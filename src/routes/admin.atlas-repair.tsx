// Atlas ↔ Encyclopedia link repair workshop.
// Categorizes every atlas_entities row by link status, suggests canonical
// encyclopedia_entities targets, and offers safe one-click actions:
//   - relink to suggested entity
//   - manual search/select
//   - create a minimal encyclopedia stub when no canonical match exists
//
// No hard deletes. No legacy fallback. Admin-gated (RLS enforces writes).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowRight, RefreshCw, Search, Link2, AlertTriangle, CheckCircle2,
  PlusCircle, ShieldAlert, Wand2,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllAtlasEntities, updateAtlasEntity, KIND_LABEL_AR,
  type AtlasEntityRow, type AtlasEntityKind,
} from "@/lib/atlas-entities";
import { normalizeEntitySlug, entityRichness } from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/atlas-repair")({
  head: () => ({
    meta: [
      { title: "إصلاح روابط الأطلس — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AtlasRepairPage /></AdminGate>,
});

// ---- Domain types --------------------------------------------------------

type EncEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: unknown;
  metadata: unknown;
  enabled: boolean;
};

type IssueKind =
  | "ok"
  | "missing"          // no encyclopedia_entity_id
  | "dangling"         // id set but no row
  | "disabled"         // linked entity exists but enabled=false
  | "weak"             // linked but very thin content
  | "slug_mismatch"    // linked entity slug doesn't match atlas slug
  | "type_mismatch";   // linked entity_type incompatible with atlas kind

const ISSUE_LABEL: Record<IssueKind, string> = {
  ok: "سليم",
  missing: "بلا رابط",
  dangling: "رابط معطوب",
  disabled: "كيان معطّل",
  weak: "محتوى ضعيف",
  slug_mismatch: "اختلاف slug",
  type_mismatch: "اختلاف النوع",
};

const ISSUE_COLOR: Record<IssueKind, string> = {
  ok: "text-emerald-300",
  missing: "text-rose-300",
  dangling: "text-rose-300",
  disabled: "text-amber-300",
  weak: "text-amber-300",
  slug_mismatch: "text-sky-300",
  type_mismatch: "text-sky-300",
};

// atlas.kind → preferred encyclopedia.entity_type(s)
const KIND_TO_TYPES: Record<AtlasEntityKind, string[]> = {
  place: ["city", "landmark"],
  battle: ["battle"],
  event: ["event"],
  figure_marker: ["figure"],
  artifact_site: ["artifact", "landmark"],
  region: ["state", "city"],
  route_point: ["landmark", "city"],
};

// ---- Scoring -------------------------------------------------------------

function classify(row: AtlasEntityRow, byId: Map<string, EncEntity>): IssueKind {
  if (!row.encyclopedia_entity_id) return "missing";
  const e = byId.get(row.encyclopedia_entity_id);
  if (!e) return "dangling";
  if (!e.enabled) return "disabled";
  const compat = KIND_TO_TYPES[row.kind] ?? [];
  if (compat.length > 0 && !compat.includes(e.entity_type)) return "type_mismatch";
  if (normalizeEntitySlug(row.slug) !== normalizeEntitySlug(e.slug)) {
    // mismatch is informational only when richness is high
    if (entityRichness(e) < 3) return "weak";
    return "slug_mismatch";
  }
  if (entityRichness(e) < 1) return "weak";
  return "ok";
}

type Candidate = { entity: EncEntity; score: number; reasons: string[] };

function suggestCandidates(row: AtlasEntityRow, list: EncEntity[]): Candidate[] {
  const targetSlug = normalizeEntitySlug(row.slug);
  const targetName = (row.name_ar ?? "").trim();
  const targetEn = (row.name_en ?? "").trim().toLowerCase();
  const compat = new Set(KIND_TO_TYPES[row.kind] ?? []);
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const aliases = new Set(
    [
      ...(Array.isArray((meta as any).aliases) ? (meta as any).aliases : []),
      (meta as any).legacy_id,
      row.slug,
      targetSlug,
    ].filter((v): v is string => typeof v === "string" && v.length > 0).map(String),
  );

  const results: Candidate[] = [];
  for (const e of list) {
    if (!e.enabled) continue;
    const reasons: string[] = [];
    let score = 0;
    const eSlug = normalizeEntitySlug(e.slug);
    if (e.slug === row.slug) { score += 100; reasons.push("slug مطابق"); }
    else if (eSlug === targetSlug) { score += 80; reasons.push("slug مُطبَّع"); }
    if (targetName && e.title?.trim() === targetName) { score += 60; reasons.push("عنوان عربي مطابق"); }
    if (targetEn && (e.subtitle ?? "").trim().toLowerCase() === targetEn) { score += 20; reasons.push("subtitle إنجليزي مطابق"); }
    const emeta = (e.metadata as Record<string, unknown> | null) ?? {};
    const eAliases = Array.isArray((emeta as any).aliases) ? (emeta as any).aliases as unknown[] : [];
    const eLegacy = (emeta as any).legacy_id;
    for (const a of eAliases) if (typeof a === "string" && aliases.has(a)) { score += 40; reasons.push(`alias: ${a}`); break; }
    if (typeof eLegacy === "string" && aliases.has(eLegacy)) { score += 40; reasons.push(`legacy_id: ${eLegacy}`); }
    if (compat.has(e.entity_type)) { score += 15; reasons.push(`نوع ${e.entity_type} متوافق`); }
    score += Math.min(10, entityRichness(e));
    if (score > 0) results.push({ entity: e, score, reasons });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 8);
}

// ---- Component -----------------------------------------------------------

function AtlasRepairPage() {
  const [rows, setRows] = useState<AtlasEntityRow[]>([]);
  const [enc, setEnc] = useState<EncEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<IssueKind | "all" | "broken">("broken");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [a, e] = await Promise.all([
        listAllAtlasEntities(),
        supabase.from("encyclopedia_entities").select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled").limit(5000),
      ]);
      if (e.error) throw e.error;
      setRows(a);
      setEnc((e.data as EncEntity[] | null) ?? []);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const byId = useMemo(() => {
    const m = new Map<string, EncEntity>();
    for (const e of enc) m.set(e.id, e);
    return m;
  }, [enc]);

  const issued = useMemo(() => rows.map((r) => ({ row: r, issue: classify(r, byId) })), [rows, byId]);

  const counts = useMemo(() => {
    const c: Record<IssueKind, number> = {
      ok: 0, missing: 0, dangling: 0, disabled: 0, weak: 0, slug_mismatch: 0, type_mismatch: 0,
    };
    for (const x of issued) c[x.issue]++;
    return c;
  }, [issued]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issued.filter(({ row, issue }) => {
      if (filter === "broken" && issue === "ok") return false;
      if (filter !== "all" && filter !== "broken" && issue !== filter) return false;
      if (q && !`${row.name_ar} ${row.name_en ?? ""} ${row.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [issued, filter, search]);

  const total = rows.length;
  const valid = counts.ok;
  const coverage = total === 0 ? 0 : Math.round((valid / total) * 1000) / 10;

  const flagBusy = (id: string, on: boolean) =>
    setBusy((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });

  const relink = async (rowId: string, entityId: string | null) => {
    flagBusy(rowId, true);
    try {
      const updated = await updateAtlasEntity(rowId, { encyclopedia_entity_id: entityId });
      setRows((rs) => rs.map((r) => (r.id === rowId ? updated : r)));
    } catch (e: any) {
      alert(`فشل الربط: ${e?.message ?? e}`);
    } finally { flagBusy(rowId, false); }
  };

  const createStub = async (row: AtlasEntityRow) => {
    const compat = KIND_TO_TYPES[row.kind] ?? ["landmark"];
    const entity_type = compat[0];
    const slug = normalizeEntitySlug(row.slug);
    if (!slug) { alert("slug غير صالح"); return; }
    if (!confirm(`إنشاء كيان موسوعة بسيط (${entity_type}/${slug}) لـ "${row.name_ar}"؟`)) return;
    flagBusy(row.id, true);
    try {
      const { data, error: insErr } = await supabase
        .from("encyclopedia_entities")
        .insert({
          entity_type,
          slug,
          title: row.name_ar,
          subtitle: row.name_en,
          summary: null,
          body: {},
          metadata: { source: "atlas_repair_stub", atlas_entity_id: row.id, aliases: [row.slug] },
          enabled: true,
        })
        .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled")
        .single();
      if (insErr) throw insErr;
      setEnc((es) => [...es, data as EncEntity]);
      await relink(row.id, (data as EncEntity).id);
    } catch (e: any) {
      alert(`فشل إنشاء الكيان: ${e?.message ?? e}`);
      flagBusy(row.id, false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-stone-950 text-stone-100">
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-900/90 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <Link to="/admin" className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] hover:bg-stone-700">
            <ArrowRight className="size-3.5" /> الإدارة
          </Link>
          <h1 className="text-sm font-bold text-amber-100">إصلاح روابط الأطلس ↔ الموسوعة</h1>
          <div className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="text-stone-300">
              تغطية: <strong className={coverage === 100 ? "text-emerald-300" : "text-amber-300"}>{coverage}%</strong>
              {" "}({valid}/{total})
            </span>
            <button onClick={reload} className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> إعادة تدقيق
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-3 p-3">
        {/* Issue summary */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(counts) as IssueKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded border px-3 py-2 text-right text-[11px] transition ${
                filter === k ? "border-amber-400 bg-amber-500/10" : "border-stone-800 bg-stone-900 hover:border-stone-700"
              }`}
            >
              <div className={`text-lg font-bold ${ISSUE_COLOR[k]}`}>{counts[k]}</div>
              <div className="text-stone-400">{ISSUE_LABEL[k]}</div>
            </button>
          ))}
        </section>

        {/* Controls */}
        <section className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-stone-700 bg-stone-900 px-2 py-1.5">
            <Search className="size-3.5 opacity-60" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في الأطلس..."
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <button onClick={() => setFilter("broken")}
              className={`rounded border px-2 py-1 ${filter === "broken" ? "border-amber-400 bg-amber-500/10" : "border-stone-700 bg-stone-800"}`}>
              معطوب فقط
            </button>
            <button onClick={() => setFilter("all")}
              className={`rounded border px-2 py-1 ${filter === "all" ? "border-amber-400 bg-amber-500/10" : "border-stone-700 bg-stone-800"}`}>
              الكل
            </button>
          </div>
          <span className="text-[11px] text-stone-400">{visible.length} ظاهر</span>
        </section>

        {error && (
          <div className="rounded border border-rose-800 bg-rose-900/30 p-3 text-[12px] text-rose-200">
            <ShieldAlert className="mb-1 inline size-4" /> {error}
          </div>
        )}

        {/* List */}
        <section className="space-y-2">
          {loading && <div className="p-3 text-[12px] text-stone-400">جاري التحميل…</div>}
          {!loading && visible.length === 0 && (
            <div className="rounded border border-stone-800 bg-stone-900 p-6 text-center text-[12px] text-stone-400">
              لا توجد عناصر بهذا التصنيف.
            </div>
          )}
          {visible.map(({ row, issue }) => (
            <RepairRow
              key={row.id}
              row={row} issue={issue}
              linked={row.encyclopedia_entity_id ? byId.get(row.encyclopedia_entity_id) ?? null : null}
              suggestions={suggestCandidates(row, enc)}
              busy={busy.has(row.id)}
              manualQuery={manual[row.id] ?? ""}
              onManual={(v) => setManual((m) => ({ ...m, [row.id]: v }))}
              encList={enc}
              onRelink={(id) => relink(row.id, id)}
              onClear={() => relink(row.id, null)}
              onCreate={() => createStub(row)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

// ---- Row -----------------------------------------------------------------

function RepairRow({
  row, issue, linked, suggestions, busy, manualQuery, onManual, encList,
  onRelink, onClear, onCreate,
}: {
  row: AtlasEntityRow;
  issue: IssueKind;
  linked: EncEntity | null;
  suggestions: Candidate[];
  busy: boolean;
  manualQuery: string;
  onManual: (v: string) => void;
  encList: EncEntity[];
  onRelink: (id: string) => void;
  onClear: () => void;
  onCreate: () => void;
}) {
  const matches = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [] as EncEntity[];
    return encList
      .filter((e) => e.enabled && (
        e.slug.toLowerCase().includes(q) ||
        e.title?.toLowerCase().includes(q) ||
        (e.subtitle ?? "").toLowerCase().includes(q)
      ))
      .slice(0, 12);
  }, [manualQuery, encList]);

  const top = suggestions[0];

  return (
    <article className="rounded border border-stone-800 bg-stone-900 p-3">
      <header className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
          issue === "ok" ? "bg-emerald-900/40 text-emerald-200" : "bg-amber-900/40 text-amber-200"
        }`}>
          {issue === "ok" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {ISSUE_LABEL[issue]}
        </span>
        <div className="font-bold text-amber-100">{row.name_ar}</div>
        <span className="text-stone-400">· {KIND_LABEL_AR[row.kind]}</span>
        <code className="text-[10px] text-stone-500">{row.slug}</code>
        {linked && (
          <span className="text-[10px] text-stone-400">
            ← مرتبط بـ <code className="text-sky-300">{linked.entity_type}/{linked.slug}</code>
          </span>
        )}
        {busy && <RefreshCw className="size-3.5 animate-spin text-amber-300" />}
      </header>

      {/* Suggestions */}
      <div className="mt-2 space-y-1.5">
        {suggestions.length === 0 && (
          <div className="text-[11px] text-stone-500">لا يوجد ترشيح آلي.</div>
        )}
        {suggestions.map((c, i) => (
          <div key={c.entity.id} className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-[11px] ${
            i === 0 ? "border-emerald-700/50 bg-emerald-900/10" : "border-stone-800 bg-stone-950/40"
          }`}>
            <span className="font-bold text-amber-100">{c.entity.title}</span>
            <code className="text-[10px] text-stone-500">{c.entity.entity_type}/{c.entity.slug}</code>
            <span className="text-stone-400">· درجة {c.score}</span>
            <span className="text-stone-500">· {c.reasons.join(" · ")}</span>
            <button
              disabled={busy || linked?.id === c.entity.id}
              onClick={() => onRelink(c.entity.id)}
              className="ml-auto inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-40"
            >
              <Link2 className="size-3" /> {linked?.id === c.entity.id ? "مرتبط" : i === 0 ? "ربط (مقترح)" : "ربط"}
            </button>
          </div>
        ))}
      </div>

      {/* Manual search + stub */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <div className="flex min-w-[16rem] flex-1 items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1">
          <Search className="size-3 opacity-60" />
          <input
            value={manualQuery}
            onChange={(e) => onManual(e.target.value)}
            placeholder="بحث يدوي في الموسوعة..."
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
        {linked && (
          <button onClick={onClear} disabled={busy}
            className="rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700 disabled:opacity-40">
            مسح الربط
          </button>
        )}
        {!top || top.score < 60 ? (
          <button onClick={onCreate} disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-sky-700 bg-sky-900/40 px-2 py-1 text-sky-200 hover:bg-sky-900/70 disabled:opacity-40">
            <PlusCircle className="size-3" /> إنشاء كيان موسوعة بسيط
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-stone-500">
            <Wand2 className="size-3" /> يوجد ترشيح قوي — تجنب الإنشاء
          </span>
        )}
      </div>

      {matches.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-950/40 px-2 py-1 text-[11px]">
              <span className="font-bold text-amber-100">{m.title}</span>
              <code className="text-[10px] text-stone-500">{m.entity_type}/{m.slug}</code>
              <button
                disabled={busy || linked?.id === m.id}
                onClick={() => onRelink(m.id)}
                className="ml-auto rounded bg-stone-800 px-2 py-0.5 text-stone-200 hover:bg-stone-700 disabled:opacity-40"
              >
                {linked?.id === m.id ? "مرتبط" : "ربط"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

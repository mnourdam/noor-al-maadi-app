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

// ---- Bulk safe-relink plan ----------------------------------------------

const BULK_MIN_SCORE = 80;
const BULK_AMBIGUITY_GAP = 10;

type BulkPlanItem = {
  row: AtlasEntityRow;
  issue: IssueKind;
  candidate: Candidate;
};

function computeBulkPlan(
  issued: { row: AtlasEntityRow; issue: IssueKind }[],
  enc: EncEntity[],
): BulkPlanItem[] {
  const plan: BulkPlanItem[] = [];
  for (const { row, issue } of issued) {
    if (issue === "ok" || issue === "type_mismatch") continue;
    const cands = suggestCandidates(row, enc);
    const top = cands[0];
    if (!top) continue;
    if (top.score < BULK_MIN_SCORE) continue;
    if (!top.entity.enabled) continue;
    const compat = KIND_TO_TYPES[row.kind] ?? [];
    if (compat.length > 0 && !compat.includes(top.entity.entity_type)) continue;
    const second = cands[1];
    if (second && top.score - second.score < BULK_AMBIGUITY_GAP) continue;
    if (row.encyclopedia_entity_id === top.entity.id) continue;
    plan.push({ row, issue, candidate: top });
  }
  return plan;
}

// ---- Bulk stub-creation plan --------------------------------------------

type StubPlanItem = {
  row: AtlasEntityRow;
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
};

type StubSkip = { row: AtlasEntityRow; reason: string };
type StubPlanResult = { plan: StubPlanItem[]; skipped: StubSkip[] };

function computeStubPlan(
  issued: { row: AtlasEntityRow; issue: IssueKind }[],
  enc: EncEntity[],
): StubPlanResult {
  const usedSlugs = new Set<string>();
  for (const e of enc) usedSlugs.add(`${e.entity_type}::${normalizeEntitySlug(e.slug)}`);
  const plan: StubPlanItem[] = [];
  const skipped: StubSkip[] = [];
  for (const { row, issue } of issued) {
    if (issue !== "missing") continue;
    const cands = suggestCandidates(row, enc);
    if (cands[0] && cands[0].score >= BULK_MIN_SCORE) {
      skipped.push({ row, reason: `ترشيح قوي موجود (${cands[0].score}) — تجنّب الإنشاء` });
      continue;
    }
    const compat = KIND_TO_TYPES[row.kind] ?? ["landmark"];
    const entity_type = compat[0];
    const title = (row.name_ar ?? "").trim();
    if (!title) { skipped.push({ row, reason: "name_ar فارغ" }); continue; }
    const baseSlug = normalizeEntitySlug(row.slug) || normalizeEntitySlug(title);
    if (!baseSlug) { skipped.push({ row, reason: "slug غير صالح" }); continue; }
    let slug = baseSlug;
    let n = 1;
    while (usedSlugs.has(`${entity_type}::${slug}`)) {
      n++;
      slug = `${baseSlug}-${n}`;
    }
    usedSlugs.add(`${entity_type}::${slug}`);
    plan.push({ row, entity_type, slug, title, subtitle: row.name_en ?? null });
  }
  return { plan, skipped };
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number }>({ done: 0, total: 0, failed: 0 });
  const [bulkResult, setBulkResult] = useState<{ fixed: number; failed: number } | null>(null);
  const [stubOpen, setStubOpen] = useState(false);
  const [stubRunning, setStubRunning] = useState(false);
  const [stubProgress, setStubProgress] = useState<{ done: number; total: number; failed: number }>({ done: 0, total: 0, failed: 0 });
  const [stubResult, setStubResult] = useState<{ created: number; linked: number; failed: number; failures: { row: AtlasEntityRow; reason: string }[] } | null>(null);

  const [encTotal, setEncTotal] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Paginate encyclopedia_entities: PostgREST caps per-request rows (default 1000),
      // so .limit(5000) silently truncates. We page until exhausted.
      const PAGE = 1000;
      const all: EncEntity[] = [];
      let from = 0;
      let total: number | null = null;
      for (;;) {
        const { data, error, count } = await supabase
          .from("encyclopedia_entities")
          .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled", { count: "exact" })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data as EncEntity[] | null) ?? [];
        all.push(...chunk);
        if (total === null && typeof count === "number") total = count;
        if (chunk.length < PAGE) break;
        from += PAGE;
        if (total !== null && all.length >= total) break;
        if (from > 100000) break; // safety
      }
      const a = await listAllAtlasEntities();
      setRows(a);
      setEnc(all);
      setEncTotal(total);
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

  const bulkPlan = useMemo(() => computeBulkPlan(issued, enc), [issued, enc]);

  const runBulk = async () => {
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: bulkPlan.length, failed: 0 });
    let done = 0, failed = 0;
    const updatedRows: AtlasEntityRow[] = [];
    for (const item of bulkPlan) {
      try {
        const u = await updateAtlasEntity(item.row.id, { encyclopedia_entity_id: item.candidate.entity.id });
        updatedRows.push(u);
      } catch {
        failed++;
      }
      done++;
      setBulkProgress({ done, total: bulkPlan.length, failed });
    }
    if (updatedRows.length) {
      setRows((rs) => rs.map((r) => updatedRows.find((u) => u.id === r.id) ?? r));
    }
    setBulkRunning(false);
    setBulkResult({ fixed: updatedRows.length, failed });
    await reload();
  };

  const stubPlanResult = useMemo(() => computeStubPlan(issued, enc), [issued, enc]);
  const stubPlan = stubPlanResult.plan;
  const stubSkips = stubPlanResult.skipped;

  const runStubBulk = async () => {
    setStubRunning(true);
    setStubProgress({ done: 0, total: stubPlan.length, failed: 0 });
    let done = 0, failed = 0;
    const newEnc: EncEntity[] = [];
    const updatedRows: AtlasEntityRow[] = [];
    const failures: { row: AtlasEntityRow; reason: string }[] = [];
    for (const item of stubPlan) {
      try {
        const { data, error: insErr } = await supabase
          .from("encyclopedia_entities")
          .insert({
            entity_type: item.entity_type,
            slug: item.slug,
            title: item.title,
            subtitle: item.subtitle,
            summary: null,
            body: {},
            metadata: {
              source: "atlas_repair_stub",
              atlas_id: item.row.id,
              atlas_slug: item.row.slug,
              aliases: [item.row.slug],
              needs_content_expansion: true,
            },
            enabled: true,
          })
          .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled")
          .single();
        if (insErr) throw insErr;
        const created = data as EncEntity;
        newEnc.push(created);
        const u = await updateAtlasEntity(item.row.id, { encyclopedia_entity_id: created.id });
        updatedRows.push(u);
      } catch (e: any) {
        failed++;
        failures.push({ row: item.row, reason: e?.message ?? String(e) });
      }
      done++;
      setStubProgress({ done, total: stubPlan.length, failed });
    }
    if (newEnc.length) setEnc((es) => [...es, ...newEnc]);
    if (updatedRows.length) {
      setRows((rs) => rs.map((r) => updatedRows.find((u) => u.id === r.id) ?? r));
    }
    setStubRunning(false);
    setStubResult({ created: newEnc.length, linked: updatedRows.length, failed, failures });
    await reload();
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
            <button
              onClick={() => { setBulkResult(null); setBulkOpen(true); }}
              disabled={loading || bulkPlan.length === 0}
              className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-emerald-100 hover:bg-emerald-900/70 disabled:opacity-40"
            >
              <Wand2 className="size-3.5" /> إصلاح جماعي آمن ({bulkPlan.length})
            </button>
            <button
              onClick={() => { setStubResult(null); setStubOpen(true); }}
              disabled={loading || stubPlan.length === 0}
              className="inline-flex items-center gap-1 rounded border border-sky-700 bg-sky-900/40 px-2 py-1 text-sky-100 hover:bg-sky-900/70 disabled:opacity-40"
            >
              <PlusCircle className="size-3.5" /> إنشاء كيانات للروابط المفقودة ({stubPlan.length})
            </button>
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

        {/* Debug: audit vs raw DB */}
        <DebugConsistencyPanel rows={rows} byId={byId} encLoaded={enc.length} encTotal={encTotal} counts={counts} />


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

      {bulkOpen && (
        <BulkRepairModal
          plan={bulkPlan}
          running={bulkRunning}
          progress={bulkProgress}
          result={bulkResult}
          onClose={() => { if (!bulkRunning) { setBulkOpen(false); setBulkResult(null); } }}
          onRun={runBulk}
        />
      )}

      {stubOpen && (
        <StubBulkModal
          plan={stubPlan}
          skipped={stubSkips}
          running={stubRunning}
          progress={stubProgress}
          result={stubResult}
          onClose={() => { if (!stubRunning) { setStubOpen(false); setStubResult(null); } }}
          onRun={runStubBulk}
        />
      )}

    </div>
  );
}

// ---- Bulk modal ----------------------------------------------------------

function BulkRepairModal({
  plan, running, progress, result, onClose, onRun,
}: {
  plan: BulkPlanItem[];
  running: boolean;
  progress: { done: number; total: number; failed: number };
  result: { fixed: number; failed: number } | null;
  onClose: () => void;
  onRun: () => void;
}) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-3">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-stone-700 bg-stone-900 shadow-xl">
        <header className="flex items-center gap-2 border-b border-stone-800 px-4 py-2.5">
          <Wand2 className="size-4 text-emerald-300" />
          <h2 className="text-sm font-bold text-amber-100">معاينة الإصلاح الجماعي الآمن</h2>
          <span className="text-[11px] text-stone-400">
            (درجة ≥ {BULK_MIN_SCORE}، فجوة ≥ {BULK_AMBIGUITY_GAP}، نوع متوافق، كيان مفعّل)
          </span>
          <button onClick={onClose} disabled={running}
            className="ml-auto rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] hover:bg-stone-700 disabled:opacity-40">
            إغلاق
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4 py-3 text-[12px]">
          {result ? (
            <div className="space-y-2">
              <div className="rounded border border-emerald-700/50 bg-emerald-900/20 p-3 text-emerald-100">
                ✓ تم إصلاح {result.fixed} رابطًا{result.failed > 0 ? ` · فشل ${result.failed}` : ""}.
              </div>
              <div className="text-stone-400">أُعيد التدقيق تلقائيًا.</div>
            </div>
          ) : plan.length === 0 ? (
            <div className="rounded border border-stone-800 bg-stone-950/40 p-4 text-center text-stone-400">
              لا توجد روابط بدرجة عالية وآمنة للإصلاح الجماعي حاليًا.
            </div>
          ) : (
            <>
              <div className="mb-2 text-stone-300">
                سيتم إعادة ربط <strong className="text-amber-200">{plan.length}</strong> صفًا فقط (تحديث
                {" "}<code className="text-stone-400">encyclopedia_entity_id</code>). لن يُحذف أو يُؤرشف أي كيان، ولن تُنشأ كيانات جديدة.
              </div>
              <ul className="divide-y divide-stone-800 rounded border border-stone-800">
                {plan.map(({ row, issue, candidate }) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                    <span className={`rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-200`}>
                      {ISSUE_LABEL[issue]}
                    </span>
                    <span className="font-bold text-amber-100">{row.name_ar}</span>
                    <code className="text-[10px] text-stone-500">{row.slug}</code>
                    <ArrowRight className="size-3 text-stone-500" />
                    <span className="text-emerald-200">{candidate.entity.title}</span>
                    <code className="text-[10px] text-stone-500">{candidate.entity.entity_type}/{candidate.entity.slug}</code>
                    <span className="text-stone-400">· درجة {candidate.score}</span>
                    <span className="text-stone-500 truncate">· {candidate.reasons.slice(0, 3).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-stone-800 px-4 py-2.5 text-[12px]">
          {running ? (
            <span className="text-amber-200">
              <RefreshCw className="mr-1 inline size-3.5 animate-spin" />
              {progress.done}/{progress.total} {progress.failed > 0 ? `· فشل ${progress.failed}` : ""}
            </span>
          ) : result ? (
            <button onClick={onClose}
              className="ml-auto rounded bg-amber-500 px-3 py-1.5 font-bold text-stone-950 hover:bg-amber-400">
              تم
            </button>
          ) : (
            <>
              <span className="text-stone-400">سيتم تحديث {plan.length} صفًا.</span>
              <button onClick={onClose}
                className="ml-auto rounded border border-stone-700 bg-stone-800 px-3 py-1.5 hover:bg-stone-700">
                إلغاء
              </button>
              <button onClick={onRun} disabled={plan.length === 0}
                className="rounded bg-emerald-500 px-3 py-1.5 font-bold text-stone-950 hover:bg-emerald-400 disabled:opacity-40">
                تنفيذ الإصلاح
              </button>
            </>
          )}
        </footer>
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

// ---- Stub bulk modal -----------------------------------------------------

function StubBulkModal({
  plan, skipped, running, progress, result, onClose, onRun,
}: {
  plan: StubPlanItem[];
  skipped: StubSkip[];
  running: boolean;
  progress: { done: number; total: number; failed: number };
  result: { created: number; linked: number; failed: number; failures: { row: AtlasEntityRow; reason: string }[] } | null;
  onClose: () => void;
  onRun: () => void;
}) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-3">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-stone-700 bg-stone-900 shadow-xl">
        <header className="flex items-center gap-2 border-b border-stone-800 px-4 py-2.5">
          <PlusCircle className="size-4 text-sky-300" />
          <h2 className="text-sm font-bold text-amber-100">إنشاء كيانات موسوعة بسيطة للروابط المفقودة</h2>
          <span className="text-[11px] text-stone-400">
            (الصفوف بلا رابط فقط · لا تتجاوز ترشيحات قوية ≥ {BULK_MIN_SCORE} · مفعّل · بحاجة توسيع محتوى)
          </span>
          <button onClick={onClose} disabled={running}
            className="ml-auto rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] hover:bg-stone-700 disabled:opacity-40">
            إغلاق
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4 py-3 text-[12px]">
          {result ? (
            <div className="space-y-2">
              <div className="rounded border border-sky-700/50 bg-sky-900/20 p-3 text-sky-100">
                <div className="font-bold">ملخّص التنفيذ</div>
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  <li>• أُنشئ: <strong>{result.created}</strong></li>
                  <li>• رُبط بصفوف الأطلس: <strong>{result.linked}</strong></li>
                  <li>• تُخطّي قبل التنفيذ (لا يستوفي شروط الإنشاء الآمن): <strong>{skipped.length}</strong></li>
                  <li>• فشل أثناء التنفيذ: <strong>{result.failed}</strong></li>
                </ul>
              </div>
              {result.failures.length > 0 && (
                <details className="rounded border border-rose-800/60 bg-rose-900/10 p-2 text-rose-100">
                  <summary className="cursor-pointer text-[11px] font-bold">أسباب الفشل ({result.failures.length})</summary>
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    {result.failures.map((f, i) => (
                      <li key={i}><code className="text-stone-400">{f.row.slug}</code> — {f.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              {skipped.length > 0 && (
                <details className="rounded border border-stone-700 bg-stone-950/40 p-2 text-stone-200">
                  <summary className="cursor-pointer text-[11px] font-bold">أسباب التخطّي ({skipped.length})</summary>
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    {skipped.map((s, i) => (
                      <li key={i}><code className="text-stone-400">{s.row.slug}</code> — {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="text-stone-400">أُعيد التدقيق تلقائيًا. الكيانات الجديدة مُعلَّمة <code>needs_content_expansion</code>.</div>
            </div>
          ) : plan.length === 0 ? (
            <div className="space-y-2">
              <div className="rounded border border-stone-800 bg-stone-950/40 p-4 text-center text-stone-400">
                لا توجد روابط مفقودة قابلة للإنشاء الآمن حاليًا.
              </div>
              {skipped.length > 0 && (
                <details className="rounded border border-stone-700 bg-stone-950/40 p-2 text-stone-200">
                  <summary className="cursor-pointer text-[11px] font-bold">صفوف "بلا رابط" مُتخطَّاة ({skipped.length})</summary>
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    {skipped.map((s, i) => (
                      <li key={i}><code className="text-stone-400">{s.row.slug}</code> — {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

          ) : (
            <>
              <div className="mb-2 text-stone-300">
                سيتم إنشاء <strong className="text-amber-200">{plan.length}</strong> كيانًا في <code className="text-stone-400">encyclopedia_entities</code> ثم ربطها بصفوف الأطلس المطابقة. لن يُحذف أو يُؤرشف أو يُستبدل أي كيان قائم.
              </div>
              <ul className="divide-y divide-stone-800 rounded border border-stone-800">
                {plan.map(({ row, entity_type, slug, title, subtitle }) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                    <span className="rounded bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">بلا رابط</span>
                    <span className="font-bold text-amber-100">{row.name_ar}</span>
                    <code className="text-[10px] text-stone-500">{row.slug}</code>
                    <ArrowRight className="size-3 text-stone-500" />
                    <span className="text-sky-200">{title}</span>
                    <code className="text-[10px] text-stone-500">{entity_type}/{slug}</code>
                    {subtitle && <span className="text-[10px] text-stone-500">· {subtitle}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-stone-800 px-4 py-2.5 text-[12px]">
          {running ? (
            <span className="text-amber-200">
              <RefreshCw className="mr-1 inline size-3.5 animate-spin" />
              {progress.done}/{progress.total} {progress.failed > 0 ? `· فشل ${progress.failed}` : ""}
            </span>
          ) : result ? (
            <button onClick={onClose}
              className="ml-auto rounded bg-amber-500 px-3 py-1.5 font-bold text-stone-950 hover:bg-amber-400">
              تم
            </button>
          ) : (
            <>
              <span className="text-stone-400">سيُنشأ {plan.length} كيانًا ويُربط تلقائيًا.</span>
              <button onClick={onClose}
                className="ml-auto rounded border border-stone-700 bg-stone-800 px-3 py-1.5 hover:bg-stone-700">
                إلغاء
              </button>
              <button onClick={onRun} disabled={plan.length === 0}
                className="rounded bg-sky-500 px-3 py-1.5 font-bold text-stone-950 hover:bg-sky-400 disabled:opacity-40">
                تنفيذ الإنشاء
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

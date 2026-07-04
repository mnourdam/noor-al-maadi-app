// Dedicated Era assignment tool — one entity at a time, manual curation only.
// Mirrors the World/State mapper philosophy but with a Prev/Next/Skip/Search/Jump
// single-entity workflow. NEVER auto-assigns; saves on user action and advances.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { useTaxonomy } from "@/lib/taxonomy";
import {
  CANONICAL_ERA_LABEL,
  CANONICAL_ERA_ORDER,
  toCanonicalEra,
  type CanonicalEra,
} from "@/lib/era-canonical";
import {
  ArrowLeft, ArrowRight, ChevronLeft, Save, SkipForward, Search,
  Loader2, AlertTriangle, CheckCircle2, RefreshCw, Download,
} from "lucide-react";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function timelineSummary(body: any): string {
  const tl = body && typeof body === "object" && Array.isArray(body.timeline) ? body.timeline : [];
  if (!tl.length) return "";
  return tl.slice(0, 10).map((t: any) => {
    const y = t?.year ?? t?.date ?? "";
    const label = t?.title ?? t?.label ?? t?.description ?? "";
    return `${y ? y + ": " : ""}${label}`.trim();
  }).filter(Boolean).join(" | ");
}

function bodyExcerpt(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 500);
  try {
    const parts: string[] = [];
    if (typeof body.overview === "string") parts.push(body.overview);
    if (Array.isArray(body.sections)) {
      for (const s of body.sections) {
        if (typeof s?.title === "string") parts.push(s.title);
        if (typeof s?.body === "string") parts.push(s.body);
      }
    }
    const joined = parts.join("\n\n") || JSON.stringify(body);
    return joined.slice(0, 500);
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/admin/era-assignment")({
  head: () => ({
    meta: [
      { title: "تعيين العصور — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <EraAssignmentPage />
    </AdminGate>
  ),
});

type Row = {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  summary: string | null;
  body: any;
  metadata: Record<string, any> | null;
  enabled: boolean;
};

type EraOption = { key: string; label: string };

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id,slug,title,entity_type,summary,body,metadata,enabled")
      .order("title", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

function metaObj(r: Row): Record<string, any> {
  return r.metadata && typeof r.metadata === "object" ? r.metadata : {};
}
function rawEra(r: Row): string {
  const v = metaObj(r).era;
  return typeof v === "string" ? v.trim() : "";
}

function EraAssignmentPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [filterType, setFilterType] = useState<string>("");
  const [filterWorld, setFilterWorld] = useState<string>("");
  const [filterState, setFilterState] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"needs" | "all">("needs");
  const [query, setQuery] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);

  const eraTax = useTaxonomy("era", { source: "db" });

  const eraOptions = useMemo<EraOption[]>(() => {
    const seen = new Set<string>();
    const out: EraOption[] = [];
    // taxonomy first
    for (const e of eraTax.entries) {
      if (!e.enabled || e.archived) continue;
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      out.push({ key: e.key, label: e.label_ar || e.key });
    }
    // ensure canonical keys are all reachable
    for (const key of CANONICAL_ERA_ORDER) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: CANONICAL_ERA_LABEL[key as CanonicalEra] });
    }
    return out;
  }, [eraTax.entries]);

  const validEraKeys = useMemo(() => new Set(eraOptions.map((o) => o.key)), [eraOptions]);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchAll();
      setRows(r);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  const worldValues = useMemo(() => {
    if (!rows) return [] as string[];
    const s = new Set<string>();
    for (const r of rows) {
      const w = metaObj(r).world;
      if (typeof w === "string" && w.trim()) s.add(w.trim());
    }
    return [...s].sort();
  }, [rows]);
  const stateValues = useMemo(() => {
    if (!rows) return [] as string[];
    const s = new Set<string>();
    for (const r of rows) {
      const st = metaObj(r).state;
      if (typeof st === "string" && st.trim()) s.add(st.trim());
    }
    return [...s].sort();
  }, [rows]);
  const typeValues = useMemo(() => {
    if (!rows) return [] as string[];
    const s = new Set<string>();
    for (const r of rows) s.add(r.entity_type);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [] as Row[];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const raw = rawEra(r);
      const needs = !raw || !validEraKeys.has(raw);
      if (filterMode === "needs" && !needs) return false;
      if (filterType && r.entity_type !== filterType) return false;
      const m = metaObj(r);
      if (filterWorld && (m.world ?? "") !== filterWorld) return false;
      if (filterState && (m.state ?? "") !== filterState) return false;
      if (q) {
        const hay = `${r.title} ${r.slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterMode, filterType, filterWorld, filterState, query, validEraKeys]);

  // Clamp index when filter changes
  useEffect(() => {
    setIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  const current: Row | null = filtered[index] ?? null;

  async function saveEra(newEra: string) {
    if (!current) return;
    if (!validEraKeys.has(newEra)) return;
    setSaving(true);
    try {
      const nextMeta = { ...(current.metadata ?? {}), era: newEra };
      const { error } = await supabase
        .from("encyclopedia_entities")
        .update({ metadata: nextMeta })
        .eq("id", current.id);
      if (error) throw error;
      // update local so filter re-evaluates and this entity drops out of "needs" mode
      setRows((prev) => prev
        ? prev.map((r) => (r.id === current.id ? { ...r, metadata: nextMeta } : r))
        : prev);
      setToast(`تم حفظ العصر: ${eraOptions.find(o => o.key === newEra)?.label ?? newEra}`);
      // If in "needs" mode, filter length will shrink and the same index shows the next entity.
      // If in "all" mode, advance manually.
      if (filterMode === "all") setIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      setTimeout(() => setToast(null), 1400);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  function goPrev() { setIndex((i) => Math.max(0, i - 1)); }
  function goNext() { setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
  function goSkip() { goNext(); }

  function exportCsv() {
    if (!rows) return;
    const q = query.trim().toLowerCase();
    const unresolved = rows.filter((r) => {
      if (!r.enabled) return false;
      const m = metaObj(r);
      if ((m as any).archived === true) return false;
      const raw = rawEra(r);
      if (raw && validEraKeys.has(raw)) return false;
      if (filterType && r.entity_type !== filterType) return false;
      if (filterWorld && (m.world ?? "") !== filterWorld) return false;
      if (filterState && (m.state ?? "") !== filterState) return false;
      if (q) {
        const hay = `${r.title} ${r.slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const headers = ["id","type","title","slug","current_era","world","state","overview","body","timeline_summary"];
    const lines = [headers.join(",")];
    for (const r of unresolved) {
      const m = metaObj(r);
      const body = r.body && typeof r.body === "object" ? r.body : {};
      const overview = typeof body.overview === "string" ? body.overview : "";
      lines.push([
        r.id,
        r.entity_type,
        r.title,
        r.slug,
        rawEra(r),
        typeof m.world === "string" ? m.world : "",
        typeof m.state === "string" ? m.state : "",
        overview,
        bodyExcerpt(r.body),
        timelineSummary(r.body),
      ].map(csvEscape).join(","));
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `era-unresolved-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast(`تم تصدير ${unresolved.length} كيان`);
    setTimeout(() => setToast(null), 1600);
  }


  return (
    <div dir="rtl" className="mx-auto min-h-screen max-w-5xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-slate-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            to="/admin/encyclopedia-cleanup"
            className="inline-flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800/60"
          >
            <ChevronLeft className="size-3.5" /> عودة إلى الورشة
          </Link>
          <h1 className="text-lg font-bold text-amber-100">تعيين العصور يدويًا</h1>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          تحديث
        </button>
      </div>

      <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-200/80">
        أداة تنظيم يدوي فقط. تعرض كيانًا واحدًا في كل مرة، وتحفظ فور اختيار العصر ثم تنتقل تلقائيًا. لا يوجد تخمين آلي.
      </p>

      {err && (
        <div className="mb-3 flex items-center gap-2 rounded border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">
          <AlertTriangle className="size-4" /> {err}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterMode("needs")}
            className={`rounded-full border px-2.5 py-1 ${filterMode === "needs" ? "border-amber-400/60 bg-amber-500/15 text-amber-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
          >
            بحاجة إلى عصر
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`rounded-full border px-2.5 py-1 ${filterMode === "all" ? "border-amber-400/60 bg-amber-500/15 text-amber-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
          >
            كل الكيانات
          </button>
        </div>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
          <option value="">كل الأنواع</option>
          {typeValues.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterWorld} onChange={(e) => setFilterWorld(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
          <option value="">كل العوالم</option>
          {worldValues.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
          <option value="">كل الدول</option>
          {stateValues.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 right-2 my-auto size-3.5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
              placeholder="بحث بالعنوان أو الـ slug"
              className="w-64 rounded border border-slate-700 bg-slate-900 py-1 pe-7 ps-2 text-slate-100"
            />
          </div>
          <button
            onClick={() => setJumpOpen((v) => !v)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 hover:bg-slate-800"
          >
            انتقال…
          </button>
        </div>
      </div>

      {jumpOpen && (
        <div className="mb-3 max-h-56 overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-xs">
          {filtered.length === 0 && <p className="p-2 text-slate-500">لا نتائج.</p>}
          {filtered.slice(0, 300).map((r, i) => (
            <button
              key={r.id}
              onClick={() => { setIndex(i); setJumpOpen(false); }}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-right hover:bg-slate-900 ${i === index ? "bg-slate-900" : ""}`}
            >
              <span className="truncate text-slate-200">{r.title}</span>
              <span className="ms-2 font-mono text-[10px] text-slate-500">{r.entity_type} · {r.slug}</span>
            </button>
          ))}
          {filtered.length > 300 && (
            <p className="p-2 text-center text-[10px] text-slate-500">عُرضت 300 من {filtered.length}. استخدم البحث للتضييق.</p>
          )}
        </div>
      )}

      {/* Progress + nav */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs">
        <div className="text-slate-400">
          {filtered.length === 0
            ? "لا يوجد كيانات مطابقة"
            : <>الكيان <b className="text-amber-100">{index + 1}</b> من <b className="text-amber-100">{filtered.length}</b></>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goPrev}
            disabled={index === 0 || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            <ArrowRight className="size-3.5" /> السابق
          </button>
          <button
            onClick={goSkip}
            disabled={index >= filtered.length - 1 || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            <SkipForward className="size-3.5" /> تخطي
          </button>
          <button
            onClick={goNext}
            disabled={index >= filtered.length - 1 || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            التالي <ArrowLeft className="size-3.5" />
          </button>
        </div>
      </div>

      {loading && !rows && (
        <div className="rounded border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> جارٍ التحميل…
        </div>
      )}

      {rows && current && (
        <EntityCard
          row={current}
          eraOptions={eraOptions}
          validEraKeys={validEraKeys}
          onSave={saveEra}
          saving={saving}
        />
      )}

      {rows && !current && filtered.length === 0 && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-8 text-center text-sm text-emerald-200">
          <CheckCircle2 className="mx-auto mb-2 size-6" />
          لا توجد كيانات تحتاج تعيين عصر بهذه الفلاتر.
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-600/20 px-4 py-2 text-xs text-emerald-100 shadow-lg backdrop-blur">
          <CheckCircle2 className="me-1.5 inline size-3.5" />
          {toast}
        </div>
      )}
    </div>
  );
}

function EntityCard({
  row, eraOptions, validEraKeys, onSave, saving,
}: {
  row: Row;
  eraOptions: EraOption[];
  validEraKeys: Set<string>;
  onSave: (era: string) => void;
  saving: boolean;
}) {
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const currentEra = typeof m.era === "string" ? m.era : "";
  const world = typeof m.world === "string" ? m.world : "";
  const state = typeof m.state === "string" ? m.state : "";
  const currentValid = currentEra && validEraKeys.has(currentEra);

  const body = row.body && typeof row.body === "object" ? row.body : {};
  const overview = typeof body.overview === "string" ? body.overview : "";
  const timeline = Array.isArray(body.timeline) ? body.timeline : [];
  const sections = Array.isArray(body.sections) ? body.sections : [];

  const [choice, setChoice] = useState<string>(currentEra || "");
  useEffect(() => { setChoice(currentEra || ""); }, [row.id, currentEra]);

  return (
    <article className="rounded-2xl border border-amber-500/25 bg-slate-950/60 p-5 shadow-lg">
      {/* Header */}
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-amber-100">{row.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300">{row.entity_type}</span>
            <span className="font-mono">{row.slug}</span>
            {!row.enabled && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-200">غير منشورة</span>}
          </div>
        </div>
        <a
          href={`/encyclopedia/entity/${encodeURIComponent(row.slug)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
        >
          فتح الصفحة ↗
        </a>
      </header>

      {/* Metadata strip */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MetaCell label="العصر الحالي" value={currentEra}
          valid={!!currentValid} invalidHint={!!currentEra && !currentValid} />
        <MetaCell label="العالَم" value={world} />
        <MetaCell label="الدولة" value={state} />
      </div>

      {/* Content excerpts */}
      {row.summary?.trim() && (
        <Section title="الملخص">
          <p className="whitespace-pre-line text-[13px] leading-7 text-slate-200">{row.summary}</p>
        </Section>
      )}
      {overview?.trim() && (
        <Section title="المقدمة (Overview)">
          <p className="whitespace-pre-line text-[13px] leading-7 text-slate-200">{overview}</p>
        </Section>
      )}
      {timeline.length > 0 && (
        <Section title={`الخط الزمني (${timeline.length})`}>
          <ul className="space-y-1 text-[12px] text-slate-300">
            {timeline.slice(0, 8).map((t: any, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-300/80">{t?.year ?? t?.date ?? "•"}</span>
                <span>{t?.title ?? t?.label ?? t?.description ?? ""}</span>
              </li>
            ))}
            {timeline.length > 8 && <li className="text-[10px] text-slate-500">…</li>}
          </ul>
        </Section>
      )}
      {sections.length > 0 && (
        <Section title={`الأقسام (${sections.length})`}>
          <ul className="space-y-2 text-[12px] text-slate-300">
            {sections.slice(0, 4).map((s: any, i: number) => (
              <li key={i}>
                <div className="font-semibold text-slate-100">{s?.title ?? `قسم ${i + 1}`}</div>
                {typeof s?.body === "string" && (
                  <p className="line-clamp-3 whitespace-pre-line text-slate-400">{s.body}</p>
                )}
              </li>
            ))}
            {sections.length > 4 && <li className="text-[10px] text-slate-500">…</li>}
          </ul>
        </Section>
      )}

      {/* Era selector */}
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="mb-2 text-xs font-semibold text-amber-100">اختر العصر يدويًا</div>
        <div className="flex flex-wrap gap-1.5">
          {eraOptions.map((o) => {
            const active = choice === o.key;
            const isCurrent = currentEra === o.key;
            return (
              <button
                key={o.key}
                onClick={() => setChoice(o.key)}
                disabled={saving}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  active
                    ? "border-amber-400 bg-amber-500/25 text-amber-50"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
                title={o.key}
              >
                {o.label}
                {isCurrent && <span className="ms-1 text-[9px] text-emerald-300">●</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            الاختيار: <b className="text-amber-100">{eraOptions.find(o => o.key === choice)?.label ?? "—"}</b>
            {choice && <span className="ms-1 font-mono text-slate-500">({choice})</span>}
          </div>
          <button
            onClick={() => onSave(choice)}
            disabled={!choice || !validEraKeys.has(choice) || saving || choice === currentEra}
            className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            حفظ ومتابعة
          </button>
        </div>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">{title}</h3>
      {children}
    </section>
  );
}

function MetaCell({
  label, value, valid, invalidHint,
}: { label: string; value: string; valid?: boolean; invalidHint?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${invalidHint ? "border-rose-500/40 bg-rose-500/5" : "border-slate-800 bg-slate-900/40"}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-[12px] ${value ? "text-slate-100" : "text-slate-500"} ${valid ? "" : ""}`}>
        {value || "—"}
        {invalidHint && <span className="ms-1 text-[10px] text-rose-300">(غير قانوني)</span>}
      </div>
    </div>
  );
}

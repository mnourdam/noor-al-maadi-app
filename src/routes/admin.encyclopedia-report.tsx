// ============================================================
// Admin: Encyclopedia Data Report
//
// Read-only diagnostic surface for content authoring.
// Everything is derived from:
//   • Live Supabase rows in `public.encyclopedia_entities`
//   • App-side canonical constants:
//       - ERAS         (src/lib/app-constants.ts)
//       - WORLD_HUBS   (src/lib/worlds.ts)
//       - SUPABASE_ENABLED_TYPES / isDisplayableEntity
//                      (src/lib/encyclopedia-source.ts)
//       - relationship-graph rules
//                      (src/lib/relationship-graph.ts)
//
// No taxonomy is invented in this page. Discrepancies between what's
// in the database and what the app accepts are surfaced as "not accepted"
// so authors know which values are safe to reuse.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Loader2, ShieldCheck, Download, Network, Filter,
  Database, BookOpen, Link2, AlertTriangle, CheckCircle2, XCircle, Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OrphanRelationEditor } from "@/components/admin/OrphanRelationEditor";
import { AdminGate } from "@/lib/admin-guard";
import { ERAS } from "@/lib/app-constants";
import { WORLD_HUBS, WORLD_ERA } from "@/lib/worlds";
import { useTaxonomy } from "@/lib/taxonomy";
import {
  SUPABASE_ENABLED_TYPES,
  isDisplayableEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/encyclopedia-report")({
  head: () => ({
    meta: [
      { title: "تقرير بيانات الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <Page />
    </AdminGate>
  ),
});

// ─────────────────────────────────────────────────────────────
// Local types + canonical labels (kept here for display only).
// ─────────────────────────────────────────────────────────────

type Row = SupabaseEncyclopediaEntity;

const TYPE_LABELS: Record<string, string> = {
  figure: "شخصية",
  city: "مدينة",
  battle: "معركة",
  state: "دولة",
  landmark: "معلم",
  artifact: "قطعة أثرية",
  event: "حدث",
  scholar: "عالم",
};

const STATUS_VALUES: Array<{ key: string; label: string; desc: string }> = [
  { key: "enabled=true",  label: "منشور", desc: "الصف يظهر في الموسوعة إذا اجتاز بوابة الجودة." },
  { key: "enabled=false", label: "معطّل", desc: "مخفي بالكامل — لا يظهر في أي واجهة عامة." },
];

const VISIBILITY_VALUES: Array<{ key: string; label: string; desc: string }> = [
  { key: "displayable", label: "قابل للعرض", desc: "enabled + ملخّص ≥ 40 حرفًا أو نص/أقسام حقيقية." },
  { key: "hidden-quality", label: "محجوب لجودة", desc: "enabled لكن يفشل في isDisplayableEntity." },
  { key: "disabled", label: "معطّل يدويًا", desc: "enabled=false — قرار محرّر." },
];

// ─────────────────────────────────────────────────────────────
// Explicit-only relationship rules (mirrors relationship-graph.ts)
// ─────────────────────────────────────────────────────────────

const REL_SOURCES: Array<{
  score: number;
  reason: "explicit" | "biography" | "geography";
  field: string;
  note: string;
}> = [
  { score: 100, reason: "explicit",   field: "metadata.related_entities", note: "قائمة صريحة من slugs/ids — أعلى ثقة." },
  { score: 100, reason: "explicit",   field: "metadata.related",          note: "اسم مختصر مقبول للحقل ذاته." },
  { score: 90,  reason: "explicit",   field: "metadata.relationships",    note: "قائمة صريحة موسّعة." },
  { score: 95,  reason: "biography",  field: "metadata.battles[]",        note: "معارك ذُكرت في سيرة هذا الكيان." },
  { score: 95,  reason: "biography",  field: "metadata.events[]",         note: "أحداث ذُكرت في سيرة هذا الكيان." },
  { score: 95,  reason: "biography",  field: "metadata.commanders[]",     note: "قادة مرتبطون (لمعارك/دول)." },
  { score: 95,  reason: "biography",  field: "metadata.figures[]",        note: "شخصيات مرتبطة (لأحداث/دول)." },
  { score: 95,  reason: "biography",  field: "metadata.related_battles[]",note: "مرادف مقبول." },
  { score: 95,  reason: "biography",  field: "metadata.related_events[]", note: "مرادف مقبول." },
  { score: 95,  reason: "biography",  field: "metadata.related_figures[]",note: "مرادف مقبول." },
  { score: 95,  reason: "biography",  field: "metadata.landmarks[]",      note: "معالم مرتبطة (لمدن/دول)." },
  { score: 95,  reason: "biography",  field: "metadata.location",         note: "slug لمدينة/مكان." },
  { score: 95,  reason: "biography",  field: "metadata.capital",          note: "slug عاصمة الدولة." },
  { score: 95,  reason: "biography",  field: "metadata.state",            note: "slug الدولة التي ينتمي إليها الكيان." },
  { score: 95,  reason: "biography",  field: "metadata.city",             note: "slug المدينة (لمعالم/أحداث)." },
  { score: 95,  reason: "biography",  field: "metadata.affiliation",      note: "slug الانتماء السياسي." },
  { score: 60,  reason: "geography",  field: "(reverse) other.metadata.city/location/capital == this.slug", note: "يُحسب تلقائيًا للمدن." },
  { score: 60,  reason: "geography",  field: "(reverse) other.metadata.state/affiliation == this.slug",    note: "يُحسب تلقائيًا للدول." },
];

const REL_IGNORED: string[] = [
  "aliases",
  "tags",
  "era",
  "world",
  "campaign / unlock_chapter",
  "atlas_id / atlas_slug",
  "same-era pairing",
  "any heuristic / synthetic edge",
];

const VALID_LINK_KINDS: Array<{ from: string; to: string; how: string }> = [
  { from: "figure",   to: "state",    how: "figure.metadata.state = <state.slug> أو state.metadata.figures[] يحتوي slug الشخصية." },
  { from: "figure",   to: "event",    how: "figure.metadata.events[] أو event.metadata.figures[]." },
  { from: "figure",   to: "battle",   how: "figure.metadata.battles[] أو battle.metadata.commanders[]." },
  { from: "state",    to: "city",     how: "state.metadata.capital = <city.slug> أو city.metadata.state." },
  { from: "state",    to: "figure",   how: "state.metadata.figures[] أو figure.metadata.state." },
  { from: "artifact", to: "figure",   how: "artifact.metadata.related_entities[] يحتوي slug الشخصية." },
  { from: "artifact", to: "campaign", how: "لا يُبنى في الشبكة — الحملات تُربط عبر admin_campaigns فقط." },
  { from: "city",     to: "event",    how: "event.metadata.location = <city.slug> أو city.metadata.events[]." },
  { from: "landmark", to: "city",     how: "landmark.metadata.city = <city.slug> أو landmark.metadata.location." },
  { from: "battle",   to: "state",    how: "battle.metadata.state أو state.metadata.battles[]." },
];

// ─────────────────────────────────────────────────────────────
// Quality gate — mirror + reasons
// ─────────────────────────────────────────────────────────────

function bodyHasContent(body: unknown): boolean {
  if (!body) return false;
  if (typeof body === "string") return body.trim().length >= 40;
  if (typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.overview === "string" && b.overview.trim().length >= 40) return true;
  if (typeof b.introduction === "string" && b.introduction.trim().length >= 40) return true;
  for (const k of ["sections", "blocks", "timeline", "facts"]) {
    if (Array.isArray((b as any)[k]) && (b as any)[k].length > 0) return true;
  }
  return false;
}

function qualityReasons(r: Row): string[] {
  const reasons: string[] = [];
  if (!r.title || !r.title.trim()) reasons.push("missing_title");
  if (!SUPABASE_ENABLED_TYPES.has(r.entity_type)) reasons.push("invalid_type");
  if (r.enabled === false) reasons.push("unpublished");
  const summary = (r.summary ?? "").trim();
  if (summary.length < 40 && !bodyHasContent(r.body)) {
    if (!summary) reasons.push("missing_overview");
    if (!bodyHasContent(r.body)) reasons.push("missing_body");
  }
  const meta = (r.metadata && typeof r.metadata === "object")
    ? (r.metadata as Record<string, unknown>) : {};
  const era = typeof meta.era === "string" ? meta.era : "";
  if (era && !CANONICAL_ERA_KEYS.has(era)) reasons.push("non_canonical_era");
  if (!r.slug || !/^[a-z0-9-]+$/.test(r.slug)) reasons.push("broken_slug");
  if (meta.needs_content === true) reasons.push("stub_flag");
  return reasons;
}

// Canonical key sets — seeded from code constants and augmented at runtime
// by CMS-managed taxonomy rows (see useSyncCanonicalKeys() below). Sets are
// mutable so aggregation code that runs after taxonomy resolves still sees
// admin-added values without threading them through every helper.
const CANONICAL_ERA_KEYS: Set<string> = new Set(ERAS.map((e) => e.id as string));
const CANONICAL_WORLD_KEYS: Set<string> = new Set(WORLD_HUBS.map((w) => w.slug));

// ─────────────────────────────────────────────────────────────
// Fetch every enabled/disabled row in pages (Supabase caps at 1000).
// ─────────────────────────────────────────────────────────────

async function fetchAllEntities(): Promise<Row[]> {
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select(
        "id,slug,entity_type,title,subtitle,summary,body,metadata,enabled,created_at,updated_at",
      )
      .order("entity_type", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data as unknown as Row[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    if (from > 20_000) break; // safety
  }
  return all;
}

// ─────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────

function metaObj(r: Row): Record<string, unknown> {
  return r.metadata && typeof r.metadata === "object"
    ? (r.metadata as Record<string, unknown>) : {};
}

function countBy<T extends Row>(rows: T[], pick: (r: T) => string | undefined | null) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (pick(r) ?? "").trim();
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function download(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// Explicit relationship check per entity
// ─────────────────────────────────────────────────────────────

function hasExplicitRelationships(r: Row): boolean {
  const m = metaObj(r);
  const anyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
  const anyStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (anyArr(m.related_entities) || anyArr(m.related) || anyArr(m.relationships)) return true;
  for (const f of ["battles","events","commanders","figures","related_battles","related_events","related_figures","landmarks"]) {
    if (anyArr((m as any)[f])) return true;
  }
  for (const f of ["location","capital","state","city","affiliation"]) {
    if (anyStr((m as any)[f])) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Metadata authoring templates (canonical keys only)
// ─────────────────────────────────────────────────────────────

function authoringTemplate(type: string): Record<string, unknown> {
  const base = {
    era: "<one of: " + ERAS.map((e) => e.id).join(" | ") + ">",
    world: "<one of: " + WORLD_HUBS.map((w) => w.slug).join(" | ") + ">",
    related: [] as string[],
    aliases: [] as string[],
    tags: [] as string[],
    sources: [] as string[],
    canonical: true,
  };
  switch (type) {
    case "figure":
      return { ...base, state: "<state.slug>", role: "…", type_label: "شخصية",
        birth_period: "…", death_gregorian: "…",
        battles: [], events: [] };
    case "city":
      return { ...base, state: "<state.slug>", type_label: "مدينة",
        landmarks: [], events: [] };
    case "state":
      return { ...base, capital: "<city.slug>", type_label: "دولة",
        figures: [], battles: [], events: [] };
    case "battle":
      return { ...base, state: "<state.slug>", location: "<city.slug>", type_label: "معركة",
        commanders: [], figures: [] };
    case "event":
      return { ...base, state: "<state.slug>", location: "<city.slug>", type_label: "حدث",
        figures: [] };
    case "landmark":
      return { ...base, city: "<city.slug>", state: "<state.slug>", type_label: "معلم" };
    case "artifact":
      return { ...base, state: "<state.slug>", type_label: "قطعة أثرية",
        rarity: "common | uncommon | rare | epic | legendary",
        related_entities: [] };
    default:
      return base;
  }
}

// ============================================================
// Page
// ============================================================

function Page() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull CMS-managed taxonomy and merge admin-added keys into the
  // canonical sets so entities using new eras/worlds stop being flagged.
  const eraTax = useTaxonomy("era");
  const worldTax = useTaxonomy("world");
  useEffect(() => {
    for (const e of eraTax.entries) if (e.enabled && !e.archived) CANONICAL_ERA_KEYS.add(e.key);
    for (const w of worldTax.entries) if (w.enabled && !w.archived) CANONICAL_WORLD_KEYS.add(w.key);
    // Trigger re-render so downstream memos re-run against the enlarged sets.
    if (rows) setRows((prev) => (prev ? [...prev] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eraTax.entries, worldTax.entries]);

  useEffect(() => {
    fetchAllEntities().then(setRows).catch((e) => setError(e.message ?? String(e)));
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex items-start gap-3 border-b border-amber-500/20 pb-4">
          <Database className="mt-1 h-7 w-7 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-amber-100">تقرير بيانات الموسوعة</h1>
            <p className="text-sm text-slate-400">
              مرجع تشخيصي لفهم القيم القياسية، آلية الروابط، بوابة الجودة، والكيانات التي تحتاج ربطًا —
              مبني حصريًا من ثوابت التطبيق ومحتوى Supabase الحيّ.
            </p>
          </div>
          <Link to="/admin" className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200">
            رجوع للوحة الإدارة <ChevronRight className="h-4 w-4" />
          </Link>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            تعذّر تحميل البيانات: {error}
          </div>
        )}

        {!rows && !error && (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل جميع صفوف الموسوعة…
          </div>
        )}

        {rows && (
          <>
            <TaxonomySection rows={rows} />
            <RelationshipSection />
            <QualityGateSection rows={rows} />
            <OrphanSection rows={rows} />
            <AuthoringGuideSection />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 1. Canonical taxonomy report
// ============================================================

function TaxonomySection({ rows }: { rows: Row[] }) {
  const enabled = rows.filter((r) => r.enabled !== false);

  const eraCounts = countBy(enabled, (r) => (metaObj(r).era as string) ?? "");
  const worldCounts = countBy(enabled, (r) => (metaObj(r).world as string) ?? "");
  const stateCounts = countBy(enabled, (r) => (metaObj(r).state as string) ?? "");
  const typeCounts = countBy(rows, (r) => r.entity_type);

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<BookOpen className="h-5 w-5" />}
        title="١. التصنيف القياسي (canonical taxonomy)"
        subtitle="القيم المعتمدة من التطبيق مقابل ما هو موجود فعليًا في قاعدة البيانات."
      />

      <TaxonomyTable
        field="era"
        rows={ERAS.map((e) => ({
          key: e.id,
          label: e.name,
          count: eraCounts.get(e.id) ?? 0,
          usedIn: "metadata.era — فلاتر الموسوعة، الأطلس، المحاور",
          accepted: true,
        }))}
        extraRows={Array.from(eraCounts.entries())
          .filter(([k]) => !CANONICAL_ERA_KEYS.has(k))
          .map(([k, count]) => ({ key: k, label: "—", count, usedIn: "قيمة غير معتمدة", accepted: false }))}
      />

      <TaxonomyTable
        field="world"
        rows={WORLD_HUBS.map((w) => ({
          key: w.slug,
          label: w.slug,
          count: worldCounts.get(w.slug) ?? 0,
          usedIn: `metadata.world — WORLD_ERA=${WORLD_ERA[w.slug] ?? "—"}`,
          accepted: true,
        }))}
        extraRows={Array.from(worldCounts.entries())
          .filter(([k]) => !CANONICAL_WORLD_KEYS.has(k))
          .map(([k, count]) => ({ key: k, label: "—", count, usedIn: "قيمة غير معتمدة (لن تُطابق محورًا)", accepted: false }))}
      />

      <TaxonomyTable
        field="state"
        rows={Array.from(stateCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40)
          .map(([slug, count]) => ({
            key: slug,
            label: "—",
            count,
            usedIn: "metadata.state — يجب أن يطابق slug صفٍّ من entity_type=state",
            accepted: true,
          }))}
        note={`الـstate ليس قائمة مغلقة — أي slug لدولة موجودة يعمل. عرض أعلى ٤٠ قيمة استخدامًا (من ${stateCounts.size} قيمة مسجّلة).`}
      />

      <TaxonomyTable
        field="type"
        rows={Array.from(SUPABASE_ENABLED_TYPES).map((t) => ({
          key: t,
          label: TYPE_LABELS[t] ?? "—",
          count: typeCounts.get(t) ?? 0,
          usedIn: "encyclopedia_entities.entity_type — فلاتر ومسارات /encyclopedia/type/$type",
          accepted: true,
        }))}
        extraRows={Array.from(typeCounts.entries())
          .filter(([k]) => !SUPABASE_ENABLED_TYPES.has(k))
          .map(([k, count]) => ({ key: k, label: "—", count, usedIn: "نوع غير مقبول — سيُخفى", accepted: false }))}
      />

      <TaxonomyTable
        field="status"
        rows={STATUS_VALUES.map((s) => ({
          key: s.key,
          label: s.label,
          count: s.key === "enabled=true" ? rows.filter((r) => r.enabled !== false).length : rows.filter((r) => r.enabled === false).length,
          usedIn: s.desc,
          accepted: true,
        }))}
      />

      <TaxonomyTable
        field="visibility"
        rows={VISIBILITY_VALUES.map((v) => {
          let count = 0;
          if (v.key === "displayable") count = rows.filter(isDisplayableEntity).length;
          else if (v.key === "hidden-quality") count = rows.filter((r) => r.enabled !== false && !isDisplayableEntity(r)).length;
          else count = rows.filter((r) => r.enabled === false).length;
          return { key: v.key, label: v.label, count, usedIn: v.desc, accepted: true };
        })}
      />
    </section>
  );
}

function TaxonomyTable({
  field, rows, extraRows = [], note,
}: {
  field: string;
  rows: Array<{ key: string; label: string; count: number; usedIn: string; accepted: boolean }>;
  extraRows?: Array<{ key: string; label: string; count: number; usedIn: string; accepted: boolean }>;
  note?: string;
}) {
  const all = [...rows, ...extraRows];
  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-2">
        <div className="text-sm font-semibold text-amber-200">حقل: {field}</div>
        <div className="text-xs text-slate-400">{all.length} قيمة</div>
      </div>
      {note && <div className="border-b border-amber-500/10 bg-slate-950/40 px-4 py-2 text-xs text-slate-400">{note}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-950/60 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-normal">المفتاح</th>
              <th className="px-3 py-2 font-normal">التسمية العربية</th>
              <th className="px-3 py-2 font-normal">العدد</th>
              <th className="px-3 py-2 font-normal">أين يُستخدم</th>
              <th className="px-3 py-2 font-normal">مقبول</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.key} className="border-t border-slate-800/70">
                <td className="px-3 py-2 font-mono text-xs text-amber-100">{r.key}</td>
                <td className="px-3 py-2 text-slate-200">{r.label}</td>
                <td className="px-3 py-2 text-slate-300">{r.count}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{r.usedIn}</td>
                <td className="px-3 py-2">
                  {r.accepted ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> نعم
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-300">
                      <XCircle className="h-3.5 w-3.5" /> لا
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// 2. Relationship mechanism explanation
// ============================================================

function RelationshipSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<Network className="h-5 w-5" />}
        title="٢. آلية الروابط (Related History Network)"
        subtitle="روابط صريحة فقط — لا استنتاج، لا مطابقة عصر، لا تخمين من الحملات أو الأطلس."
      />

      <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900/60">
        <div className="border-b border-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200">
          المصادر المقبولة (بالترتيب الوزني)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950/60 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2 font-normal">الوزن</th>
                <th className="px-3 py-2 font-normal">السبب</th>
                <th className="px-3 py-2 font-normal">الحقل</th>
                <th className="px-3 py-2 font-normal">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {REL_SOURCES.map((s, i) => (
                <tr key={i} className="border-t border-slate-800/70">
                  <td className="px-3 py-2 font-mono text-xs text-amber-100">{s.score}</td>
                  <td className="px-3 py-2 text-slate-200">{s.reason}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">{s.field}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
        <div className="mb-2 flex items-center gap-2 font-semibold text-red-200">
          <AlertTriangle className="h-4 w-4" /> حقول لا تُنشئ روابط
        </div>
        <ul className="grid gap-1 pr-4 text-slate-300 md:grid-cols-2">
          {REL_IGNORED.map((f) => (
            <li key={f} className="list-disc font-mono text-xs">{f}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          هذه الحقول قد تُستخدم للبحث أو الفلترة أو العرض، لكنها لا تُنتج edge في شبكة الروابط.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900/60">
        <div className="border-b border-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200">
          أنواع الروابط الصحيحة وكيفية تأليفها
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950/60 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2 font-normal">من</th>
                <th className="px-3 py-2 font-normal">إلى</th>
                <th className="px-3 py-2 font-normal">كيفية التوثيق</th>
              </tr>
            </thead>
            <tbody>
              {VALID_LINK_KINDS.map((k, i) => (
                <tr key={i} className="border-t border-slate-800/70">
                  <td className="px-3 py-2 font-mono text-xs text-amber-100">{k.from}</td>
                  <td className="px-3 py-2 font-mono text-xs text-amber-100">{k.to}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{k.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        تُقرأ القواعد من <code className="font-mono">src/lib/relationship-graph.ts</code> — أي إضافة مصدر جديد يتطلب تعديل الملف وتحديث هذا التقرير.
      </p>
    </section>
  );
}

// ============================================================
// 3. Quality gate report — with filters + CSV
// ============================================================

function QualityGateSection({ rows }: { rows: Row[] }) {
  const [fType, setFType] = useState<string>("");
  const [fEra, setFEra] = useState<string>("");
  const [fWorld, setFWorld] = useState<string>("");
  const [fState, setFState] = useState<string>("");
  const [fPass, setFPass] = useState<"all" | "pass" | "fail">("fail");

  const analyzed = useMemo(() => {
    return rows.map((r) => ({
      row: r,
      reasons: qualityReasons(r),
      displayable: isDisplayableEntity(r),
    }));
  }, [rows]);

  const filtered = useMemo(() => {
    return analyzed.filter(({ row, displayable }) => {
      const m = metaObj(row);
      if (fType && row.entity_type !== fType) return false;
      if (fEra && (m.era as string) !== fEra) return false;
      if (fWorld && (m.world as string) !== fWorld) return false;
      if (fState && (m.state as string) !== fState) return false;
      if (fPass === "pass" && !displayable) return false;
      if (fPass === "fail" && displayable) return false;
      return true;
    });
  }, [analyzed, fType, fEra, fWorld, fState, fPass]);

  const stateOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = (metaObj(r).state as string) ?? "";
      if (v) s.add(v);
    }
    return Array.from(s).sort();
  }, [rows]);

  function exportCsv() {
    const header = ["id","entity_type","slug","title","enabled","displayable","reasons","era","world","state"];
    const lines = [header.join(",")];
    for (const { row, reasons, displayable } of filtered) {
      const m = metaObj(row);
      lines.push([
        row.id, row.entity_type, row.slug, row.title, row.enabled,
        displayable, reasons.join("|"),
        m.era ?? "", m.world ?? "", m.state ?? "",
      ].map(csvEscape).join(","));
    }
    download(`encyclopedia-quality-${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  const passCount = analyzed.filter((a) => a.displayable).length;
  const failCount = analyzed.length - passCount;

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="٣. تقرير بوابة الجودة"
        subtitle={`${passCount} صف يمر بـ isDisplayableEntity، ${failCount} صف محجوب.`}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
        <FilterSelect label="النوع" value={fType} onChange={setFType}
          options={[{ v: "", l: "الكل" }, ...Array.from(SUPABASE_ENABLED_TYPES).map((t) => ({ v: t, l: `${t} (${TYPE_LABELS[t] ?? ""})` }))]} />
        <FilterSelect label="العصر" value={fEra} onChange={setFEra}
          options={[{ v: "", l: "الكل" }, ...ERAS.map((e) => ({ v: e.id, l: `${e.id} — ${e.name}` }))]} />
        <FilterSelect label="العالم" value={fWorld} onChange={setFWorld}
          options={[{ v: "", l: "الكل" }, ...WORLD_HUBS.map((w) => ({ v: w.slug, l: w.slug }))]} />
        <FilterSelect label="الدولة" value={fState} onChange={setFState}
          options={[{ v: "", l: "الكل" }, ...stateOptions.map((s) => ({ v: s, l: s }))]} />
        <FilterSelect label="الحالة" value={fPass} onChange={(v) => setFPass(v as any)}
          options={[{ v: "fail", l: "فشل فقط" }, { v: "pass", l: "نجاح فقط" }, { v: "all", l: "الكل" }]} />
        <div className="mr-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{filtered.length.toLocaleString("ar")} نتيجة</span>
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20">
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-amber-500/20 bg-slate-900/60">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-950/60 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-normal">العنوان</th>
              <th className="px-3 py-2 font-normal">النوع</th>
              <th className="px-3 py-2 font-normal">slug</th>
              <th className="px-3 py-2 font-normal">الحالة</th>
              <th className="px-3 py-2 font-normal">أسباب الفشل</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map(({ row, reasons, displayable }) => (
              <tr key={row.id} className="border-t border-slate-800/70">
                <td className="px-3 py-2 text-slate-100">{row.title || <span className="text-red-300">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.entity_type}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.slug}</td>
                <td className="px-3 py-2 text-xs">
                  {displayable
                    ? <span className="text-emerald-300">نجاح</span>
                    : <span className="text-red-300">فشل</span>}
                </td>
                <td className="px-3 py-2 text-xs text-amber-200">
                  {reasons.length ? reasons.join("، ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="border-t border-slate-800 px-4 py-2 text-center text-xs text-slate-500">
            يعرض أول 500 نتيجة — استخدم CSV للتصدير الكامل.
          </div>
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex items-center gap-1"><Filter className="h-3 w-3" /> {label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

// ============================================================
// 4. Orphan / weak-relationship report
// ============================================================

function OrphanSection({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [tick, setTick] = useState(0); // bump to force re-derive after save

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const t of SUPABASE_ENABLED_TYPES) map.set(t, []);
    for (const r of rows) {
      if (!isDisplayableEntity(r)) continue;
      if (hasExplicitRelationships(r)) continue;
      const bucket = map.get(r.entity_type);
      if (bucket) bucket.push(r);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tick]);

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<Link2 className="h-5 w-5" />}
        title="٤. الكيانات اليتيمة (بدون روابط صريحة)"
        subtitle="منشورة ومقبولة عرضيًا، لكنها لا تُصرّح بأي كيان مرتبط. استخدم «إضافة روابط» لاعتماد روابط صريحة."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {Array.from(groups.entries()).map(([type, list]) => (
          <div key={type} className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-amber-200">
                {TYPE_LABELS[type] ?? type} <span className="font-mono text-xs text-slate-400">({type})</span>
              </div>
              <div className="text-xs text-slate-400">{list.length} كيان</div>
            </div>
            {list.length === 0 ? (
              <div className="text-xs text-emerald-300">لا يوجد يتامى — كل الكيانات مربوطة.</div>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                {list.slice(0, 60).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded border border-slate-800/60 bg-slate-950/40 px-2 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-100">{r.title}</div>
                      <div dir="ltr" className="truncate font-mono text-[10px] text-slate-500">{r.slug}</div>
                    </div>
                    <button
                      onClick={() => setEditing(r)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-500/20"
                    >
                      <Plus className="size-3" /> إضافة روابط
                    </button>
                  </li>
                ))}
                {list.length > 60 && (
                  <li className="text-center text-[11px] text-slate-500">… و{list.length - 60} كيان آخر.</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <OrphanRelationEditor
          entity={editing}
          allRows={rows}
          onClose={() => setEditing(null)}
          onSaved={() => setTick((n) => n + 1)}
        />
      )}
    </section>
  );
}


// ============================================================
// 5. Metadata authoring guide
// ============================================================

function AuthoringGuideSection() {
  const types = ["figure","city","state","battle","event","landmark","artifact"];
  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<BookOpen className="h-5 w-5" />}
        title="٥. دليل تأليف الميتاداتا"
        subtitle="القوالب أدناه تستخدم القيم القياسية المعتمدة فعليًا في التطبيق. انسخ القالب وامْلأه بمفاتيح slugs موجودة."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {types.map((t) => (
          <div key={t} className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-2">
              <div className="text-sm font-semibold text-amber-200">
                {TYPE_LABELS[t] ?? t} <span className="font-mono text-xs text-slate-400">({t})</span>
              </div>
            </div>
            <pre dir="ltr" className="overflow-x-auto bg-slate-950/70 p-3 text-[11px] leading-6 text-emerald-100">
{JSON.stringify(authoringTemplate(t), null, 2)}
            </pre>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-6 text-slate-300">
        <div className="mb-1 flex items-center gap-2 font-semibold text-amber-200">
          <ShieldCheck className="h-4 w-4" /> قواعد يجب اتباعها
        </div>
        <ul className="list-disc space-y-1 pr-5">
          <li>كل قيمة <code>era</code> يجب أن تكون واحدة من ERAS العشرة أعلاه — أي شيء آخر يُرفض من الفلاتر.</li>
          <li>كل قيمة <code>world</code> يجب أن تكون slug محور موجود في WORLD_HUBS.</li>
          <li>كل مرجع slug (state، city، capital، related…) يجب أن يكون slug صفٍّ موجود ومنشور — وإلا لن تُبنى الحافّة.</li>
          <li>الملخّص (<code>summary</code>) ≥ 40 حرفًا أو <code>body</code> يحتوي overview/sections/timeline/facts — وإلا يفشل في بوابة الجودة.</li>
          <li>الروابط تُبنى فقط من الحقول الموثقة في القسم ٢ — لا تعتمد على aliases أو tags أو era لإنشاء علاقة.</li>
        </ul>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, subtitle,
}: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-amber-500/20 pb-2">
      <div className="mt-1 text-amber-300">{icon}</div>
      <div className="flex-1">
        <h2 className="text-lg font-bold text-amber-100">{title}</h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

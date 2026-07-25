// ============================================================
// BulkOrphanLinker
//
// One-click SAFE bulk relation curator for orphan encyclopedia
// entities. It reuses the same suggestion signals as the manual
// OrphanRelationEditor but only auto-proposes HIGH-confidence
// links (never era/world/state alone). Every proposed link goes
// through a preview table with per-row + per-entity approval
// before any writes. Saves append to metadata.related_entities
// via the standard Data API (RLS + audits apply as elsewhere).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import {
  Wand2, X, Loader2, CheckCircle2, AlertTriangle, Download,
  ShieldCheck, Filter, RefreshCw, Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { selectCampaignRows } from "@/lib/campaigns/entities";

type Row = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  aliases?: string[] | null;
};

const TYPE_LABELS: Record<string, string> = {
  figure: "شخصية", city: "مدينة", battle: "معركة", state: "دولة",
  landmark: "معلم", artifact: "قطعة أثرية", event: "حدث", scholar: "عالم",
};

// Which target-types are meaningful for each source-type (same
// contract as the manual editor). Used to diversify per-entity picks.
const ALLOWED_TARGETS: Record<string, string[]> = {
  figure:   ["battle", "event", "city", "state", "scholar"],
  scholar:  ["figure", "city", "state", "event"],
  artifact: ["event", "figure", "battle", "city", "state"],
  battle:   ["figure", "city", "state", "event"],
  city:     ["state", "event", "figure", "battle", "landmark"],
  state:    ["city", "figure", "battle", "event"],
  event:    ["figure", "battle", "city", "state"],
  landmark: ["city", "state", "event"],
};

type Confidence = "high" | "medium" | "low";

type Proposal = {
  target: Row;
  reasons: string[];
  confidence: Confidence;
  score: number;
};

type EntityPlan = {
  source: Row;
  proposals: Proposal[]; // pre-capped, high-confidence, diversified
};

function metaObj(r: Row): Record<string, unknown> {
  return r.metadata && typeof r.metadata === "object"
    ? (r.metadata as Record<string, unknown>) : {};
}
function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x.trim());
}
function bodyHasContent(body: unknown): boolean {
  if (!body) return false;
  if (typeof body === "string") return body.trim().length >= 40;
  if (typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.overview === "string" && b.overview.trim().length >= 40) return true;
  if (typeof b.introduction === "string" && b.introduction.trim().length >= 40) return true;
  for (const k of ["sections", "blocks", "timeline", "facts"]) {
    const v = b[k];
    if (Array.isArray(v) && v.length) return true;
  }
  return false;
}
function isDisplayable(r: Row): boolean {
  if (!r.enabled) return false;
  if (!r.summary || r.summary.trim().length < 20) return false;
  return bodyHasContent(r.body);
}
function existingRelated(r: Row): Set<string> {
  const m = metaObj(r);
  return new Set<string>([
    ...asStrArr(m.related_entities).map((s) => s.toLowerCase()),
    ...asStrArr(m.related).map((s) => s.toLowerCase()),
    ...asStrArr(m.relationships).map((s) => s.toLowerCase()),
  ]);
}
function slugFamily(slug: string): string | null {
  // First token before the last "-" segment; only counts if long enough
  // to be meaningful (avoids linking "abu-*" / "ibn-*" false positives).
  const parts = slug.toLowerCase().split("-").filter(Boolean);
  if (parts.length < 3) return null;
  const head = parts.slice(0, parts.length - 1).join("-");
  return head.length >= 8 ? head : null;
}

// ------------------------------------------------------------
// Suggestion engine (extended vs. manual editor, but strict).
// Returns per-orphan proposals with an assigned confidence tier.
// ------------------------------------------------------------
function buildPlans(
  orphans: Row[],
  allRows: Row[],
  campaignCoSlugs: Map<string, Set<string>>, // entity.slug -> set of other slugs co-mentioned in an admin_campaign
  maxPerEntity: number,
): EntityPlan[] {
  const bySlug = new Map<string, Row>();
  for (const r of allRows) bySlug.set(r.slug.toLowerCase(), r);
  const pool = allRows.filter(isDisplayable);

  return orphans.map<EntityPlan>((source) => {
    const sm = metaObj(source);
    const era     = asStr(sm.era);
    const world   = asStr(sm.world);
    const state   = asStr(sm.state) ?? asStr(sm.affiliation);
    const city    = asStr(sm.city)  ?? asStr(sm.location);
    const tags    = new Set(asStrArr(sm.tags).map((t) => t.toLowerCase()));
    const already = existingRelated(source);
    const allowed = new Set(ALLOWED_TARGETS[source.entity_type] ?? []);
    const co      = campaignCoSlugs.get(source.slug.toLowerCase()) ?? new Set<string>();
    const family  = slugFamily(source.slug);

    const raw: Proposal[] = [];
    for (const t of pool) {
      if (t.id === source.id) continue;
      const slugLc = t.slug.toLowerCase();
      if (already.has(slugLc)) continue;

      const tm = metaObj(t);
      const tState = asStr(tm.state) ?? asStr(tm.affiliation);
      const tCity  = asStr(tm.city)  ?? asStr(tm.location);
      const tEra   = asStr(tm.era);
      const tWorld = asStr(tm.world);
      const tTags  = new Set(asStrArr(tm.tags).map((x) => x.toLowerCase()));

      const reasons: string[] = [];
      let confidence: Confidence = "low";
      let score = 0;

      // -------- HIGH-confidence signals --------
      if (co.has(slugLc)) {
        reasons.push("مجموعة الحملة نفسها");
        confidence = "high"; score += 120;
      }
      // Cluster: target slug is referenced by an explicit canonical field
      // on the source (e.g. figure.state === target.slug) or vice-versa.
      const clusterHits: string[] = [];
      if (state && state === t.slug)                          clusterHits.push("دولة مرجعية");
      if (city  && city  === t.slug)                          clusterHits.push("مدينة مرجعية");
      if (asStr(sm.battle) === t.slug)                        clusterHits.push("معركة مرجعية");
      if (asStr(sm.event)  === t.slug)                        clusterHits.push("حدث مرجعي");
      if (tState && tState === source.slug)                   clusterHits.push("مرجع دولة عكسي");
      if (tCity  && tCity  === source.slug)                   clusterHits.push("مرجع مدينة عكسي");
      if (asStr(tm.battle) === source.slug)                   clusterHits.push("مرجع معركة عكسي");
      if (asStr(tm.event)  === source.slug)                   clusterHits.push("مرجع حدث عكسي");
      if (clusterHits.length) {
        reasons.push(`عنقود صريح: ${clusterHits[0]}`);
        confidence = "high"; score += 90 + clusterHits.length * 5;
      }
      // Slug family (shared prefix, e.g. `battle-of-hattin-*`)
      if (family && slugLc.startsWith(family + "-")) {
        reasons.push("نفس عائلة الـ slug");
        confidence = "high"; score += 70;
      }
      // Exact state + world + era + strong shared tags (≥2)
      const sharedTags = [...tags].filter((x) => tTags.has(x));
      const geoAll = !!state && !!world && !!era
        && tState === state && tWorld === world && tEra === era;
      if (geoAll && sharedTags.length >= 2) {
        reasons.push(`نفس الدولة/العالم/الحقبة + وسوم: ${sharedTags.slice(0, 2).join("، ")}`);
        confidence = "high"; score += 60 + sharedTags.length * 5;
      }

      // -------- MEDIUM-confidence signals --------
      // Requires at least one DIRECT historical signal. Context
      // (era/world/state) alone is never Medium — it is Low.
      if (confidence !== "high") {
        // Direct historical: ≥2 shared historical tags. Context, when
        // present, only boosts the score — it does not qualify alone.
        if (sharedTags.length >= 2) {
          reasons.push(`وسوم تاريخية مشتركة: ${sharedTags.slice(0, 2).join("، ")}`);
          confidence = "medium"; score += 25 + sharedTags.length * 3;
          if (geoAll)       { reasons.push("سياق: نفس الدولة/العالم/الحقبة"); score += 10; }
          else if (state && tState === state) { reasons.push("سياق: نفس الدولة"); score += 5; }
        }
        // Soft city/landmark co-mention (source city referenced anywhere
        // in target's known fields but not as an explicit canonical link).
        else if (city && (tCity === city)) {
          reasons.push("مدينة مشتركة");
          confidence = "medium"; score += 22;
        }
      }

      // -------- LOW (contextual similarity only) --------
      // era / world / state (any combination) with no historical signal.
      if (confidence === "low") {
        const ctx: string[] = [];
        if (state && tState === state) { ctx.push("نفس الدولة"); score += 10; }
        if (world && tWorld === world) { ctx.push("نفس العالم"); score += 6; }
        if (era   && tEra   === era)   { ctx.push("نفس الحقبة"); score += 4; }
        if (sharedTags.length === 1)   { ctx.push(`وسم مشترك: ${sharedTags[0]}`); score += 5; }
        if (!ctx.length) continue; // no signal at all
        reasons.push(ctx.join(" + "));
      }

      // Bias toward acceptable target kinds for this source type.
      if (allowed.has(t.entity_type)) score += 5;
      raw.push({ target: t, reasons, confidence, score });
    }

    // Diversify: at most one per target type first, then fill.
    raw.sort((a, b) => b.score - a.score);
    const chosen: Proposal[] = [];
    const usedTypes = new Set<string>();
    for (const p of raw) {
      if (chosen.length >= maxPerEntity) break;
      if (usedTypes.has(p.target.entity_type)) continue;
      chosen.push(p); usedTypes.add(p.target.entity_type);
    }
    for (const p of raw) {
      if (chosen.length >= maxPerEntity) break;
      if (chosen.includes(p)) continue;
      chosen.push(p);
    }

    return { source, proposals: chosen };
  });
}

// ------------------------------------------------------------
// Campaign co-membership index
// ------------------------------------------------------------
async function loadCampaignCoSlugs(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  try {
    const { data } = await supabase
      .from("admin_campaigns" as any)
      .select("id,data")
      .limit(1000);
    if (!data) return map;
    const re = /"(?:slug|entity_slug|entity|target|unlock_slug)"\s*:\s*"([a-z0-9][a-z0-9-]+)"/gi;
    for (const c of selectCampaignRows(data as unknown as Array<{ data: unknown }>)) {
      const blob = JSON.stringify(c.data ?? {});
      const set = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = re.exec(blob))) set.add(m[1].toLowerCase());
      const arr = [...set];
      for (const s of arr) {
        const co = map.get(s) ?? new Set<string>();
        for (const other of arr) if (other !== s) co.add(other);
        map.set(s, co);
      }
    }
  } catch { /* non-fatal */ }
  return map;
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------
export function BulkOrphanLinker({
  orphans, allRows, onClose, onDone,
}: {
  orphans: Row[];
  allRows: Row[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading]   = useState(true);
  const [plans, setPlans]       = useState<EntityPlan[]>([]);
  const [threshold, setThreshold] = useState<"high" | "high+medium">("high");
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key = `${sourceId}::${targetSlug}`
  const [saving, setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const co = await loadCampaignCoSlugs();
      if (cancelled) return;
      const built = buildPlans(orphans, allRows, co, 5);
      if (cancelled) return;
      setPlans(built);
      // Pre-select all HIGH-confidence proposals by default.
      const pre = new Set<string>();
      for (const plan of built) {
        for (const p of plan.proposals) {
          if (p.confidence === "high") pre.add(`${plan.source.id}::${p.target.slug}`);
        }
      }
      setSelected(pre);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orphans, allRows]);

  const visiblePlans = useMemo(() => {
    return plans
      .map((p) => ({
        ...p,
        proposals: p.proposals.filter((x) =>
          threshold === "high"
            ? x.confidence === "high"
            : x.confidence === "high" || x.confidence === "medium",
        ),
      }))
      .filter((p) => p.proposals.length > 0);
  }, [plans, threshold]);

  const totals = useMemo(() => {
    let high = 0, med = 0, entitiesWithAny = 0, selectedRows = 0;
    for (const p of plans) {
      let any = false;
      for (const pr of p.proposals) {
        if (pr.confidence === "high") { high++; any = true; }
        if (pr.confidence === "medium") { med++; }
        if (selected.has(`${p.source.id}::${pr.target.slug}`)) selectedRows++;
      }
      if (any) entitiesWithAny++;
    }
    return { high, med, entitiesWithAny, selectedRows };
  }, [plans, selected]);

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const approveAllHigh = () => {
    const next = new Set(selected);
    for (const p of plans) for (const pr of p.proposals)
      if (pr.confidence === "high") next.add(`${p.source.id}::${pr.target.slug}`);
    setSelected(next);
  };
  const clearAll = () => setSelected(new Set());

  const exportCsv = () => {
    const lines: string[] = ["entity_id,entity_slug,entity_type,target_slug,target_type,confidence,reasons"];
    for (const p of visiblePlans) {
      for (const pr of p.proposals) {
        const reasons = pr.reasons.join(" | ").replace(/"/g, '""');
        lines.push([
          p.source.id, p.source.slug, p.source.entity_type,
          pr.target.slug, pr.target.entity_type, pr.confidence,
          `"${reasons}"`,
        ].join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "orphan-bulk-linker.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const apply = async () => {
    setSaving(true); setErr(null); setSavedCount(0);
    try {
      // Group selected keys by source id.
      const grouped = new Map<string, string[]>();
      for (const key of selected) {
        const [srcId, slug] = key.split("::");
        if (!srcId || !slug) continue;
        const arr = grouped.get(srcId) ?? [];
        arr.push(slug);
        grouped.set(srcId, arr);
      }
      let done = 0;
      for (const [srcId, slugs] of grouped) {
        const src = plans.find((p) => p.source.id === srcId)?.source;
        if (!src) continue;
        const m = metaObj(src);
        const existing = asStrArr(m.related_entities);
        const merged = Array.from(new Set([...existing, ...slugs]));
        if (merged.length === existing.length) { done++; continue; }
        const nextMeta = { ...m, related_entities: merged };
        const { error } = await supabase
          .from("encyclopedia_entities")
          .update({ metadata: nextMeta as any })
          .eq("id", srcId);
        if (error) throw error;
        done++;
        setSavedCount(done);
      }
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" dir="rtl">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/20 bg-gradient-to-l from-slate-900 to-slate-950 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] tracking-widest text-amber-300">
              <Wand2 className="size-3.5" /> اقتراح وربط تلقائي آمن
            </div>
            <h2 className="text-lg font-bold text-amber-100">
              روابط مقترحة عالية الثقة للكيانات اليتيمة
            </h2>
            <p className="mt-1 max-w-xl text-[11px] text-slate-400">
              عالية: دليل تاريخي مباشر (حملة، عنقود صريح، عائلة slug، أو تطابق كامل + وسوم).
              متوسطة: إشارة تاريخية مباشرة (وسوم مشتركة ≥٢ أو مدينة مشتركة) مع دعم سياقي اختياري.
              منخفضة: تشابه سياقي فقط (حقبة/عالم/دولة) — لا تُعتمد تلقائيًا.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 p-1.5 text-slate-300 hover:bg-slate-800/60"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-900/40 px-5 py-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-amber-300" />
            <span>حد الثقة:</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-700/60">
              <button
                onClick={() => setThreshold("high")}
                className={
                  "px-2.5 py-1 " +
                  (threshold === "high" ? "bg-amber-500/25 text-amber-100" : "text-slate-300 hover:bg-slate-800/50")
                }
              >
                عالية فقط
              </button>
              <button
                onClick={() => setThreshold("high+medium")}
                className={
                  "border-r border-slate-700/60 px-2.5 py-1 " +
                  (threshold === "high+medium" ? "bg-amber-500/25 text-amber-100" : "text-slate-300 hover:bg-slate-800/50")
                }
              >
                عالية + متوسطة (مراجعة)
              </button>
            </div>
            <span className="text-slate-500">
              (المنخفضة مخفية دائمًا)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <Stat label="كيانات" value={totals.entitiesWithAny} tone="amber" />
            <Stat label="عالية" value={totals.high} tone="emerald" />
            <Stat label="متوسطة" value={totals.med} tone="sky" />
            <Stat label="محدد" value={totals.selectedRows} tone="violet" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              <Loader2 className="me-2 size-4 animate-spin" /> يتم بناء الاقتراحات…
            </div>
          ) : visiblePlans.length === 0 ? (
            <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-6 text-center text-sm text-emerald-200">
              <CheckCircle2 className="me-1 inline size-4" />
              لا توجد اقتراحات عالية الثقة في هذا الحد. جرّب رفعه إلى «متوسطة» للمراجعة اليدوية.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800/60">
              <table className="w-full min-w-[860px] border-collapse text-[12px]">
                <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="p-2 text-right">الكيان</th>
                    <th className="p-2 text-right">الرابط المقترح</th>
                    <th className="p-2 text-right">الثقة</th>
                    <th className="p-2 text-right">السبب</th>
                    <th className="p-2 text-center">حفظ</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlans.map((plan) => (
                    plan.proposals.map((pr, i) => {
                      const key = `${plan.source.id}::${pr.target.slug}`;
                      const isFirst = i === 0;
                      return (
                        <tr
                          key={key}
                          className={
                            "border-t border-slate-800/60 " +
                            (isFirst ? "bg-slate-900/30" : "")
                          }
                        >
                          <td className="p-2 align-top">
                            {isFirst ? (
                              <div>
                                <div className="font-semibold text-slate-100">{plan.source.title}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                                  <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-300">
                                    {TYPE_LABELS[plan.source.entity_type] ?? plan.source.entity_type}
                                  </span>
                                  <span dir="ltr" className="font-mono">{plan.source.slug}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600">↳</span>
                            )}
                          </td>
                          <td className="p-2 align-top">
                            <div className="text-slate-100">{pr.target.title}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-300">
                                {TYPE_LABELS[pr.target.entity_type] ?? pr.target.entity_type}
                              </span>
                              <span dir="ltr" className="font-mono">{pr.target.slug}</span>
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <ConfidenceBadge c={pr.confidence} />
                          </td>
                          <td className="p-2 align-top">
                            <div className="flex flex-wrap gap-1">
                              {pr.reasons.map((r) => (
                                <span
                                  key={r}
                                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2 text-center align-top">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleRow(key)}
                              className="size-4 accent-amber-400"
                            />
                          </td>
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {err && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 size-3.5" /> {err}
            </div>
          )}
          {saving && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="size-3.5 animate-spin" />
              يتم الحفظ… ({savedCount})
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/20 bg-slate-900/60 px-5 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="size-3.5 text-emerald-300" />
            لن يتم استبدال أي علاقة موجودة — الإضافة فقط، بدون تكرار.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={loading || visiblePlans.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
            >
              <Download className="size-3.5" /> CSV
            </button>
            <button
              onClick={clearAll}
              disabled={loading || selected.size === 0 || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
            >
              <RefreshCw className="size-3.5" /> مسح التحديد
            </button>
            <button
              onClick={approveAllHigh}
              disabled={loading || saving || totals.high === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              اعتماد كل ما هو عالي الثقة ({totals.high})
            </button>
            <button
              onClick={apply}
              disabled={loading || saving || totals.selectedRows === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              حفظ المحدد ({totals.selectedRows})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "sky" | "violet" }) {
  const toneMap: Record<string, string> = {
    amber:   "border-amber-500/40 bg-amber-500/10 text-amber-100",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
    sky:     "border-sky-500/40 bg-sky-500/10 text-sky-100",
    violet:  "border-violet-500/40 bg-violet-500/10 text-violet-100",
  };
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 " + toneMap[tone]}>
      <span className="opacity-80">{label}</span>
      <b className="font-mono">{value}</b>
    </span>
  );
}
function ConfidenceBadge({ c }: { c: Confidence }) {
  if (c === "high") return (
    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
      عالية
    </span>
  );
  if (c === "medium") return (
    <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
      متوسطة
    </span>
  );
  return (
    <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300">
      منخفضة
    </span>
  );
}

// ============================================================
// OrphanRelationEditor
//
// Modal that lets an admin curate EXPLICIT relationships for an
// entity. Nothing is auto-created — every relation shown is only
// a suggestion until the admin approves it. Approved slugs are
// merged into `metadata.related_entities` on the entity row.
//
// Canonical-first policy (locked):
//   • The picker prefers the canonical/published entity with the
//     richest content and hides archived duplicates from the
//     visible pool.
//   • If a search query matches an archived duplicate that has
//     `metadata.canonical_slug` / `canonical_id`, the picker
//     transparently redirects to the canonical row.
//   • On save, every selected slug is passed through the redirect
//     map, so `related_entities` NEVER stores an obsolete
//     duplicate slug.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  X, Search, Sparkles, Plus, Check, Loader2, Link2, Save,
  MapPin, Globe, Landmark as LandmarkIcon, Tag, Swords, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { isDisplayableEntity, normalizeEntitySlug } from "@/lib/encyclopedia-source";
import { normalizeArabicName } from "@/lib/arabic-normalize";
import { selectCampaignRows } from "@/lib/campaigns/entities";

type Row = SupabaseEncyclopediaEntity;

const TYPE_LABELS: Record<string, string> = {
  figure: "شخصية", city: "مدينة", battle: "معركة", state: "دولة",
  landmark: "معلم", artifact: "قطعة أثرية", event: "حدث", scholar: "عالم",
};

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

function meta(r: Row): Record<string, unknown> {
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

// ─────────────────────────────────────────────────────────────
// Canonical resolution
// ─────────────────────────────────────────────────────────────

/** True when this row is an archived merge duplicate (points at a canonical). */
function isMergedDuplicate(r: Row): boolean {
  const m = meta(r);
  const hasTarget =
    (typeof m.canonical_slug === "string" && !!(m.canonical_slug as string).trim()) ||
    (typeof m.canonical_id === "string" && !!(m.canonical_id as string).trim());
  return hasTarget && (m.archived === true || r.enabled === false);
}

/** True when this row is (or is marked as) the canonical winner. */
function isCanonicalWinner(r: Row): boolean {
  return meta(r).canonical === true;
}

/** Richness score — higher = more complete dossier. */
function richnessScore(r: Row): number {
  let s = 0;
  const summary = (r.summary ?? "").trim();
  if (summary.length >= 40)  s += 10;
  if (summary.length >= 160) s += 5;
  const b = (r.body && typeof r.body === "object") ? (r.body as Record<string, unknown>) : {};
  if (typeof b.overview === "string" && (b.overview as string).length >= 120) s += 15;
  if (typeof b.introduction === "string" && (b.introduction as string).length >= 120) s += 8;
  for (const k of ["sections", "blocks", "timeline", "facts", "sources"]) {
    const v = b[k];
    if (Array.isArray(v) && v.length) s += Math.min(15, v.length * 3);
  }
  const m = meta(r);
  if (isCanonicalWinner(r)) s += 40;
  if (Array.isArray(m.aliases) && (m.aliases as unknown[]).length) s += 3;
  if (Array.isArray(r.aliases) && r.aliases.length) s += 3;
  return s;
}

/** Build slug/id → canonical Row map from every archived duplicate. */
function buildRedirectMap(all: Row[]): Map<string, Row> {
  const bySlug = new Map<string, Row>();
  const byId   = new Map<string, Row>();
  for (const r of all) { bySlug.set(r.slug.toLowerCase(), r); byId.set(r.id, r); }
  const map = new Map<string, Row>();
  for (const r of all) {
    if (!isMergedDuplicate(r)) continue;
    const m = meta(r);
    const target =
      (typeof m.canonical_id === "string" && byId.get(m.canonical_id as string)) ||
      (typeof m.canonical_slug === "string" && bySlug.get((m.canonical_slug as string).toLowerCase())) ||
      null;
    if (!target) continue;
    // Follow chains up to 3 hops.
    let winner: Row = target;
    for (let i = 0; i < 3 && isMergedDuplicate(winner); i++) {
      const wm = meta(winner);
      const next =
        (typeof wm.canonical_id === "string" && byId.get(wm.canonical_id as string)) ||
        (typeof wm.canonical_slug === "string" && bySlug.get((wm.canonical_slug as string).toLowerCase())) ||
        null;
      if (!next) break;
      winner = next;
    }
    map.set(r.slug.toLowerCase(), winner);
    map.set(r.id, winner);
  }
  return map;
}

function resolveCanonicalSlug(slug: string, redirects: Map<string, Row>): string {
  const hit = redirects.get(slug.toLowerCase());
  return hit ? hit.slug : slug;
}

type Suggestion = { row: Row; reasons: string[]; score: number };

export function OrphanRelationEditor({
  entity, allRows, onClose, onSaved, onCommit,
}: {
  entity: Row;
  allRows: Row[];
  onClose: () => void;
  onSaved: () => void;
  onCommit?: (mergedRelatedSlugs: string[]) => Promise<void> | void;
}) {
  const em = meta(entity);
  const era     = asStr(em.era);
  const world   = asStr(em.world);
  const state   = asStr(em.state) ?? asStr(em.affiliation);
  const city    = asStr(em.city) ?? asStr(em.location);
  const tags    = asStrArr(em.tags);
  const already = new Set<string>([
    ...asStrArr(em.related_entities).map(normalizeEntitySlug),
    ...asStrArr(em.related).map(normalizeEntitySlug),
    ...asStrArr(em.relationships).map(normalizeEntitySlug),
  ]);

  const [selected, setSelected] = useState<Set<string>>(new Set()); // canonical slugs
  const [query, setQuery]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [redirectedNote, setRedirectedNote] = useState<string | null>(null);
  const [campaignSlugs, setCampaignSlugs] = useState<Set<string>>(new Set());

  // Redirect map covers the entire dataset (archived rows too).
  const redirects = useMemo(() => buildRedirectMap(allRows), [allRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("admin_campaigns" as any)
          .select("id,data")
          .limit(500);
        if (cancelled || !data) return;
        const slugSet = new Set<string>();
        const re = /"(?:slug|entity_slug|entity|target|unlock_slug)"\s*:\s*"([a-z0-9][a-z0-9-]+)"/gi;
        for (const c of selectCampaignRows(data as unknown as Array<{ data: unknown }>)) {
          const blob = JSON.stringify(c.data ?? {});
          if (!blob.includes(entity.slug)) continue;
          let m: RegExpExecArray | null;
          while ((m = re.exec(blob))) slugSet.add(m[1]);
        }
        slugSet.delete(entity.slug);
        setCampaignSlugs(slugSet);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [entity.slug]);

  // Visible pool: only canonical + displayable, minus self and already-linked.
  const pool = useMemo(() => {
    return allRows.filter((r) =>
      r.id !== entity.id &&
      !isMergedDuplicate(r) &&
      isDisplayableEntity(r) &&
      !already.has(r.slug.toLowerCase()),
    );
  }, [allRows, entity.id, already]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const allowed = new Set(ALLOWED_TARGETS[entity.entity_type] ?? []);
    const out = new Map<string, Suggestion>();
    const bump = (r: Row, reason: string, score: number) => {
      const prev = out.get(r.id);
      if (prev) {
        if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
        prev.score += score;
      } else {
        out.set(r.id, { row: r, reasons: [reason], score });
      }
    };
    for (const r of pool) {
      const rm = meta(r);
      const rState = asStr(rm.state) ?? asStr(rm.affiliation);
      const rCity  = asStr(rm.city)  ?? asStr(rm.location);
      const rEra   = asStr(rm.era);
      const rWorld = asStr(rm.world);
      const rTags  = asStrArr(rm.tags);

      const kindBoost   = allowed.has(r.entity_type) ? 5 : 0;
      const qualityBoost = Math.round(richnessScore(r) / 4);

      if (campaignSlugs.has(r.slug))                       bump(r, "نفس الحملة", 100 + kindBoost + qualityBoost);
      if (state && (rState === state || r.slug === state)) bump(r, "نفس الدولة", 60 + kindBoost + qualityBoost);
      if (city  && (rCity  === city  || r.slug === city))  bump(r, "نفس المدينة", 55 + kindBoost + qualityBoost);
      if (world && rWorld === world)                       bump(r, "نفس العالم", 30 + kindBoost);
      if (era   && rEra === era)                           bump(r, "نفس الحقبة", 20 + kindBoost);
      const shared = tags.filter((t) => rTags.includes(t));
      if (shared.length) bump(r, `وسوم مشتركة: ${shared.slice(0,2).join("، ")}`, 15 * shared.length + kindBoost);
    }
    return Array.from(out.values())
      .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title, "ar"))
      .slice(0, 60);
  }, [pool, entity.entity_type, state, city, era, world, tags, campaignSlugs]);

  // Search: normalize Arabic, match title/aliases/slug/also_known_as against
  // EVERY row (including archived duplicates), then resolve to canonical
  // and rank canonical + rich first.
  const searchResults = useMemo<{ row: Row; via?: Row }[]>(() => {
    const raw = query.trim();
    if (!raw) return [];
    const nq = normalizeArabicName(raw);
    const qLc = raw.toLowerCase();

    const seen = new Set<string>();
    const hits: { row: Row; via?: Row; rel: number }[] = [];

    for (const r of allRows) {
      if (r.id === entity.id) continue;
      const meta_ = meta(r);
      const nameKeys: string[] = [];
      nameKeys.push(normalizeArabicName(r.title || ""));
      if (r.subtitle) nameKeys.push(normalizeArabicName(r.subtitle));
      for (const key of ["aliases", "also_known_as", "alt_names", "names"]) {
        const v = (meta_ as any)[key];
        if (Array.isArray(v)) for (const a of v) if (typeof a === "string") nameKeys.push(normalizeArabicName(a));
      }
      if (Array.isArray(r.aliases)) for (const a of r.aliases) nameKeys.push(normalizeArabicName(a));

      let rel = 0;
      if (nameKeys.some((k) => k === nq))            rel = 100;
      else if (nameKeys.some((k) => k.startsWith(nq))) rel = 70;
      else if (nameKeys.some((k) => k.includes(nq)))   rel = 40;
      else if (r.slug.toLowerCase().includes(qLc))     rel = 30;
      if (!rel) continue;

      // Resolve to canonical if this row is a merged duplicate.
      const canonical = resolveViaMap(r, redirects);
      if (!canonical) continue;
      if (canonical.id === entity.id) continue;
      if (already.has(canonical.slug.toLowerCase())) continue;
      // Hide non-displayable canonicals (stubs).
      if (!isDisplayableEntity(canonical)) continue;

      if (seen.has(canonical.id)) continue;
      seen.add(canonical.id);
      hits.push({ row: canonical, via: canonical.id === r.id ? undefined : r, rel });
    }

    hits.sort((a, b) => {
      // Canonical winners first, then richness, then relevance, then title.
      const canDiff = Number(isCanonicalWinner(b.row)) - Number(isCanonicalWinner(a.row));
      if (canDiff) return canDiff;
      const rich = richnessScore(b.row) - richnessScore(a.row);
      if (rich) return rich;
      if (b.rel !== a.rel) return b.rel - a.rel;
      return a.row.title.localeCompare(b.row.title, "ar");
    });
    return hits.slice(0, 40).map(({ row, via }) => ({ row, via }));
  }, [query, allRows, entity.id, already, redirects]);

  const toggle = (slugRaw: string) => {
    // Always store the canonical slug in the selection set.
    const canonical = resolveCanonicalSlug(slugRaw, redirects);
    if (canonical !== slugRaw) {
      setRedirectedNote(`تم توجيه ${slugRaw} إلى الكيان الرسمي ${canonical}`);
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(canonical)) next.delete(canonical); else next.add(canonical);
      return next;
    });
  };

  const save = async () => {
    if (selected.size === 0) { onClose(); return; }
    setSaving(true); setErr(null);
    try {
      const existing = asStrArr(em.related_entities);
      // Rewrite any obsolete duplicate slugs already stored to their canonical.
      const rewrittenExisting = existing.map((s) => resolveCanonicalSlug(s, redirects));
      const additions = Array.from(selected).map((s) => resolveCanonicalSlug(s, redirects));
      const merged = Array.from(new Set([...rewrittenExisting, ...additions])).filter(
        (s) => s && s !== entity.slug,
      );
      if (onCommit) {
        await onCommit(merged);
      } else {
        const nextMeta = { ...em, related_entities: merged };
        const { error } = await supabase
          .from("encyclopedia_entities")
          .update({ metadata: nextMeta as any })
          .eq("id", entity.id);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const allowedList = (ALLOWED_TARGETS[entity.entity_type] ?? [])
    .map((t) => TYPE_LABELS[t] ?? t).join(" · ");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" dir="rtl">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/20 bg-gradient-to-l from-slate-900 to-slate-950 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[11px] tracking-widest text-amber-300">
              <Link2 className="size-3.5" /> ربط كيان
            </div>
            <h2 className="truncate text-lg font-bold text-amber-100">{entity.title}</h2>
            <div dir="ltr" className="mt-0.5 font-mono text-[11px] text-slate-500">{entity.slug}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 p-1.5 text-slate-300 hover:bg-slate-800/60"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-800/60 px-5 py-3 text-xs md:grid-cols-4">
          <Fact icon={<Tag className="size-3.5" />}       label="النوع" value={TYPE_LABELS[entity.entity_type] ?? entity.entity_type} />
          <Fact icon={<Sparkles className="size-3.5" />}  label="الحقبة" value={era ?? "—"} />
          <Fact icon={<Globe className="size-3.5" />}     label="العالم" value={world ?? "—"} />
          <Fact icon={<LandmarkIcon className="size-3.5" />} label="الدولة" value={state ?? "—"} />
        </div>
        <div className="border-b border-slate-800/60 bg-slate-900/40 px-5 py-2 text-[11px] text-slate-400">
          <span className="text-amber-300">أنواع الروابط المقبولة:</span>{" "}
          <span className="text-slate-200">{allowedList || "—"}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Search */}
          <div className="mb-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Search className="size-3.5" /> ابحث عن كيان لإضافته (تُفضَّل النسخة الرسمية دومًا)
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اسم أو slug أو اسم بديل…"
              className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/60"
            />
            {query.trim() && (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-800/60 bg-slate-950/60 p-1">
                {searchResults.length === 0 && (
                  <li className="px-2 py-2 text-center text-xs text-slate-500">لا نتائج مطابقة.</li>
                )}
                {searchResults.map(({ row, via }) => (
                  <ResultRow
                    key={row.id}
                    row={row}
                    via={via}
                    canonical={isCanonicalWinner(row)}
                    richness={richnessScore(row)}
                    checked={selected.has(row.slug)}
                    onToggle={() => toggle(row.slug)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
              <Sparkles className="size-4" /> اقتراحات للمراجعة
            </h3>
            <span className="text-[10px] text-slate-500">
              اعتمد ما هو صحيح فقط — لا شيء يُحفظ تلقائيًا.
            </span>
          </div>

          {suggestions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
              لا اقتراحات — استخدم البحث أعلاه لإضافة روابط يدويًا.
            </div>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <ResultRow
                  key={s.row.id}
                  row={s.row}
                  reasons={s.reasons}
                  canonical={isCanonicalWinner(s.row)}
                  richness={richnessScore(s.row)}
                  checked={selected.has(s.row.slug)}
                  onToggle={() => toggle(s.row.slug)}
                />
              ))}
            </ul>
          )}

          {redirectedNote && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {redirectedNote}
            </div>
          )}
          {err && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-amber-500/20 bg-slate-900/60 px-5 py-3">
          <div className="text-xs text-slate-400">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">{selected.size}</span>{" "}
            رابط جاهز للحفظ · حاليًا مرتبط بـ{" "}
            <span className="text-slate-200">{already.size}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60"
            >
              إلغاء
            </button>
            <button
              onClick={save}
              disabled={saving || selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              حفظ الروابط المعتمدة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Resolve a row → its canonical winner Row (or itself if canonical).
function resolveViaMap(r: Row, redirects: Map<string, Row>): Row | null {
  if (!isMergedDuplicate(r)) return r;
  return redirects.get(r.id) ?? redirects.get(r.slug.toLowerCase()) ?? null;
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900/50 px-2 py-1.5">
      <span className="text-amber-300">{icon}</span>
      <span className="text-[10px] text-slate-400">{label}:</span>
      <span className="truncate text-slate-200">{value}</span>
    </div>
  );
}

function ResultRow({
  row, reasons, via, canonical, richness, checked, onToggle,
}: {
  row: Row;
  reasons?: string[];
  via?: Row;
  canonical?: boolean;
  richness?: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-right transition " +
          (checked
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-slate-800/60 bg-slate-950/40 hover:bg-slate-900/60")
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-slate-100">{row.title}</span>
            <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300">
              {TYPE_LABELS[row.entity_type] ?? row.entity_type}
            </span>
            {canonical && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                <ShieldCheck className="size-3" /> رسمي
              </span>
            )}
            {typeof richness === "number" && richness >= 40 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                محتوى غني
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span dir="ltr" className="font-mono text-[10px] text-slate-500">{row.slug}</span>
            {via && (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200">
                استُبدل عن: {via.slug}
              </span>
            )}
            {reasons?.map((r) => (
              <span key={r} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                {r}
              </span>
            ))}
          </div>
        </div>
        <span
          className={
            "grid size-6 place-items-center rounded-md border " +
            (checked
              ? "border-emerald-400/60 bg-emerald-500/30 text-emerald-100"
              : "border-slate-600/60 text-slate-400")
          }
        >
          {checked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </span>
      </button>
    </li>
  );
}

// keep icons referenced for tree-shake predictability
void MapPin; void Swords;

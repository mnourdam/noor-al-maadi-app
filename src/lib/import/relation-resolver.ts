// ============================================================
// Phase 3 — Relation resolver.
//
// One canonical entry-point that turns any raw reference (an
// unlock id "figure:foo", a bare slug, or a raw uuid) into a
// RelationResolution describing what happened and, if the target
// is legacy/archived/redirected, what the canonical replacement is.
//
// Reuses (never re-implements):
//   • parseUnlockId              — src/lib/campaignUnlocks
//   • normalizeEntitySlug        — src/lib/encyclopedia-source
//   • isRedirectedOrArchivedEntity, isDisplayableEntity
//   • resolveCanonicalLocal, readRedirectTargetId
//   • localEncyclopediaBySlug / ById / All + snapshot loader
//   • entityNameKeys / normalizeArabicName  (alias / fuzzy)
//   • similarity                 — src/lib/import/duplicate-detection
// ============================================================
import { parseUnlockId, type ParsedUnlock } from "@/lib/campaignUnlocks";
import {
  normalizeEntitySlug,
  isRedirectedOrArchivedEntity,
  pickCanonicalEntity,
} from "@/lib/encyclopedia-source";
import {
  resolveCanonicalLocal,
  readRedirectTargetId,
} from "@/lib/encyclopedia-canonical";
import {
  localEncyclopediaAll,
  localEncyclopediaById,
  localEncyclopediaBySlug,
  localEncyclopediaSlugCandidates,
  localAtlasEntities,
} from "@/lib/local-first-store";
import { entityNameKeys, normalizeArabicName } from "@/lib/arabic-normalize";
import { similarity } from "./duplicate-detection";

// ---------- Types ----------

export type RelationStatus =
  | "valid"           // resolves cleanly to a live, canonical, displayable entity
  | "remapped"        // resolved via the canonical chain — needs a rewrite
  | "type_mismatch"   // resolved, but entity_type differs from expected
  | "archived"        // target exists but is archived / hidden duplicate
  | "disabled"        // target exists but enabled === false
  | "ambiguous"       // several fuzzy candidates, no clear winner
  | "missing";        // no candidate at all

export type RelationSource = "unlock" | "reward" | "activity" | "chapter_ref"
  | "related_entity" | "encyclopedia_related" | "atlas" | "world";

export interface RelationRef {
  /** Where the reference lives inside the payload — for the UI panel. */
  path: string;
  /** The original, unmodified reference string as authored. */
  raw: string;
  /** What kind of relation this is. */
  source: RelationSource;
  /** Expected entity_type when known ("figure"/"battle"/…). */
  expectedType?: string | null;
}

export interface ResolvedEntity {
  id: string;
  slug: string;
  entity_type: string;
  title: string;
}

export interface RelationResolution {
  ref: RelationRef;
  parsed: ParsedUnlock;
  status: RelationStatus;
  /** How we found the target. */
  method?: "id" | "slug" | "canonical_chain" | "alias" | "normalized_name" | "fuzzy";
  /** Confidence in the repair suggestion. */
  confidence: "high" | "medium" | "low";
  /** Resolved entity if any (already run through canonical chain). */
  target?: ResolvedEntity;
  /** If the original ref pointed at a legacy row, this is that row. */
  legacy?: ResolvedEntity;
  /** Alternative candidates for the ambiguous / low-confidence case. */
  candidates?: ResolvedEntity[];
  /** Human note in Arabic for the UI. */
  note?: string;
  /** True when target != raw and the payload should be rewritten. */
  suggestRewrite: boolean;
  /** The new reference string to write in place of `ref.raw`. */
  rewriteTo?: string;
}

// ---------- Local helpers ----------

type EncRow = {
  id: string;
  slug: string;
  entity_type?: string;
  title?: string;
  subtitle?: string | null;
  metadata?: unknown;
  enabled?: boolean;
  body?: unknown;
};

function toResolved(r: EncRow | null | undefined): ResolvedEntity | null {
  if (!r || !r.id) return null;
  return {
    id: r.id,
    slug: r.slug ?? "",
    entity_type: r.entity_type ?? "",
    title: r.title ?? "",
  };
}

/** Rebuild a `type:slug` unlock-id given a resolved entity. Preserves the
 *  original prefix format the payload used when possible. */
function formatRef(ref: RelationRef, target: ResolvedEntity): string {
  if (!ref.raw.includes(":")) return target.slug || target.id;
  return `${target.entity_type}:${target.slug || target.id}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Alias / fuzzy fallback ----------

function findByAliasOrName(needle: string, expectedType?: string | null): {
  best: EncRow | null;
  candidates: EncRow[];
  method: "alias" | "normalized_name" | "fuzzy";
  score: number;
} {
  const all = localEncyclopediaAll() as EncRow[];
  const nq = normalizeArabicName(needle);
  if (!nq) return { best: null, candidates: [], method: "fuzzy", score: 0 };

  // (a) alias / normalized-name exact hits via entityNameKeys.
  const exact: EncRow[] = [];
  for (const r of all) {
    if (r.enabled === false) continue;
    if (isRedirectedOrArchivedEntity(r)) continue;
    const keys = entityNameKeys({ title: r.title ?? "", subtitle: r.subtitle ?? null, metadata: r.metadata });
    if (keys.includes(nq)) exact.push(r);
  }
  if (exact.length > 0) {
    const preferred = pickCanonicalEntity(exact, expectedType ?? null) as EncRow | null;
    return {
      best: preferred ?? exact[0],
      candidates: exact,
      method: normalizeArabicName(exact[0].title ?? "") === nq ? "normalized_name" : "alias",
      score: 1,
    };
  }

  // (b) fuzzy title similarity — bounded scan.
  let best: EncRow | null = null;
  let bestScore = 0;
  const near: Array<{ r: EncRow; s: number }> = [];
  for (const r of all) {
    if (r.enabled === false) continue;
    if (isRedirectedOrArchivedEntity(r)) continue;
    if (!r.title) continue;
    const s = similarity(needle, r.title);
    if (s >= 0.75) near.push({ r, s });
    if (s > bestScore) { best = r; bestScore = s; }
  }
  near.sort((a, b) => b.s - a.s);
  return {
    best: bestScore >= 0.75 ? best : null,
    candidates: near.slice(0, 5).map((n) => n.r),
    method: "fuzzy",
    score: bestScore,
  };
}

// ---------- Atlas lookup ----------

type AtlasRow = { id: string; slug?: string | null; name_ar?: string | null; status?: string | null; enabled?: boolean };

function lookupAtlas(raw: string): AtlasRow | null {
  const atlas = localAtlasEntities() as unknown as AtlasRow[];
  const norm = normalizeEntitySlug(raw);
  if (!atlas || atlas.length === 0) return null;
  for (const a of atlas) {
    if (a.slug && normalizeEntitySlug(a.slug) === norm) return a;
    if (a.id === raw) return a;
  }
  return null;
}

// ---------- Public entry point ----------

/**
 * Resolve a single reference against the local encyclopedia + atlas
 * snapshot. Returns a full RelationResolution — never throws.
 */
export function resolveRelation(ref: RelationRef): RelationResolution {
  const parsed = parseUnlockId(ref.raw);
  const expected = ref.expectedType ?? parsed.type ?? null;

  // Atlas relations take a dedicated path.
  if (ref.source === "atlas") {
    const hit = lookupAtlas(ref.raw);
    if (!hit) {
      return {
        ref, parsed, status: "missing", confidence: "low", suggestRewrite: false,
        note: "لا يوجد كيان أطلس مطابق.",
      };
    }
    const enabled = hit.enabled !== false && (hit.status === "published" || !hit.status);
    if (!enabled) {
      return {
        ref, parsed, status: "disabled", confidence: "medium", suggestRewrite: false,
        note: "كيان الأطلس غير منشور أو معطّل.",
      };
    }
    return {
      ref, parsed, status: "valid", method: "slug", confidence: "high",
      target: { id: hit.id, slug: hit.slug ?? "", entity_type: "atlas", title: hit.name_ar ?? "" },
      suggestRewrite: false,
    };
  }

  // 1) Direct id / slug hit.
  let direct: EncRow | null = null;
  let method: RelationResolution["method"] | undefined;
  if (parsed.slug) {
    // Try (type, slug) first when type is known; fall back to slug alone.
    direct = (expected
      ? (localEncyclopediaBySlug(parsed.slug, expected) as EncRow | null)
      : null)
      ?? (localEncyclopediaBySlug(parsed.slug) as EncRow | null);
    if (direct) method = "slug";
    if (!direct) {
      // Multiple rows may share this slug across types — check candidates.
      const list = localEncyclopediaSlugCandidates(parsed.slug) as unknown as EncRow[];
      if (list && list.length > 0) {
        const preferred = pickCanonicalEntity(list, expected ?? null) as EncRow | null;
        direct = preferred ?? list[0];
        method = "slug";
      }
    }
  }
  if (!direct && UUID_RE.test(ref.raw)) {
    direct = localEncyclopediaById(ref.raw) as EncRow | null;
    if (direct) method = "id";
  }

  // 2) Canonical chain walk.
  if (direct) {
    const canonical = resolveCanonicalLocal(direct) as EncRow | null;
    const wasRedirected = canonical && canonical.id !== direct.id;
    const isArchived = isRedirectedOrArchivedEntity(direct);
    const finalRow = canonical ?? direct;

    if (finalRow.enabled === false) {
      return {
        ref, parsed, status: "disabled", confidence: "medium",
        method, target: toResolved(finalRow) ?? undefined, legacy: toResolved(direct) ?? undefined,
        suggestRewrite: false, note: "الهدف موجود لكنه معطّل.",
      };
    }

    if (wasRedirected || isArchived) {
      // Legacy → canonical.
      const rewriteTo = formatRef(ref, toResolved(finalRow)!);
      const typeMismatch = !!expected && !!finalRow.entity_type && finalRow.entity_type !== expected;
      return {
        ref, parsed,
        status: typeMismatch ? "type_mismatch" : "remapped",
        method: "canonical_chain",
        confidence: "high",
        legacy: toResolved(direct) ?? undefined,
        target: toResolved(finalRow) ?? undefined,
        suggestRewrite: rewriteTo !== ref.raw,
        rewriteTo,
        note: typeMismatch
          ? `القيمة الشرعية موجودة لكن نوعها ${finalRow.entity_type} بدلاً من ${expected}.`
          : "أعيد توجيه المرجع إلى الكيان الأصيل.",
      };
    }

    // Straight valid hit — check type.
    const typeMismatch = !!expected && !!finalRow.entity_type && finalRow.entity_type !== expected;
    if (typeMismatch) {
      return {
        ref, parsed, status: "type_mismatch", confidence: "medium",
        method, target: toResolved(finalRow) ?? undefined,
        suggestRewrite: false,
        note: `النوع لا يطابق: متوقّع ${expected}، الموجود ${finalRow.entity_type}.`,
      };
    }
    // Also warn if it survived the redirect check but readRedirectTargetId
    // points elsewhere (mid-chain enabled=false stopped the walk).
    const stalledRedirect = readRedirectTargetId(direct);
    if (stalledRedirect && stalledRedirect !== direct.id) {
      return {
        ref, parsed, status: "archived", confidence: "medium",
        method, legacy: toResolved(direct) ?? undefined,
        target: toResolved(direct) ?? undefined,
        suggestRewrite: false,
        note: "لسلسلة المرادف نقطة توقّف — يستوجب مراجعة يدوية.",
      };
    }
    return {
      ref, parsed, status: "valid", confidence: "high", method,
      target: toResolved(finalRow) ?? undefined,
      suggestRewrite: false,
    };
  }

  // 3) Alias / normalized-name / fuzzy fallback.
  const fb = findByAliasOrName(parsed.slug || ref.raw, expected);
  if (fb.best) {
    const canonical = resolveCanonicalLocal(fb.best) as EncRow | null;
    const finalRow = canonical ?? fb.best;
    const confidence: RelationResolution["confidence"] =
      fb.method === "normalized_name" ? "high"
        : fb.method === "alias" ? "high"
          : fb.score >= 0.9 ? "medium" : "low";
    const rewriteTo = formatRef(ref, toResolved(finalRow)!);
    return {
      ref, parsed,
      status: "remapped",
      method: fb.method,
      confidence,
      target: toResolved(finalRow) ?? undefined,
      candidates: fb.candidates.map(toResolved).filter((x): x is ResolvedEntity => !!x),
      suggestRewrite: rewriteTo !== ref.raw,
      rewriteTo,
      note:
        fb.method === "fuzzy"
          ? `مرشح بمطابقة ${Math.round(fb.score * 100)}٪ من العنوان.`
          : "عُثر عليه عبر الأسماء البديلة/المطبّعة.",
    };
  }

  // 4) Ambiguous vs missing.
  if (fb.candidates.length > 1) {
    return {
      ref, parsed, status: "ambiguous", confidence: "low",
      candidates: fb.candidates.map(toResolved).filter((x): x is ResolvedEntity => !!x),
      suggestRewrite: false,
      note: "عدّة مرشحين محتملين — يتطلّب اختيار المسؤول.",
    };
  }
  return {
    ref, parsed, status: "missing", confidence: "low",
    suggestRewrite: false,
    note: "لم يُعثر على أي مرشح.",
  };
}

// ---------- Snapshot ----------

export { ensureLocalSnapshotLoaded } from "@/lib/local-first-store";

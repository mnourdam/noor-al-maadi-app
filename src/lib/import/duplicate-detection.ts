// ============================================================
// Phase 2 — Duplicate detection for the /admin/import wizard.
//
// Reuses Irth's existing Arabic normalization (arabic-normalize.ts)
// and digit normalization (formatNumber.ts). This module is pure
// (no I/O) — callers pass already-loaded existing rows.
//
// Detection layers:
//   1. Exact identifiers: slug / canonical_id / external_id(s)
//   2. Exact normalized name / alias match
//   3. Fuzzy title similarity (Dice-bigram over normalized text)
//   4. Cross-type conflict (same historical entity, different type)
//
// Performance: builds an index over existing rows once per batch,
// then per-incoming-row work is O(names) for exact lookups + a
// pre-filtered scan for fuzzy comparison. Never O(n²) blindly.
// ============================================================
import {
  entityNameKeys,
  normalizeArabicName,
} from "@/lib/arabic-normalize";
import { toWesternDigits } from "@/lib/formatNumber";

// ---------- Normalization ----------

/**
 * Match-only normalization. Layered on top of normalizeArabicName which
 * already: strips diacritics, folds alef/ya/ta-marbuta, strips hamza,
 * strips tatweel, lowercases ASCII, collapses spaces, trims. This
 * wrapper additionally normalizes Arabic-Indic → Western digits before
 * folding, per Phase 2 requirements. The original title is never
 * mutated in storage — this key is used only for comparison.
 */
export function normalizeForCompare(s: string | null | undefined): string {
  if (!s) return "";
  return normalizeArabicName(toWesternDigits(String(s)));
}

// ---------- Similarity (Dice bigrams) ----------

function bigramCounts(s: string): { map: Map<string, number>; total: number } {
  const map = new Map<string, number>();
  const t = s.replace(/\s+/g, " ").trim();
  let total = 0;
  if (t.length < 2) {
    if (t) { map.set(t, 1); total = 1; }
    return { map, total };
  }
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    map.set(b, (map.get(b) ?? 0) + 1);
    total++;
  }
  return { map, total };
}

/**
 * Similarity in [0..1] using Dice-coefficient over character bigrams
 * of the normalized strings. Substring containment is treated as
 * "high similarity" (0.9 floor) so short aliases like "العباسية"
 * still score highly against "الدولة العباسية".
 */
export function similarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigramCounts(na);
  const B = bigramCounts(nb);
  if (A.total === 0 || B.total === 0) return 0;
  let common = 0;
  for (const [k, v] of A.map) {
    const w = B.map.get(k);
    if (w !== undefined) common += Math.min(v, w);
  }
  const dice = (2 * common) / (A.total + B.total);
  if (na.includes(nb) || nb.includes(na)) return Math.max(dice, 0.9);
  return dice;
}

// ---------- Types ----------

export type CandidateReason =
  | "slug"
  | "canonical_id"
  | "external_id"
  | "exact_name"
  | "alias_match"
  | "fuzzy_name";

export type CandidateSeverity = "exact" | "high" | "medium";

export interface DuplicateCandidate {
  existingId: string;
  existingType: string;
  existingSlug: string;
  existingTitle: string;
  existingSubtitle?: string | null;
  existingMetadata?: any;
  score: number;
  reasons: CandidateReason[];
  severity: CandidateSeverity;
  crossType: boolean;
}

export interface ExistingIndexRow {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  metadata?: any;
}

export interface IncomingItem {
  entity_type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  metadata?: any;
}

export interface ExistingIndex {
  bySlug: Map<string, ExistingIndexRow>;
  byId: Map<string, ExistingIndexRow>;
  byNameKey: Map<string, ExistingIndexRow[]>;
  byExternal: Map<string, ExistingIndexRow[]>;
  /** Rows bucketed by first-2 normalized-title chars — fuzzy pre-filter. */
  byPrefix: Map<string, ExistingIndexRow[]>;
  all: ExistingIndexRow[];
}

function collectExternalIds(md: any): string[] {
  if (!md || typeof md !== "object") return [];
  const raw = md.external_id ?? md.external_ids;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((x) => String(x)).filter(Boolean);
}

/** Build all lookup structures over the currently-known DB rows. */
export function buildExistingIndex(rows: ExistingIndexRow[]): ExistingIndex {
  const bySlug = new Map<string, ExistingIndexRow>();
  const byId = new Map<string, ExistingIndexRow>();
  const byNameKey = new Map<string, ExistingIndexRow[]>();
  const byExternal = new Map<string, ExistingIndexRow[]>();
  const byPrefix = new Map<string, ExistingIndexRow[]>();

  const pushMulti = (m: Map<string, ExistingIndexRow[]>, key: string, r: ExistingIndexRow) => {
    if (!key) return;
    const arr = m.get(key);
    if (arr) arr.push(r); else m.set(key, [r]);
  };

  for (const r of rows) {
    byId.set(r.id, r);
    if (r.slug) bySlug.set(`${r.entity_type}|${r.slug}`, r);
    const keys = entityNameKeys({ title: r.title, subtitle: r.subtitle ?? null, metadata: r.metadata });
    for (const k of keys) pushMulti(byNameKey, k, r);
    for (const e of collectExternalIds(r.metadata)) pushMulti(byExternal, e, r);
    const norm = normalizeForCompare(r.title);
    if (norm.length >= 2) pushMulti(byPrefix, norm.slice(0, 2), r);
  }

  return { bySlug, byId, byNameKey, byExternal, byPrefix, all: rows };
}

// ---------- Candidate lookup ----------

const FUZZY_MIN = 0.75;
const HIGH_MIN = 0.9;

export function findCandidates(item: IncomingItem, idx: ExistingIndex): DuplicateCandidate[] {
  const out = new Map<string, DuplicateCandidate>();

  const merge = (r: ExistingIndexRow, reason: CandidateReason, score: number) => {
    const crossType = r.entity_type !== item.entity_type;
    const s = Math.max(0, Math.min(1, score));
    const severity: CandidateSeverity = s >= 1 ? "exact" : s >= HIGH_MIN ? "high" : "medium";
    const cur = out.get(r.id);
    if (!cur) {
      out.set(r.id, {
        existingId: r.id,
        existingType: r.entity_type,
        existingSlug: r.slug,
        existingTitle: r.title,
        existingSubtitle: r.subtitle ?? null,
        existingMetadata: r.metadata,
        score: s,
        reasons: [reason],
        severity,
        crossType,
      });
      return;
    }
    if (s > cur.score) {
      cur.score = s;
      cur.severity = severity;
    }
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
  };

  // (1) Slug — same-type exact identifier.
  const slugHit = idx.bySlug.get(`${item.entity_type}|${item.slug}`);
  if (slugHit) merge(slugHit, "slug", 1);

  // (1b) canonical_id — trust as exact regardless of type.
  const canonicalId = (item.metadata as any)?.canonical_id;
  if (canonicalId && idx.byId.has(String(canonicalId))) {
    merge(idx.byId.get(String(canonicalId))!, "canonical_id", 1);
  }

  // (1c) external ids.
  for (const e of collectExternalIds(item.metadata)) {
    const list = idx.byExternal.get(e);
    if (list) for (const r of list) merge(r, "external_id", 1);
  }

  // (2) Exact normalized name / alias.
  const titleKey = normalizeForCompare(item.title);
  const keys = entityNameKeys({
    title: item.title,
    subtitle: item.subtitle ?? null,
    metadata: item.metadata,
  });
  for (const k of keys) {
    const list = idx.byNameKey.get(k);
    if (!list) continue;
    for (const r of list) {
      merge(r, k === titleKey ? "exact_name" : "alias_match", 1);
    }
  }

  // (3) Fuzzy. Prefilter by shared 2-char prefix bucket to avoid O(n²).
  if (titleKey.length >= 2) {
    const bucket = idx.byPrefix.get(titleKey.slice(0, 2));
    if (bucket) {
      for (const r of bucket) {
        if (out.has(r.id)) continue;
        const s = similarity(item.title, r.title);
        if (s >= FUZZY_MIN) merge(r, "fuzzy_name", s);
      }
    }
    // Aliases: also score any candidate that shares a name key already
    // captured above (they're in `out`). No extra work needed.
  }

  return Array.from(out.values()).sort((a, b) => b.score - a.score);
}

// ---------- Human labels ----------

export const CANDIDATE_REASON_AR: Record<CandidateReason, string> = {
  slug: "معرّف مطابق (slug)",
  canonical_id: "canonical_id مطابق",
  external_id: "معرّف خارجي مطابق",
  exact_name: "اسم مطابق بعد التطبيع",
  alias_match: "يطابق أحد الأسماء البديلة",
  fuzzy_name: "تشابه في الاسم",
};

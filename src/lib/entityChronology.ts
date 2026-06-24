// ============================================================
// Encyclopedia entity chronological ordering (Sprint 2).
// ------------------------------------------------------------
// Deterministic order for figures, events, battles, cities,
// landmarks, artifacts inside world pages and admin lists.
//
// Priority chain (lower = earlier in history):
//   1. timeline_order      — explicit admin-curated position
//   2. timeline_year       — primary historical year
//   3. timeline_start_year — span start, when no single year exists
//   4. metadata.year / metadata.sort_year — best-effort fallback
//
// Year values may be stored on either the Hijri or the Gregorian
// scale. We normalize to a single comparable axis by treating any
// value > 622 as Gregorian and subtracting 622. This keeps a 1281
// Gregorian figure (≈660H) close to its 660H peers instead of
// sorting at the very end of every list.
//
// Entities with no chronology signal sink to the end with a stable
// Arabic alphabetical tiebreaker — never random, never insertion
// order, never created_at.
// ============================================================

import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

function normalizeYear(y: number | null | undefined): number | null {
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  // Treat values clearly in the Gregorian era as Gregorian and
  // shift them down to a Hijri-comparable axis.
  return y > 622 ? y - 622 : y;
}

function metaNum(meta: unknown, key: string): number | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function entitySortKey(e: SupabaseEncyclopediaEntity | null | undefined): number {
  if (!e) return Number.POSITIVE_INFINITY;

  // 1. Explicit admin-curated order takes absolute precedence.
  if (typeof e.timeline_order === "number" && Number.isFinite(e.timeline_order) && e.timeline_order !== 0) {
    return e.timeline_order;
  }

  // 2-3. Use the most specific year available, then the span start.
  const year =
    normalizeYear(e.timeline_year) ??
    normalizeYear(e.timeline_start_year) ??
    normalizeYear(metaNum(e.metadata, "year")) ??
    normalizeYear(metaNum(e.metadata, "sort_year")) ??
    normalizeYear(metaNum(e.metadata, "start_year"));

  // Offset year-derived keys so they always sort after explicit
  // timeline_order values (which are typically small integers).
  if (year != null) return 1_000_000 + year;

  return Number.POSITIVE_INFINITY;
}

export function sortEntitiesChronological<T extends { entity: SupabaseEncyclopediaEntity }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ka = entitySortKey(a.entity);
    const kb = entitySortKey(b.entity);
    if (ka !== kb) return ka - kb;
    return (a.entity.title ?? "").localeCompare(b.entity.title ?? "", "ar");
  });
}

/** Same as sortEntitiesChronological but for bare entity arrays. */
export function sortBareEntitiesChronological<T extends SupabaseEncyclopediaEntity>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ka = entitySortKey(a);
    const kb = entitySortKey(b);
    if (ka !== kb) return ka - kb;
    return (a.title ?? "").localeCompare(b.title ?? "", "ar");
  });
}

/** True when an entity has no usable chronology signal (admin-review flag). */
export function hasChronology(e: SupabaseEncyclopediaEntity | null | undefined): boolean {
  return Number.isFinite(entitySortKey(e));
}

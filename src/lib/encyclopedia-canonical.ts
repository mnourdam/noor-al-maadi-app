// ============================================================
// Canonical resolver — never let players land on an empty duplicate.
//
// Priority chain (LC1 hardening):
//   1. metadata.canonical_id → always redirect to the canonical row.
//   2. Multiple rows representing the same historical entity → pick
//      the richest (body > sections > sources > summary).
//   3. Never display an empty row when a richer sibling exists.
//   4. Performed transparently before rendering.
//
// Pure functions over already-fetched rows. The actual sibling lookup
// comes from the local-first in-memory store (synchronous, sub-ms) so
// this works offline and during the very first paint.
// ============================================================

import { localEncyclopediaById, localEncyclopediaSameNameSiblings } from "./local-first-store";

type Row = {
  id: string;
  slug: string;
  entity_type?: string;
  title?: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: unknown;
  metadata?: unknown;
  enabled?: boolean;
};

/** Numeric richness score — bigger is fuller. Pure, no I/O. */
export function richness(e: Row | null | undefined): number {
  if (!e) return -1;
  let s = 0;
  const b = e.body as unknown;
  if (b && typeof b === "object") {
    const bb = b as Record<string, unknown>;
    if (Array.isArray(bb.sections)) s += (bb.sections as unknown[]).length * 4;
    if (Array.isArray(bb.timeline)) s += (bb.timeline as unknown[]).length * 3;
    if (Array.isArray(bb.facts)) s += (bb.facts as unknown[]).length;
    if (Array.isArray(bb.sources)) s += (bb.sources as unknown[]).length;
    if (typeof bb.overview === "string")
      s += Math.min(5, Math.floor((bb.overview as string).length / 200));
    if (typeof bb.introduction === "string")
      s += Math.min(5, Math.floor((bb.introduction as string).length / 200));
  }
  if (typeof e.summary === "string" && e.summary.trim().length > 0) s += 1;
  if (typeof e.subtitle === "string" && e.subtitle.trim().length > 0) s += 1;
  return s;
}

export function hasBody(e: Row | null | undefined): boolean {
  if (!e) return false;
  const b = e.body as Record<string, unknown> | null | undefined;
  if (!b || typeof b !== "object") return false;
  if (Array.isArray((b as any).sections) && (b as any).sections.length > 0) return true;
  if (typeof (b as any).overview === "string" && (b as any).overview.length > 40) return true;
  if (typeof (b as any).introduction === "string" && (b as any).introduction.length > 40) return true;
  return false;
}

/**
 * Resolve the canonical row for a given entity. Always returns SOMETHING
 * (the input is the floor) so callers can safely render the result.
 *
 *   1. Follow metadata.canonical_id (sync — uses local store) if present.
 *   2. Among same-name siblings of the same entity_type, pick the richest.
 *   3. If the richer sibling is strictly richer than the input, switch.
 */
export function resolveCanonicalLocal(input: Row | null | undefined): Row | null {
  if (!input) return null;
  // (1) explicit redirect
  const meta = (input.metadata && typeof input.metadata === "object")
    ? (input.metadata as Record<string, unknown>)
    : {};
  const cid = typeof meta.canonical_id === "string" ? meta.canonical_id : null;
  if (cid && cid !== input.id) {
    const canon = localEncyclopediaById(cid) as Row | null;
    if (canon && canon.enabled !== false) {
      // Recurse so chains of merges resolve to the leaf.
      return resolveCanonicalLocal(canon) ?? canon;
    }
  }
  // (2) same-name siblings
  const sibs = (localEncyclopediaSameNameSiblings(input) as Row[]).filter(
    (s) => s && s.id !== input.id && s.enabled !== false,
  );
  if (sibs.length === 0) return input;
  let best = input;
  let bestScore = richness(input);
  for (const s of sibs) {
    const sc = richness(s);
    if (sc > bestScore) { best = s; bestScore = sc; }
  }
  return best;
}

/**
 * Admin helper: returns a sibling that is strictly richer than `input`
 * (same entity_type + normalized name), if one exists. Used to surface a
 * "richer duplicate" warning in the cleanup workshop.
 */
export function findRicherDuplicate(input: Row | null | undefined, pool: Row[]): Row | null {
  if (!input) return null;
  const myScore = richness(input);
  let best: Row | null = null;
  let bestScore = myScore;
  for (const c of pool) {
    if (!c || c.id === input.id) continue;
    if (c.enabled === false) continue;
    const sc = richness(c);
    if (sc > bestScore) { best = c; bestScore = sc; }
  }
  return best;
}

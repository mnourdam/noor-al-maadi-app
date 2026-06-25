// ============================================================
// Game → Museum unlock pipeline
// ------------------------------------------------------------
// Games unlock real encyclopedia-backed museum artifacts using
// the SAME pipeline as Campaigns (user_collection). Authors
// reference existing slugs — they never invent collectibles.
//
// Source of truth for ids is one of (in priority order):
//   1. envelope.rewards.museum_unlocks
//   2. envelope.museum_unlocks
//   3. game.metadata.museum_unlocks (persisted form)
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { parseUnlockId, type ParsedUnlock } from "@/lib/campaignUnlocks";
import type { CollectionItemInsert } from "@/lib/progressSync";

export function extractMuseumUnlocks(envelope: {
  rewards?: { museum_unlocks?: string[] };
  museum_unlocks?: string[];
  metadata?: Record<string, unknown> | null;
}): string[] {
  const fromRewards = envelope.rewards?.museum_unlocks ?? [];
  const fromTop = envelope.museum_unlocks ?? [];
  const fromMeta = Array.isArray((envelope.metadata as any)?.museum_unlocks)
    ? ((envelope.metadata as any).museum_unlocks as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  // Dedup while preserving order.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...fromRewards, ...fromTop, ...fromMeta]) {
    const v = (id ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function museumUnlocksToCollectionItems(ids: string[]): CollectionItemInsert[] {
  const seen = new Set<string>();
  const items: CollectionItemInsert[] = [];
  for (const id of ids) {
    const p = parseUnlockId(id);
    if (!p.slug) continue;
    const key = `${p.type ?? "registry"}:${p.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ itemId: p.slug, itemType: p.type ?? "registry" });
  }
  return items;
}

export interface UnlockValidationReport {
  parsed: ParsedUnlock[];
  duplicates: string[]; // raw ids
  missing: ParsedUnlock[]; // slugs/types that don't exist in encyclopedia_entities
  resolved: Array<{ raw: string; slug: string; type: string; title: string }>;
}

/**
 * Admin-side validation: confirm every museum_unlocks id resolves to an
 * existing, enabled encyclopedia entity. Reports duplicates and missing
 * targets so the importer can block the import on bad references.
 */
export async function validateMuseumUnlocks(
  ids: string[],
): Promise<UnlockValidationReport> {
  const parsed = ids.map(parseUnlockId);

  // Duplicates by raw id
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.raw, (counts.get(p.raw) ?? 0) + 1);
  const duplicates = Array.from(counts.entries())
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const slugs = Array.from(
    new Set(parsed.map((p) => p.slug).filter((s): s is string => !!s)),
  );

  if (slugs.length === 0) {
    return {
      parsed,
      duplicates,
      missing: parsed.filter((p) => !p.slug),
      resolved: [],
    };
  }

  type Row = { entity_type: string; slug: string; title: string };
  const { data, error } = await supabase
    .from("encyclopedia_entities")
    .select("entity_type, slug, title")
    .in("slug", slugs)
    .eq("enabled", true);

  if (error) {
    // Can't reach the database — surface as a single missing-everything error
    // rather than silently passing. Admin will retry.
    return {
      parsed,
      duplicates,
      missing: parsed,
      resolved: [],
    };
  }

  const bySlug = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) {
    const arr = bySlug.get(r.slug) ?? [];
    arr.push(r);
    bySlug.set(r.slug, arr);
  }

  const resolved: UnlockValidationReport["resolved"] = [];
  const missing: ParsedUnlock[] = [];
  const seenResolved = new Set<string>();

  for (const p of parsed) {
    if (!p.slug) {
      missing.push(p);
      continue;
    }
    const rows = bySlug.get(p.slug) ?? [];
    // Prefer exact type match, otherwise accept any row with that slug.
    const hit = (p.type && rows.find((r) => r.entity_type === p.type)) || rows[0];
    if (!hit) {
      missing.push(p);
      continue;
    }
    const k = `${hit.entity_type}:${hit.slug}`;
    if (seenResolved.has(k)) continue;
    seenResolved.add(k);
    resolved.push({ raw: p.raw, slug: hit.slug, type: hit.entity_type, title: hit.title });
  }

  return { parsed, duplicates, missing, resolved };
}

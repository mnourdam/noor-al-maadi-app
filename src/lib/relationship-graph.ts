// ============================================================
// Encyclopedia relationship graph — explicit relationships, local-first.
//
// Architectural rule:
//   • No guessed connections. No campaign inference. No atlas family.
//   • No alias fan-out. No same-era pairing. No synthetic edges.
//   • Only edges literally recorded in content metadata are surfaced.
//
// Sources considered:
//   100 — metadata.related_entities / related  (explicit references)
//    95 — biographical arrays authored on this entity
//         (battles, events, commanders, figures, landmarks,
//          related_battles, related_events, related_figures)
//    95 — single biographical refs on this entity
//         (location, capital, state, city, affiliation)
//    90 — metadata.relationships
//    60 — reverse geography: other entities that explicitly declare
//         this entity as their city / state / affiliation
//
// The final list is filtered through `isDisplayableEntity` so incomplete
// rows never appear. If nothing qualifies, we return [] and the UI shows
// "لا توجد روابط تاريخية متاحة حاليًا."
// ============================================================

import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import {
  isDisplayableEntity,
  normalizeEntitySlug,
} from "@/lib/encyclopedia-source";
import { ensureLocalSnapshotLoaded, localEncyclopediaAll, localEncyclopediaBySlug } from "@/lib/local-first-store";
import { safeKey } from "@/lib/text/safe-text";

export type RelationReason = "explicit" | "biography" | "geography";

export type RelatedNode = {
  entity: SupabaseEncyclopediaEntity;
  score: number;
  reason: RelationReason;
};

export const REASON_LABEL: Record<RelationReason, string> = {
  explicit: "صلة مباشرة موثقة",
  biography: "روابط سيرة وأحداث",
  geography: "ارتباط جغرافي/سياسي",
};

export const REASON_ORDER: RelationReason[] = ["explicit", "biography", "geography"];

function metaObj(e: { metadata: unknown }): Record<string, unknown> {
  return e.metadata && typeof e.metadata === "object"
    ? (e.metadata as Record<string, unknown>)
    : {};
}

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const s =
        (typeof o.slug === "string" && o.slug) ||
        (typeof o.id === "string" && o.id) ||
        (typeof o.entity_slug === "string" && o.entity_slug) ||
        (typeof o.entity_id === "string" && o.entity_id);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}

type ScoredRef = { score: number; reason: RelationReason };

export async function resolveRelatedEntities(
  entity: SupabaseEncyclopediaEntity,
): Promise<RelatedNode[]> {
  await ensureLocalSnapshotLoaded();
  const meta = metaObj(entity);
  const selfSlug = safeKey(entity.slug);
  const selfId = entity.id;

  const scores = new Map<string, ScoredRef>();

  const bump = (refs: string[], score: number, reason: RelationReason) => {
    for (const raw of refs) {
      const key = normalizeEntitySlug(raw);
      if (!key || key === selfSlug || key === selfId) continue;
      const prev = scores.get(key);
      if (!prev || score > prev.score) scores.set(key, { score, reason });
    }
  };

  // 1. Explicit relationships.
  bump(asStringList(meta.related_entities), 100, "explicit");
  bump(asStringList(meta.related), 100, "explicit");
  bump(asStringList(meta.relationships), 90, "explicit");

  // 2. Biographical references authored on THIS entity.
  const bioArrayFields = [
    "battles",
    "events",
    "commanders",
    "figures",
    "related_battles",
    "related_events",
    "related_figures",
    "landmarks",
  ];
  for (const f of bioArrayFields) bump(asStringList(meta[f]), 95, "biography");

  const bioSingleFields = ["location", "capital", "state", "city", "affiliation"];
  for (const f of bioSingleFields) {
    const v = meta[f];
    if (typeof v === "string" && v.trim()) bump([v.trim()], 95, "biography");
  }

  // 3. Reverse geography — other entities that explicitly point AT this one.
  const ors: string[] = [];
  if (entity.entity_type === "city") {
    ors.push(`metadata->>city.eq.${entity.slug}`);
    ors.push(`metadata->>location.eq.${entity.slug}`);
    ors.push(`metadata->>capital.eq.${entity.slug}`);
  }
  if (entity.entity_type === "state") {
    ors.push(`metadata->>state.eq.${entity.slug}`);
    ors.push(`metadata->>affiliation.eq.${entity.slug}`);
  }

  if (ors.length > 0) {
    const geo = (localEncyclopediaAll() as SupabaseEncyclopediaEntity[])
      .filter((candidate) => {
        if (!candidate || candidate.enabled === false || candidate.id === selfId) return false;
        const m = metaObj(candidate);
        if (entity.entity_type === "city") {
          return [m.city, m.location, m.capital]
            .some((v) => typeof v === "string" && normalizeEntitySlug(v) === entity.slug);
        }
        if (entity.entity_type === "state") {
          return [m.state, m.affiliation]
            .some((v) => typeof v === "string" && normalizeEntitySlug(v) === entity.slug);
        }
        return false;
      })
      .slice(0, 80);
    bump(geo.map((r) => r.slug), 60, "geography");
  }

  if (scores.size === 0) return [];

  // Resolve slugs → local enabled rows, then follow canonical/merged/converted/redirect
  // chains so references to converted duplicates surface the canonical entity.
  // Deduplicate by resolved id (keep the highest score / earliest reason).
  const keys = Array.from(scores.keys());
  const rawRows = keys
    .map((key) => localEncyclopediaBySlug(key) as SupabaseEncyclopediaEntity | null)
    .filter((row): row is SupabaseEncyclopediaEntity => !!row && row.enabled !== false);

  const { resolveCanonicalLocal } = await import("@/lib/encyclopedia-canonical");
  const byId = new Map<string, RelatedNode>();
  for (const raw of rawRows) {
    const ref = scores.get(safeKey(raw.slug));
    if (!ref) continue;
    const resolved = (resolveCanonicalLocal(raw) as SupabaseEncyclopediaEntity | null) ?? raw;
    if (!isDisplayableEntity(resolved)) continue;
    if (resolved.id === entity.id) continue;
    const prev = byId.get(resolved.id);
    if (!prev || ref.score > prev.score) {
      byId.set(resolved.id, { entity: resolved, score: ref.score, reason: ref.reason });
    }
  }

  const nodes = Array.from(byId.values());
  nodes.sort(
    (a, b) => b.score - a.score || a.entity.title.localeCompare(b.entity.title, "ar"),
  );
  return nodes;

}

export function groupRelatedByReason(
  nodes: RelatedNode[],
): Array<{ reason: RelationReason; label: string; items: RelatedNode[] }> {
  const groups = new Map<RelationReason, RelatedNode[]>();
  for (const n of nodes) {
    const arr = groups.get(n.reason) ?? [];
    arr.push(n);
    groups.set(n.reason, arr);
  }
  return REASON_ORDER.filter((r) => groups.has(r)).map((r) => ({
    reason: r,
    label: REASON_LABEL[r],
    items: groups.get(r)!,
  }));
}

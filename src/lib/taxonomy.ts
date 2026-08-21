// ============================================================
// Taxonomy — CMS-managed classifications (eras, worlds, states,
// entity types, and future taxonomy types). Single source of
// truth is public.admin_taxonomy in Supabase.
//
// Consumers (Encyclopedia filters, quality gate, report,
// cleanup workshop, canonical fixer, etc.) read from these
// hooks / helpers instead of hardcoded constants. Code-level
// constants (`ERAS`, `WORLD_HUBS`) remain only as a bootstrap
// fallback for the very first render before Supabase resolves.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ERAS as CODE_ERAS } from "@/lib/app-constants";
import { WORLD_HUBS as CODE_WORLD_HUBS } from "@/lib/worlds";
import {
  APPROVED_ERA_SLUGS,
  APPROVED_WORLD_SLUGS,
  APPROVED_STATE_SLUGS,
  ERA_LABELS_AR,
  WORLD_LABELS_AR,
  STATE_LABELS_AR,
} from "@/lib/taxonomy-labels";

export type TaxonomyType =
  | "era"
  | "world"
  | "state"
  | "entity_type"
  | "tag_category"
  | (string & {});

export interface TaxonomyEntry {
  id: string;
  type: TaxonomyType;
  key: string;
  label_ar: string;
  label_en: string | null;
  description: string | null;
  sort_order: number;
  enabled: boolean;
  archived: boolean;
  color: string | null;
  icon: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}


/**
 * Synthesised taxonomy entries built from the approved taxonomy-labels
 * source of truth. This is what normal pickers / filters / editors should
 * use — legacy DB values (buyid, taifa, byzantine, crusades, modern, …)
 * never appear here.
 */
function approvedEntries(type: TaxonomyType): TaxonomyEntry[] {
  const now = new Date().toISOString();
  const mk = (
    key: string,
    label_ar: string,
    sort_order: number,
    extra: Partial<TaxonomyEntry> = {},
  ): TaxonomyEntry => ({
    id: `approved-${type}-${key}`,
    type,
    key,
    label_ar,
    label_en: null,
    description: null,
    sort_order,
    enabled: true,
    archived: false,
    color: null,
    icon: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...extra,
  });
  if (type === "era") {
    return APPROVED_ERA_SLUGS.map((k, i) => {
      const meta = CODE_ERAS.find((e) => e.id === k);
      return mk(k, ERA_LABELS_AR[k], (i + 1) * 10, {
        metadata: meta ? { years: meta.years } : {},
      });
    });
  }
  if (type === "world") {
    return APPROVED_WORLD_SLUGS.map((k, i) => {
      const hub = CODE_WORLD_HUBS.find((h) => h.slug === k);
      return mk(k, WORLD_LABELS_AR[k], (i + 1) * 10, {
        metadata: hub ? { glyph: hub.glyph } : {},
      });
    });
  }
  if (type === "state") {
    return APPROVED_STATE_SLUGS.map((k, i) => mk(k, STATE_LABELS_AR[k], (i + 1) * 10));
  }
  return [];
}

/**
 * Taxonomy hook.
 *
 * - Default (`source: "approved"`): returns ONLY approved values from the
 *   central taxonomy-labels module. This is what normal pickers, filters
 *   and editors must use.
 * - `source: "db"`: reads raw `admin_taxonomy` rows including legacy /
 *   disabled / archived values. Reserved for cleanup / audit / review
 *   tools that need to remap or clean legacy slugs.
 */
export function useTaxonomy(
  type: TaxonomyType,
  opts: { enabledOnly?: boolean; source?: "approved" | "db" } = {},
) {
  const source = opts.source ?? "approved";
  const enabledOnly = opts.enabledOnly ?? false;

  const query = useQuery({
    queryKey: ["admin-taxonomy", type, enabledOnly, source],
    staleTime: 10 * 60_000,
    retry: 1,
    enabled: source === "db",
    queryFn: async (): Promise<TaxonomyEntry[]> => {
      let q = supabase
        .from("admin_taxonomy" as never)
        .select("*")
        .eq("type", type)
        .order("sort_order", { ascending: true })
        .order("key", { ascending: true });
      if (enabledOnly) q = q.eq("enabled", true).eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as TaxonomyEntry[] | null) ?? []).map((r) => ({
        ...r,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      }));
    },
  });

  const dbEntries = query.data ?? [];

  const effective: TaxonomyEntry[] = useMemo(() => {
    if (source === "approved") return approvedEntries(type);
    // DB mode — fall back to approved list on first paint / when empty
    // so audit tools never render a blank picker.
    return dbEntries.length > 0 ? dbEntries : approvedEntries(type);
  }, [source, type, dbEntries]);

  const byKey = useMemo(() => {
    const m = new Map<string, TaxonomyEntry>();
    for (const r of effective) m.set(r.key, r);
    return m;
  }, [effective]);

  return { ...query, entries: effective, byKey };
}

/** Convenience: canonical keys as a Set, honouring `enabled` + `archived`. */
export function useCanonicalKeys(type: TaxonomyType): Set<string> {
  const { entries } = useTaxonomy(type);
  return useMemo(
    () => new Set(entries.filter((e) => e.enabled && !e.archived).map((e) => e.key)),
    [entries],
  );
}


/** Look up a label by key. Falls back to the raw key when unknown. */
export function labelFor(entries: TaxonomyEntry[], key: string | null | undefined): string {
  if (!key) return "";
  const hit = entries.find((e) => e.key === key);
  return hit?.label_ar ?? key;
}

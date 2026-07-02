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

/** Fallback rows synthesised from code constants — used before the network
 *  responds so we never render an empty filter bar. */
function bootstrap(type: TaxonomyType): TaxonomyEntry[] {
  const now = new Date().toISOString();
  const mk = (
    key: string,
    label_ar: string,
    sort_order: number,
    extra: Partial<TaxonomyEntry> = {},
  ): TaxonomyEntry => ({
    id: `bootstrap-${type}-${key}`,
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
    return CODE_ERAS.map((e, i) => mk(e.id, e.name, (i + 1) * 10, { metadata: { years: e.years } }));
  }
  if (type === "world") {
    return CODE_WORLD_HUBS.map((w) => mk(w.slug, w.slug, w.order * 10, { metadata: { glyph: w.glyph } }));
  }
  return [];
}

/** Fetch every taxonomy row (including disabled/archived — admin surfaces
 *  filter client-side). Public callers should pass `{ enabledOnly: true }`. */
export function useTaxonomy(type: TaxonomyType, opts: { enabledOnly?: boolean } = {}) {
  const enabledOnly = opts.enabledOnly ?? false;
  const query = useQuery({
    queryKey: ["admin-taxonomy", type, enabledOnly],
    staleTime: 60_000,
    retry: 1,
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

  const entries = query.data ?? [];
  const byKey = useMemo(() => {
    const m = new Map<string, TaxonomyEntry>();
    for (const r of entries) m.set(r.key, r);
    return m;
  }, [entries]);

  // Bootstrap so the UI has something to render on first paint / while offline.
  const effective: TaxonomyEntry[] = entries.length > 0 ? entries : bootstrap(type);

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

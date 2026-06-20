// ============================================================
// Encyclopedia data source — Supabase primary, packs fallback.
//
// Phase 1: artifacts only. Other types still read from packs/data.ts.
// Public pages call useEncyclopediaSupabaseEntity(type, rawId) to fetch
// a matching row from encyclopedia_entities. If found, callers prefer
// Supabase values over pack values. If not found (or query fails),
// callers fall back transparently to the legacy pack entity.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupabaseEncyclopediaEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: unknown;
  metadata: unknown;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** Mirror of admin migration normalizeSlug — keep in sync. */
export function normalizeEntitySlug(raw: string): string {
  const last = raw.split(".").pop() ?? raw;
  return last.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Types currently wired to read from Supabase first. Extend gradually. */
export const SUPABASE_ENABLED_TYPES = new Set<string>(["artifact"]);

export function isSupabaseEnabled(entityType: string): boolean {
  return SUPABASE_ENABLED_TYPES.has(entityType);
}

/**
 * Fetch a single enabled entity by (type, slug). Returns null if missing.
 * Legacy fallback is the caller's responsibility.
 */
export function useEncyclopediaSupabaseEntity(
  entityType: string,
  rawId: string,
  options: { enabled?: boolean } = {},
) {
  const slug = normalizeEntitySlug(rawId);
  const enabled = (options.enabled ?? true) && !!slug && !!entityType;
  return useQuery({
    queryKey: ["encyclopedia-entity", entityType, slug],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("entity_type", entityType)
        .eq("slug", slug)
        .eq("enabled", true)
        .maybeSingle();
      if (error) {
        // Silent fallback: callers will use legacy source.
        if (typeof console !== "undefined") {
          console.warn("[encyclopedia-source] supabase fetch failed", error.message);
        }
        return null;
      }
      return (data as SupabaseEncyclopediaEntity | null) ?? null;
    },
  });
}

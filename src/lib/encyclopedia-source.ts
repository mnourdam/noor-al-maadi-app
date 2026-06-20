// ============================================================
// Encyclopedia data source — Supabase primary, packs fallback.
//
// Strategy: callers render the legacy layout (which holds rich fields not
// yet in Supabase: rarity, coords, gradients, related lists), and ask this
// module for title/subtitle/summary overrides. Supabase rows take priority
// when present; legacy values are used as fallback. Supabase-only entities
// (no legacy match) render a minimal view via useEncyclopediaSupabaseEntity.
//
// Phase 2: figure, city, battle, state, landmark, artifact now read from
// Supabase. Campaign engine content is NOT touched.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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

export type EncyclopediaSourceTag = "supabase" | "legacy" | "fallback";

/** Mirror of admin migration normalizeSlug — keep in sync. */
export function normalizeEntitySlug(raw: string): string {
  if (!raw) return "";
  const last = raw.split(".").pop() ?? raw;
  return last.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Types wired to read from Supabase first. */
export const SUPABASE_ENABLED_TYPES = new Set<string>([
  "figure",
  "city",
  "battle",
  "state",
  "landmark",
  "artifact",
]);

export function isSupabaseEnabled(entityType: string): boolean {
  return SUPABASE_ENABLED_TYPES.has(entityType);
}

const DEBUG =
  typeof window !== "undefined" &&
  (window.localStorage?.getItem("irth.debug.encyclopedia") === "1" ||
    new URLSearchParams(window.location.search).get("debug") === "encyclopedia");

/** Dev-only logger; never logs in production unless explicitly enabled. */
export function logEncyclopediaSource(
  entityType: string,
  rawId: string,
  source: EncyclopediaSourceTag,
) {
  if (!DEBUG || typeof console === "undefined") return;
  console.info(
    `[encyclopedia] type=${entityType} id=${rawId} → source=${source}`,
  );
}

/**
 * Fetch a single enabled entity by (type, slug). Returns null on miss.
 * Never throws; failures fall through silently so legacy renders.
 */
export function useEncyclopediaSupabaseEntity(
  entityType: string,
  rawId: string,
  options: { enabled?: boolean } = {},
) {
  const slug = normalizeEntitySlug(rawId);
  const enabled =
    (options.enabled ?? true) && !!slug && !!entityType && isSupabaseEnabled(entityType);
  return useQuery({
    queryKey: ["encyclopedia-entity", entityType, slug],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("entity_type", entityType)
          .eq("slug", slug)
          .eq("enabled", true)
          .maybeSingle();
        if (error) {
          if (typeof console !== "undefined")
            console.warn("[encyclopedia-source] fetch failed", error.message);
          return null;
        }
        return (data as SupabaseEncyclopediaEntity | null) ?? null;
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] fetch crashed", e);
        return null;
      }
    },
  });
}

/**
 * Bulk fetch all enabled entities of a type (used by list/grid views like
 * the map and museum). Returns a Map keyed by slug for O(1) override lookup.
 */
export function useEncyclopediaSupabaseList(entityType: string) {
  const enabled = isSupabaseEnabled(entityType);
  const query = useQuery({
    queryKey: ["encyclopedia-list", entityType],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity[]> => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("entity_type", entityType)
          .eq("enabled", true);
        if (error) {
          if (typeof console !== "undefined")
            console.warn("[encyclopedia-source] list failed", error.message);
          return [];
        }
        return (data as SupabaseEncyclopediaEntity[] | null) ?? [];
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] list crashed", e);
        return [];
      }
    },
  });
  const bySlug = useMemo(() => {
    const m = new Map<string, SupabaseEncyclopediaEntity>();
    for (const r of query.data ?? []) m.set(r.slug, r);
    return m;
  }, [query.data]);
  return { ...query, bySlug };
}

/**
 * Convenience: ask "for legacy id `rawId`, what should I display?".
 * Returns merged display fields and the source tag for debug.
 */
export function useEncyclopediaDisplay<L extends { title?: string; subtitle?: string | null; summary?: string | null; description?: string | null }>(
  entityType: string,
  rawId: string,
  legacy: L | null | undefined,
) {
  const q = useEncyclopediaSupabaseEntity(entityType, rawId);
  const supa = q.data ?? null;

  let source: EncyclopediaSourceTag = "legacy";
  if (supa) source = "supabase";
  else if (!legacy) source = "fallback";

  logEncyclopediaSource(entityType, rawId, source);

  const title = supa?.title || legacy?.title || "";
  const subtitle =
    (supa?.subtitle ?? null) || legacy?.subtitle || null;
  const summary =
    (supa?.summary ?? null) ||
    legacy?.summary ||
    legacy?.description ||
    null;

  return {
    supa,
    source,
    title,
    subtitle,
    summary,
    isFromSupabase: !!supa,
    isLoading: q.isLoading,
  };
}

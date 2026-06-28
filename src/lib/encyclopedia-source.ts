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
import {
  cachedEncyclopediaById,
  cachedEncyclopediaBySlug,
  cachedEncyclopediaByType,
} from "./offline-fallback";
import {
  localEncyclopediaById,
  localEncyclopediaBySlug,
  localEncyclopediaByType,
  localEncyclopediaSlugCandidates,
} from "./local-first-store";

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
  // Chronology fields (Sprint 2 — Historical Chronology Engine). Optional
  // because legacy entities and older selects may omit them.
  timeline_order?: number | null;
  timeline_year?: number | null;
  timeline_start_year?: number | null;
};

/** Columns required to render + chronologically sort an entity. */
export const ENCYCLOPEDIA_ENTITY_COLUMNS =
  "id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body," +
  "timeline_order,timeline_year,timeline_start_year";

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
  "event",
  "scholar",
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
    // Local-first: render the cached row instantly so the player sees real
    // content offline; the network fetch below refreshes in the background.
    initialData: () =>
      (localEncyclopediaBySlug(slug, entityType) as SupabaseEncyclopediaEntity | null) ?? undefined,
    initialDataUpdatedAt: 0,
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
          return (await cachedEncyclopediaBySlug(slug, entityType)) as SupabaseEncyclopediaEntity | null;
        }
        if (!data) return (await cachedEncyclopediaBySlug(slug, entityType)) as SupabaseEncyclopediaEntity | null;
        return data as SupabaseEncyclopediaEntity;
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] fetch crashed", e);
        return (await cachedEncyclopediaBySlug(slug, entityType)) as SupabaseEncyclopediaEntity | null;
      }
    },
  });
}

/**
 * Score how "rich" an encyclopedia entity is, so we can pick the canonical
 * one when multiple rows share the same slug across different entity types.
 * Pure, no I/O.
 */
export function entityRichness(e: {
  body?: unknown;
  summary?: string | null;
  subtitle?: string | null;
  enabled?: boolean;
}): number {
  let s = 0;
  const b = e.body as Record<string, unknown> | null | undefined;
  if (b && typeof b === "object") {
    if (Array.isArray(b.sections)) s += (b.sections as unknown[]).length * 4;
    if (Array.isArray(b.timeline)) s += (b.timeline as unknown[]).length * 3;
    if (Array.isArray(b.facts)) s += (b.facts as unknown[]).length;
    if (Array.isArray(b.sources)) s += (b.sources as unknown[]).length;
    if (b.related && typeof b.related === "object") {
      for (const v of Object.values(b.related as Record<string, unknown>))
        if (Array.isArray(v)) s += v.length;
    }
    if (typeof b.overview === "string")
      s += Math.min(5, Math.floor((b.overview as string).length / 200));
  }
  if (e.summary) s += 1;
  if (e.subtitle) s += 1;
  if (e.enabled) s += 0.5;
  return s;
}

/** Pick the richest entity; ties broken by hinted type, then enabled. */
export function pickCanonicalEntity<
  T extends {
    entity_type?: string;
    enabled?: boolean;
    body?: unknown;
    summary?: string | null;
    subtitle?: string | null;
  },
>(list: T[], preferType?: string | null): T | null {
  if (!list || list.length === 0) return null;
  return (
    [...list].sort((a, b) => {
      const ra = entityRichness(a), rb = entityRichness(b);
      if (ra !== rb) return rb - ra;
      if (preferType) {
        const at = a.entity_type === preferType ? 1 : 0;
        const bt = b.entity_type === preferType ? 1 : 0;
        if (at !== bt) return bt - at;
      }
      const ae = a.enabled ? 1 : 0, be = b.enabled ? 1 : 0;
      if (ae !== be) return be - ae;
      return 0;
    })[0] ?? null
  );
}

/**
 * Canonical resolver for a raw unlock id (`type:slug`, `slug`, or alias).
 * Searches by slug AND by metadata.aliases containing the raw id, across
 * all entity types, and returns the richest result. Hinted type only
 * breaks ties.
 */
export function useEncyclopediaCanonicalEntity(
  rawId: string,
  hintedType?: string | null,
) {
  const slug = normalizeEntitySlug(rawId);
  const raw = (rawId ?? "").trim();
  const lookupIds = Array.from(new Set([raw, slug].filter(Boolean)));
  return useQuery({
    queryKey: ["encyclopedia-canonical", slug, raw, hintedType ?? ""],
    enabled: !!slug,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      try {
        const candidates: SupabaseEncyclopediaEntity[] = [];
        const seen = new Set<string>();
        const push = (rows: unknown) => {
          for (const row of (rows as SupabaseEncyclopediaEntity[]) ?? []) {
            if (row?.id && !seen.has(row.id)) {
              seen.add(row.id);
              candidates.push(row);
            }
          }
        };
        const slugRes = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("slug", slug)
          .eq("enabled", true);
        if (!slugRes.error) push(slugRes.data);
        for (const id of lookupIds) {
          const aliasRes = await supabase
            .from("encyclopedia_entities")
            .select("*")
            .contains("metadata", { aliases: [id] })
            .eq("enabled", true);
          if (!aliasRes.error) push(aliasRes.data);

          const legacyRes = await supabase
            .from("encyclopedia_entities")
            .select("*")
            .contains("metadata", { legacy_id: id })
            .eq("enabled", true);
          if (!legacyRes.error) push(legacyRes.data);
        }
        return pickCanonicalEntity(candidates, hintedType ?? null);
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] canonical fetch crashed", e);
        return null;
      }
    },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return !!s && UUID_RE.test(s.trim());
}

/** Fetch a single enabled entity by UUID — used by atlas → encyclopedia links. */
export function useEncyclopediaSupabaseEntityById(rawId: string) {
  const id = (rawId ?? "").trim();
  const enabled = isUuid(id);
  return useQuery({
    queryKey: ["encyclopedia-entity-by-id", id],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("id", id)
          .eq("enabled", true)
          .maybeSingle();
        if (error) {
          if (typeof console !== "undefined")
            console.warn("[encyclopedia-source] id fetch failed", error.message);
          return await cachedEncyclopediaById(id);
        }
        return (data as SupabaseEncyclopediaEntity | null) ?? (await cachedEncyclopediaById(id));
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] id fetch crashed", e);
        return await cachedEncyclopediaById(id);
      }
    },
  });
}

/**
 * Fetch a single enabled entity by slug across all entity_types. Picks the
 * canonical (richest) row when multiple types share the same slug.
 */
export function useEncyclopediaSupabaseEntityBySlug(rawId: string) {
  const slug = normalizeEntitySlug(rawId);
  return useQuery({
    queryKey: ["encyclopedia-entity-by-slug", slug],
    enabled: !!slug,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("slug", slug)
          .eq("enabled", true);
        if (error) {
          if (typeof console !== "undefined")
            console.warn("[encyclopedia-source] slug fetch failed", error.message);
          return await cachedEncyclopediaBySlug(slug);
        }
        const picked = pickCanonicalEntity((data as SupabaseEncyclopediaEntity[]) ?? []);
        return picked ?? (await cachedEncyclopediaBySlug(slug));
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] slug fetch crashed", e);
        return await cachedEncyclopediaBySlug(slug);
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
          return await cachedEncyclopediaByType(entityType);
        }
        const rows = (data as SupabaseEncyclopediaEntity[] | null) ?? [];
        return rows.length > 0 ? rows : await cachedEncyclopediaByType(entityType);
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia-source] list crashed", e);
        return await cachedEncyclopediaByType(entityType);
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

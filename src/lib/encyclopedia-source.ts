// ============================================================
// Encyclopedia data source — SUPABASE IS THE ONLY SOURCE OF TRUTH.
//
// Architectural rule (locked):
//   • The Encyclopedia surface reads exclusively from
//     `public.encyclopedia_entities` in Supabase.
//   • No local packs, no bundled JSON, no offline fallback,
//     no legacy registry, no synthetic entities, no generated cards.
//   • If Supabase has nothing, the UI renders an empty state.
//
// Anything incomplete is hidden — quality over quantity.
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
  timeline_order?: number | null;
  timeline_year?: number | null;
  timeline_start_year?: number | null;
  /** Alternative names / common references; participates in search. */
  aliases?: string[] | null;
};

/** Columns required to render + chronologically sort an entity. */
export const ENCYCLOPEDIA_ENTITY_COLUMNS =
  "id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body,aliases," +
  "timeline_order,timeline_year,timeline_start_year";

/** Mirror of admin migration normalizeSlug — keep in sync. */
export function normalizeEntitySlug(raw: string): string {
  if (!raw) return "";
  const last = raw.split(".").pop() ?? raw;
  return last.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Types the Encyclopedia surfaces. Kept here so filters/UI agree. */
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

// ─────────────────────────────────────────────────────────────
// Displayability — quality gate
// ─────────────────────────────────────────────────────────────

function bodyHasContent(body: unknown): boolean {
  if (!body) return false;
  if (typeof body === "string") return body.trim().length >= 40;
  if (typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.overview === "string" && b.overview.trim().length >= 40) return true;
  if (typeof b.introduction === "string" && b.introduction.trim().length >= 40) return true;
  if (Array.isArray(b.sections) && b.sections.length > 0) return true;
  if (Array.isArray(b.blocks) && b.blocks.length > 0) return true;
  if (Array.isArray(b.timeline) && b.timeline.length > 0) return true;
  if (Array.isArray(b.facts) && b.facts.length > 0) return true;
  return false;
}

/**
 * The Encyclopedia never shows empty cards, orphan records, or stubs.
 * A row is displayable only when it is enabled AND has real content —
 * either a substantial summary or a real body.
 */
export function isDisplayableEntity(
  e: Pick<SupabaseEncyclopediaEntity, "enabled" | "summary" | "body"> | null | undefined,
): boolean {
  if (!e || e.enabled === false) return false;
  const summary = (e.summary ?? "").trim();
  if (summary.length >= 40) return true;
  if (bodyHasContent(e.body)) return true;
  return false;
}

/** Filter helper for lists. */
export function filterDisplayable<T extends { enabled?: boolean; summary?: string | null; body?: unknown }>(
  list: T[] | null | undefined,
): T[] {
  return (list ?? []).filter((r) => isDisplayableEntity(r as any));
}

// ─────────────────────────────────────────────────────────────
// Queries — Supabase only, no fallbacks.
// ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return !!s && UUID_RE.test(s.trim());
}

/** Score how "rich" a row is; used only to disambiguate same-slug siblings. */
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
    if (typeof b.overview === "string")
      s += Math.min(5, Math.floor((b.overview as string).length / 200));
  }
  if (e.summary) s += 1;
  if (e.subtitle) s += 1;
  if (e.enabled) s += 0.5;
  return s;
}

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

/** Fetch one enabled entity by (type, slug). Returns null on miss. */
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
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("entity_type", entityType)
        .eq("slug", slug)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw error;
      return (data as SupabaseEncyclopediaEntity | null) ?? null;
    },
  });
}

/** Fetch one enabled entity by UUID — used by atlas → encyclopedia links. */
export function useEncyclopediaSupabaseEntityById(rawId: string) {
  const id = (rawId ?? "").trim();
  const enabled = isUuid(id);
  return useQuery({
    queryKey: ["encyclopedia-entity-by-id", id],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("id", id)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw error;
      return (data as SupabaseEncyclopediaEntity | null) ?? null;
    },
  });
}

/** Fetch one enabled entity by slug across types; picks the richest match. */
export function useEncyclopediaSupabaseEntityBySlug(rawId: string) {
  const slug = normalizeEntitySlug(rawId);
  return useQuery({
    queryKey: ["encyclopedia-entity-by-slug", slug],
    enabled: !!slug,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("slug", slug)
        .eq("enabled", true);
      if (error) throw error;
      return pickCanonicalEntity((data as SupabaseEncyclopediaEntity[]) ?? []);
    },
  });
}

/** Bulk fetch all enabled entities of a type. */
export function useEncyclopediaSupabaseList(entityType: string) {
  const enabled = isSupabaseEnabled(entityType);
  const query = useQuery({
    queryKey: ["encyclopedia-list", entityType],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity[]> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("entity_type", entityType)
        .eq("enabled", true);
      if (error) throw error;
      return (data as SupabaseEncyclopediaEntity[] | null) ?? [];
    },
  });
  const bySlug = useMemo(() => {
    const m = new Map<string, SupabaseEncyclopediaEntity>();
    for (const r of query.data ?? []) m.set(r.slug, r);
    return m;
  }, [query.data]);
  return { ...query, bySlug };
}

// ============================================================
// Encyclopedia data source — local-first, network-refreshed.
//
// Player-facing encyclopedia, museum, atlas panels, and related-content
// surfaces render from the offline snapshot first (memory/IndexedDB/
// bundled JSON). Live reads are only a fallback when the local cache is
// empty; normal freshness comes from the global background offline sync.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureLocalSnapshotLoaded,
  localEncyclopediaAll,
  localEncyclopediaById,
  localEncyclopediaBySlug,
  localEncyclopediaByType,
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
  timeline_order?: number | null;
  timeline_year?: number | null;
  timeline_start_year?: number | null;
  /** Alternative names / common references; participates in search. */
  aliases?: string[] | null;
  /** Optional hero image — all fields nullable, no-image is the default. */
  image_url?: string | null;
  image_path?: string | null;
  image_credit?: string | null;
  image_source?: string | null;
};

/** Columns required to render + chronologically sort an entity. */
export const ENCYCLOPEDIA_ENTITY_COLUMNS =
  "id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body,aliases," +
  "timeline_order,timeline_year,timeline_start_year," +
  "image_url,image_path,image_credit,image_source";

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
 * True when the entity has been converted / merged into another canonical
 * entity, or has been archived / soft-hidden as a duplicate. These rows
 * must never appear in public lists, search, suggestions, or pickers —
 * only the destination canonical entity should remain visible.
 */
export function isRedirectedOrArchivedEntity(e: { metadata?: unknown } | null | undefined): boolean {
  if (!e) return false;
  const meta = (e.metadata && typeof e.metadata === "object")
    ? (e.metadata as Record<string, unknown>)
    : null;
  if (!meta) return false;
  if (typeof meta.canonical_id === "string" && meta.canonical_id.trim().length > 0) return true;
  if (meta.archived === true) return true;
  if (meta.hidden_duplicate === true) return true;
  if (typeof meta.merged_into === "string" && meta.merged_into.trim().length > 0) return true;
  if (typeof meta.converted_to === "string" && meta.converted_to.trim().length > 0) return true;
  if (typeof meta.redirect_to === "string" && meta.redirect_to.trim().length > 0) return true;
  return false;
}

/**
 * The Encyclopedia never shows empty cards, orphan records, or stubs.
 * A row is displayable only when it is enabled, not a redirect/merge/archive
 * stub, and has real content — either a substantial summary or a real body.
 */
export function isDisplayableEntity(
  e:
    | (Pick<SupabaseEncyclopediaEntity, "enabled" | "summary" | "body"> & {
        entity_type?: string;
        metadata?: unknown;
      })
    | null
    | undefined,
): boolean {
  if (!e || e.enabled === false) return false;
  // Converted/merged/archived rows must be hidden from every public surface.
  if (isRedirectedOrArchivedEntity(e)) return false;
  // Artifacts are always visible once published — content can be enriched over time.
  if ((e as { entity_type?: string }).entity_type === "artifact") return true;
  const summary = (e.summary ?? "").trim();
  if (summary.length >= 40) return true;
  if (bodyHasContent(e.body)) return true;
  return false;
}


/** Filter helper for lists. */
export function filterDisplayable<
  T extends { entity_type?: string; enabled?: boolean; summary?: string | null; body?: unknown },
>(list: T[] | null | undefined): T[] {
  return (list ?? []).filter((r) => isDisplayableEntity(r as any));
}

// ─────────────────────────────────────────────────────────────
// Queries — Supabase only, no fallbacks.
// ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return !!s && UUID_RE.test(s.trim());
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
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

async function liveFetchById(id: string): Promise<SupabaseEncyclopediaEntity | null> {
  const r = await supabase
    .from("encyclopedia_entities")
    .select("*")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  if (r.error) throw r.error;
  return (r.data ?? null) as SupabaseEncyclopediaEntity | null;
}

async function liveFetchBySlug(slug: string, entityType?: string | null): Promise<SupabaseEncyclopediaEntity | null> {
  let q = supabase
    .from("encyclopedia_entities")
    .select("*")
    .eq("slug", slug)
    .eq("enabled", true);
  if (entityType) q = q.eq("entity_type", entityType);
  const { data, error } = await q;
  if (error) throw error;
  return pickCanonicalEntity((data as unknown as SupabaseEncyclopediaEntity[]) ?? [], entityType ?? null);
}

async function liveFetchByType(entityType: string): Promise<SupabaseEncyclopediaEntity[]> {
  const { data, error } = await supabase
    .from("encyclopedia_entities")
    .select("*")
    .eq("entity_type", entityType)
    .eq("enabled", true);
  if (error) throw error;
  return (data as unknown as SupabaseEncyclopediaEntity[] | null) ?? [];
}

async function liveFetchAll(): Promise<SupabaseEncyclopediaEntity[]> {
  const PAGE = 1000;
  const rows: SupabaseEncyclopediaEntity[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select(ENCYCLOPEDIA_ENTITY_COLUMNS)
      .eq("enabled", true)
      .order("title")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as SupabaseEncyclopediaEntity[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function fetchEncyclopediaAllLocalFirst(): Promise<SupabaseEncyclopediaEntity[]> {
  await ensureLocalSnapshotLoaded();
  const local = localEncyclopediaAll() as SupabaseEncyclopediaEntity[];
  if (local.length > 0) return local;
  if (!isOnline()) return [];
  try { return await liveFetchAll(); } catch { return []; }
}

/**
 * Fetch the current public live index without replacing local-first behavior.
 * Public search uses this as an online authority so stale cached rows that were
 * later archived/merged/disabled cannot keep rendering as duplicate results.
 *
 * PERFORMANCE: prefer `fetchEncyclopediaLivePublicIds` when only the
 * authoritative id set is needed. This variant downloads every `body`
 * (~12 MB / 2 round trips) and must never gate a player-facing first paint.
 */
export async function fetchEncyclopediaLivePublicAll(): Promise<SupabaseEncyclopediaEntity[] | null> {
  if (!isOnline()) return null;
  try { return await liveFetchAll(); } catch { return null; }
}

/**
 * Authoritative id set only — 49 KB / one round trip instead of the 12 MB
 * full-row download. This is all the public search pipeline actually needs
 * from the network: proof that a locally cached row still exists and is
 * still enabled. Row *content* comes from the local snapshot.
 */
export async function fetchEncyclopediaLivePublicIds(): Promise<Set<string> | null> {
  if (!isOnline()) return null;
  try {
    const PAGE = 2000;
    const ids = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("id")
        .eq("enabled", true)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as { id: string }[];
      for (const row of batch) if (row?.id) ids.add(row.id);
      if (batch.length < PAGE) break;
    }
    return ids.size > 0 ? ids : null;
  } catch {
    return null;
  }
}


export async function fetchEncyclopediaByTypeLocalFirst(entityType: string): Promise<SupabaseEncyclopediaEntity[]> {
  if (!isSupabaseEnabled(entityType)) return [];
  await ensureLocalSnapshotLoaded();
  const local = localEncyclopediaByType(entityType) as SupabaseEncyclopediaEntity[];
  if (local.length > 0) return local;
  if (!isOnline()) return [];
  try { return await liveFetchByType(entityType); } catch { return []; }
}

export async function fetchEncyclopediaByIdLocalFirst(id: string): Promise<SupabaseEncyclopediaEntity | null> {
  await ensureLocalSnapshotLoaded();
  const local = localEncyclopediaById(id) as SupabaseEncyclopediaEntity | null;
  if (local && local.enabled !== false) return local;
  if (!isOnline()) return null;
  try { return await liveFetchById(id); } catch { return null; }
}

export async function fetchEncyclopediaBySlugLocalFirst(
  rawId: string,
  entityType?: string | null,
): Promise<SupabaseEncyclopediaEntity | null> {
  const slug = normalizeEntitySlug(rawId);
  if (!slug) return null;
  await ensureLocalSnapshotLoaded();
  const local = localEncyclopediaBySlug(slug, entityType) as SupabaseEncyclopediaEntity | null;
  if (local && local.enabled !== false) return local;
  if (!isOnline()) return null;
  try { return await liveFetchBySlug(slug, entityType); } catch { return null; }
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
    initialData: () => localEncyclopediaBySlug(slug, entityType) as SupabaseEncyclopediaEntity | null,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      return fetchEncyclopediaBySlugLocalFirst(slug, entityType);
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
    initialData: () => localEncyclopediaById(id) as SupabaseEncyclopediaEntity | null,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      return fetchEncyclopediaByIdLocalFirst(id);
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
    initialData: () => localEncyclopediaBySlug(slug) as SupabaseEncyclopediaEntity | null,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      return fetchEncyclopediaBySlugLocalFirst(slug);
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
    initialData: () => {
      const rows = localEncyclopediaByType(entityType) as SupabaseEncyclopediaEntity[];
      return rows.length > 0 ? rows : undefined;
    },
    queryFn: async (): Promise<SupabaseEncyclopediaEntity[]> => {
      return fetchEncyclopediaByTypeLocalFirst(entityType);
    },
  });
  const bySlug = useMemo(() => {
    const m = new Map<string, SupabaseEncyclopediaEntity>();
    for (const r of query.data ?? []) m.set(r.slug, r);
    return m;
  }, [query.data]);
  return { ...query, bySlug };
}

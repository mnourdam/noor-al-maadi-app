// Phase 1 — Atlas entities client helpers.
// Reads via the browser supabase client (RLS gates exposure).
// Mutations only succeed when called by a content admin (RLS check).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AtlasEntityKind = Database["public"]["Enums"]["atlas_entity_kind"];
export type AtlasEntityStatus = Database["public"]["Enums"]["atlas_entity_status"];
export type AtlasEntityRow = Database["public"]["Tables"]["atlas_entities"]["Row"];
export type AtlasEntityInsert = Database["public"]["Tables"]["atlas_entities"]["Insert"];
export type AtlasEntityUpdate = Database["public"]["Tables"]["atlas_entities"]["Update"];

export const ATLAS_ENTITY_KINDS: AtlasEntityKind[] = [
  "place",
  "battle",
  "event",
  "figure_marker",
  "artifact_site",
  "region",
  "route_point",
];

// ─── LC1 player Atlas surface ─────────────────────────────────────────
// For Launch Candidate 1 the player-facing Atlas only renders three
// entity families: regions/states/empires, places/cities, and battles.
// Events, artifacts, figure markers, and route points stay in the
// database (imports continue, encyclopedia/museum still surface them)
// but are filtered out at the query layer so the map stays light and
// fast on Android. Re-enable by widening this set.
export const LC1_ATLAS_VISIBLE_KINDS: ReadonlySet<AtlasEntityKind> = new Set<AtlasEntityKind>([
  "region",
  "place",
  "battle",
]);

export function isLc1VisibleAtlasKind(kind: AtlasEntityKind | string | null | undefined): boolean {
  return !!kind && LC1_ATLAS_VISIBLE_KINDS.has(kind as AtlasEntityKind);
}

export function filterLc1AtlasRows<T extends { kind: AtlasEntityKind | string }>(rows: T[]): T[] {
  return rows.filter((r) => isLc1VisibleAtlasKind(r.kind));
}

export const ATLAS_ENTITY_STATUSES: AtlasEntityStatus[] = [
  "draft",
  "review",
  "published",
  "retired",
];

export const KIND_LABEL_AR: Record<AtlasEntityKind, string> = {
  place: "موقع",
  battle: "معركة",
  event: "حدث",
  figure_marker: "شخصية",
  artifact_site: "أثر",
  region: "إقليم",
  route_point: "نقطة طريق",
};

export const STATUS_LABEL_AR: Record<AtlasEntityStatus, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  published: "منشور",
  retired: "متقاعد",
};

/**
 * Explicit, non-editorial column list.
 *
 * SECURITY: `created_by`, `updated_by` and `aps_verified_by` are editorial
 * identity columns and are NOT granted to `anon`/`authenticated` at the
 * database level. Never re-add them to a client-side select.
 */
export const ATLAS_PUBLIC_COLUMNS =
  "id,slug,kind,name_ar,name_en,aps_x,aps_y,aps_verified,aps_verified_at," +
  "lon,lat,geo_source,atlas_version,era,year_start,year_end,status," +
  "published_at,encyclopedia_entity_id,metadata,created_at,updated_at";

/** Public read: only published + verified rows (RLS enforces this for anon/auth). */
export async function listPublishedAtlasEntities(): Promise<AtlasEntityRow[]> {
  try {
    const { data, error } = await supabase
      .from("atlas_entities")
      .select(ATLAS_PUBLIC_COLUMNS)
      .eq("status", "published")
      .eq("aps_verified", true)
      .limit(2000);
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as AtlasEntityRow[];
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[atlas-entities] live read failed, using snapshot:", e);
  }
  // Offline / failure fallback: serve from the bundled/cached snapshot.
  try {
    const { cachedAtlasEntities } = await import("./offline-fallback");
    return (await cachedAtlasEntities()) as AtlasEntityRow[];
  } catch {
    return [];
  }
}

/** Admin read: every row regardless of status (RLS admin policy must allow). */
export async function listAllAtlasEntities(): Promise<AtlasEntityRow[]> {
  const { data, error } = await supabase
    .from("atlas_entities")
    .select(ATLAS_PUBLIC_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as AtlasEntityRow[];
}

export async function getAtlasEntity(id: string): Promise<AtlasEntityRow | null> {
  const { data, error } = await supabase
    .from("atlas_entities")
    .select(ATLAS_PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AtlasEntityRow) ?? null;
}

export async function createAtlasEntity(input: AtlasEntityInsert): Promise<AtlasEntityRow> {
  // Always start unverified + draft, regardless of caller intent.
  const sanitized: AtlasEntityInsert = {
    ...input,
    aps_verified: false,
    aps_verified_by: null,
    aps_verified_at: null,
    status: "draft",
    published_at: null,
  };
  const { data, error } = await supabase
    .from("atlas_entities")
    .insert(sanitized)
    .select(ATLAS_PUBLIC_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as AtlasEntityRow;
}

export async function updateAtlasEntity(
  id: string,
  patch: AtlasEntityUpdate,
): Promise<AtlasEntityRow> {
  const { data, error } = await supabase
    .from("atlas_entities")
    .update(patch)
    .eq("id", id)
    .select(ATLAS_PUBLIC_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as AtlasEntityRow;
}


/** Flip aps_verified=true and stamp reviewer. Trigger fills the timestamp. */
export async function verifyAtlasEntity(id: string, reviewerId: string | null): Promise<AtlasEntityRow> {
  return updateAtlasEntity(id, {
    aps_verified: true,
    aps_verified_by: reviewerId,
  });
}

export async function unverifyAtlasEntity(id: string): Promise<AtlasEntityRow> {
  return updateAtlasEntity(id, { aps_verified: false });
}

export async function setAtlasEntityStatus(
  id: string,
  status: AtlasEntityStatus,
): Promise<AtlasEntityRow> {
  return updateAtlasEntity(id, { status });
}

export async function deleteAtlasEntity(id: string): Promise<void> {
  // Trigger/RLS only allow hard delete for status='draft'. Caller may
  // need to set status to 'retired' for published rows instead.
  const { error } = await supabase.from("atlas_entities").delete().eq("id", id);
  if (error) throw error;
}

/** Naive slug suggester: prefer name_en, fall back to a transliterated name_ar. */
export function suggestSlug(nameAr: string, nameEn?: string | null): string {
  const source = (nameEn?.trim() || nameAr.trim() || "").toLowerCase();
  // Strip diacritics, replace Arabic chars by rough transliteration, then keep
  // [a-z0-9-]. This is a *suggestion*, not authoritative — admin can edit.
  const map: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
    "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ء": "", "ؤ": "u",
    "ئ": "i",
  };
  let out = "";
  for (const ch of source) out += map[ch] ?? ch;
  out = out
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return out || "entity";
}

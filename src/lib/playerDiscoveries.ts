// ============================================================
// Unified Player Discoveries — single source of truth for
// "what has this player recently discovered or acquired?"
// ------------------------------------------------------------
// Two canonical concepts (kept SEPARATE by design):
//
//   A. Encyclopedia discovery
//      The player meaningfully read/discovered an encyclopedia
//      entity. Source rows:
//        • public.user_entity_discoveries (server, RLS-scoped)
//        • local offline discovery mirror (@/lib/entityDiscoveries)
//      Timestamps use `first_discovered_at` (initial discovery).
//      Reading an artifact article never counts as ownership.
//
//   B. Museum acquisition
//      The player owns/unlocked/received an artifact or
//      museum item. Source rows:
//        • public.user_collection (server, RLS-scoped)
//        • pending `collection_add` outbox items (offline)
//      Timestamps use `unlocked_at`.
//
// A campaign reward may create BOTH a discovery and an
// acquisition row — the records remain distinct.
//
// Every UI surface that asks "what did the player just find?"
// MUST consume this service. Do not duplicate this logic.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDiscoveries } from "@/lib/entityDiscoveries";
import { peekAll } from "@/lib/offline/outbox";
import { listCampaigns } from "@/lib/campaignStorage";

// ============================================================
// Public types
// ============================================================

export type DiscoveryKind = "encyclopedia" | "museum";

export type DiscoverySource =
  | "encyclopedia_read"
  | "campaign_reward"
  | "museum_unlock"
  | "game_unlock"
  | "investigation_reward"
  | "legacy_collection";

export interface DiscoveryItem {
  /** Stable dedup/key: `${kind}:${canonicalEntityId}` */
  key: string;
  /** Canonical slug (redirects/aliases collapsed). */
  canonicalEntityId: string;
  /** Slug as displayed / used for routing. Equals canonicalEntityId. */
  slug: string;
  /** Arabic title, resolved from encyclopedia_entities. */
  title: string;
  /** Underlying entity_type (figure, artifact, city, ...). */
  entityType: string;
  /** Optional image URL for hero art. */
  image?: string;
  /** Optional world hint from entity metadata. */
  world?: string;
  /** Whether this is an encyclopedia discovery or museum acquisition. */
  kind: DiscoveryKind;
  /** How the entry originated. */
  source: DiscoverySource;
  /** ms epoch — first_discovered_at OR unlocked_at. */
  occurredAt: number;
  /** In-app destination. */
  destinationRoute: string;
  /** Short Arabic label ("اكتشاف موسوعي" / "كنز جديد" / ...). */
  kindLabel: string;
  /** Optional Arabic subtitle (e.g. "من حملة …"). */
  subtitle?: string;
}

// ============================================================
// Constants
// ============================================================

const KIND_LABEL: Record<DiscoverySource, string> = {
  encyclopedia_read: "اكتشاف موسوعي",
  campaign_reward: "مكافأة حملة",
  museum_unlock: "كنز جديد",
  game_unlock: "مكافأة لعبة",
  investigation_reward: "مكافأة تحقيق",
  legacy_collection: "من الأرشيف",
};

const HAS_ARABIC = /[\u0600-\u06FF]/;

// Route-safe entity types (mirror museum + encyclopedia canonical).
const ROUTABLE_TYPES = new Set([
  "figure", "scholar", "artifact", "landmark", "city",
  "battle", "event", "state",
]);

// ============================================================
// Encyclopedia index — canonical resolution + title/image lookup
// ============================================================

interface EncyclopediaIndex {
  /** slug or alias → canonical slug */
  canonicalOf: Map<string, string>;
  /** entity uuid → canonical slug */
  canonicalById: Map<string, string>;
  /** canonical slug → { title, type, image, world } */
  meta: Map<string, {
    title: string;
    type: string;
    image?: string;
    world?: string;
  }>;
  loaded: boolean;
}

const EMPTY_INDEX: EncyclopediaIndex = {
  canonicalOf: new Map(),
  canonicalById: new Map(),
  meta: new Map(),
  loaded: false,
};

function useEncyclopediaIndex(): EncyclopediaIndex {
  const [idx, setIdx] = useState<EncyclopediaIndex>(EMPTY_INDEX);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("id,slug,title,entity_type,enabled,aliases,metadata,image_url")
          .eq("enabled", true);
        if (cancelled || error || !data) return;
        const canonicalOf = new Map<string, string>();
        const canonicalById = new Map<string, string>();
        const meta = new Map<string, { title: string; type: string; image?: string; world?: string }>();
        for (const r of data as Array<{
          id: string; slug: string; title: string | null;
          entity_type: string; aliases: string[] | null;
          metadata: Record<string, unknown> | null;
          image_url: string | null;
        }>) {
          const slug = String(r.slug ?? "").toLowerCase().trim();
          if (!slug) continue;
          // Never surface archived/merged/hidden duplicates.
          const md = (r.metadata ?? {}) as Record<string, unknown>;
          if (md.archived === true || md.hidden === true) continue;
          if (typeof md.merged_into === "string" && md.merged_into) {
            // Redirect this slug (and aliases) to the canonical target.
            const target = String(md.merged_into).toLowerCase();
            canonicalOf.set(slug, target);
            if (r.id) canonicalById.set(r.id, target);
            continue;
          }
          canonicalOf.set(slug, slug);
          if (r.id) canonicalById.set(r.id, slug);
          const title = (r.title ?? "").trim();
          if (!title || !HAS_ARABIC.test(title)) continue;
          const image = r.image_url ? String(r.image_url) : undefined;
          const world = typeof md.world === "string" ? md.world as string : undefined;
          meta.set(slug, { title, type: String(r.entity_type ?? ""), image, world });
          // Aliases + legacy_id resolve back to canonical slug.
          const aliases = Array.isArray(r.aliases) ? r.aliases : [];
          const legacyId = typeof md.legacy_id === "string" ? md.legacy_id : null;
          for (const raw of [legacyId, ...aliases]) {
            const a = String(raw ?? "").toLowerCase().trim();
            if (!a || a === slug) continue;
            canonicalOf.set(a, slug);
          }
        }
        setIdx({ canonicalOf, canonicalById, meta, loaded: true });
      } catch {
        /* offline — keep last known */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return idx;
}

// ============================================================
// Auth scope tracking (uid | "guest") + refresh triggers
// ============================================================

function useUserScope(): { uid: string | null; userKey: string; refreshTick: number } {
  const [uid, setUid] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setRefreshTick((n) => n + 1);
    window.addEventListener("irth:outbox:flushed", bump);
    window.addEventListener("irth:entity-discovery:changed", bump);
    window.addEventListener("online", bump);
    return () => {
      window.removeEventListener("irth:outbox:flushed", bump);
      window.removeEventListener("irth:entity-discovery:changed", bump);
      window.removeEventListener("online", bump);
    };
  }, []);

  return { uid, userKey: uid ?? "guest", refreshTick };
}

// ============================================================
// Server row loaders (scoped by uid)
// ============================================================

interface ServerDiscoveryRow {
  entityId: string;
  entitySlug: string;
  entityType: string;
  firstAt: number;
  source: string | null;
}
interface ServerCollectionRow {
  itemId: string;
  itemType: string;
  unlockedAt: number;
  sourceCampaignId: string | null;
}

function useServerRows(uid: string | null, refreshTick: number): {
  discoveries: ServerDiscoveryRow[];
  collection: ServerCollectionRow[];
  loaded: boolean;
} {
  const [state, setState] = useState<{
    discoveries: ServerDiscoveryRow[];
    collection: ServerCollectionRow[];
    loaded: boolean;
  }>({ discoveries: [], collection: [], loaded: false });

  useEffect(() => {
    // Sign-out: hard reset to prevent previous-account flash.
    if (!uid) {
      setState({ discoveries: [], collection: [], loaded: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [disc, coll] = await Promise.all([
          supabase
            .from("user_entity_discoveries")
            .select("entity_id,entity_slug,entity_type,first_discovered_at,source")
            .eq("user_id", uid),
          supabase
            .from("user_collection")
            .select("item_id,item_type,unlocked_at,source_campaign_id")
            .eq("user_id", uid),
        ]);
        if (cancelled) return;
        const discoveries: ServerDiscoveryRow[] = (disc.data ?? []).map((r: {
          entity_id: string; entity_slug: string; entity_type: string;
          first_discovered_at: string; source: string | null;
        }) => ({
          entityId: r.entity_id,
          entitySlug: String(r.entity_slug ?? "").toLowerCase(),
          entityType: String(r.entity_type ?? ""),
          firstAt: r.first_discovered_at ? new Date(r.first_discovered_at).getTime() : 0,
          source: r.source,
        }));
        const collection: ServerCollectionRow[] = (coll.data ?? []).map((r: {
          item_id: string; item_type: string;
          unlocked_at: string; source_campaign_id: string | null;
        }) => ({
          itemId: String(r.item_id ?? "").toLowerCase(),
          itemType: String(r.item_type ?? ""),
          unlockedAt: r.unlocked_at ? new Date(r.unlocked_at).getTime() : 0,
          sourceCampaignId: r.source_campaign_id,
        }));
        setState({ discoveries, collection, loaded: true });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [uid, refreshTick]);

  return state;
}

// ============================================================
// Pending offline museum acquisitions (outbox `collection_add`)
// ============================================================

function usePendingCollection(uid: string | null, refreshTick: number): ServerCollectionRow[] {
  const [rows, setRows] = useState<ServerCollectionRow[]>([]);
  useEffect(() => {
    if (!uid) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const items = await peekAll(uid);
        if (cancelled) return;
        const out: ServerCollectionRow[] = [];
        for (const it of items) {
          if (it.kind !== "collection_add") continue;
          const p = (it.payload ?? {}) as Record<string, unknown>;
          out.push({
            itemId: String(p.itemId ?? "").toLowerCase(),
            itemType: String(p.itemType ?? ""),
            unlockedAt: it.createdAt,
            sourceCampaignId: typeof p.sourceCampaignId === "string" ? p.sourceCampaignId : null,
          });
        }
        setRows(out);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [uid, refreshTick]);
  return rows;
}

// ============================================================
// Assembly helpers
// ============================================================

/**
 * Classify a museum-acquisition row into a canonical DiscoverySource.
 * Rules:
 *   • has source_campaign_id           → campaign_reward
 *   • missing unlocked_at (epoch 0)    → legacy_collection
 *   • otherwise                        → museum_unlock
 * Existing rows are never rewritten; we only interpret them.
 */
function classifyCollection(row: ServerCollectionRow): DiscoverySource {
  if (row.sourceCampaignId) return "campaign_reward";
  if (!row.unlockedAt) return "legacy_collection";
  return "museum_unlock";
}

function campaignTitleFor(cid: string | null): string | null {
  if (!cid) return null;
  try {
    const c = listCampaigns().find((x) => x.id === cid);
    if (c) return c.title;
  } catch { /* ignore */ }
  return null;
}

function buildEncyclopediaItems(
  serverRows: ServerDiscoveryRow[],
  localMap: Record<string, { id: string; slug: string; type: string; firstAt: string; source?: string }>,
  idx: EncyclopediaIndex,
): DiscoveryItem[] {
  const perCanonical = new Map<string, DiscoveryItem>();

  const consider = (
    entityId: string,
    slugRaw: string,
    typeHint: string,
    at: number,
    sourceHint: string | undefined | null,
  ) => {
    if (!at) return;
    const slug = slugRaw.toLowerCase();
    const canonicalFromSlug = idx.canonicalOf.get(slug);
    const canonicalFromId = entityId ? idx.canonicalById.get(entityId) : undefined;
    const canonical = canonicalFromId ?? canonicalFromSlug;
    // If idx not loaded yet, be lenient and use slug as canonical.
    if (!canonical && idx.loaded) return;
    const canonicalId = canonical ?? slug;
    const meta = idx.meta.get(canonicalId);
    // Filter out archived/disabled/merged: absent from meta once idx is loaded.
    if (idx.loaded && !meta) return;
    const title = meta?.title ?? "";
    if (!title) return; // no reliable Arabic title -> skip
    const entityType = meta?.type ?? typeHint ?? "";
    if (entityType && !ROUTABLE_TYPES.has(entityType)) return;

    const source: DiscoverySource =
      sourceHint === "campaign" || sourceHint === "campaign_reward" ? "campaign_reward" :
      sourceHint === "investigation" || sourceHint === "investigation_reward" ? "investigation_reward" :
      sourceHint === "game" || sourceHint === "game_unlock" ? "game_unlock" :
      "encyclopedia_read";

    const existing = perCanonical.get(canonicalId);
    // Keep the EARLIEST first-discovery timestamp per canonical entity.
    if (existing && existing.occurredAt <= at) return;
    perCanonical.set(canonicalId, {
      key: `encyclopedia:${canonicalId}`,
      canonicalEntityId: canonicalId,
      slug: canonicalId,
      title,
      entityType,
      image: meta?.image,
      world: meta?.world,
      kind: "encyclopedia",
      source,
      occurredAt: at,
      destinationRoute: `/encyclopedia/entity/${canonicalId}`,
      kindLabel: KIND_LABEL[source],
    });
  };

  for (const r of serverRows) consider(r.entityId, r.entitySlug, r.entityType, r.firstAt, r.source);
  for (const r of Object.values(localMap)) {
    const at = r.firstAt ? new Date(r.firstAt).getTime() : 0;
    consider(r.id, r.slug, r.type, at, r.source);
  }
  return Array.from(perCanonical.values());
}

function buildMuseumItems(
  serverRows: ServerCollectionRow[],
  pendingRows: ServerCollectionRow[],
  idx: EncyclopediaIndex,
): DiscoveryItem[] {
  const perCanonical = new Map<string, DiscoveryItem>();
  const consider = (row: ServerCollectionRow, isPending: boolean) => {
    const slug = row.itemId.toLowerCase();
    const canonical = idx.canonicalOf.get(slug) ?? (idx.loaded ? undefined : slug);
    if (!canonical) return;
    const meta = idx.meta.get(canonical);
    if (idx.loaded && !meta) return;
    const entityType = meta?.type ?? row.itemType;
    if (entityType && !ROUTABLE_TYPES.has(entityType)) return;
    const title = meta?.title;
    if (!title) return;

    const source = classifyCollection(row);
    const at = row.unlockedAt || (isPending ? Date.now() : 0);
    const campaignName = campaignTitleFor(row.sourceCampaignId);

    const existing = perCanonical.get(canonical);
    if (existing && existing.occurredAt >= at) return;
    perCanonical.set(canonical, {
      key: `museum:${canonical}`,
      canonicalEntityId: canonical,
      slug: canonical,
      title,
      entityType,
      image: meta?.image,
      world: meta?.world,
      kind: "museum",
      source,
      occurredAt: at,
      destinationRoute: `/encyclopedia/entity/${canonical}`,
      kindLabel: KIND_LABEL[source],
      subtitle: campaignName ? `من حملة ${campaignName}` : undefined,
    });
  };
  // Pending first (so a server row for the same entity overwrites when it lands).
  for (const r of pendingRows) consider(r, true);
  for (const r of serverRows) consider(r, false);
  return Array.from(perCanonical.values());
}

function sortByOccurred(items: DiscoveryItem[]): DiscoveryItem[] {
  return [...items].sort((a, b) => {
    if (b.occurredAt !== a.occurredAt) return b.occurredAt - a.occurredAt;
    // Deterministic tie-breaker: canonical slug ascending.
    return a.canonicalEntityId.localeCompare(b.canonicalEntityId);
  });
}

// ============================================================
// Public hooks
// ============================================================

/** Latest encyclopedia discoveries (reading events), newest first. */
export function useLatestEncyclopediaDiscoveries(limit = 8): DiscoveryItem[] {
  const { uid, userKey, refreshTick } = useUserScope();
  const idx = useEncyclopediaIndex();
  const { discoveries } = useServerRows(uid, refreshTick);

  // Local mirror read (partitioned by userKey → guest never leaks to account).
  const localMap = useMemo(() => {
    void refreshTick; // dependency for CHANGED_EVENT
    return getLocalDiscoveries(userKey);
  }, [userKey, refreshTick]);

  return useMemo(() => {
    const items = buildEncyclopediaItems(discoveries, localMap, idx);
    return sortByOccurred(items).slice(0, limit);
  }, [discoveries, localMap, idx, limit]);
}

/** Latest museum acquisitions (ownership events), newest first. */
export function useLatestMuseumAcquisitions(limit = 8): DiscoveryItem[] {
  const { uid, refreshTick } = useUserScope();
  const idx = useEncyclopediaIndex();
  const { collection } = useServerRows(uid, refreshTick);
  const pending = usePendingCollection(uid, refreshTick);

  return useMemo(() => {
    const items = buildMuseumItems(collection, pending, idx);
    return sortByOccurred(items).slice(0, limit);
  }, [collection, pending, idx, limit]);
}

/**
 * Unified feed — encyclopedia discoveries + museum acquisitions,
 * deduped by canonical entity id. When both kinds exist for the same
 * entity, the newer event wins; ties prefer museum acquisition
 * because it is the stronger relationship.
 */
export function useUnifiedDiscoveryFeed(limit = 8): DiscoveryItem[] {
  const enc = useLatestEncyclopediaDiscoveries(limit * 2);
  const mus = useLatestMuseumAcquisitions(limit * 2);
  return useMemo(() => {
    const perCanonical = new Map<string, DiscoveryItem>();
    for (const item of [...enc, ...mus]) {
      const existing = perCanonical.get(item.canonicalEntityId);
      if (!existing) { perCanonical.set(item.canonicalEntityId, item); continue; }
      if (item.occurredAt > existing.occurredAt) {
        perCanonical.set(item.canonicalEntityId, item);
      } else if (item.occurredAt === existing.occurredAt && item.kind === "museum") {
        perCanonical.set(item.canonicalEntityId, item);
      }
    }
    return sortByOccurred(Array.from(perCanonical.values())).slice(0, limit);
  }, [enc, mus, limit]);
}

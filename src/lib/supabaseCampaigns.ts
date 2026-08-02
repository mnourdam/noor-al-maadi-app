// ============================================================
// Campaign Reader — local-first, network refresh.
// ------------------------------------------------------------
// Player-facing routes read campaigns through this module. The bundled
// offline snapshot is the primary source so chapters open instantly
// without a network call; Supabase is consulted when local has no match
// or as a background refresh (the next call after sync sees the update).
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/types/campaign";
import { sortCampaignsChronological } from "./campaignChronology";
import { withBackfilledChronologyAll } from "./campaignChronologyBackfill";
import {
  ensureLocalSnapshotLoaded,
  invalidateLocalCampaign,
  localCampaignByIdOrSlug,
  localCampaignDividerRows,
  localPublishedCampaigns,
} from "./local-first-store";
import {
  applyKeyArtOverlay,
  getCampaignKeyArtOverlay,
  
  type KeyArtOverlayRow,
} from "./campaignKeyArtOverlay";

import {
  buildFeed,
  groupFeedIntoSections,
  type CampaignSectionDivider,
  type EraSection,
  type FeedItem,
} from "./campaignDividers";
import {
  isDividerRow,
  selectCampaignRows,
  selectDividers,
} from "./campaigns/entities";

function toCampaigns(
  rawList: { id: string; slug: string; data: any; key_art_path?: string | null; key_art_square_path?: string | null; key_art_credit?: string | null }[],
  overlay: Record<string, KeyArtOverlayRow> = {},
): Campaign[] {
  // Section dividers are a different entity type — they can never enter the
  // campaign pipeline (sorting, progress, artwork, counts).
  const all = selectCampaignRows(rawList)
    .map((r) => {
      const c = r.data as unknown as Campaign;
      if (!c) return c;
      // Merge Key Art fields (view columns) onto the Campaign object so
      // player surfaces resolve artwork through the single canonical
      // resolver in `src/lib/campaignArtwork.tsx`. Snapshot rows predate
      // those columns — the overlay repairs them.
      const merged = {
        ...c,
        id: c.id ?? r.id,
        slug: (c as any).slug ?? r.slug,
        key_art_path: r.key_art_path ?? c.key_art_path ?? null,
        key_art_square_path: r.key_art_square_path ?? c.key_art_square_path ?? null,
        key_art_credit: r.key_art_credit ?? c.key_art_credit ?? null,
      } as Campaign;
      return applyKeyArtOverlay(
        merged as Campaign & { id?: string; slug?: string },
        overlay,
      ) as Campaign;
    })
    .filter((c) => c && c.status === "published");
  return sortCampaignsChronological(withBackfilledChronologyAll(all));
}

// -------------------- Timeline freshness --------------------
// The bundled snapshot only SEEDS the timeline. Ordering (and therefore which
// era section a campaign belongs to) is edited in the admin workshop, so a
// shipped snapshot goes stale the moment the timeline is reordered. This
// refresh replaces the local campaign rows with the authoritative
// `campaigns_public` rows once per session while online.

let _timelineRefresh: Promise<boolean> | null = null;

/** Pull authoritative campaign + divider rows into the local store. */
export async function refreshCampaignRows(force = false): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (force) _timelineRefresh = null;
  if (!_timelineRefresh) {
    _timelineRefresh = (async () => {
      try {
        const { data, error } = await supabase
          .from("campaigns_public" as any)
          .select("id, slug, data, key_art_path, key_art_square_path, key_art_credit");
        if (error || !Array.isArray(data) || data.length === 0) return false;
        const { mergeLocalCampaignRows } = await import("./local-first-store");
        return mergeLocalCampaignRows(data as any[]);
      } catch {
        return false;
      }
    })();
    // A failed attempt must not poison the session.
    _timelineRefresh = _timelineRefresh.then((ok) => {
      if (!ok) _timelineRefresh = null;
      return ok;
    });
  }
  return _timelineRefresh;
}

/** All published campaigns, ordered chronologically. Local-first. */
export async function fetchPublishedCampaigns(): Promise<Campaign[]> {
  await ensureLocalSnapshotLoaded();
  await refreshCampaignRows();
  const local = localPublishedCampaigns() as { id: string; slug: string; data: any }[];

  if (local.length > 0) {
    // Snapshot rows carry no `key_art_*` columns — merge the artwork
    // overlay so campaign-owned surfaces never fall back to a random
    // hero image while showing that campaign's title / progress / CTA.
    const overlay = await getCampaignKeyArtOverlay();
    return toCampaigns(local, overlay);
  }

  // Local empty (rare — e.g. snapshot still loading). Fall through to network.
  try {
    const { data, error } = await supabase
      .from("campaigns_public" as any)
      .select("id, slug, data, key_art_path, key_art_square_path, key_art_credit");
    if (!error && data) return toCampaigns(data as any[]);

  } catch (err) {
    console.warn("[supabaseCampaigns] live list failed:", err);
  }
  return [];
}

/**
 * Resolve a campaign by UUID id or slug.
 * - mode: "published" (default) → local-first, live snapshot only.
 * - mode: "draft" → editor preview; always reads `draft_data` via the
 *   admin-only RPC `admin_get_campaign_full`. Non-admins get null.
 *   Never returns local cache.
 */
export async function fetchCampaignByIdOrSlug(
  idOrSlug: string,
  opts?: { mode?: "published" | "draft" },
): Promise<Campaign | null> {
  if (!idOrSlug) return null;
  const mode = opts?.mode ?? "published";

  if (mode === "draft") {
    // Draft data lives on admin_campaigns.draft_data, which is not readable
    // by anon/authenticated at the column-grant level. Go through the
    // admin-gated RPC. The RPC accepts a UUID id; when the input looks like
    // a slug we resolve it via a published lookup first, then re-query by id.
    try {
      let targetId = idOrSlug;
      // Simple heuristic: UUIDs contain a dash pattern; otherwise treat as slug
      // and resolve to an id via the public view first.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(idOrSlug)) {
        const bySlug: any = await supabase
          .from("campaigns_public" as any)
          .select("id")
          .eq("slug", idOrSlug)
          .maybeSingle();
        if (bySlug?.data?.id) targetId = bySlug.data.id;
      }

      const rpc = await supabase.rpc("admin_get_campaign_full" as any, { p_id: targetId });
      if (rpc.error) return null;
      const rows = (rpc.data as any[]) ?? [];
      const row = rows[0];
      const c = (row?.draft_data ?? null) as Campaign | null;
      // Preview always renders — status can be draft/published/archived.
      return c ? { ...c, status: "published" } as Campaign : null;
    } catch (err) {
      console.warn("[supabaseCampaigns] draft resolve failed:", err);
      return null;
    }
  }

  await ensureLocalSnapshotLoaded();

  const hit = localCampaignByIdOrSlug(idOrSlug);
  if (hit && !isDividerRow(hit as any)) {
    const c = (hit.data ?? null) as Campaign | null;
    if (c && c.status === "published") {
      // An older bundled campaign row can predate a newly linked intro.
      // On entry, refresh that specific row before returning the stale local
      // copy so the intro can open on the very first visit after publication.
      // Fully-authored local rows remain instant and offline-first.
      if (c.intro_story_id || typeof navigator !== "undefined" && navigator.onLine === false) {
        const overlay = await getCampaignKeyArtOverlay();
        const merged = {
          ...c,
          id: c.id ?? (hit as any).id,
          slug: (c as any).slug ?? (hit as any).slug,
          key_art_path: (hit as any).key_art_path ?? c.key_art_path ?? null,
          key_art_square_path: (hit as any).key_art_square_path ?? c.key_art_square_path ?? null,
          key_art_credit: (hit as any).key_art_credit ?? c.key_art_credit ?? null,
        } as Campaign & { id?: string; slug?: string };
        return applyKeyArtOverlay(merged, overlay) as Campaign;
      }
    }
  }


  // Local miss — try network (may be a freshly published campaign).
  try {
    let row: any = await supabase
      .from("campaigns_public" as any)
      .select("id, slug, data, key_art_path, key_art_square_path, key_art_credit")
      .eq("id", idOrSlug)
      .maybeSingle();
    if (!row?.data) {
      row = await supabase
        .from("campaigns_public" as any)
        .select("id, slug, data, key_art_path, key_art_square_path, key_art_credit")
        .eq("slug", idOrSlug)
        .maybeSingle();
    }
    if (!row?.error) {
      const r = row?.data;
      const c = (r?.data ?? null) as Campaign | null;
      if (c && c.status === "published") {
        return {
          ...c,
          key_art_path: r?.key_art_path ?? c.key_art_path ?? null,
          key_art_square_path: r?.key_art_square_path ?? c.key_art_square_path ?? null,
          key_art_credit: r?.key_art_credit ?? c.key_art_credit ?? null,
        } as Campaign;
      }
    } else {
      console.warn("[supabaseCampaigns] resolve failed:", row.error.message);
    }

  } catch (err) {
    console.warn("[supabaseCampaigns] resolve crashed:", err);
  }
  return null;
}


// -------------------- Publish-event invalidation --------------------

/**
 * Bust the local in-memory campaign cache. Called on `irth:campaign-published`
 * and BroadcastChannel messages so the very next `fetchCampaignByIdOrSlug`
 * call refetches the freshly-published data from Supabase.
 */
export function invalidatePublishedCampaign(idOrSlug: string): void {
  invalidateLocalCampaign(idOrSlug);
}

let _publishListenerInstalled = false;
type PublishListener = (id: string, kind: "draft" | "publish") => void;
const _publishListeners = new Set<PublishListener>();

function ensurePublishListener() {
  if (_publishListenerInstalled || typeof window === "undefined") return;
  _publishListenerInstalled = true;
  const handle = (id: string, kind: "draft" | "publish") => {
    invalidatePublishedCampaign(id);
    _publishListeners.forEach(fn => { try { fn(id, kind); } catch { /* noop */ } });
  };
  window.addEventListener("irth:campaign-published", (e: any) => {
    handle(e?.detail?.id, e?.detail?.kind ?? "publish");
  });
  try {
    const ch = new BroadcastChannel("irth-campaigns");
    ch.onmessage = (m) => handle(m?.data?.id, m?.data?.kind ?? "publish");
  } catch { /* noop */ }
}

/** Subscribe to publish notifications. Returns unsubscribe. */
export function onCampaignPublished(fn: PublishListener): () => void {
  ensurePublishListener();
  _publishListeners.add(fn);
  return () => { _publishListeners.delete(fn); };
}


/**
 * Full ordered timeline feed: era dividers interleaved with campaigns
 * in their shared chronological position. Local-first, identical to the
 * admin Campaign Ordering Workshop sequence.
 */
export async function fetchPublishedFeed(): Promise<{
  items: FeedItem[];
  sections: EraSection[];
  dividers: CampaignSectionDivider[];
  campaigns: Campaign[];
}> {
  await ensureLocalSnapshotLoaded();
  // Ordering is authored in the admin workshop; refresh before grouping so a
  // stale snapshot can never move a campaign into the wrong era section.
  await refreshCampaignRows();
  let campaignRows = localPublishedCampaigns() as { id: string; slug: string; data: any }[];
  let dividerRows = localCampaignDividerRows() as { id: string; slug: string; data: any }[];
  if (campaignRows.length === 0) {
    try {
      const { data, error } = await supabase
        .from("campaigns_public" as any)
        .select("id, slug, data, key_art_path, key_art_square_path, key_art_credit");
      if (!error && data) {
        campaignRows = selectCampaignRows(data as any[]) as any[];
        dividerRows = (data as any[]).filter((r) => isDividerRow(r));
      }
    } catch { /* ignore */ }

  }
  const campaigns = toCampaigns(campaignRows);
  const dividers = selectDividers(dividerRows);
  const items = buildFeed(campaigns, dividers);
  const sections = groupFeedIntoSections(items);
  return { items, sections, dividers, campaigns };
}

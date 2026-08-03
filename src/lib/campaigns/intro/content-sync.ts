// ============================================================
// Campaign Intros — background delta sync
// ------------------------------------------------------------
// Truth order for intro CONTENT at runtime:
//
//   1. locally synced bundle (this module)   ← newest
//   2. bundled offline snapshot (APK seed)
//   3. live server fetch on demand
//
// A campaign intro published AFTER the APK was built therefore
// starts working on the next background sync — no new release.
//
// Guarantees:
//   * never blocks start-up (always fire-and-forget)
//   * never deletes a working bundle before the new one commits
//   * a failed/aborted sync leaves the previous content intact
//   * identical content is never re-downloaded (content_version
//     + updated_at cursor)
//   * content sync is identity-independent: guests and signed-in
//     players receive exactly the same updates
//   * campaign intros stay isolated from the story library
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { prefetchStoryMediaRows } from "@/lib/stories/media/url";
import {
  deleteSyncedIntroBundle,
  listSyncedIntroBundles,
  readIntroSyncMeta,
  writeIntroSyncMeta,
  writeSyncedIntroBundle,
  writeSyncedIntroLinks,
  type IntroSyncMeta,
  type SyncedIntroBundle,
  type SyncedIntroLink,
} from "./content-store";

export interface IntroCatalogEntry {
  storyId: string;
  contentVersion: number;
  updatedAt: string | null;
}

export interface IntroSyncPlan {
  /** Stories that must be downloaded (new or outdated locally). */
  fetchIds: string[];
  /** Locally cached stories the server no longer publishes as intros. */
  removeIds: string[];
}

/**
 * PURE planner — decides what to download and what to reconcile away.
 * `local` is the set of bundles currently cached on the device.
 */
export function planIntroSync(
  catalog: IntroCatalogEntry[],
  local: { storyId: string; contentVersion: number }[],
): IntroSyncPlan {
  const localMap = new Map<string, number>();
  for (const row of local) {
    if (row?.storyId) localMap.set(row.storyId, Number(row.contentVersion) || 0);
  }
  const fetchIds: string[] = [];
  const serverIds = new Set<string>();
  for (const entry of catalog) {
    if (!entry?.storyId) continue;
    serverIds.add(entry.storyId);
    const have = localMap.get(entry.storyId);
    if (have === undefined || have < (Number(entry.contentVersion) || 1)) {
      fetchIds.push(entry.storyId);
    }
  }
  const removeIds: string[] = [];
  for (const storyId of localMap.keys()) {
    if (!serverIds.has(storyId)) removeIds.push(storyId);
  }
  return { fetchIds, removeIds };
}

// ---------------------------------------------------------------
// Sync runner
// ---------------------------------------------------------------

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const RESUME_AFTER_MS = 10 * 60 * 1000;

let inFlight: Promise<IntroSyncMeta> | null = null;
let lastRunAt = 0;
let listenersBound = false;
let hiddenSince = 0;

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((r) => r && typeof r === "object") as Record<string, unknown>[])
    : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function online(): boolean {
  try {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  } catch {
    return true;
  }
}

export interface IntroSyncOptions {
  /** Ignore the throttle (used by "campaign has no local intro" recovery). */
  force?: boolean;
  /** Always (re-)download these stories even when the local version matches. */
  requireStoryIds?: string[];
}

export async function syncCampaignIntroContent(
  options: IntroSyncOptions = {},
): Promise<IntroSyncMeta> {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!options.force && now - lastRunAt < MIN_INTERVAL_MS) return readIntroSyncMeta();
  if (!online()) return readIntroSyncMeta();

  inFlight = (async () => {
    const meta = readIntroSyncMeta();
    writeIntroSyncMeta({ last_attempt: new Date().toISOString() });
    try {
      const localBundles = await listSyncedIntroBundles();
      const requested = (options.requireStoryIds ?? []).filter(Boolean);

      // Pass 1 — catalogue + deltas since the last successful sync.
      const { data, error } = await supabase.rpc("campaign_intros_sync_v1" as never, {
        p_since: meta.sync_cursor,
        p_story_ids: requested.length ? requested : null,
      } as never);
      if (error) throw error;
      const payload = (data ?? {}) as Record<string, unknown>;

      // --- Links (campaign → intro story) -------------------------
      const links: SyncedIntroLink[] = rows(payload.links)
        .map((row) => {
          const campaignId = str(row.campaign_id);
          const storyId = str(row.story_id);
          if (!campaignId || !storyId) return null;
          const version = Number(row.intro_version);
          return {
            campaignId,
            slug: str(row.slug),
            storyId,
            version: Number.isFinite(version) && version >= 1 ? Math.trunc(version) : 1,
          } satisfies SyncedIntroLink;
        })
        .filter((l): l is SyncedIntroLink => !!l);

      const catalog: IntroCatalogEntry[] = rows(payload.catalog)
        .map((row) => {
          const storyId = str(row.story_id);
          if (!storyId) return null;
          const v = Number(row.content_version);
          return {
            storyId,
            contentVersion: Number.isFinite(v) && v >= 1 ? Math.trunc(v) : 1,
            updatedAt: str(row.updated_at),
          } satisfies IntroCatalogEntry;
        })
        .filter((c): c is IntroCatalogEntry => !!c);

      const plan = planIntroSync(
        catalog,
        localBundles.map((b) => ({ storyId: b.storyId, contentVersion: b.contentVersion })),
      );
      for (const id of requested) {
        if (!plan.fetchIds.includes(id) && catalog.some((c) => c.storyId === id)) {
          plan.fetchIds.push(id);
        }
      }

      // --- Bundles ------------------------------------------------
      let shippedStories = rows(payload.stories);
      let shippedScenes = rows(payload.story_scenes);
      let shippedMedia = rows(payload.story_media);

      const missing = plan.fetchIds.filter(
        (id) => !shippedStories.some((s) => String(s.id ?? "") === id),
      );
      if (missing.length > 0) {
        // Pass 2 — explicitly ask for whatever the cursor pass did not ship.
        const second = await supabase.rpc("campaign_intros_sync_v1" as never, {
          p_since: null,
          p_story_ids: missing,
        } as never);
        if (second.error) throw second.error;
        const p2 = (second.data ?? {}) as Record<string, unknown>;
        shippedStories = shippedStories.concat(
          rows(p2.stories).filter((s) => missing.includes(String(s.id ?? ""))),
        );
        shippedScenes = shippedScenes.concat(
          rows(p2.story_scenes).filter((s) => missing.includes(String(s.story_id ?? ""))),
        );
        shippedMedia = shippedMedia.concat(
          rows(p2.story_media).filter((m) => missing.includes(String(m.story_id ?? ""))),
        );
      }

      const knownLocal = new Set(localBundles.map((b) => b.storyId));
      let added = 0;
      let updated = 0;
      const mediaForPrefetch: Record<string, unknown>[] = [];

      for (const story of shippedStories) {
        const storyId = str(story.id);
        if (!storyId) continue;
        const scenes = shippedScenes
          .filter((s) => String(s.story_id ?? "") === storyId)
          .sort((a, b) => Number(a.scene_index ?? 0) - Number(b.scene_index ?? 0));
        // A story without scenes is a broken download: keep the old bundle.
        if (scenes.length === 0) continue;
        const media = shippedMedia.filter((m) => String(m.story_id ?? "") === storyId);
        const v = Number(story.content_version);
        const bundle: SyncedIntroBundle = {
          storyId,
          contentVersion: Number.isFinite(v) && v >= 1 ? Math.trunc(v) : 1,
          updatedAt: str(story.updated_at),
          story,
          scenes,
          media,
          syncedAt: new Date().toISOString(),
        };
        const ok = await writeSyncedIntroBundle(bundle);
        if (!ok) continue;
        if (knownLocal.has(storyId)) updated += 1;
        else added += 1;
        mediaForPrefetch.push(...media);
      }

      // --- Reconciliation (tombstones) ----------------------------
      let removed = 0;
      for (const storyId of plan.removeIds) {
        await deleteSyncedIntroBundle(storyId);
        removed += 1;
      }

      // Links last: only advertise a link once its bundle attempt is done.
      writeSyncedIntroLinks(links);

      const serverTime = str(payload.server_time) ?? new Date().toISOString();
      const next = writeIntroSyncMeta({
        last_successful_sync: new Date().toISOString(),
        sync_cursor: serverTime,
        sync_version: meta.sync_version + 1,
        added,
        updated,
        removed,
        last_error: null,
      });

      // Media warm-up is best-effort and never gates readiness.
      if (mediaForPrefetch.length > 0) {
        void prefetchStoryMediaRows(mediaForPrefetch as any);
      }
      lastRunAt = Date.now();
      return next;
    } catch (err) {
      // Silent for the player: the previous local content stays valid.
      return writeIntroSyncMeta({
        last_error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Recovery path: a campaign opened whose intro is not available locally.
 * Forces a targeted sync for that story.
 */
export async function ensureCampaignIntroContent(storyId: string | null | undefined): Promise<void> {
  if (!storyId) return;
  await syncCampaignIntroContent({ force: true, requireStoryIds: [storyId] });
}

/** Registers app-lifecycle triggers exactly once. */
export function startCampaignIntroContentSync(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;

  const kick = (force = false) => {
    void syncCampaignIntroContent({ force });
  };

  // App start — after first paint, never blocking.
  window.setTimeout(() => kick(true), 1500);

  window.addEventListener("online", () => kick(true));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenSince = Date.now();
      return;
    }
    const away = hiddenSince ? Date.now() - hiddenSince : 0;
    hiddenSince = 0;
    kick(away > RESUME_AFTER_MS);
  });

  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        kick(event !== "TOKEN_REFRESHED");
      }
    });
  } catch {
    /* auth listener is optional */
  }
}

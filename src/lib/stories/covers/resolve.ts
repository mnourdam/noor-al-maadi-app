// ============================================================
// Story cover resolution — local-first, zero-wait
// ------------------------------------------------------------
// One entry point for every surface that renders a story CARD:
// /stories catalog, Home rail, Worlds section, Related rails.
//
//   useStoryCoverSrc(story)  → string | null
//
// Bundled covers resolve SYNCHRONOUSLY (no query, no signing, no
// await) so the catalog paints on the first frame, online or off.
// Only stories added after this build was cut fall through to the
// delta-sync path, which downloads that single cover once and keeps
// it in the offline image cache forever.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { resolveCachedStoryMediaUrl } from "@/lib/stories/media/url";

import {
  bundledCoverContentVersion,
  hasOfflineStoryCover,
  localStoryCoverPath,
} from "./offline-pack";

export interface StoryCoverInput {
  id: string;
  cover_media_id?: string | null;
  content_version?: number | null;
}

/** True when the bundled asset is still the correct bytes for this story. */
export function bundledCoverIsCurrent(story: StoryCoverInput): boolean {
  if (!hasOfflineStoryCover(story.id)) return false;
  const packed = bundledCoverContentVersion(story.id);
  const live = Number(story.content_version ?? 1);
  if (packed == null || !Number.isFinite(live)) return true;
  return packed >= live;
}

interface CoverRpcResult {
  ok?: boolean;
  media?: StoryMediaRow[];
}

/**
 * Resolve the remote cover row through the M6 visibility-enforcing RPC.
 * `story_media` is never read directly and the bucket stays private.
 */
async function fetchCoverRow(
  storyId: string,
  coverMediaId: string,
): Promise<StoryMediaRow | null> {
  try {
    const { data, error } = await supabase.rpc(
      "get_story_media_urls_v2" as never,
      { p_story_id: storyId } as never,
    );
    if (error) return null;
    const payload = (data ?? {}) as CoverRpcResult;
    if (!payload.ok) return null;
    const hit = (payload.media ?? []).find((m) => m.id === coverMediaId) ?? null;
    if (!hit) return null;
    // Prefer the compact card derivative (10–20KB) when the upload
    // pipeline produced one; fall back to the full-size cover.
    const card = (hit.metadata as Record<string, unknown> | null)?.card_cover_path;
    return typeof card === "string" && card ? { ...hit, storage_path: card } : hit;
  } catch {
    return null;
  }
}


/**
 * Card cover source. Returns the bundled path immediately when the cover
 * ships with the app; otherwise resolves (and offline-caches) the remote one.
 */
export function useStoryCoverSrc(story: StoryCoverInput): string | null {
  const local = useMemo(
    () => (bundledCoverIsCurrent(story) ? localStoryCoverPath(story.id) : null),
    [story.id, story.content_version],
  );

  const needsRemote = !local && !!story.cover_media_id;

  const { data: row } = useQuery({
    queryKey: ["story-cover-row:v3", story.id, story.cover_media_id],
    enabled: needsRemote,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: () => fetchCoverRow(story.id, story.cover_media_id as string),
  });

  const [remote, setRemote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (local || !row) {
      setRemote(null);
      return;
    }
    void (async () => {
      const cached = await resolveCachedStoryMediaUrl(row);
      if (alive && cached) setRemote(cached);

    })();
    return () => {
      alive = false;
    };
  }, [local, row?.storage_path]);

  return local ?? remote;
}

// ------------------------------------------------------------
// Delta sync — only covers that are NOT in this build
// ------------------------------------------------------------

const SYNC_KEY = "irth.story-covers.delta.v1";
const CONCURRENCY = 3;

type SyncLedger = Record<string, number>;

function readLedger(): SyncLedger {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SyncLedger) : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: SyncLedger): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(ledger));
  } catch {
    /* quota — sync will simply retry next launch */
  }
}

/**
 * Download the covers this build does not already ship, once each.
 * Never re-downloads a cover that is bundled or already cached; a story
 * whose `content_version` moved is re-fetched exactly once.
 */
export async function syncStoryCovers(stories: StoryCoverInput[]): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (navigator.onLine === false) return 0;

  const ledger = readLedger();
  const pending = stories.filter((s) => {
    if (!s.cover_media_id) return false;
    if (bundledCoverIsCurrent(s)) return false;
    const version = Number(s.content_version ?? 1);
    return ledger[s.id] !== version;
  });
  if (pending.length === 0) return 0;

  let index = 0;
  let synced = 0;
  async function worker() {
    while (index < pending.length) {
      const story = pending[index++];
      try {
        const row = await fetchCoverRow(story.id, story.cover_media_id as string);
        if (!row) continue;
        const ok = await resolveCachedStoryMediaUrl(row);
        if (!ok) continue;

        ledger[story.id] = Number(story.content_version ?? 1);
        synced += 1;
      } catch {
        /* keep going; retried on next visit */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  writeLedger(ledger);
  return synced;
}

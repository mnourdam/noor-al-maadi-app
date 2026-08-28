import { supabase } from "@/integrations/supabase/client";
import { localSnapshotInfo } from "./local-first-store";

export interface ContentManifestItem {
  collection: string;
  total_count: number;
  last_updated: string;
}

export interface ManifestComparison {
  upToDate: boolean;
  needsUpdate: string[];
}

/** Map a server manifest collection name to the local snapshot key. */
export function manifestKeyToLocalKey(collection: string): string {
  if (collection === "campaigns_public") return "admin_campaigns";
  if (collection === "investigations_public") return "investigations";
  return collection;
}

/**
 * Collections whose LOCAL row count is a legitimate subset of the server
 * table count (visibility-filtered story scenes/media returned by
 * `stories_snapshot_manifest_v2`). Count equality is meaningless for them —
 * change detection uses `last_updated` only.
 */
const COUNT_NON_COMPARABLE = new Set(["story_scenes", "story_media", "story_collections"]);

export function isManifestCountComparable(localKey: string): boolean {
  return !COUNT_NON_COMPARABLE.has(localKey);
}

let _cachedManifest: ContentManifestItem[] | null = null;
let _manifestPromise: Promise<ContentManifestItem[] | null> | null = null;

/**
 * Fetch the latest content manifest from the server.
 * Returns counts and max(updated_at) for all collections.
 */
export async function fetchContentManifest(): Promise<ContentManifestItem[] | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  if (_manifestPromise) return _manifestPromise;

  _manifestPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_content_manifest");
      if (error) {
        console.warn("[manifest] failed to fetch manifest:", error.message);
        return null;
      }
      _cachedManifest = (data as any[]) ?? [];
      return _cachedManifest;
    } catch (err) {
      console.warn("[manifest] manifest fetch crashed:", err);
      return null;
    } finally {
      // Clear promise after 10 seconds to allow fresh checks later in the session
      setTimeout(() => { _manifestPromise = null; }, 10_000);
    }
  })();

  return _readyManifest(await _manifestPromise);
}

function _readyManifest(data: any[] | null): ContentManifestItem[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(d => ({
    collection: d.collection,
    total_count: Number(d.total_count),
    last_updated: d.last_updated
  }));
}

/**
 * Compare the server manifest with the current local snapshot.
 * Identifies which collections have newer data on the server.
 */
export async function checkManifestUpdates(): Promise<ManifestComparison> {
  const server = await fetchContentManifest();
  const local = localSnapshotInfo();

  if (!server || !local || !local.content_counts) {
    return { upToDate: true, needsUpdate: [] };
  }

  const needsUpdate: string[] = [];

  for (const s of server) {
    // Map server manifest collection names to local snapshot collection keys
    const localKey = manifestKeyToLocalKey(s.collection);

    const localCount = local.content_counts[localKey] ?? 0;

    // 1. Check for count changes (new additions or removals). Skipped for
    //    visibility-filtered story subsets, whose local count is expected
    //    to be smaller than the raw table count.
    if (isManifestCountComparable(localKey) && s.total_count !== localCount) {
      needsUpdate.push(localKey);
      continue;
    }

    // 2. Check for timestamp changes
    // generated_at serves as the upper bound for the current snapshot.
    const serverDate = new Date(s.last_updated).getTime();
    const snapshotDate = new Date(local.generated_at).getTime();

    if (serverDate > snapshotDate) {
      needsUpdate.push(localKey);
    }
  }

  return {
    upToDate: needsUpdate.length === 0,
    needsUpdate
  };
}

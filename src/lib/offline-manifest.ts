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
  
  // Mapping of server manifest collection names to local snapshot collection keys
  const SERVER_TO_LOCAL: Record<string, string> = {
    'encyclopedia_entities': 'encyclopedia_entities',
    'admin_campaigns': 'admin_campaigns',
    'investigations': 'investigations',
    'stories': 'stories',
    'story_scenes': 'story_scenes',
    'story_media': 'story_media',
    'atlas_entities': 'atlas_entities'
  };

  for (const s of server) {
    const localKey = SERVER_TO_LOCAL[s.collection];
    if (!localKey) continue;

    const localCount = local.content_counts[localKey] ?? 0;
    
    // 1. Check for count changes (new additions or removals)
    if (s.total_count !== localCount) {
      needsUpdate.push(localKey);
      continue;
    }

    // 2. Check for timestamp changes
    // Note: This requires the local snapshot to store the max(updated_at) per collection
    // in the future. For now, we can use the snapshot's generated_at as a proxy 
    // or rely on count changes for basic triggers.
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

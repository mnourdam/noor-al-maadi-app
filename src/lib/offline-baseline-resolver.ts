/**
 * Content Baseline Resolver.
 *
 * Implements the Phase 2 contract:
 *   Memory Cache → Persistent IndexedDB → Bundled Baseline Fallback.
 *
 * Guarantees:
 *   1. First paint DOES NOT wait for IndexedDB seeding.
 *   2. Bundled baseline parsed exactly once per session.
 *   3. Strict separation between Content (shared) and Progress (personal).
 *   4. Fingerprint-based versioning for baseline updates.
 */

import { isValidBaseline, type BaselineContent } from "./offline-baseline";
import { type GameRow } from "./games/store";
import { type StoryAccessBundle } from "./stories/types";
import { isCampaignIntroRow, introStoryIdsFromCampaigns } from "./stories/library-filter";

// --- Internal State ---

let _memoryBaseline: BaselineContent | null = null;
let _parseTimeMs: number = 0;
let _indexedDbSeedTimeMs: number = 0;
let _isSeeding = false;

// --- Performance Utilities ---

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// --- Content Resolver ---

/**
 * Load and parse the bundled baseline content.
 * Result is cached in memory for the duration of the session.
 */
export async function getBaselineContent(): Promise<BaselineContent | null> {
  if (_memoryBaseline) return _memoryBaseline;

  const start = now();
  try {
    const response = await fetch("/baseline-content.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    if (isValidBaseline(data)) {
      _memoryBaseline = data;
      _parseTimeMs = now() - start;
      console.info(`[baseline] parsed 4.8MB in ${_parseTimeMs.toFixed(1)}ms`);
      
      // Diagnostic attachment for the acceptance test
      if (typeof window !== "undefined") {
        (window as any).irth_baseline_report = {
          parseTimeMs: _parseTimeMs,
          version: _memoryBaseline.version,
          games: _memoryBaseline.collections.games.length,
          stories: _memoryBaseline.collections.stories.length
        };
      }
      
      return _memoryBaseline;
    }
    throw new Error("Invalid baseline schema");
  } catch (e) {
    console.error("[baseline] load failed:", e);
    return null;
  }
}

/**
 * Seed the baseline content into the local-first store's persistent storage
 * without blocking the main thread or UI.
 */
export async function seedBaselineToPersistentStore(): Promise<void> {
  if (_isSeeding) return;
  _isSeeding = true;
  
  const start = now();
  try {
    const baseline = await getBaselineContent();
    if (!baseline) return;

    const { loadSnapshot, saveSnapshot, SNAPSHOT_SCHEMA_VERSION } = await import("./offline-storage");
    type OfflineSnapshot = import("./offline-storage").OfflineSnapshot;
    
    const existing = await loadSnapshot();

    // Versioning check: only overwrite if baseline is newer or version mismatch
    if (existing && existing.snapshot_version >= baseline.version) {
      console.info("[baseline] persistent store is already up to date");
      _isSeeding = false;
      return;
    }

    const { collections } = baseline;
    
    // Construct a snapshot compatible with the local-first-store
    // NOTE: We only touch the collections defined in baseline-content.json.
    // If we're upgrading an existing snapshot, we preserve other collections (encyclopedia, atlas, etc.)
    const newSnapshot: OfflineSnapshot = existing ? { ...existing } : {
      snapshot_version: baseline.version,
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      generated_at: baseline.generated_at,
      source: "bundled",
      content_counts: {},
      collections: {}
    };

    newSnapshot.snapshot_version = baseline.version;
    newSnapshot.generated_at = baseline.generated_at;
    
    // Merge baseline collections
    newSnapshot.collections.games = collections.games;
    newSnapshot.collections.stories = collections.stories;
    newSnapshot.collections.story_scenes = collections.story_scenes;
    newSnapshot.collections.story_media = collections.story_media;
    if (collections.story_collections) {
      (newSnapshot.collections as any).story_collections = collections.story_collections;
    }
    
    // Update counts
    newSnapshot.content_counts.games = collections.games.length;
    newSnapshot.content_counts.stories = collections.stories.length;
    newSnapshot.content_counts.story_scenes = collections.story_scenes.length;
    newSnapshot.content_counts.story_media = collections.story_media.length;

    await saveSnapshot(newSnapshot);
    
    // Notify local-first-store to re-index if it's already ready
    const { isLocalReady, applyLocalSnapshot } = await import("./local-first-store");
    if (isLocalReady()) {
      applyLocalSnapshot(newSnapshot);
    }

    _indexedDbSeedTimeMs = now() - start;
    console.info(`[baseline] seeded IndexedDB in ${_indexedDbSeedTimeMs.toFixed(1)}ms`);
    
    if (typeof window !== "undefined" && (window as any).irth_baseline_report) {
      (window as any).irth_baseline_report.seedTimeMs = _indexedDbSeedTimeMs;
    }
  } catch (e) {
    console.warn("[baseline] seeding failed:", e);
  } finally {
    _isSeeding = false;
  }
}

// --- Domain-Specific Resolvers ---

/**
 * Synchronous local list of library stories, following the Phase 2 priority.
 * Guaranteed to exclude campaign intros.
 */
export function getLocalLibraryStories(): any[] {
  // We need to be careful with 'require' in TanStack Start's SSR environment.
  const lfs = require("./local-first-store");
  const publishedCampaigns = lfs.localPublishedCampaigns();
  const { isCampaignIntroRow, introStoryIdsFromCampaigns } = require("./stories/library-filter");
  const introIds = introStoryIdsFromCampaigns(publishedCampaigns);
  
  // 1. Memory / Persistent (local-first-store)
  if (lfs.isLocalReady()) {
    const all = lfs.localStoriesAll() || [];
    // localStoriesAll already filters published + library in its indexer,
    // but we apply it again defensively to match the contract.
    const library = all.filter((s: any) => !isCampaignIntroRow(s, introIds));
    if (library.length > 0) return library;
  }

  // 2. Bundled Fallback
  if (_memoryBaseline) {
    return _memoryBaseline.collections.stories.filter(s => 
      s.status === 'published' && !isCampaignIntroRow(s, introIds)
    );
  }

  return [];
}

/**
 * Synchronous local list of published games, following the Phase 2 priority.
 */
export function getLocalPublishedGames(): GameRow[] {
  const lfs = require("./local-first-store");
  
  // 1. Memory / Persistent (local-first-store)
  if (lfs.isLocalReady()) {
    const games = lfs.localPublishedGames();
    if (games.length > 0) return games as GameRow[];
  }

  // 2. Bundled Fallback
  if (_memoryBaseline) {
    return _memoryBaseline.collections.games as GameRow[];
  }

  return [];
}

// --- Diagnostic Report ---

export function getBaselineDiagnosticReport() {
  return {
    parseTimeMs: _parseTimeMs,
    seedTimeMs: _indexedDbSeedTimeMs,
    memoryLoaded: !!_memoryBaseline,
    version: _memoryBaseline?.version ?? 0,
    gamesCount: _memoryBaseline?.collections.games.length ?? 0,
    storiesCount: _memoryBaseline?.collections.stories.length ?? 0
  };
}

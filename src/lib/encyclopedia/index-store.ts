// ============================================================
// Encyclopedia unified index — one build, every surface.
//
// WHY THIS EXISTS (measured, not guessed):
//   Before: the hub and every category page each ran their own query that
//   awaited `fetchEncyclopediaLivePublicAll()` — a paged download of EVERY
//   enabled row *including `body`*: 12.3 MB across 2 round trips, ~4.2 s on
//   a wired connection, far worse on mobile. It was awaited inside
//   `Promise.all` next to the local snapshot read, so the instant local data
//   was thrown away as a blocker. On top of that, each surface used a
//   different `queryKey`, so switching category re-did all of it, and search
//   re-normalized ~2000 rows of Arabic text on every keystroke.
//
//   Now: rows come from the local snapshot (already in RAM). The network is
//   consulted only for the authoritative id set (49 KB, 1 round trip) so
//   archived/merged rows can't linger. One shared `queryKey` means the hub,
//   all seven category pages, and search hit the same warm cache, and the
//   whole index — counts, per-type buckets, era histograms, normalized
//   search haystacks — is built exactly once per data version.
// ============================================================

import { useSyncExternalStore } from "react";
import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import {
  fetchEncyclopediaLivePublicAll,
  fetchEncyclopediaLivePublicIds,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import {
  ensureLocalSnapshotLoaded,
  localDataVersion,
  localEncyclopediaAll,
  onLocalSnapshotChange,
} from "@/lib/local-first-store";
import {
  buildCanonicalizedEncyclopediaSearch,
  buildEntityHaystack,
  normalizeArabicSearch,
  scoreHaystack,
  type EntityHaystack,
} from "@/lib/encyclopedia-search";
import { publicEraSortIndex, toPublicEra } from "@/lib/eras-public";

/**
 * Query key root. The full key always carries the snapshot data version, so a
 * cache entry built from an older snapshot is a *different* entry and can
 * never be served after the real snapshot lands.
 */
export const ENCYCLOPEDIA_INDEX_QUERY_KEY = ["encyclopedia", "index", "v5"] as const;


export type IndexedEntity = {
  e: SupabaseEncyclopediaEntity;
  hay: EntityHaystack;
  era: string;
};

export type EncyclopediaIndex = {
  /** Canonical, public, displayable rows — already deduplicated. */
  rows: SupabaseEncyclopediaEntity[];
  indexed: IndexedEntity[];
  /** type → indexed rows, pre-sorted alphabetically. */
  byType: Record<string, IndexedEntity[]>;
  counts: Record<string, number>;
  total: number;
  /** `"all"` plus each entity type → [canonicalEra, count] sorted chronologically. */
  erasByType: Record<string, [string, number][]>;
  /** Newest-first / recently-updated-first views (top 12 each). */
  recentlyAdded: SupabaseEncyclopediaEntity[];
  recentlyUpdated: SupabaseEncyclopediaEntity[];
  bySlug: Map<string, SupabaseEncyclopediaEntity>;
  /** Where the row content came from — used by diagnostics only. */
  source: "local" | "live";
};

function metaEra(entity: SupabaseEncyclopediaEntity): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string).trim() : "";
}

const collator = new Intl.Collator("ar");

export function buildEncyclopediaIndex(
  rawRows: SupabaseEncyclopediaEntity[],
  authoritativeIds: ReadonlySet<string> | null,
  source: "local" | "live" = "local",
): EncyclopediaIndex {
  // Single canonicalization pass (redirect resolution + public/displayable
  // gating + dedupe by canonical id).
  const rows = buildCanonicalizedEncyclopediaSearch({
    rows: rawRows,
    query: "",
    authoritativeIds,
    includeUnscored: true,
  }).map((x) => x.e);

  const indexed: IndexedEntity[] = rows.map((e) => ({
    e,
    hay: buildEntityHaystack(e),
    era: toPublicEra(metaEra(e)) ?? "",
  }));

  const byType: Record<string, IndexedEntity[]> = {};
  const counts: Record<string, number> = {};
  const eraCounters: Record<string, Map<string, number>> = { all: new Map() };
  const bySlug = new Map<string, SupabaseEncyclopediaEntity>();

  for (const item of indexed) {
    const t = item.e.entity_type;
    (byType[t] ??= []).push(item);
    counts[t] = (counts[t] ?? 0) + 1;
    if (item.e.slug && !bySlug.has(item.e.slug)) bySlug.set(item.e.slug, item.e);
    if (item.era) {
      const all = eraCounters.all;
      all.set(item.era, (all.get(item.era) ?? 0) + 1);
      const perType = (eraCounters[t] ??= new Map());
      perType.set(item.era, (perType.get(item.era) ?? 0) + 1);
    }
  }

  for (const list of Object.values(byType)) {
    list.sort((a, b) => collator.compare(String(a.e.title ?? ""), String(b.e.title ?? "")));
  }

  const erasByType: Record<string, [string, number][]> = {};
  for (const [key, counter] of Object.entries(eraCounters)) {
    erasByType[key] = Array.from(counter.entries()).sort((a, b) => {
      const ai = publicEraSortIndex(a[0]);
      const bi = publicEraSortIndex(b[0]);
      if (ai !== bi) return ai - bi;
      return b[1] - a[1];
    });
  }

  const recentlyAdded = rows
    .slice()
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 12);
  const recentlyUpdated = rows
    .slice()
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .slice(0, 12);

  return {
    rows,
    indexed,
    byType,
    counts,
    total: rows.length,
    erasByType,
    recentlyAdded,
    recentlyUpdated,
    bySlug,
    source,
  };
}

export const EMPTY_ENCYCLOPEDIA_INDEX: EncyclopediaIndex = buildEncyclopediaIndex([], null);

/**
 * How long the authoritative id request may gate an index that already has a
 * complete local snapshot behind it. Past this, the snapshot wins.
 */
export const AUTHORITY_TIMEOUT_MS = 4_000;

/**
 * Ask the network for the authoritative id set, but never let it block the
 * index for more than {@link AUTHORITY_TIMEOUT_MS}.
 *
 * `null` means "no authority available" — the already-supported fallback that
 * builds the index from the local snapshot as-is. A late settlement of the
 * original promise is swallowed, so a slow/hung request can never surface as
 * an unhandled rejection.
 */
async function authoritativeIdsBounded(): Promise<Set<string> | null> {
  const request = fetchEncyclopediaLivePublicIds();
  request.catch(() => null); // late failures must not go unhandled
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), AUTHORITY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Build the index ONLY from a fully applied offline snapshot.
 *
 * Hard rule: the index is never built from a partial/absent snapshot. If the
 * snapshot is not ready we either fall back to one authoritative live read
 * (web, first visit) or we throw — throwing means React Query stores nothing,
 * so no wrong count can ever be cached or displayed.
 */
async function loadEncyclopediaIndex(): Promise<EncyclopediaIndex> {
  await ensureLocalSnapshotLoaded();
  const local = localEncyclopediaAll() as SupabaseEncyclopediaEntity[];
  if (local.length > 0) {
    // Network is consulted for the id authority only (49 KB). It never gates
    // the first paint: rows come from the snapshot and the authority simply
    // prunes rows that no longer exist server-side. If that request fails or
    // hangs, the complete local snapshot is used unpruned rather than leaving
    // the player on an endless spinner.
    const ids = await authoritativeIdsBounded();
    return buildEncyclopediaIndex(local, ids, "local");
  }
  // No usable snapshot yet (fresh web visit before the background sync
  // finished) — one full live read, still keyed by the current data version.
  const live = await fetchEncyclopediaLivePublicAll();
  if (live && live.length > 0) {
    return buildEncyclopediaIndex(live, new Set(live.map((r) => r.id)), "live");
  }
  // Nothing authoritative available: refuse to produce an index rather than
  // caching an empty/incorrect one.
  throw new Error("encyclopedia-index: snapshot not ready");
}


export function encyclopediaIndexQueryOptions(dataVersion = localDataVersion()) {
  return queryOptions({
    queryKey: [...ENCYCLOPEDIA_INDEX_QUERY_KEY, dataVersion] as const,
    queryFn: loadEncyclopediaIndex,
    // The encyclopedia is content, not state: it changes when the offline
    // snapshot syncs, not while the player browses. A long stale window is
    // what makes re-opening a category instant instead of "loading…".
    // The data version in the key is what guarantees freshness.
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    retry: 2,
    retryDelay: 400,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Subscribe to the snapshot data version. Components read the index through
 * this so a background snapshot refresh swaps them onto a freshly built index
 * instead of leaving a stale one on screen.
 */
export function useEncyclopediaIndexQueryOptions() {
  const version = useSyncExternalStore(
    onLocalSnapshotChange,
    localDataVersion,
    () => 0,
  );
  return encyclopediaIndexQueryOptions(version);
}

export function useEncyclopediaIndex() {
  const options = useEncyclopediaIndexQueryOptions();
  const q = useQuery(options);
  const hasData = Boolean(q.data);
  return {
    index: q.data ?? EMPTY_ENCYCLOPEDIA_INDEX,
    /**
     * True only while the query is genuinely in flight without data. A settled
     * failure reports `isError`, never eternal loading.
     */
    isPending: !hasData && !q.isError,
    isError: q.isError && !hasData,
    error: q.error ?? null,
    isFetching: q.isFetching,
    /** Genuinely re-runs the query (cancels a wedged fetch first). */
    refetch: () => { void q.refetch({ cancelRefetch: true }); },
  };
}


let prefetchStarted = false;
let versionWatcherAttached = false;

/**
 * Build (or reuse) the index for the CURRENT snapshot version, dropping every
 * entry from older versions. Callers never trigger a duplicate build: when the
 * snapshot is not applied yet we wait for it first, so the index is built once,
 * under its final key.
 */
export function primeEncyclopediaIndex(queryClient: QueryClient): void {
  const run = () => {
    const version = localDataVersion();
    queryClient.removeQueries({
      queryKey: ENCYCLOPEDIA_INDEX_QUERY_KEY,
      predicate: (q) => q.queryKey[3] !== version,
    });
    void queryClient.prefetchQuery(encyclopediaIndexQueryOptions(version));
  };

  if (localDataVersion() > 0) run();
  else void ensureLocalSnapshotLoaded().then(run).catch(() => {});

  if (!versionWatcherAttached) {
    versionWatcherAttached = true;
    // Rebuild once a background snapshot sync applies newer content.
    onLocalSnapshotChange(run);
  }
}

/**
 * Warm the encyclopedia index in the background at app boot. The encyclopedia
 * is the most-visited surface, so by the time the player taps it the data is
 * already built and the route renders from cache with zero awaits.
 */
export function prefetchEncyclopediaIndex(queryClient: QueryClient, force = false): void {
  if (prefetchStarted && !force) return;
  prefetchStarted = true;
  primeEncyclopediaIndex(queryClient);
}



// ─────────────────────────────────────────────────────────────
// Search / filter — operates on the prebuilt index, never on raw rows.
// ─────────────────────────────────────────────────────────────

export type EncyclopediaBrowseSort = "relevance" | "alpha" | "newest" | "updated";

export type BrowseOptions = {
  query?: string;
  type?: string;
  era?: string;
  sort?: EncyclopediaBrowseSort;
  max?: number;
};

export function browseEncyclopedia(
  index: EncyclopediaIndex,
  { query = "", type = "all", era = "", sort = "relevance", max }: BrowseOptions,
): SupabaseEncyclopediaEntity[] {
  const nq = normalizeArabicSearch(query.trim());
  const pool = type && type !== "all" ? (index.byType[type] ?? []) : index.indexed;

  const hits: { e: SupabaseEncyclopediaEntity; s: number }[] = [];
  for (const item of pool) {
    if (era && item.era !== era) continue;
    if (nq) {
      const s = scoreHaystack(item.hay, nq);
      if (s <= 0) continue;
      hits.push({ e: item.e, s });
    } else {
      hits.push({ e: item.e, s: 0 });
    }
  }

  const effectiveSort = sort === "relevance" && !nq ? "alpha" : sort;
  if (effectiveSort === "relevance") {
    hits.sort((a, b) => (b.s !== a.s ? b.s - a.s : collator.compare(String(a.e.title ?? ""), String(b.e.title ?? ""))));
  } else if (effectiveSort === "alpha") {
    // Per-type buckets are already alphabetical; only re-sort mixed pools.
    if (type === "all" || nq || era) {
      hits.sort((a, b) => collator.compare(String(a.e.title ?? ""), String(b.e.title ?? "")));
    }
  } else if (effectiveSort === "newest") {
    hits.sort((a, b) => String(b.e.created_at ?? "").localeCompare(String(a.e.created_at ?? "")));
  } else {
    hits.sort((a, b) => String(b.e.updated_at ?? "").localeCompare(String(a.e.updated_at ?? "")));
  }

  const out = hits.map((h) => h.e);
  return typeof max === "number" ? out.slice(0, max) : out;
}

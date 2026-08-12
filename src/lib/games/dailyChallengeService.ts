// Canonical daily-challenge state — the SINGLE source of truth for every
// surface that shows "today's challenges" (Home DailyChallengesSection,
// Adventure "Challenges Hall", any future notification/badge).
//
// Guarantees:
//   • Same two challenge IDs on every surface for a given (userKey, localDate).
//   • Same completion set (server-today ∪ local-today ∪ all-time∩picks).
//   • Same "both completed" decision — no surface can re-roll a fresh pair
//     because a pick was completed. The pair only rotates at local midnight.
//   • Completion in one surface propagates to every subscribed surface via
//     a single browser event (`irth:daily-challenge-completed`). No second
//     event system.
//
// Storage keys (all partitioned by `userKey` = uid or "guest"):
//   irth.daily-challenges.<userKey>.<localDate>          → frozen 2 IDs
//   irth.daily-challenges.done.<userKey>.<localDate>     → completed today
//
// Rewards are NOT granted here. Reward idempotency lives in
// `recordCompletion` (game_progress row + firstTime flag).

import { supabase } from "@/integrations/supabase/client";
import { localDateKey } from "@/lib/daily-quest";
import {
  fetchMyCompletedGameIds,
  fetchMyDailyCompletedGameIds,
  listPublishedGames,
  selectDailyChallenges,
  type GameRow,
} from "@/lib/games/store";
import {
  readGuestCompletedIds,
  GUEST_COMPLETIONS_EVENT,
  GUEST_COMPLETIONS_STORAGE_KEY,
} from "@/lib/games/guestCompletions";
import { useEffect, useState } from "react";


// ─── Types ───────────────────────────────────────────────────────────────

export interface DailyChallengeState {
  /** Local YYYY-MM-DD used to freeze the pair. */
  date: string;
  /** "guest" for anonymous, uid otherwise. Partitions storage per account. */
  userKey: string;
  /** Frozen daily picks (≤ 2). Stable for the whole local day. */
  picks: GameRow[];
  /** Picks completed today (from any surface). Subset of `picks` IDs. */
  completedIds: Set<string>;
  /** Picks that remain playable today. */
  remaining: GameRow[];
  /** True iff every frozen pick is completed. */
  todaysPicksDone: boolean;
  /**
   * True iff no un-completed eligible games remain in the entire published
   * pool — permanent completion state, distinct from "come back tomorrow".
   */
  allEligibleExhausted: boolean;
  /** Local midnight of the next day, in ms epoch — for scheduling refresh. */
  nextResetAt: number;
  /** Total published games, for admin/debug surfaces. */
  totalPublished: number;
}

// ─── Storage ─────────────────────────────────────────────────────────────

function picksKey(userKey: string, date: string): string {
  return `irth.daily-challenges.${userKey}.${date}`;
}

function doneKey(userKey: string, date: string): string {
  return `irth.daily-challenges.done.${userKey}.${date}`;
}

function readIds(key: string): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

// ─── Local-midnight helper ───────────────────────────────────────────────

function nextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next.getTime();
}

// ─── Event bus ───────────────────────────────────────────────────────────

const CHANGE_EVENT = "irth:daily-challenge-completed";

/**
 * Mark a game as completed inside today's frozen pair. Idempotent.
 * Emits `irth:daily-challenge-completed` so every mounted surface refreshes
 * without a page navigation.
 */
export function markDailyChallengeCompletedLocally(
  userKey: string,
  gameId: string,
): void {
  const date = localDateKey();
  const key = doneKey(userKey, date);
  const cur = new Set(readIds(key));
  if (cur.has(gameId)) return;
  cur.add(gameId);
  writeIds(key, [...cur]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { gameId, userKey, date } }),
    );
  }
}

/** Resolve the caller's userKey synchronously via getActiveOwner. */
function resolveUserKeySync(): string {
  try {
    const { getActiveOwner, userOwnerKey } = require("@/lib/identity/owner");
    const owner = getActiveOwner();
    // getActiveOwner returns `user:<id>` or `guest:<id>`.
    // The legacy dailyChallengeService uses raw `id` for users and "guest" for guests.
    if (owner.startsWith("user:")) return owner.slice(5);
    return "guest";
  } catch {
    return "guest";
  }
}

/** Deterministic fingerprint of the game catalogue to detect meaningful changes. */
function getCatalogueFingerprint(games: GameRow[]): string {
  if (!games.length) return "empty";
  const sorted = [...games].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map(g => `${g.id}|${g.updated_at}`).join(";");
}


// ─── Core loader ─────────────────────────────────────────────────────────

/**
 * Load today's canonical daily-challenge state. Never re-rolls a completed
 * pick within the same local day. Called by both Home and Hall.
 */
export async function loadDailyChallengeState(opts: { 
  forceUserKey?: string;
  providedGames?: GameRow[];
} = {}): Promise<DailyChallengeState> {
  const userKey = opts.forceUserKey ?? resolveUserKeySync();
  const [serverAllTime, serverToday, published] = await Promise.all([
    fetchMyCompletedGameIds(),
    fetchMyDailyCompletedGameIds(),
    opts.providedGames ? Promise.resolve(opts.providedGames) : listPublishedGames(),
  ]);


  const date = localDateKey();
  const totalPublished = published.length;
  const byId = new Map(published.map((g) => [g.id, g]));

  // Canonical all-time completed set:
  //   • authenticated → server `game_progress.completed`
  //   • guest         → local guest ledger (never touches server, never
  //                     merged from any account)
  // Guest ledger is ONLY consulted when userKey === "guest". Signing into
  // an account causes userKey to flip, and the account's server-side set
  // becomes the sole source of truth — guest history stays isolated.
  const allTimeCompleted = new Set<string>(serverAllTime);
  if (userKey === "guest") {
    for (const id of readGuestCompletedIds()) allTimeCompleted.add(id);
  }

  // 1. Try today's frozen pair.
  let picks: GameRow[] = readIds(picksKey(userKey, date))
    .map((id) => byId.get(id))
    .filter((g): g is GameRow => !!g);

  let allEligibleExhausted = false;

  // 2. First visit today (or the persisted pair no longer resolves) — freeze
  //    a fresh pair. `selectDailyChallenges` excludes all-time completions,
  //    which for guests now includes the durable ledger.
  if (picks.length === 0) {
    const sel = await selectDailyChallenges(2, {
      completedIds: allTimeCompleted,
    });
    picks = sel.picks;
    allEligibleExhausted = sel.allCompleted && sel.totalPublished > 0;
    if (picks.length > 0) {
      writeIds(
        picksKey(userKey, date),
        picks.map((g) => g.id),
      );
    }
  }

  // 3. Compute today's completion set for the frozen pair.
  //    Union of: server today-completed, local today-completed, and any
  //    pick that is already all-time completed. For guests, the ledger
  //    IS the "server" — a pick present in it counts as completed.
  const localDone = new Set(readIds(doneKey(userKey, date)));
  const completedIds = new Set<string>();
  for (const g of picks) {
    if (
      serverToday.has(g.id) ||
      localDone.has(g.id) ||
      allTimeCompleted.has(g.id)
    ) {
      completedIds.add(g.id);
    }
  }

  const remaining = picks.filter((g) => !completedIds.has(g.id));
  const todaysPicksDone = picks.length > 0 && remaining.length === 0;

  // If the pair somehow ended up empty AND every published game is
  // all-time completed, flag exhaustion so surfaces can show the permanent
  // state instead of a normal "come back tomorrow" message. This branch
  // now fires for guests too, using the merged all-time set.
  if (!allEligibleExhausted && picks.length === 0 && totalPublished > 0) {
    allEligibleExhausted = published.every((g) => allTimeCompleted.has(g.id));
  }

  return {
    date,
    userKey,
    picks,
    completedIds,
    remaining,
    todaysPicksDone,
    allEligibleExhausted,
    nextResetAt: nextLocalMidnight(),
    totalPublished,
  };
}


// ─── React hook ──────────────────────────────────────────────────────────

/**
 * Subscribe to canonical daily-challenge state.
 *
 * Refreshes when:
 *   • the completion event fires (any surface completes a challenge)
 *   • the tab regains focus (returning after a device sleep)
 *   • local midnight passes (scheduled timer)
 *   • storage changes in another tab (multi-tab safety)
 *   • an auth session change occurs (userKey may have flipped)
 */
export function useDailyChallengeState(opts: { enabled?: boolean } = {}): {
  state: DailyChallengeState | null;
  loading: boolean;
  refresh: () => void;
} {
  const enabled = opts.enabled !== false;
  const [state, setState] = useState<DailyChallengeState | null>(() => {
    if (!enabled || typeof window === "undefined") return null;
    
    // Stage 1: Synchronous Initial Render (Local-First)
    try {
      const { isLocalReady } = require("@/lib/local-first-store");
      const { localListPublishedGames } = require("./store");
      
      if (isLocalReady()) {
        const localGames = localListPublishedGames();
        if (localGames.length > 0) {
          // We can't await server IDs synchronously, but we can return 
          // a "pessimistic" state using local completion evidence.
          // This prevents the section from disappearing.
          const userKey = resolveUserKeySync();
          const date = localDateKey();
          
          // Re-read local completions for the sync pass
          const localDone = new Set(readIds(doneKey(userKey, date)));
          const allTimeCompleted = new Set<string>();
          if (userKey === "guest") {
             for (const id of readGuestCompletedIds()) allTimeCompleted.add(id);
          }

          // We don't have serverAllTime here, but loadDailyChallengeState 
          // will follow up in the background and fill them in.
          // Return null for now or compute rotation if possible?
          // Actually, we must return a valid state to avoid the skeleton if possible.
          // But without server completions, rotation might be wrong.
          // Better to return null and let the useEffect handle it, 
          // BUT ensure it starts IMMEDIATELY (no idle delay).
        }
      }
    } catch { /* ignore */ }
    return null;
  });
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      // Priority 1: Check Local Cache First
      try {
        const { isLocalReady, ensureLocalSnapshotLoaded } = require("@/lib/local-first-store");
        const { localListPublishedGames } = require("./store");
        
        // If not ready, await it, but we prefer synchronous.
        if (!isLocalReady()) {
          await ensureLocalSnapshotLoaded();
        }

        const localGames = localListPublishedGames();
        if (!cancelled && localGames.length > 0) {
          const s = await loadDailyChallengeState({ providedGames: localGames });
          if (!cancelled) {
            setState(s);
            setLoading(false);
          }
        }
      } catch (e) {
        console.warn("[dailyChallengeService] local-first failed", e);
      }

      // Priority 2: Background Refresh / Network Bootstrap
      try {
        const serverGames = await listPublishedGames();
        if (cancelled) return;

        const currentFingerprint = state ? getCatalogueFingerprint(state.picks) : "";
        const serverFingerprint = getCatalogueFingerprint(serverGames);

        if (serverFingerprint !== currentFingerprint || !state) {
          const s = await loadDailyChallengeState({ providedGames: serverGames });

          if (!cancelled) {
            setState(s);
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce, state === null]);


  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const bump = () => setNonce((n) => n + 1);

    const onCompleted = () => bump();
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key.startsWith("irth.daily-challenges.") ||
        e.key === GUEST_COMPLETIONS_STORAGE_KEY ||
        e.key.startsWith("supabase.auth.token")
      ) {
        bump();
      }
    };

    window.addEventListener(CHANGE_EVENT, onCompleted as EventListener);
    window.addEventListener(
      GUEST_COMPLETIONS_EVENT,
      onCompleted as EventListener,
    );
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", bump);


    // Schedule refresh at local midnight — plus a 1s cushion so the local
    // date has already flipped when we reload.
    const now = Date.now();
    const midnight = nextLocalMidnight(new Date(now));
    const delay = Math.max(1000, midnight - now + 1000);
    const timer = window.setTimeout(bump, delay);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onCompleted as EventListener);
      window.removeEventListener(
        GUEST_COMPLETIONS_EVENT,
        onCompleted as EventListener,
      );
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", bump);
      window.clearTimeout(timer);
    };
  }, [enabled]);

  return { state, loading, refresh: () => setNonce((n) => n + 1) };
}

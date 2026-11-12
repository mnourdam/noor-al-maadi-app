import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { recordTrace } from "@/lib/diag-trace";
import { getActiveOwner, getIdentityEpoch } from "./identity/owner";
import { useProfileWriter, type ProfilePersistence } from "./profile-writer";
import { irthDayKey, irthYesterdayKey } from "./irth-day";

/**
 * V16 — the canonical streak day is the Asia/Riyadh calendar day, matching
 * the server exactly. `todayKey()` used to be the DEVICE-local day, which
 * disagreed with the server for part of every day on any non-UTC+3 device
 * and caused false streak expiry.
 */
function todayKey(d: Date = new Date()): string {
  return irthDayKey(d);
}

/**
 * Day-anchored streak DISPLAY status. V16: this is a pure derivation used
 * for presentation only — it MUST NOT be used to persist a zero over a
 * server-provided streak value (a wrong device clock or a stale
 * `lastActiveDay` would otherwise destroy real progress).
 *   - safe:      played today (IRTH day)
 *   - at-risk:   played yesterday, expires at the next IRTH midnight
 *   - expired:   missed a full day (or never played)
 */
export type StreakStatus = "safe" | "at-risk" | "expired";
export function deriveStreak(
  storedStreak: number,
  lastActiveDay: string | null | undefined,
  now: Date = new Date(),
): { streak: number; status: StreakStatus } {
  const today = irthDayKey(now);
  const yesterday = irthYesterdayKey(now);
  const stored = Math.max(0, Math.floor(storedStreak || 0));
  if (lastActiveDay === today) return { streak: stored, status: "safe" };
  if (lastActiveDay === yesterday) return { streak: stored, status: "at-risk" };
  return { streak: 0, status: "expired" };
}


/**
 * V17-04A — explicit day precedence. IRTH day keys are `YYYY-MM-DD`, so a
 * lexical comparison is a chronological comparison. Used wherever a streak
 * value and its day must stay coherent (never "new streak + stale day").
 */
export function laterDayKey(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const x = a || null;
  const y = b || null;
  if (!x) return y;
  if (!y) return x;
  return y > x ? y : x;
}

function dailyMissionsForDate(_d: Date = new Date()): { id: string }[] {
  return [];
}
import { HEART_MAX, getEffectiveHearts, commitHearts, ACTIVITY_COOLDOWN_MS, activityKey, STREAK_MILESTONES, type HeartActivity, type StreakMilestone } from "./hearts";
import { STARTING_DINARS, HEART_COST_DINARS } from "./economy";
import { DEFAULT_AVATAR_ID } from "./avatars";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "./notifications";
import { androidMeasure, recordAndroidAction } from "./androidFreezeDiagnostics";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "hakaya.profile.v2";

/**
 * Per-page owner/attempt dedup set for `loseHeartOnce`. Survives across re-renders /
 * provider remounts inside a single tab but is intentionally NOT
 * persisted — heart loss for the same attempt should only be skipped
 * for the immediate rapid-tap window, not forever.
 */
const heartPenaltyDedup = new Set<string>();

export interface AppSettings {
  ambienceEnabled: boolean;
  ambienceVolume: number; // 0..1
  reduceMotion: boolean;
  notifications: boolean;
  notificationPrefs?: NotificationPrefs;
  /** Reading Comfort — scales typography on reading-heavy screens only. */
  textSize?: "sm" | "md" | "lg";
  /** True once the user has dismissed the Atlas informational intro. */
  atlasIntroDismissed?: boolean;
}


export interface ProfileState {
  name: string;
  loggedIn: boolean;
  points: number;
  streak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  storiesOpened: string[];
  storiesRead: string[]; // FINISHED stories (after explicit confirm)
  savedStories: string[];
  puzzlesSolved: string[];
  whoSolved: string[];
  badges: string[];
  unlockedEras: string[];
  investigationsCompleted: string[];
  timelinesCompleted: string[];
  decisionsCompleted: string[];
  missionsCompleted: string[];
  campaignsCompleted: string[];
  artifactsFound: string[];
  charactersUnlocked: string[];
  regionsUnlocked: string[];
  dailyClaimed: { day: string; ids: string[] };
  // seasonPoints / seasonClaimed removed in Phase 3B (Seasons demo deleted).

  titlesEarned: string[];
  settings: AppSettings;
  bio?: string;
  favoriteStateId?: string;
  favoriteFigureId?: string;
  avatarId?: string;
  // Engagement v1
  hearts: number;
  heartsAt: number; // ms epoch of last hearts commit
  dinars: number;
  activityCooldowns: Record<string, number>; // key -> ms epoch expiry
  streakMilestonesClaimed: number[];
  hintsPurchased: Record<string, number>; // e.g. "inv:<id>" -> count revealed
  // `achievementsEarned` was removed in the Achievement Engine v2
  // finalization (Slice 4). Unlock state lives in the `user_achievements`
  // table and is projected through `useAchievementViews()`.
}

const initial: ProfileState = {
  name: "ضيف",
  loggedIn: false,
  points: 0,
  streak: 0,
  longestStreak: 0,
  lastActiveDay: null,
  storiesOpened: [],
  storiesRead: [],
  savedStories: [],
  puzzlesSolved: [],
  whoSolved: [],
  badges: [],
  unlockedEras: ["seerah", "rashidun", "ayyubid"],
  investigationsCompleted: [],
  timelinesCompleted: [],
  decisionsCompleted: [],
  missionsCompleted: [],
  campaignsCompleted: [],
  artifactsFound: [],
  charactersUnlocked: [],
  regionsUnlocked: ["hijaz"],
  dailyClaimed: { day: "", ids: [] },
  // season fields removed in Phase 3B

  titlesEarned: [],
  settings: { ambienceEnabled: false, ambienceVolume: 0.4, reduceMotion: false, notifications: true, textSize: "sm" },
  bio: "",
  favoriteStateId: "",
  favoriteFigureId: "",
  avatarId: DEFAULT_AVATAR_ID,
  hearts: HEART_MAX,
  heartsAt: Date.now(),
  dinars: STARTING_DINARS,
  activityCooldowns: {},
  streakMilestonesClaimed: [],
  hintsPurchased: {},
};

interface Ctx {
  profile: ProfileState;
  hydrated: boolean;
  getPersistence: () => ProfilePersistence;
  login: (name: string) => void;
  logout: () => void;
  userId: string | null;

  addPoints: (n: number) => void;
  openStory: (id: string) => void;
  finishStory: (id: string, missionId?: string) => void;
  toggleSavedStory: (id: string) => void;
  markPuzzleSolved: (id: string) => void;
  markWhoSolved: (id: string) => void;
  unlockEra: (id: string) => void;
  touchStreak: () => void;
  awardBadge: (id: string) => void;
  completeInvestigation: (id: string, reward: number) => void;
  /**
   * Phase G — server-authoritative marker. Adds the slug/id to the
   * local completions array and bumps the streak, but does NOT grant
   * XP or dinars locally. The reward is granted server-side via
   * `complete_investigation_v2` and reconciled through cloud_saves.
   */
  markInvestigationCompletedLocal: (id: string) => void;
  completeTimeline: (id: string, reward: number) => void;
  completeDecision: (id: string, reward: number) => void;
  completeMission: (id: string, reward: number) => void;
  completeCampaign: (id: string, reward: number) => void;
  findArtifact: (id: string) => void;
  unlockCharacter: (id: string) => void;
  unlockRegion: (id: string, cost: number) => boolean;
  claimDaily: (id: string, reward: number) => boolean;
  // claimSeason removed in Phase 3B (Seasons demo deleted).
  updateSettings: (patch: Partial<AppSettings>) => void;
  todayDailyIds: () => string[];
  setBio: (bio: string) => void;
  setFavorites: (patch: { favoriteStateId?: string; favoriteFigureId?: string }) => void;
  /** Player-initiated pick — updates local state AND durably persists it. */
  setAvatar: (id: string) => void;
  /**
   * Durable, revertible pick. Resolves ONLY after the write is durable:
   * `synced` (server confirmed), `queued` (durable outbox, offline),
   * `local` (guest) or `failed` — in which case the previous emblem has
   * already been restored. UI must not report success on `failed`.
   */
  setAvatarDurable: (id: string) => Promise<"synced" | "queued" | "local" | "failed">;
  /**
   * Adopt an emblem that already came FROM the server (hydration/realtime).
   * Local-only: must not re-queue a write, or hydration would echo forever.
   */
  adoptServerAvatar: (id: string) => void;
  setNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  // Engagement v1
  loseHeart: () => number;          // returns new effective hearts (raw — prefer loseHeartOnce)
  /**
   * Idempotent heart loss keyed by a unique attempt id (e.g.
   * "campaign:chapter:activity:attempt"). Subsequent calls with the
   * same key in the lifetime of the page are no-ops. Use this from
   * gameplay code instead of `loseHeart()` to prevent double-decrement
   * on multi-tap / re-render races.
   */
  loseHeartOnce: (attemptKey: string) => number;
  hasHearts: () => boolean;
  recoverHeartFromActivity: (a: HeartActivity) => { ok: boolean; reason?: "full" | "cooldown" };
  spendDinarsForHeart: () => boolean;
  addDinars: (n: number) => void;
  spendDinars: (n: number) => boolean;
  /**
   * React-safe spend: affordability is decided synchronously against the last
   * committed profile (plus in-tick reservations) BEFORE the state update is
   * scheduled, so `true` always means the debit will land and `false` always
   * means zero dinars were deducted.
   */
  trySpendDinars: (n: number) => boolean;

  buyHint: (scopeKey: string, hintIndex: number, cost: number) => boolean;
  hintsRevealed: (scopeKey: string) => number;
  /**
   * @deprecated Phase 3A — manual streak claim is gone. The server auto-grants
   * milestones through `record_streak_activity`. This wrapper is a no-op kept
   * only for source compatibility with in-flight code paths.
   */
  claimStreakMilestone: (days: number) => Promise<boolean>;
  availableStreakMilestones: () => StreakMilestone[];
  /** Fetch already-claimed streak milestones from the server and merge locally. */
  hydrateClaimedStreakRewards: () => Promise<void>;
  /**
   * Phase 3A — canonical qualifying-activity call. Authenticated users hit
   * `record_streak_activity` (server day = Asia/Riyadh) and mirror the
   * returned totals into the local profile. Guests fall back to local
   * `touchStreak` (no server economy grants).
   */
  recordStreakActivity: (
    source: "campaign_chapter" | "game" | "investigation",
    sourceId?: string | null,
  ) => Promise<void>;
  // Cloud-save integration
  replaceProfile: (next: ProfileState) => void;
  /**
   * Merge a cloud-save snapshot into local state WITHOUT clobbering
   * progression arrays. Numeric scalars from cloud win (server is
   * authoritative for xp/dinars/season/streak). String[] progression
   * arrays are UNIONed with local (and with `extras.stickyCampaignIds`,
   * the server-side sticky completions ledger). Settings are shallow
   * merged, with cloud winning on conflict. This is the sole safe path
   * for `AccountProvider` to hydrate a returning user without erasing
   * completions earned since the last cloud push (Stability Phase 1).
   */
  mergeCloudSave: (
    cloud: ProfileState,
    extras?: { stickyCampaignIds?: readonly string[] },
  ) => void;
  resetProfile: () => void;
  /** Single-use local receipt application, not server idempotency or authority. */
  captureHeartPurchase: () => {
    current: () => boolean;
    apply: (receipt: { dinars: number; hearts?: number }) => Promise<boolean>;
    purchaseGuest: () => Promise<boolean>;
  };
  /**
   * Merge authoritative server-side stats (admin edits, cloud reconciliation)
   * into the local profile WITHOUT discarding local-only fields. Mirrors
   * server `profiles` columns onto the local snapshot.
   */
  applyServerStats: (stats: {
    xp?: number | null;
    dinars?: number | null;
    hearts?: number | null;
    streak?: number | null;
    /**
     * V17-04A — the server-owned day that the streak mirror belongs to
     * (`profiles.last_streak_day`). A server streak MUST arrive together
     * with its day so the HUD's `deriveStreak` cannot report a false 0
     * from stale local date metadata.
     */
    lastStreakDay?: string | null;
  }) => void;
  // Social v1
  grantTitle: (title: string) => void;
  grantArtifact: (id: string) => void;
  // `markAchievementEarned` was removed in the Achievement Engine v2
  // finalization slice. Achievement unlocking is now server-authoritative
  // via `@/lib/achievements/v2` (see `claim_achievements` RPC).
}


const ProfileContext = createContext<Ctx | null>(null);

function addPointsTo(p: ProfileState, n: number): ProfileState {
  return { ...p, points: p.points + n };
}

function addDinarsTo(p: ProfileState, n: number): ProfileState {
  return { ...p, dinars: Math.max(0, (p.dinars ?? 0) + n) };
}

/** Dinar award proportional to XP reward for an activity (floor reward/4, min 1). */
function dinarsForReward(xp: number): number {
  if (xp <= 0) return 0;
  return Math.max(1, Math.floor(xp / 4));
}

/** Validate the entire variable reward before accepting any completion metadata. */
function localRewardTotals(p: ProfileState, reward: number): Pick<ProfileState, "points" | "dinars"> | undefined {
  if (!Number.isFinite(reward)) return undefined;
  const points = p.points + reward;
  const dinars = Math.max(0, (p.dinars ?? 0) + dinarsForReward(reward));
  if (!Number.isFinite(points) || !Number.isFinite(dinars)) return undefined;
  return { points, dinars };
}

/**
 * Read the persisted profile snapshot outside React.
 *
 * Needed by the offline outbox flusher, which replays queued writes from a
 * background/reconnect context where no provider is mounted. Never throws;
 * falls back to the seed profile.
 */
export function readPersistedProfileState(): ProfileState {
  try {
    if (typeof localStorage === "undefined") return initial;
    const owner = getActiveOwner();
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<ProfileState>;
    return {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return initial;
  }
}

/** Read + normalise the persisted profile of the CURRENT owner namespace. */
function hydrateFromStorage(reportReadable?: (readable: boolean) => void): ProfileState | null {
  reportReadable?.(false);
  const ownerAtHydrate = getActiveOwner();
  recordTrace("sync-forensics", "LOCAL_PROFILE_HYDRATE_START", JSON.stringify({ owner: ownerAtHydrate }));
  const start = Date.now();

  try {
    recordTrace("logout-audit", "profile-hydrate:initial");
    recordTrace("logout-audit", "owner:before", ownerAtHydrate);
    
    const parseSafe = (v: string | null) => {
      if (!v) return null;
      try {
        const p = JSON.parse(v);
        return { name: p.name, loggedIn: p.loggedIn, points: p.points, dinars: p.dinars };
      } catch { return "error"; }
    };

    const s = typeof window !== "undefined" ? window.localStorage : null;
    const originalGet = s ? ((s as any).__originalGetItem || s.getItem) : null;
    
    const rawLocal = s ? s.getItem(STORAGE_KEY) : null;
    let rawLegacy = null;
    if (s && originalGet) {
      try {
        rawLegacy = originalGet.call(s, STORAGE_KEY);
      } catch (e) {}
    }
    const rawSession = typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null;

    const finalRaw = rawLocal || rawLegacy || rawSession;
    const finalSource = rawLocal ? "partitioned-local" : 
                       rawLegacy ? "legacy-local" : 
                       rawSession ? "session-storage" : "none";

    const parsedData = parseSafe(finalRaw);
    
    // V13 Pollution Detection & Sanitization
    if (finalRaw && ownerAtHydrate.startsWith("guest:")) {
      try {
        const p = JSON.parse(finalRaw);
        if (p && p.loggedIn === true) {
          recordTrace("logout-audit", "PROFILE_POLLUTION_DETECTED", JSON.stringify({
            owner: ownerAtHydrate,
            source: finalSource,
            data: parsedData,
            caller: "hydrateFromStorage"
          }));
          
          // Preserve quarantined source bytes; never replace them with seed data.
          return null; 
        }
      } catch (e) {}
    }

    recordTrace("logout-audit", "PROFILE_HYDRATION_SOURCE", JSON.stringify({
      owner: ownerAtHydrate,
      source: finalSource,
      logicalKey: STORAGE_KEY,
      physicalKey: rawLocal ? "mapped-by-partition" : STORAGE_KEY,
      data: parsedData,
      returned: finalSource !== "none" ? finalSource : "null"
    }));




    if (!finalRaw) { reportReadable?.(true); return null; }
    const parsed = JSON.parse(finalRaw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid-profile");
    reportReadable?.(Number.isFinite(parsed.points) && Number.isFinite(parsed.dinars));
    
    let merged: ProfileState = {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...(parsed.settings ?? {}) },
    };
    // V16: hydration is NON-DESTRUCTIVE. The stored streak is kept verbatim;
    // expiry is a display derivation (`deriveStreak`), never a persisted 0.
    // A stale/foreign `lastActiveDay` or a wrong device clock must not be
    // able to destroy a valid server streak on boot.


    return merged;
  } catch (e) {
    recordTrace("logout-audit", "profile-hydrate:error", (e as Error).message);
    return null;
  } finally {
    const duration = Date.now() - start;
    recordTrace("sync-forensics", "LOCAL_PROFILE_HYDRATE_DONE", `${duration}ms`);
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { profile, owner: profileOwner, epoch: profileEpoch, setProfile, hydrate, getPersistence, capture, reset, prepareConditional } = useProfileWriter(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    hydrate(hydrateFromStorage);
    setHydrated(true);
  }, [hydrate]);

  // Identity switch (login / logout / account switch): the storage
  // namespace has already been repointed at the new owner, so the ONLY
  // correct state is whatever that owner has stored — never a merge with
  // the outgoing identity's in-memory profile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onIdentityChange = () => {
      const nextOwner = getActiveOwner();

      // 1) IMMEDIATELY detach the previous owner's React profile state.
      // This prevents stale data (Account A's XP) from remaining visible
      // in the React tree while hydrateFromStorage is working.
      // Hydration replaces the entire identity-bound frame atomically.
      
      // 2) Then hydrate the newly active owner's profile from its already-switched partition.
      hydrate(hydrateFromStorage);
      const next = readPersistedProfileState();

      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "ProfileProvider:onIdentityChange:end", JSON.stringify({
          afterPoints: next.points,
          afterName: next.name,
          afterLoggedIn: next.loggedIn
        }));
      }).catch(() => {});
    };
    window.addEventListener("irth:identity-changed", onIdentityChange);
    return () => window.removeEventListener("irth:identity-changed", onIdentityChange);
  }, [hydrate]);

  // Persistence is owned by useProfileWriter's immutable identity frame.

  // V16 — day-rollover TICK ONLY.
  // Previously this watcher persisted `streak = 0` whenever the derived
  // status was "expired". That was the single biggest cause of lost
  // "الحماسة": one wrong day comparison wrote a fabricated zero over a
  // valid server streak and persisted it to localStorage.
  // It now only nudges a re-render so display-level derivations
  // (`deriveStreak`) refresh across the IRTH midnight boundary. No writes.
  const [, setDayTick] = useState(0);
  useEffect(() => {
    if (!hydrated) return;
    let lastDay = todayKey();
    const check = () => {
      const now = todayKey();
      if (now !== lastDay) {
        lastDay = now;
        setDayTick((n) => n + 1);
      }
    };
    const id = window.setInterval(check, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      window.clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [hydrated]);


  const update = useCallback((fn: (p: ProfileState) => ProfileState) => setProfile((p) => {
    const started = performance.now();
    const next = fn(p);
    if (next !== p) recordAndroidAction("profile.update");
    androidMeasure("profile.update", started);
    return next;
  }), [setProfile]);

  const awardBadge = useCallback((id: string) => {
    update((p) => (p.badges.includes(id) ? p : { ...p, badges: [...p.badges, id] }));
  }, [update]);

  // Latest committed profile, readable from async callbacks without stale
  // closures (used by the emblem revert path below).
  const latestProfileRef = useRef(profile);
  latestProfileRef.current = profile;

  // V16 — REACT-SAFE SPEND.
  // `spendDinars` decides affordability *inside* a `setProfile` updater, so its
  // boolean is only truthful when React happens to run the updater eagerly.
  // Under batching it can report failure while the debit still lands later
  // (paid no-op). `trySpendDinars` decides synchronously against the last
  // committed profile plus the amount already reserved in this tick, then
  // schedules the mutation. The existing `spendDinars` contract is untouched
  // for its other callers (games / crossword help).
  const reservedDinarsRef = useRef(0);
  const reservationScopeRef = useRef(capture);
  useEffect(() => {
    if (reservationScopeRef.current === capture) reservedDinarsRef.current = 0;
  }, [profile.dinars, capture]);
  const trySpendDinars = useCallback((n: number): boolean => {
    const write = getPersistence();
    if (!capture()() || write.outcome === "unresolved" || write.outcome === "failed") return false;
    // Reservations belong to the accepting capability, not a later owner
    // with the same balance. An obsolete action cannot reset live reservations.
    if (reservationScopeRef.current !== capture) {
      reservationScopeRef.current = capture;
      reservedDinarsRef.current = 0;
    }
    if (!Number.isFinite(n) || n <= 0) return false;
    const available = (latestProfileRef.current.dinars ?? 0) - reservedDinarsRef.current;
    if (available < n) return false;
    reservedDinarsRef.current += n;
    update((p) => ({ ...p, dinars: Math.max(0, (p.dinars ?? 0) - n) }));
    return true;
  }, [update, capture, getPersistence]);


  const sessionCurrent = useCallback(async (current: () => boolean) => {
    if (!current() || getActiveOwner() !== profileOwner || getIdentityEpoch() !== profileEpoch) return false;
    try {
      const { data, error } = await supabase.auth.getSession();
      const expected = profileOwner.startsWith("user:") ? profileOwner.slice(5) : null;
      return !error && current() && getActiveOwner() === profileOwner &&
        getIdentityEpoch() === profileEpoch && (data.session?.user.id ?? null) === expected;
    } catch { return false; }
  }, [profileOwner, profileEpoch]);

  // Premium Emblem — DURABLE, REVERTIBLE write.
  // Local state flips instantly for responsiveness, but the promise resolves
  // only once the pick is durable. On a hard failure the previous emblem is
  // restored here, so the UI can never keep an optimistic value the server
  // never accepted. See `@/lib/emblems/avatar-persistence`.
  const ctxSetAvatarDurable = useCallback(async (id: string) => {
    const current = capture();
    if (!current()) return "failed" as const;
    const previous = latestProfileRef.current.avatarId ?? null;
    if (previous === id) {
      // Re-picking the current emblem must still confirm durability (the
      // previous attempt may have been queued or lost).
      try {
        const { persistAvatarSelection } = await import("@/lib/emblems/avatar-persistence");
        if (!(await sessionCurrent(current))) return "failed" as const;
        const result = await persistAvatarSelection(id);
        return current() ? result : "failed" as const;
      } catch {
        return "failed" as const;
      }
    }
    update((p) => ({ ...p, avatarId: id }));
    let result: "synced" | "queued" | "local" | "failed" = "failed";
    try {
      const { persistAvatarSelection } = await import("@/lib/emblems/avatar-persistence");
      if (!(await sessionCurrent(current))) return "failed" as const;
      result = await persistAvatarSelection(id);
    } catch {
      result = "failed";
    }
    if ((await sessionCurrent(current)) && result === "failed") {
      update((p) => (!current() ? p : p.avatarId === id ? { ...p, avatarId: previous ?? p.avatarId } : p));
    }
    return current() ? result : "failed" as const;
  }, [update, capture, sessionCurrent]);

  const ctx = useMemo<Ctx>(() => ({
    profile,
    hydrated,
    getPersistence,
    login: (name) => update((p) => ({ ...p, name: name.trim() || "صديق التاريخ", loggedIn: true })),
    logout: () => {
      const current = capture();
      if (!current()) return;
      import("@/lib/identity/reset").then(({ resetForIdentityChange }) => {
        if (current()) void resetForIdentityChange({ nextUserId: null, reason: "sign-out" });
      });
    },
    userId: profileOwner.startsWith("user:") ? profileOwner.slice(5) : null,
    addPoints: (n) => {
      if (!Number.isFinite(n)) return;
      update((p) => Number.isFinite(p.points + n) ? addPointsTo(p, n) : p);
    },

    openStory: (id) => update((p) => p.storiesOpened.includes(id) ? p : { ...p, storiesOpened: [...p.storiesOpened, id] }),
    finishStory: (id, missionId) => update((p) => {
      if (p.storiesRead.includes(id)) {
        // Already finished — still allow mission completion if first time for that mission
        if (missionId && !p.missionsCompleted.includes(missionId)) {
          return addPointsTo({ ...p, missionsCompleted: [...p.missionsCompleted, missionId] }, 10);
        }
        return p;
      }
      const read = [...p.storiesRead, id];
      const badges = [...p.badges];
      if (!badges.includes("first_story") && read.length >= 1) badges.push("first_story");
      if (!badges.includes("five_stories") && read.length >= 5) badges.push("five_stories");
      let np = addPointsTo({ ...p, storiesRead: read, badges }, 25);
      if (missionId && !np.missionsCompleted.includes(missionId)) {
        np = { ...np, missionsCompleted: [...np.missionsCompleted, missionId] };
      }
      return np;
    }),
    toggleSavedStory: (id) => update((p) => ({
      ...p,
      savedStories: p.savedStories.includes(id) ? p.savedStories.filter((x) => x !== id) : [...p.savedStories, id],
    })),
    markPuzzleSolved: (id) => update((p) => {
      if (p.puzzlesSolved.includes(id)) return p;
      return addPointsTo({ ...p, puzzlesSolved: [...p.puzzlesSolved, id] }, 15);
    }),
    markWhoSolved: (id) => update((p) => {
      if (p.whoSolved.includes(id)) return p;
      return addPointsTo({ ...p, whoSolved: [...p.whoSolved, id] }, 20);
    }),
    unlockEra: (id) => update((p) => p.unlockedEras.includes(id) ? p : { ...p, unlockedEras: [...p.unlockedEras, id] }),
    touchStreak: () => update((p) => {
      const today = todayKey();
      if (p.lastActiveDay === today) return p;
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = todayKey(y);
      const streak = p.lastActiveDay === yesterday ? p.streak + 1 : 1;
      return { ...p, streak, lastActiveDay: today };
    }),
    awardBadge,
    completeInvestigation: (id, reward) => update((p) => {
      if (p.investigationsCompleted.includes(id)) return p;
      const totals = localRewardTotals(p, reward);
      if (!totals) return p;
      // Qualifying streak activity: investigation completion.
      const today = todayKey();
      let streak = p.streak;
      let lastActiveDay = p.lastActiveDay;
      if (lastActiveDay !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yesterday = todayKey(y);
        streak = lastActiveDay === yesterday ? streak + 1 : 1;
        lastActiveDay = today;
      }
      return { ...p, ...totals, investigationsCompleted: [...p.investigationsCompleted, id], streak, lastActiveDay };
    }),
    /**
     * Phase G — Marks completion locally without granting XP/dinars.
     * The server (complete_investigation_v2) is the reward authority.
     */
    markInvestigationCompletedLocal: (id) => update((p) => {
      if (p.investigationsCompleted.includes(id)) return p;
      const today = todayKey();
      let streak = p.streak;
      let lastActiveDay = p.lastActiveDay;
      if (lastActiveDay !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yesterday = todayKey(y);
        streak = lastActiveDay === yesterday ? streak + 1 : 1;
        lastActiveDay = today;
      }
      return { ...p, investigationsCompleted: [...p.investigationsCompleted, id], streak, lastActiveDay };
    }),
    completeTimeline: (id, reward) => update((p) => {
      if (p.timelinesCompleted.includes(id)) return p;
      const totals = localRewardTotals(p, reward);
      return totals ? { ...p, ...totals, timelinesCompleted: [...p.timelinesCompleted, id] } : p;
    }),
    completeDecision: (id, reward) => update((p) => {
      if (p.decisionsCompleted.includes(id)) return p;
      const totals = localRewardTotals(p, reward);
      return totals ? { ...p, ...totals, decisionsCompleted: [...p.decisionsCompleted, id] } : p;
    }),
    completeMission: (id, reward) => update((p) => {
      if (p.missionsCompleted.includes(id)) return p;
      const totals = localRewardTotals(p, reward);
      return totals ? { ...p, ...totals, missionsCompleted: [...p.missionsCompleted, id] } : p;
    }),
    completeCampaign: (id, reward) => update((p) => {
      if (p.campaignsCompleted.includes(id)) return p;
      const totals = localRewardTotals(p, reward);
      return totals ? { ...p, ...totals, campaignsCompleted: [...p.campaignsCompleted, id] } : p;
    }),
    findArtifact: (id) => update((p) => p.artifactsFound.includes(id) ? p
      : addPointsTo({ ...p, artifactsFound: [...p.artifactsFound, id] }, 15)),
    unlockCharacter: (id) => update((p) => p.charactersUnlocked.includes(id) ? p
      : addPointsTo({ ...p, charactersUnlocked: [...p.charactersUnlocked, id] }, 20)),
    unlockRegion: (id, cost) => {
      let ok = false;
      update((p) => {
        if (p.regionsUnlocked.includes(id)) { ok = true; return p; }
        if (!Number.isFinite(cost) || p.points < cost) return p;
        const remaining = p.points - cost;
        if (!Number.isFinite(remaining)) return p;
        ok = true;
        return { ...p, regionsUnlocked: [...p.regionsUnlocked, id], points: remaining };
      });
      return ok;
    },
    claimDaily: (id, reward) => {
      let ok = false;
      update((p) => {
        const today = todayKey();
        const dc = p.dailyClaimed.day === today ? p.dailyClaimed : { day: today, ids: [] };
        if (dc.ids.includes(id)) return p;
        const totals = localRewardTotals(p, reward);
        if (!totals) return p;
        ok = true;
        return { ...p, ...totals, dailyClaimed: { day: today, ids: [...dc.ids, id] } };
      });
      return ok;
    },
    // claimSeason removed in Phase 3B (Seasons demo deleted).

    updateSettings: (patch) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    todayDailyIds: () => dailyMissionsForDate().map((m) => m.id),
    setBio: (bio) => update((p) => ({ ...p, bio })),
    setFavorites: (patch) => update((p) => ({ ...p, ...patch })),
    // Emblem selection is a DURABLE write, not a debounced side effect.
    // Local state flips instantly; the pick is simultaneously queued to the
    // offline outbox (stable idempotency key) so it survives process death,
    // airplane mode and reinstall. See `@/lib/emblems/avatar-persistence`.
    adoptServerAvatar: (id) => update((p) => (p.avatarId === id ? p : { ...p, avatarId: id })),
    setAvatar: (id) => { void ctxSetAvatarDurable(id); },
    setAvatarDurable: (id) => ctxSetAvatarDurable(id),
    setNotificationPrefs: (patch) => {
      if (!capture()()) return;
      update((p) => ({
        ...p,
        settings: {
          ...p.settings,
          notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(p.settings.notificationPrefs ?? {}), ...patch },
        },
      }));
      // Notify the Daily Challenge scheduler (and any other listeners)
      // that preferences changed so they can reschedule/cancel
      // immediately. This is the single canonical event; the scheduler
      // reads the same profile-local prefs as the settings UI.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("irth:notification-preferences-updated"));
      }
    },


    // ============= Engagement v1 =============
    loseHeart: () => {
      if (!capture()()) return 0;
      let result = HEART_MAX;
      update((p) => {
        const now = Date.now();
        const eff = getEffectiveHearts(p, now);
        const next = Math.max(0, eff - 1);
        result = next;
      return { ...p, ...commitHearts(p, next, now) };

      });
      if (typeof window !== "undefined") {
        try { window.dispatchEvent(new CustomEvent("irth:heart-lost", { detail: { hearts: result } })); } catch {}
      }
      return result;
    },
    loseHeartOnce: (attemptKey: string) => {
      if (!capture()()) return 0;
      if (!attemptKey) return getEffectiveHearts(profile);
      const penaltyKey = JSON.stringify([profileOwner, attemptKey]);
      if (heartPenaltyDedup.has(penaltyKey)) {
        return getEffectiveHearts(profile);
      }
      heartPenaltyDedup.add(penaltyKey);
      if (heartPenaltyDedup.size > 500) {
        const first = heartPenaltyDedup.values().next().value;
        if (first) heartPenaltyDedup.delete(first);
      }
      let result = HEART_MAX;
      update((p) => {
        const now = Date.now();
        const eff = getEffectiveHearts(p, now);
        const next = Math.max(0, eff - 1);
        result = next;
        return { ...p, ...commitHearts(p, next, now) };
      });
      if (typeof window !== "undefined") {
        try { window.dispatchEvent(new CustomEvent("irth:heart-lost", { detail: { hearts: result } })); } catch {}
      }
      return result;
    },
    hasHearts: () => getEffectiveHearts(profile) > 0,
    recoverHeartFromActivity: (a) => {
      let outcome: { ok: boolean; reason?: "full" | "cooldown" } = { ok: false };
      update((p) => {
        const now = Date.now();
        const eff = getEffectiveHearts(p, now);
        if (eff >= HEART_MAX) { outcome = { ok: false, reason: "full" }; return p; }
        const k = activityKey(a);
        const exp = p.activityCooldowns?.[k] ?? 0;
        if (exp > now) { outcome = { ok: false, reason: "cooldown" }; return p; }
        outcome = { ok: true };
        return {
          ...p,
          ...commitHearts(p, eff + 1, now),
          activityCooldowns: { ...(p.activityCooldowns ?? {}), [k]: now + ACTIVITY_COOLDOWN_MS },
        };
      });
      return outcome;
    },
    spendDinarsForHeart: () => {
      let ok = false;
      update((p) => {
        const now = Date.now();
        const eff = getEffectiveHearts(p, now);
        if (eff >= HEART_MAX) return p;
        if ((p.dinars ?? 0) < HEART_COST_DINARS) return p;
        ok = true;
        return { ...p, ...commitHearts(p, eff + 1, now), dinars: p.dinars - HEART_COST_DINARS };
      });
      return ok;
    },
    addDinars: (n) => {
      if (!Number.isFinite(n)) return;
      update((p) => Number.isFinite(Math.max(0, (p.dinars ?? 0) + n)) ? addDinarsTo(p, n) : p);
    },
    spendDinars: (n) => {
      if (!Number.isFinite(n)) return false;
      let ok = false;
      update((p) => {
        if ((p.dinars ?? 0) < n) return p;
        const remaining = p.dinars - n;
        if (!Number.isFinite(remaining)) return p;
        ok = true;
        return { ...p, dinars: remaining };
      });
      return ok;
    },
    trySpendDinars,

    buyHint: (scopeKey, hintIndex, cost) => {
      let ok = false;
      update((p) => {
        const already = p.hintsPurchased?.[scopeKey] ?? 0;
        if (hintIndex < already) { ok = true; return p; } // already revealed
        if (hintIndex !== already) return p;              // must buy in order
        // Keep already-revealed and ordering behavior above unchanged.
        // This guard prevents a new malformed purchase, not write admission.
        if (!Number.isFinite(cost)) return p;
        if ((p.dinars ?? 0) < cost) return p;
        const remaining = p.dinars - cost;
        if (!Number.isFinite(remaining)) return p;
        ok = true;
        return {
          ...p,
          dinars: remaining,
          hintsPurchased: { ...(p.hintsPurchased ?? {}), [scopeKey]: already + 1 },
        };
      });
      return ok;
    },
    hintsRevealed: (scopeKey) => profile.hintsPurchased?.[scopeKey] ?? 0,
    // Phase 3A — manual claim is retired. Server auto-grants milestones via
    // record_streak_activity. This wrapper is a deprecated no-op that returns
    // false; the legacy server RPC also refuses to grant new rewards.
    claimStreakMilestone: async (_days) => {
      void _days;
      return false;
    },
    availableStreakMilestones: () =>
      STREAK_MILESTONES.filter((m) => profile.streak >= m.days && !(profile.streakMilestonesClaimed ?? []).includes(m.days)),
    hydrateClaimedStreakRewards: async () => {
      const current = capture();
      if (!(await sessionCurrent(current))) return;
      try {
        const { data, error } = await supabase.rpc("my_claimed_streak_rewards");
        if (!(await sessionCurrent(current))) return;
        if (error) {
          console.error("[streak-reward] my_claimed_streak_rewards", error);
          return;
        }
        const list = Array.isArray(data) ? (data as number[]) : [];
        if (list.length === 0) return;
        update((p) => {
          if (!current()) return p;
          const cur = new Set(p.streakMilestonesClaimed ?? []);
          let changed = false;
          for (const d of list) { if (!cur.has(d)) { cur.add(d); changed = true; } }
          if (!changed) return p;
          return { ...p, streakMilestonesClaimed: Array.from(cur).sort((a, b) => a - b) };
        });
      } catch (e) {
        console.error("[streak-reward] hydrate failed", e);
      }
    },

    // V16 — durable qualifying-activity call.
    recordStreakActivity: async (source, sourceId) => {
      const current = capture();
      const unchanged = capture(true);
      if (!current()) return;
      const { recordStreakActivity: rpc } = await import("./streak-activity");
      if (!(await sessionCurrent(current)) || !unchanged()) return;
      const outcome = await rpc(source, sourceId ?? null);
      if (!(await sessionCurrent(current)) || !unchanged()) return;
      if (outcome.ok !== true) {
        if (profile.loggedIn && !outcome.queued) return;
        // Guest or confirmed durable queue only. An unpersisted authenticated
        // attempt must not project successful activity. Pending work will
        // replay with the original IRTH day, so the local mirror here is
        // purely optimistic UI — it never fabricates server truth.
        update((p) => {
          if (!current()) return p;
          const today = todayKey();
          if (p.lastActiveDay === today) return p;
          const yesterday = irthYesterdayKey();
          const streak = p.lastActiveDay === yesterday ? p.streak + 1 : Math.max(1, 1);
          const longestStreak = Math.max(p.longestStreak ?? 0, streak);
          return { ...p, streak, longestStreak, lastActiveDay: today };
        });
        return;
      }

      // Server authoritative — mirror totals into local state.
      update((p) => {
        if (!current()) return p;
        let np: ProfileState = {
          ...p,
          streak: outcome.current_streak,
          longestStreak: Math.max(p.longestStreak ?? 0, outcome.longest_streak),
          lastActiveDay: outcome.last_active_day || p.lastActiveDay,
          points: outcome.xp_total,
          dinars: outcome.dinar_balance,
        };
        // Reflect optional rewards + newly-recorded milestones locally so
        // Profile shows the truthful state without re-fetching.
        for (const g of outcome.grants) {
          if (!(np.streakMilestonesClaimed ?? []).includes(g.milestone_days)) {
            np = {
              ...np,
              streakMilestonesClaimed: [
                ...(np.streakMilestonesClaimed ?? []),
                g.milestone_days,
              ].sort((a, b) => a - b),
            };
          }
          if (g.badge_id && !np.badges.includes(g.badge_id)) {
            np = { ...np, badges: [...np.badges, g.badge_id] };
          }
          if (g.title_id && !np.titlesEarned.includes(g.title_id)) {
            np = { ...np, titlesEarned: [...np.titlesEarned, g.title_id] };
          }
          if (g.artifact_id && !np.artifactsFound.includes(g.artifact_id)) {
            np = { ...np, artifactsFound: [...np.artifactsFound, g.artifact_id] };
          }
        }
        return np;
      });
    },

    // ============= Cloud Save bridge =============
    replaceProfile: (next) => setProfile({
      ...initial,
      ...next,
      settings: { ...initial.settings, ...(next.settings ?? {}) },
    }),
    mergeCloudSave: (cloud, extras) => {
      // Snapshot once before React can defer the merge. Reject a malformed
      // numeric snapshot without admitting any partial progression/balance write.
      const captured = { ...cloud };
      if ([captured.points, captured.dinars, captured.streak].some(
        (value) => typeof value === "number" && !Number.isFinite(value),
      )) return;
      // Normalize scalar map entries once before a deferred/replayed updater.
      // Preserve Number(value) || 0 compatibility; validate final maxima below.
      const incomingCooldowns = Object.entries(captured.activityCooldowns ?? {})
        .map(([key, value]) => [key, Number(value) || 0] as const);
      const incomingHints = Object.entries(captured.hintsPurchased ?? {})
        .map(([key, value]) => [key, Number(value) || 0] as const);
      setProfile((p) => {
        const union = (a: readonly string[] | undefined, b: readonly string[] | undefined): string[] => {
          const s = new Set<string>();
          for (const x of a ?? []) if (x) s.add(x);
          for (const x of b ?? []) if (x) s.add(x);
          return Array.from(s);
        };
        const numMax = (a: number | undefined, b: number | undefined, fallback = 0): number =>
          Math.max(fallback, Math.floor(a ?? fallback), Math.floor(b ?? fallback));
        const cooldowns: Record<string, number> = { ...(p.activityCooldowns ?? {}) };
        for (const [k, v] of incomingCooldowns) {
          cooldowns[k] = Math.max(cooldowns[k] ?? 0, v);
        }
        const hints: Record<string, number> = { ...(p.hintsPurchased ?? {}) };
        for (const [k, v] of incomingHints) {
          hints[k] = Math.max(hints[k] ?? 0, v);
        }
        // Reject the whole merge, including unrelated progression, if either
        // final map would persist a nonfinite value (also inspect local entries).
        if (Object.values(cooldowns).some((value) => !Number.isFinite(value)) ||
            Object.values(hints).some((value) => !Number.isFinite(value))) return p;
        // V16 — Streak: cloud/server value is authoritative and is adopted
        // verbatim (max with local so an in-flight local activity is not
        // regressed). A client-side "expired" derivation NEVER zeroes it;
        // expiry is display-only. This stops a stale local `lastActiveDay`
        // from wiping a valid server streak during hydration.
        const nextStreak = numMax(p.streak, captured.streak);
        // V17-04A — the `...cloud` spread below used to let an OLDER cloud
        // `lastActiveDay` overwrite a newer local one, producing the
        // "correct streak + stale day" pair that makes the HUD show 0.
        // Precedence is now explicit: keep the later of the two days.
        const nextLastActiveDay = laterDayKey(p.lastActiveDay, captured.lastActiveDay);


        // Hearts: cloud value wins ONLY when it differs from the local
        // committed value; preserves regen anchor otherwise.
        //
        // Anchor rule (reinstall/second-device safety): on a fresh install
        // the local `heartsAt` is `Date.now()` (from `initial`) — newer
        // than the cloud anchor. Adopting the local anchor would silently
        // wipe accrued regeneration. When cloud carries a numeric anchor
        // that is OLDER than the local one, use the cloud anchor as the
        // starting point so the timer resumes at the correct offset.
        const cloudHearts = Math.max(0, Math.min(HEART_MAX, captured.hearts ?? HEART_MAX));
        const localCommitted = Math.max(0, Math.min(HEART_MAX, p.hearts ?? HEART_MAX));
        const cloudAt = typeof captured.heartsAt === "number" && Number.isFinite(captured.heartsAt)
          ? captured.heartsAt
          : null;
        const now = Date.now();
        const localEff = getEffectiveHearts(p, now);
        const cloudEff = cloudAt !== null ? getEffectiveHearts({ ...p, hearts: cloudHearts, heartsAt: cloudAt }, now) : cloudHearts;


        // V13 MINIMAL SAFE FIX: Reconciliation must compare EFFECTIVE states and preserve the tuple.
        // Do NOT use commitHearts during hydration as it resets the anchor to 'now'.
        const useCloud = cloudEff > localEff || (cloudEff === localEff && cloudAt !== null && cloudAt < (p.heartsAt ?? now));

        const heartsPatch = useCloud && cloudAt !== null
          ? { hearts: cloudHearts, heartsAt: cloudAt }
          : { hearts: p.hearts, heartsAt: p.heartsAt };


        const dailyDay = captured.dailyClaimed?.day && captured.dailyClaimed.day === p.dailyClaimed?.day

          ? p.dailyClaimed.day
          : (captured.dailyClaimed?.day ?? p.dailyClaimed?.day ?? "");
        const dailyIds = captured.dailyClaimed?.day === p.dailyClaimed?.day
          ? union(p.dailyClaimed?.ids, captured.dailyClaimed?.ids)
          : (captured.dailyClaimed?.ids ?? p.dailyClaimed?.ids ?? []);

        return {
          ...initial,
          ...p,
          ...captured,
          // Scalars: max so a stale cloud push never regresses local.
          points: numMax(p.points, captured.points),
          // seasonPoints removed in Phase 3B
          dinars: numMax(p.dinars, captured.dinars, STARTING_DINARS),
          streak: nextStreak,
          lastActiveDay: nextLastActiveDay,
          hearts: heartsPatch.hearts,
          heartsAt: heartsPatch.heartsAt,
          // Union all progression arrays. Include the server sticky
          // campaign completions ledger so a returning device that never
          // pushed the fact cannot drop it.
          storiesOpened: union(p.storiesOpened, captured.storiesOpened),
          storiesRead: union(p.storiesRead, captured.storiesRead),
          savedStories: union(p.savedStories, captured.savedStories),
          puzzlesSolved: union(p.puzzlesSolved, captured.puzzlesSolved),
          whoSolved: union(p.whoSolved, captured.whoSolved),
          badges: union(p.badges, captured.badges),
          unlockedEras: union(p.unlockedEras, captured.unlockedEras),
          investigationsCompleted: union(p.investigationsCompleted, captured.investigationsCompleted),
          timelinesCompleted: union(p.timelinesCompleted, captured.timelinesCompleted),
          decisionsCompleted: union(p.decisionsCompleted, captured.decisionsCompleted),
          missionsCompleted: union(p.missionsCompleted, captured.missionsCompleted),
          campaignsCompleted: union(
            union(p.campaignsCompleted, captured.campaignsCompleted),
            extras?.stickyCampaignIds,
          ),
          artifactsFound: union(p.artifactsFound, captured.artifactsFound),
          charactersUnlocked: union(p.charactersUnlocked, captured.charactersUnlocked),
          regionsUnlocked: union(p.regionsUnlocked, captured.regionsUnlocked),
          titlesEarned: union(p.titlesEarned, captured.titlesEarned),
          streakMilestonesClaimed: Array.from(new Set([
            ...(p.streakMilestonesClaimed ?? []),
            ...(captured.streakMilestonesClaimed ?? []),
          ])).sort((a, b) => a - b),
          activityCooldowns: cooldowns,
          hintsPurchased: hints,
          dailyClaimed: { day: dailyDay, ids: dailyIds },
          settings: { ...initial.settings, ...(p.settings ?? {}), ...(captured.settings ?? {}) },
        } as ProfileState;
      });
    },
    captureHeartPurchase: () => {
      const operation = prepareConditional();
      const current = () => operation.current() && latestProfileRef.current === profile;
      return {
        current,
        purchaseGuest: () => {
          if (!current() || profile.loggedIn) return Promise.resolve(false);
          const purchasedAt = Date.now();
          const hearts = getEffectiveHearts(profile, purchasedAt);
          const remaining = profile.dinars - HEART_COST_DINARS;
          if (hearts >= HEART_MAX || !Number.isFinite(hearts) ||
              (profile.dinars ?? 0) < HEART_COST_DINARS || !Number.isFinite(remaining)) {
            return Promise.resolve(false);
          }
          return operation.apply((p) => ({
            ...p, ...commitHearts(p, hearts + 1, purchasedAt), dinars: remaining,
          }));
        },
        apply: ({ dinars, hearts }) => {
          if (!current() || !Number.isSafeInteger(dinars) || dinars < 0 ||
              (hearts !== undefined && (!Number.isInteger(hearts) || hearts < 0 || hearts > HEART_MAX))) {
            return Promise.resolve(false);
          }
          const appliedAt = Date.now();
          return operation.apply((p) => ({
            ...p,
            dinars,
            ...(hearts === undefined ? {} : commitHearts(p, hearts, appliedAt)),
          }));
        },
      };
    },
    resetProfile: () => reset(initial),
    applyServerStats: (stats) => {
      // Capture before React can defer the updater. Invalid snapshots must not
      // consume write admission or overwrite valid persisted numbers with null.
      const xp = stats.xp, dinars = stats.dinars, streak = stats.streak;
      if ([xp, dinars, streak].some((value) => typeof value === "number" && !Number.isFinite(value))) return;
      const lastStreakDay = typeof streak === "number" ? stats.lastStreakDay : undefined;
      update((p) => {
        const now = Date.now();
        let next = p;
        let changed = false;
        if (typeof xp === "number" && xp !== p.points) {
          next = { ...next, points: Math.max(0, xp) };
          changed = true;
        }
        if (typeof xp === "number" && xp !== p.points) {
          next = { ...next, points: Math.max(0, xp) };
          changed = true;
        }
        if (typeof dinars === "number" && dinars !== (p.dinars ?? 0)) {
          next = { ...next, dinars: Math.max(0, dinars) };
          changed = true;
        }
        if (typeof streak === "number") {
          // V16: server value is authoritative and adopted verbatim. Never
          // zeroed from a client-side day derivation.
          const nextStreak = Math.max(0, Math.floor(streak));

          if (nextStreak !== next.streak) {
            next = { ...next, streak: nextStreak };
            changed = true;
          }
          // V17-04A — the streak mirror and its day travel together. Without
          // this, a server streak of N could sit next to a stale
          // `lastActiveDay`, and `deriveStreak` would render 0 in the HUD
          // while /profile rendered N.
          const day = laterDayKey(next.lastActiveDay, lastStreakDay ?? null);
          if (day !== next.lastActiveDay) {
            next = { ...next, lastActiveDay: day };
            changed = true;
          }
        }

        return changed ? next : p;
      });
    },
    grantTitle: (title) => update((p) => p.titlesEarned.includes(title) ? p : { ...p, titlesEarned: [...p.titlesEarned, title] }),
    grantArtifact: (id) => update((p) => p.artifactsFound.includes(id) ? p : { ...p, artifactsFound: [...p.artifactsFound, id] }),
    // `markAchievementEarned` removed - Achievement Engine v2 owns unlocks.
  }), [profile, profileOwner, profileEpoch, hydrated, getPersistence, capture, reset, prepareConditional, sessionCurrent, update, awardBadge, trySpendDinars]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

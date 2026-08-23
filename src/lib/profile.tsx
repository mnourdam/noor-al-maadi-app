import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActiveOwner } from "./identity/owner";
function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Day-anchored streak validation. Single source of truth used at hydrate,
 * server-sync, and any HUD read. A stored streak number is NEVER trusted
 * on its own — it must be reconciled against `lastActiveDay`.
 *   - safe:      played today
 *   - at-risk:   played yesterday, will expire at next midnight if idle
 *   - expired:   missed a full day (or never played) → streak forced to 0
 */
export type StreakStatus = "safe" | "at-risk" | "expired";
export function deriveStreak(
  storedStreak: number,
  lastActiveDay: string | null | undefined,
  now: Date = new Date(),
): { streak: number; status: StreakStatus } {
  const today = todayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = todayKey(y);
  const stored = Math.max(0, Math.floor(storedStreak || 0));
  if (lastActiveDay === today) return { streak: stored, status: "safe" };
  if (lastActiveDay === yesterday) return { streak: stored, status: "at-risk" };
  return { streak: 0, status: "expired" };
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
import { recordTrace } from "@/lib/diag-trace";

const STORAGE_KEY = "hakaya.profile.v2";

/**
 * Per-page dedup set for `loseHeartOnce`. Survives across re-renders /
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
  login: (name: string) => void;
  logout: () => void;
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
  /**
   * Merge authoritative server-side stats (admin edits, cloud reconciliation)
   * into the local profile WITHOUT discarding local-only fields. Mirrors
   * server `profiles` columns onto the local snapshot.
   */
  applyServerStats: (stats: { xp?: number | null; dinars?: number | null; hearts?: number | null; streak?: number | null }) => void;
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
function hydrateFromStorage(): ProfileState | null {
  try {
    const ownerAtHydrate = getActiveOwner();
    recordTrace("logout-audit", "profile-hydrate:initial");
    recordTrace("logout-audit", "owner:before", ownerAtHydrate);
    
    const parseSafe = (v: string | null) => {
      if (!v) return null;
      try {
        const p = JSON.parse(v);
        return { name: p.name, loggedIn: p.loggedIn, points: p.points, dinars: p.dinars };
      } catch { return "error"; }
    };

    const rawLocal = localStorage.getItem(STORAGE_KEY);
    let rawLegacy = null;
    try {
      // @ts-ignore
      const originalGet = (Storage.prototype as any).__originalGetItem || localStorage.getItem;
      rawLegacy = originalGet.call(localStorage, STORAGE_KEY);
    } catch (e) {}
    const rawSession = sessionStorage.getItem(STORAGE_KEY);

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
            data: parsedData
          }));
          
          // SANITIZE: Remove the polluted physical key from the specific store it was found in.
          // We don't want to destroy the profile entirely if it has progress, but 'loggedIn: true'
          // is an invalid state for a guest. However, since the user's audit shows Account A data
          // was written here, we must prioritize isolation.
          if (rawLocal) {
            localStorage.removeItem(STORAGE_KEY);
            recordTrace("logout-audit", "PROFILE_GUEST_SANITIZED", JSON.stringify({ key: STORAGE_KEY, store: "localStorage" }));
          }
          if (rawSession) {
            sessionStorage.removeItem(STORAGE_KEY);
            recordTrace("logout-audit", "PROFILE_GUEST_SANITIZED", JSON.stringify({ key: STORAGE_KEY, store: "sessionStorage" }));
          }
          
          return null; // Force reset to initial
        }
      } catch (e) {}
    }

    recordTrace("logout-audit", "PROFILE_HYDRATION_SOURCE", JSON.stringify({
      owner: ownerAtHydrate,
      source: finalSource,
      logicalKey: STORAGE_KEY,
      physicalKey: rawLocal ? "mapped-by-partition" : STORAGE_KEY,
      data: parsedData
    }));

    if (!finalRaw) return null;
    const parsed = JSON.parse(finalRaw);
    
    let merged: ProfileState = {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...(parsed.settings ?? {}) },
    };
    const derived = deriveStreak(merged.streak, merged.lastActiveDay);
    if (derived.streak !== merged.streak) {
      merged = { ...merged, streak: derived.streak };
    }
    return merged;
  } catch (e) {
    recordTrace("logout-audit", "profile-hydrate:error", (e as Error).message);
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(initial);
  const [hydrated, setHydrated] = useState(false);
  const profileOwnerRef = useRef<string>(getActiveOwner());

  useEffect(() => {
    const state = hydrateFromStorage() ?? initial;
    setProfile(state);
    profileOwnerRef.current = getActiveOwner();
    setHydrated(true);
  }, []);

  // Identity switch (login / logout / account switch): the storage
  // namespace has already been repointed at the new owner, so the ONLY
  // correct state is whatever that owner has stored — never a merge with
  // the outgoing identity's in-memory profile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onIdentityChange = () => {
      const nextOwner = getActiveOwner();
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "profile-identity-event:received");
        m.recordTrace("logout-audit", "owner-at-listener", nextOwner);
        m.recordTrace("logout-audit", "ProfileProvider:onIdentityChange:start", JSON.stringify({
          beforePoints: profile.points,
          beforeName: profile.name,
          beforeLoggedIn: profile.loggedIn,
          profileOwnerRef: profileOwnerRef.current
        }));
      }).catch(() => {});

      // 1) IMMEDIATELY detach the previous owner's React profile state.
      // This prevents stale data (Account A's XP) from remaining visible
      // in the React tree while hydrateFromStorage is working.
      setProfile(initial);
      profileOwnerRef.current = nextOwner;
      
      // 2) Then hydrate the newly active owner's profile from its already-switched partition.
      const next = hydrateFromStorage() ?? initial;
      setProfile(next);

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
  }, [profile.points, profile.name, profile.loggedIn]);

  // V13 Owner-bound Persistence Effect
  useEffect(() => {
    if (!hydrated) return;
    
    const intendedOwner = profileOwnerRef.current;
    const activeOwnerAtFlush = getActiveOwner();
    
    // ROOT CAUSE MITIGATION: Never write a profile if the owner has changed.
    // If ProfileProvider is still holding Account A's state but activeOwner is Guest,
    // this guard stops the write.
    if (intendedOwner !== activeOwnerAtFlush) {
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "PROFILE_WRITE_QUARANTINED", JSON.stringify({
          intendedOwner,
          activeOwner: activeOwnerAtFlush,
          reason: "owner-mismatch-during-effect",
          data: { name: profile.name, points: profile.points, loggedIn: profile.loggedIn }
        }));
      }).catch(() => {});
      return;
    }

    const started = performance.now();
    let raw = "";
    try {
      raw = JSON.stringify(profile);
      
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "PROFILE_WRITE_ATTEMPT", JSON.stringify({
          intendedOwner,
          activeOwner: activeOwnerAtFlush,
          logical: STORAGE_KEY,
          data: { name: profile.name, points: profile.points, loggedIn: profile.loggedIn }
        }));
      }).catch(() => {});

      localStorage.setItem(STORAGE_KEY, raw);
    } catch {}
    androidMeasure("profile.localStorage.write", started, { bytes: raw.length });
  }, [profile, hydrated]);

  // Live streak-expiry watcher. While the app stays open across local
  // midnight, the stored streak value would otherwise stay stale (e.g. 7)
  // even though `lastActiveDay` is now older than yesterday → expired.
  // Re-derive every 30s and on visibility change, resetting to 0 the
  // moment the day rolls over without a qualifying activity.
  useEffect(() => {
    if (!hydrated) return;
    const check = () => {
      setProfile((p) => {
        const d = deriveStreak(p.streak, p.lastActiveDay);
        if (d.status === "expired" && p.streak !== 0) {
          if (import.meta.env.DEV) {
            console.debug("[streak] live-expire", {
              today: todayKey(),
              lastActiveDay: p.lastActiveDay,
              storedStreak: p.streak,
            });
          }
          return { ...p, streak: 0 };
        }
        return p;
      });
    };
    check();
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
  }, [hydrated, profile.lastActiveDay, profile.streak]);

  const update = useCallback((fn: (p: ProfileState) => ProfileState) => setProfile((p) => {
    const started = performance.now();
    const next = fn(p);
    if (next !== p) recordAndroidAction("profile.update");
    androidMeasure("profile.update", started);
    return next;
  }), []);

  const awardBadge = useCallback((id: string) => {
    update((p) => (p.badges.includes(id) ? p : { ...p, badges: [...p.badges, id] }));
  }, [update]);

  // Latest committed profile, readable from async callbacks without stale
  // closures (used by the emblem revert path below).
  const latestProfileRef = useRef(profile);
  latestProfileRef.current = profile;

  // Premium Emblem — DURABLE, REVERTIBLE write.
  // Local state flips instantly for responsiveness, but the promise resolves
  // only once the pick is durable. On a hard failure the previous emblem is
  // restored here, so the UI can never keep an optimistic value the server
  // never accepted. See `@/lib/emblems/avatar-persistence`.
  const ctxSetAvatarDurable = useCallback(async (id: string) => {
    const previous = latestProfileRef.current.avatarId ?? null;
    if (previous === id) {
      // Re-picking the current emblem must still confirm durability (the
      // previous attempt may have been queued or lost).
      try {
        const { persistAvatarSelection } = await import("@/lib/emblems/avatar-persistence");
        return await persistAvatarSelection(id);
      } catch {
        return "failed" as const;
      }
    }
    update((p) => ({ ...p, avatarId: id }));
    let result: "synced" | "queued" | "local" | "failed" = "failed";
    try {
      const { persistAvatarSelection } = await import("@/lib/emblems/avatar-persistence");
      result = await persistAvatarSelection(id);
    } catch {
      result = "failed";
    }
    if (result === "failed") {
      update((p) => (p.avatarId === id ? { ...p, avatarId: previous ?? p.avatarId } : p));
    }
    return result;
  }, [update]);

  const ctx = useMemo<Ctx>(() => ({
    profile,
    hydrated,
    login: (name) => update((p) => ({ ...p, name: name.trim() || "صديق التاريخ", loggedIn: true })),
    logout: () => {
      import("@/lib/identity/reset").then(({ resetForIdentityChange }) => {
        resetForIdentityChange({ nextUserId: null, reason: "sign-out" });
      });
    },
    addPoints: (n) => update((p) => addPointsTo(p, n)),
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
      return addDinarsTo(
        addPointsTo(
          { ...p, investigationsCompleted: [...p.investigationsCompleted, id], streak, lastActiveDay },
          reward,
        ),
        dinarsForReward(reward),
      );
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
    completeTimeline: (id, reward) => update((p) => p.timelinesCompleted.includes(id) ? p
      : addDinarsTo(addPointsTo({ ...p, timelinesCompleted: [...p.timelinesCompleted, id] }, reward), dinarsForReward(reward))),
    completeDecision: (id, reward) => update((p) => p.decisionsCompleted.includes(id) ? p
      : addDinarsTo(addPointsTo({ ...p, decisionsCompleted: [...p.decisionsCompleted, id] }, reward), dinarsForReward(reward))),
    completeMission: (id, reward) => update((p) => p.missionsCompleted.includes(id) ? p
      : addDinarsTo(addPointsTo({ ...p, missionsCompleted: [...p.missionsCompleted, id] }, reward), dinarsForReward(reward))),
    completeCampaign: (id, reward) => update((p) => {
      if (p.campaignsCompleted.includes(id)) return p;
      return addDinarsTo(addPointsTo({ ...p, campaignsCompleted: [...p.campaignsCompleted, id] }, reward), dinarsForReward(reward));
    }),
    findArtifact: (id) => update((p) => p.artifactsFound.includes(id) ? p
      : addPointsTo({ ...p, artifactsFound: [...p.artifactsFound, id] }, 15)),
    unlockCharacter: (id) => update((p) => p.charactersUnlocked.includes(id) ? p
      : addPointsTo({ ...p, charactersUnlocked: [...p.charactersUnlocked, id] }, 20)),
    unlockRegion: (id, cost) => {
      let ok = false;
      update((p) => {
        if (p.regionsUnlocked.includes(id)) { ok = true; return p; }
        if (p.points < cost) return p;
        ok = true;
        return { ...p, regionsUnlocked: [...p.regionsUnlocked, id], points: p.points - cost };
      });
      return ok;
    },
    claimDaily: (id, reward) => {
      let ok = false;
      update((p) => {
        const today = todayKey();
        const dc = p.dailyClaimed.day === today ? p.dailyClaimed : { day: today, ids: [] };
        if (dc.ids.includes(id)) return p;
        ok = true;
        const next = addDinarsTo(addPointsTo({ ...p, dailyClaimed: { day: today, ids: [...dc.ids, id] } }, reward), dinarsForReward(reward));
        return next;
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
      if (!attemptKey) return getEffectiveHearts(profile);
      if (heartPenaltyDedup.has(attemptKey)) {
        return getEffectiveHearts(profile);
      }
      heartPenaltyDedup.add(attemptKey);
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
    addDinars: (n) => update((p) => addDinarsTo(p, n)),
    spendDinars: (n) => {
      let ok = false;
      update((p) => {
        if ((p.dinars ?? 0) < n) return p;
        ok = true;
        return { ...p, dinars: p.dinars - n };
      });
      return ok;
    },
    buyHint: (scopeKey, hintIndex, cost) => {
      let ok = false;
      update((p) => {
        const already = p.hintsPurchased?.[scopeKey] ?? 0;
        if (hintIndex < already) { ok = true; return p; } // already revealed
        if (hintIndex !== already) return p;              // must buy in order
        if ((p.dinars ?? 0) < cost) return p;
        ok = true;
        return {
          ...p,
          dinars: p.dinars - cost,
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
      try {
        const { data, error } = await supabase.rpc("my_claimed_streak_rewards");
        if (error) {
          console.error("[streak-reward] my_claimed_streak_rewards", error);
          return;
        }
        const list = Array.isArray(data) ? (data as number[]) : [];
        if (list.length === 0) return;
        update((p) => {
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

    // Phase 3A — canonical qualifying-activity call.
    recordStreakActivity: async (source, sourceId) => {
      // Local mirror first so the guest path stays instant.
      const { recordStreakActivity: rpc } = await import("./streak-activity");
      const outcome = await rpc(source, sourceId ?? null);
      if (outcome.ok !== true) {
        // Guest / offline / rpc error — fall back to local increment so UX
        // still reflects the activity. Server sync will reconcile on reconnect.
        update((p) => {
          const today = todayKey();
          if (p.lastActiveDay === today) return p;
          const y = new Date(); y.setDate(y.getDate() - 1);
          const yesterday = todayKey(y);
          const streak = p.lastActiveDay === yesterday ? p.streak + 1 : 1;
          const longestStreak = Math.max(p.longestStreak ?? 0, streak);
          return { ...p, streak, longestStreak, lastActiveDay: today };
        });
        return;
      }
      // Server authoritative — mirror totals into local state.
      update((p) => {
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
    mergeCloudSave: (cloud, extras) => setProfile((p) => {
      const union = (a: readonly string[] | undefined, b: readonly string[] | undefined): string[] => {
        const s = new Set<string>();
        for (const x of a ?? []) if (x) s.add(x);
        for (const x of b ?? []) if (x) s.add(x);
        return Array.from(s);
      };
      const numMax = (a: number | undefined, b: number | undefined, fallback = 0): number =>
        Math.max(fallback, Math.floor(a ?? fallback), Math.floor(b ?? fallback));
      const cooldowns: Record<string, number> = { ...(p.activityCooldowns ?? {}) };
      for (const [k, v] of Object.entries(cloud.activityCooldowns ?? {})) {
        cooldowns[k] = Math.max(cooldowns[k] ?? 0, Number(v) || 0);
      }
      const hints: Record<string, number> = { ...(p.hintsPurchased ?? {}) };
      for (const [k, v] of Object.entries(cloud.hintsPurchased ?? {})) {
        hints[k] = Math.max(hints[k] ?? 0, Number(v) || 0);
      }
      // Streak: cloud is authoritative but must still respect day-anchored
      // expiry. Reuse applyServerStats' semantics inline.
      const target = numMax(p.streak, cloud.streak);
      const derived = deriveStreak(p.streak, p.lastActiveDay);
      const nextStreak = derived.status === "expired" ? 0 : target;

      // Hearts: cloud value wins ONLY when it differs from the local
      // committed value; preserves regen anchor otherwise.
      //
      // Anchor rule (reinstall/second-device safety): on a fresh install
      // the local `heartsAt` is `Date.now()` (from `initial`) — newer
      // than the cloud anchor. Adopting the local anchor would silently
      // wipe accrued regeneration. When cloud carries a numeric anchor
      // that is OLDER than the local one, use the cloud anchor as the
      // starting point so the timer resumes at the correct offset.
      const cloudHearts = Math.max(0, Math.min(HEART_MAX, cloud.hearts ?? HEART_MAX));
      const localCommitted = Math.max(0, Math.min(HEART_MAX, p.hearts ?? HEART_MAX));
      const cloudAt = typeof cloud.heartsAt === "number" && Number.isFinite(cloud.heartsAt)
        ? cloud.heartsAt
        : null;
      const anchorSource: ProfileState = cloudAt !== null && cloudAt < (p.heartsAt ?? Date.now())
        ? ({ ...p, heartsAt: cloudAt } as ProfileState)
        : p;
      const heartsPatch = cloudHearts !== localCommitted
        ? commitHearts(anchorSource, cloudHearts, Date.now())
        : { hearts: anchorSource.hearts, heartsAt: anchorSource.heartsAt };

      const dailyDay = cloud.dailyClaimed?.day && cloud.dailyClaimed.day === p.dailyClaimed?.day
        ? p.dailyClaimed.day
        : (cloud.dailyClaimed?.day ?? p.dailyClaimed?.day ?? "");
      const dailyIds = cloud.dailyClaimed?.day === p.dailyClaimed?.day
        ? union(p.dailyClaimed?.ids, cloud.dailyClaimed?.ids)
        : (cloud.dailyClaimed?.ids ?? p.dailyClaimed?.ids ?? []);

      return {
        ...initial,
        ...p,
        ...cloud,
        // Scalars: max so a stale cloud push never regresses local.
        points: numMax(p.points, cloud.points),
        // seasonPoints removed in Phase 3B
        dinars: numMax(p.dinars, cloud.dinars, STARTING_DINARS),
        streak: nextStreak,
        hearts: heartsPatch.hearts,
        heartsAt: heartsPatch.heartsAt,
        // Union all progression arrays. Include the server sticky
        // campaign completions ledger so a returning device that never
        // pushed the fact cannot drop it.
        storiesOpened: union(p.storiesOpened, cloud.storiesOpened),
        storiesRead: union(p.storiesRead, cloud.storiesRead),
        savedStories: union(p.savedStories, cloud.savedStories),
        puzzlesSolved: union(p.puzzlesSolved, cloud.puzzlesSolved),
        whoSolved: union(p.whoSolved, cloud.whoSolved),
        badges: union(p.badges, cloud.badges),
        unlockedEras: union(p.unlockedEras, cloud.unlockedEras),
        investigationsCompleted: union(p.investigationsCompleted, cloud.investigationsCompleted),
        timelinesCompleted: union(p.timelinesCompleted, cloud.timelinesCompleted),
        decisionsCompleted: union(p.decisionsCompleted, cloud.decisionsCompleted),
        missionsCompleted: union(p.missionsCompleted, cloud.missionsCompleted),
        campaignsCompleted: union(
          union(p.campaignsCompleted, cloud.campaignsCompleted),
          extras?.stickyCampaignIds,
        ),
        artifactsFound: union(p.artifactsFound, cloud.artifactsFound),
        charactersUnlocked: union(p.charactersUnlocked, cloud.charactersUnlocked),
        regionsUnlocked: union(p.regionsUnlocked, cloud.regionsUnlocked),
        titlesEarned: union(p.titlesEarned, cloud.titlesEarned),
        streakMilestonesClaimed: Array.from(new Set([
          ...(p.streakMilestonesClaimed ?? []),
          ...(cloud.streakMilestonesClaimed ?? []),
        ])).sort((a, b) => a - b),
        activityCooldowns: cooldowns,
        hintsPurchased: hints,
        dailyClaimed: { day: dailyDay, ids: dailyIds },
        settings: { ...initial.settings, ...(p.settings ?? {}), ...(cloud.settings ?? {}) },
      } as ProfileState;
    }),
    resetProfile: () => setProfile(initial),
    applyServerStats: (stats) => update((p) => {
      const now = Date.now();
      let next = p;
      let changed = false;
      if (typeof stats.xp === "number" && stats.xp !== p.points) {
        next = { ...next, points: Math.max(0, stats.xp) };
        changed = true;
      }
      if (typeof stats.dinars === "number" && stats.dinars !== (p.dinars ?? 0)) {
        next = { ...next, dinars: Math.max(0, stats.dinars) };
        changed = true;
      }
      if (typeof stats.streak === "number") {
        // Streak is day-anchored locally. Server value is NEVER trusted
        // on its own — if local `lastActiveDay` says the streak has
        // expired (player missed a full day), force 0 regardless of
        // what the server echoes. Otherwise:
        //   - safe (played today):    keep max(local, server) so admin
        //                             grants raise it but stale realtime
        //                             echoes can't lower it.
        //   - at-risk (yesterday):    accept server value.
        const target = Math.max(0, Math.floor(stats.streak));
        const derived = deriveStreak(p.streak, p.lastActiveDay);
        let nextStreak: number;
        if (derived.status === "expired") {
          nextStreak = 0;
        } else if (derived.status === "safe") {
          nextStreak = Math.max(p.streak, target);
        } else {
          nextStreak = target;
        }
        if (import.meta.env.DEV) {
          console.debug("[streak] applyServerStats", {
            today: todayKey(),
            lastActiveDay: p.lastActiveDay,
            storedStreak: p.streak,
            serverStreak: target,
            computedStreak: nextStreak,
            reason: derived.status,
          });
        }
        if (nextStreak !== p.streak) {
          next = { ...next, streak: nextStreak };
          changed = true;
        }
      }





      if (typeof stats.hearts === "number") {
        // The server stores only the last *committed* hearts value — it has
        // no notion of elapsed-time regeneration. Compare against the local
        // committed `p.hearts` (NOT the effective regen-aware value); if
        // they match, the server is just echoing what we already have and
        // we MUST preserve the local `heartsAt` anchor so an in-flight
        // regeneration timer keeps ticking across launches and realtime
        // syncs. Only apply a true admin-side change.
        const target = Math.max(0, Math.min(HEART_MAX, stats.hearts));
        const localCommitted = Math.max(0, Math.min(HEART_MAX, p.hearts ?? HEART_MAX));
        if (target !== localCommitted) {
          next = { ...next, ...commitHearts(p, target, now) };
          changed = true;
        }
      }

      return changed ? next : p;
    }),
    grantTitle: (title) => update((p) => p.titlesEarned.includes(title) ? p : { ...p, titlesEarned: [...p.titlesEarned, title] }),
    grantArtifact: (id) => update((p) => p.artifactsFound.includes(id) ? p : { ...p, artifactsFound: [...p.artifactsFound, id] }),
    // `markAchievementEarned` removed - Achievement Engine v2 owns unlocks.
  }), [profile, hydrated, update, awardBadge]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  seasonPoints: number;
  seasonClaimed: boolean;
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
  seasonPoints: 0,
  seasonClaimed: false,
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
  claimSeason: (reward: number, title?: string, dinars?: number, artifact?: string) => boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
  todayDailyIds: () => string[];
  setBio: (bio: string) => void;
  setFavorites: (patch: { favoriteStateId?: string; favoriteFigureId?: string }) => void;
  setAvatar: (id: string) => void;
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
  claimStreakMilestone: (days: number) => Promise<boolean>;
  availableStreakMilestones: () => StreakMilestone[];
  /** Fetch already-claimed streak milestones from the server and merge locally. */
  hydrateClaimedStreakRewards: () => Promise<void>;
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
  return { ...p, points: p.points + n, seasonPoints: p.seasonPoints + Math.max(0, n) };
}

function addDinarsTo(p: ProfileState, n: number): ProfileState {
  return { ...p, dinars: Math.max(0, (p.dinars ?? 0) + n) };
}

/** Dinar award proportional to XP reward for an activity (floor reward/4, min 1). */
function dinarsForReward(xp: number): number {
  if (xp <= 0) return 0;
  return Math.max(1, Math.floor(xp / 4));
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        let merged: ProfileState = {
          ...initial,
          ...parsed,
          settings: { ...initial.settings, ...(parsed.settings ?? {}) },
        };
        // Passive streak expiry: if the player missed an entire calendar day
        // since their last active day, the streak must reset to 0 — even if
        // they don't open a screen that calls touchStreak immediately. This
        // keeps the HUD honest the moment the app boots.
        // Passive streak expiry: streak is derived, never trusted as a
        // stored number. If the last active day is older than yesterday
        // (or missing entirely), force streak to 0 BEFORE first paint so
        // the HUD never flashes a stale value.
        const derived = deriveStreak(merged.streak, merged.lastActiveDay);
        if (derived.streak !== merged.streak) {
          merged = { ...merged, streak: derived.streak };
        }
        if (import.meta.env.DEV) {
          console.debug("[streak] hydrate", {
            today: todayKey(),
            lastActiveDay: merged.lastActiveDay,
            storedStreak: parsed.streak,
            computedStreak: derived.streak,
            reason: derived.status,
          });
        }
        setProfile(merged);
      }
    } catch {}
    setHydrated(true);
  }, []);





  useEffect(() => {
    if (!hydrated) return;
    const started = performance.now();
    let raw = "";
    try {
      raw = JSON.stringify(profile);
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

  const ctx = useMemo<Ctx>(() => ({
    profile,
    login: (name) => update((p) => ({ ...p, name: name.trim() || "صديق التاريخ", loggedIn: true })),
    logout: () => setProfile(initial),
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
    claimSeason: (reward, title, dinars, artifact) => {
      let ok = false;
      update((p) => {
        if (p.seasonClaimed) return p;
        ok = true;
        let np: ProfileState = {
          ...p,
          seasonClaimed: true,
          titlesEarned: title && !p.titlesEarned.includes(title) ? [...p.titlesEarned, title] : p.titlesEarned,
          artifactsFound: artifact && !p.artifactsFound.includes(artifact) ? [...p.artifactsFound, artifact] : p.artifactsFound,
        };
        np = addPointsTo(np, reward);
        if (dinars) np = addDinarsTo(np, dinars);
        return np;
      });
      return ok;
    },
    updateSettings: (patch) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    todayDailyIds: () => dailyMissionsForDate().map((m) => m.id),
    setBio: (bio) => update((p) => ({ ...p, bio })),
    setFavorites: (patch) => update((p) => ({ ...p, ...patch })),
    setAvatar: (id) => update((p) => ({ ...p, avatarId: id })),
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
    claimStreakMilestone: async (days) => {
      const m = STREAK_MILESTONES.find((x) => x.days === days);
      if (!m) return false;
      if (profile.streak < days) return false;
      if ((profile.streakMilestonesClaimed ?? []).includes(days)) return false;
      // Server-side gate — permanent one-time claim per (user, milestone).
      try {
        const { data, error } = await supabase.rpc("claim_streak_reward", { p_days: days });
        if (error) {
          console.error("[streak-reward] claim_streak_reward", error);
          return false;
        }
        const payload = (data ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) {
          // Already claimed on another device/session — mirror locally so UI
          // never offers it again, but do NOT re-grant the reward.
          if (payload.reason === "already_claimed") {
            update((p) => (
              (p.streakMilestonesClaimed ?? []).includes(days)
                ? p
                : { ...p, streakMilestonesClaimed: [...(p.streakMilestonesClaimed ?? []), days] }
            ));
          }
          return false;
        }
      } catch (e) {
        console.error("[streak-reward] rpc failed", e);
        return false;
      }
      update((p) => {
        if ((p.streakMilestonesClaimed ?? []).includes(days)) return p;
        let np: ProfileState = {
          ...p,
          streakMilestonesClaimed: [...(p.streakMilestonesClaimed ?? []), days],
        };
        if (m.xp) np = addPointsTo(np, m.xp);
        if (m.dinars) np = addDinarsTo(np, m.dinars);
        if (m.badge && !np.badges.includes(m.badge)) np = { ...np, badges: [...np.badges, m.badge] };
        if (m.artifact && !np.artifactsFound.includes(m.artifact)) np = { ...np, artifactsFound: [...np.artifactsFound, m.artifact] };
        if (m.title && !np.titlesEarned.includes(m.title)) np = { ...np, titlesEarned: [...np.titlesEarned, m.title] };
        return np;
      });
      return true;
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

    // ============= Cloud Save bridge =============
    replaceProfile: (next) => setProfile({
      ...initial,
      ...next,
      settings: { ...initial.settings, ...(next.settings ?? {}) },
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
  }), [profile, update, awardBadge]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
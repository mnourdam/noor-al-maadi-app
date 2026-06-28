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
import { DEFAULT_AVATAR_ID } from "./avatars";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "./notifications";
import { androidMeasure, recordAndroidAction } from "./androidFreezeDiagnostics";

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
  achievementsEarned: Record<string, number>; // id -> earned-at ms epoch
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
  settings: { ambienceEnabled: false, ambienceVolume: 0.4, reduceMotion: false, notifications: true },
  bio: "",
  favoriteStateId: "",
  favoriteFigureId: "",
  avatarId: DEFAULT_AVATAR_ID,
  hearts: HEART_MAX,
  heartsAt: Date.now(),
  dinars: 50,
  activityCooldowns: {},
  streakMilestonesClaimed: [],
  hintsPurchased: {},
  achievementsEarned: {},
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
  claimStreakMilestone: (days: number) => boolean;
  availableStreakMilestones: () => StreakMilestone[];
  // Cloud-save integration
  replaceProfile: (next: ProfileState) => void;
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
  markAchievementEarned: (id: string) => boolean; // returns true if it was newly marked
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
        const last = merged.lastActiveDay;
        if (last && typeof last === "string") {
          const today = todayKey();
          const y = new Date(); y.setDate(y.getDate() - 1);
          const yesterday = todayKey(y);
          if (last !== today && last !== yesterday && merged.streak > 0) {
            merged = { ...merged, streak: 0 };
          }
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
    completeInvestigation: (id, reward) => update((p) => p.investigationsCompleted.includes(id) ? p
      : addDinarsTo(addPointsTo({ ...p, investigationsCompleted: [...p.investigationsCompleted, id] }, reward), dinarsForReward(reward))),
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
    setNotificationPrefs: (patch) => update((p) => ({
      ...p,
      settings: {
        ...p.settings,
        notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(p.settings.notificationPrefs ?? {}), ...patch },
      },
    })),

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
      const COST = 20;
      let ok = false;
      update((p) => {
        const now = Date.now();
        const eff = getEffectiveHearts(p, now);
        if (eff >= HEART_MAX) return p;
        if ((p.dinars ?? 0) < COST) return p;
        ok = true;
        return { ...p, ...commitHearts(p, eff + 1, now), dinars: p.dinars - COST };
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
    claimStreakMilestone: (days) => {
      let ok = false;
      update((p) => {
        const m = STREAK_MILESTONES.find((x) => x.days === days);
        if (!m) return p;
        if (p.streak < days) return p;
        if ((p.streakMilestonesClaimed ?? []).includes(days)) return p;
        ok = true;
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
      return ok;
    },
    availableStreakMilestones: () =>
      STREAK_MILESTONES.filter((m) => profile.streak >= m.days && !(profile.streakMilestonesClaimed ?? []).includes(m.days)),

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
        // Streak source-of-truth rule: the *day boundary* is anchored locally
        // by `lastActiveDay`, but the *count* lives on the server too. If we
        // already incremented today (lastActiveDay === today), never accept a
        // server value lower than local — that would be the server's stale
        // pre-increment row echoed back via Realtime. We still accept upward
        // corrections (e.g. admin grants). If the day boundary is older, the
        // server number is authoritative.
        const target = Math.max(0, Math.floor(stats.streak));
        const activeToday = p.lastActiveDay === todayKey();
        const nextStreak = activeToday ? Math.max(p.streak, target) : target;
        if (nextStreak !== p.streak) {
          next = { ...next, streak: nextStreak };
          changed = true;
        }
        // If the server reports a positive streak but the local day anchor
        // is missing (fresh install / cleared storage), seed lastActiveDay
        // to yesterday so the next touchStreak today extends the chain
        // (+1) instead of resetting it to 1.
        if (!activeToday && nextStreak > 0 && !p.lastActiveDay) {
          const y = new Date(); y.setDate(y.getDate() - 1);
          next = { ...next, lastActiveDay: todayKey(y) };
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
    markAchievementEarned: (id) => {
      let isNew = false;
      update((p) => {
        if (p.achievementsEarned?.[id]) return p;
        isNew = true;
        return { ...p, achievementsEarned: { ...(p.achievementsEarned ?? {}), [id]: Date.now() } };
      });
      return isNew;
    },
  }), [profile, update, awardBadge]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
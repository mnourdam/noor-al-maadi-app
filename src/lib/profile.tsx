import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayKey, dailyMissionsForDate } from "./data";

const STORAGE_KEY = "hakaya.profile.v2";

export interface AppSettings {
  ambienceEnabled: boolean;
  ambienceVolume: number; // 0..1
  reduceMotion: boolean;
  notifications: boolean;
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
  claimSeason: (reward: number, title?: string) => boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
  todayDailyIds: () => string[];
}

const ProfileContext = createContext<Ctx | null>(null);

function addPointsTo(p: ProfileState, n: number): ProfileState {
  return { ...p, points: p.points + n, seasonPoints: p.seasonPoints + Math.max(0, n) };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProfile({ ...initial, ...JSON.parse(raw), settings: { ...initial.settings, ...(JSON.parse(raw).settings ?? {}) } });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch {}
  }, [profile, hydrated]);

  const update = useCallback((fn: (p: ProfileState) => ProfileState) => setProfile((p) => fn(p)), []);

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
      : addPointsTo({ ...p, investigationsCompleted: [...p.investigationsCompleted, id] }, reward)),
    completeTimeline: (id, reward) => update((p) => p.timelinesCompleted.includes(id) ? p
      : addPointsTo({ ...p, timelinesCompleted: [...p.timelinesCompleted, id] }, reward)),
    completeDecision: (id, reward) => update((p) => p.decisionsCompleted.includes(id) ? p
      : addPointsTo({ ...p, decisionsCompleted: [...p.decisionsCompleted, id] }, reward)),
    completeMission: (id, reward) => update((p) => p.missionsCompleted.includes(id) ? p
      : addPointsTo({ ...p, missionsCompleted: [...p.missionsCompleted, id] }, reward)),
    completeCampaign: (id, reward) => update((p) => {
      if (p.campaignsCompleted.includes(id)) return p;
      return addPointsTo({ ...p, campaignsCompleted: [...p.campaignsCompleted, id] }, reward);
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
        const next = addPointsTo({ ...p, dailyClaimed: { day: today, ids: [...dc.ids, id] } }, reward);
        return next;
      });
      return ok;
    },
    claimSeason: (reward, title) => {
      let ok = false;
      update((p) => {
        if (p.seasonClaimed) return p;
        ok = true;
        return addPointsTo({
          ...p,
          seasonClaimed: true,
          titlesEarned: title && !p.titlesEarned.includes(title) ? [...p.titlesEarned, title] : p.titlesEarned,
        }, reward);
      });
      return ok;
    },
    updateSettings: (patch) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    todayDailyIds: () => dailyMissionsForDate().map((m) => m.id),
  }), [profile, update, awardBadge]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
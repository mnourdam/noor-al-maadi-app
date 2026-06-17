import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "hakaya.profile.v1";

export interface ProfileState {
  name: string;
  loggedIn: boolean;
  points: number;
  streak: number;
  lastActiveDay: string | null;
  storiesRead: string[];
  savedStories: string[];
  puzzlesSolved: string[];
  whoSolved: string[];
  badges: string[];
  unlockedEras: string[];
  // Gameplay
  investigationsCompleted: string[];
  timelinesCompleted: string[];
  decisionsCompleted: string[];
  missionsCompleted: string[];
  campaignsCompleted: string[];
  artifactsFound: string[];
  charactersUnlocked: string[];
  regionsUnlocked: string[];
}

const initial: ProfileState = {
  name: "ضيف",
  loggedIn: false,
  points: 0,
  streak: 0,
  lastActiveDay: null,
  storiesRead: [],
  savedStories: [],
  puzzlesSolved: [],
  whoSolved: [],
  badges: [],
  unlockedEras: ["seerah", "rashidun"],
  investigationsCompleted: [],
  timelinesCompleted: [],
  decisionsCompleted: [],
  missionsCompleted: [],
  campaignsCompleted: [],
  artifactsFound: [],
  charactersUnlocked: [],
  regionsUnlocked: ["hijaz"],
};

interface Ctx {
  profile: ProfileState;
  login: (name: string) => void;
  logout: () => void;
  addPoints: (n: number) => void;
  markStoryRead: (id: string) => void;
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
}

const ProfileContext = createContext<Ctx | null>(null);

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileState>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProfile({ ...initial, ...JSON.parse(raw) });
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
    addPoints: (n) => update((p) => ({ ...p, points: p.points + n })),
    markStoryRead: (id) => update((p) => {
      const read = p.storiesRead.includes(id) ? p.storiesRead : [...p.storiesRead, id];
      const points = p.storiesRead.includes(id) ? p.points : p.points + 10;
      const badges = [...p.badges];
      if (!badges.includes("first_story") && read.length >= 1) badges.push("first_story");
      if (!badges.includes("five_stories") && read.length >= 5) badges.push("five_stories");
      return { ...p, storiesRead: read, points, badges };
    }),
    toggleSavedStory: (id) => update((p) => ({
      ...p,
      savedStories: p.savedStories.includes(id) ? p.savedStories.filter((x) => x !== id) : [...p.savedStories, id],
    })),
    markPuzzleSolved: (id) => update((p) => {
      if (p.puzzlesSolved.includes(id)) return p;
      const solved = [...p.puzzlesSolved, id];
      const badges = [...p.badges];
      if (!badges.includes("first_puzzle")) badges.push("first_puzzle");
      if (!badges.includes("ten_puzzles") && solved.length >= 10) badges.push("ten_puzzles");
      return { ...p, puzzlesSolved: solved, points: p.points + 15, badges };
    }),
    markWhoSolved: (id) => update((p) => {
      if (p.whoSolved.includes(id)) return p;
      const solved = [...p.whoSolved, id];
      const badges = [...p.badges];
      if (!badges.includes("who_am_i") && solved.length >= 5) badges.push("who_am_i");
      return { ...p, whoSolved: solved, points: p.points + 20, badges };
    }),
    unlockEra: (id) => update((p) => {
      if (p.unlockedEras.includes(id)) return p;
      const eras = [...p.unlockedEras, id];
      const badges = [...p.badges];
      if (eras.length >= 10 && !badges.includes("all_eras")) badges.push("all_eras");
      return { ...p, unlockedEras: eras, badges };
    }),
    touchStreak: () => update((p) => {
      const today = todayKey();
      if (p.lastActiveDay === today) return p;
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
      const streak = p.lastActiveDay === yesterday ? p.streak + 1 : 1;
      const badges = [...p.badges];
      if (streak >= 3 && !badges.includes("streak_3")) badges.push("streak_3");
      if (streak >= 7 && !badges.includes("streak_7")) badges.push("streak_7");
      return { ...p, streak, lastActiveDay: today, badges };
    }),
    awardBadge,
    completeInvestigation: (id, reward) => update((p) => {
      if (p.investigationsCompleted.includes(id)) return p;
      return { ...p, investigationsCompleted: [...p.investigationsCompleted, id], points: p.points + reward };
    }),
    completeTimeline: (id, reward) => update((p) => {
      if (p.timelinesCompleted.includes(id)) return p;
      return { ...p, timelinesCompleted: [...p.timelinesCompleted, id], points: p.points + reward };
    }),
    completeDecision: (id, reward) => update((p) => {
      if (p.decisionsCompleted.includes(id)) return p;
      return { ...p, decisionsCompleted: [...p.decisionsCompleted, id], points: p.points + reward };
    }),
    completeMission: (id, reward) => update((p) => {
      if (p.missionsCompleted.includes(id)) return p;
      return { ...p, missionsCompleted: [...p.missionsCompleted, id], points: p.points + reward };
    }),
    completeCampaign: (id, reward) => update((p) => {
      if (p.campaignsCompleted.includes(id)) return p;
      const badges = [...p.badges];
      const list = [...p.campaignsCompleted, id];
      if (list.length >= 3 && !badges.includes("three_campaigns")) badges.push("three_campaigns");
      if (list.length >= 10 && !badges.includes("all_campaigns")) badges.push("all_campaigns");
      return { ...p, campaignsCompleted: list, points: p.points + reward, badges };
    }),
    findArtifact: (id) => update((p) => {
      if (p.artifactsFound.includes(id)) return p;
      const list = [...p.artifactsFound, id];
      const badges = [...p.badges];
      if (!badges.includes("first_artifact")) badges.push("first_artifact");
      if (list.length >= 10 && !badges.includes("ten_artifacts")) badges.push("ten_artifacts");
      return { ...p, artifactsFound: list, points: p.points + 15, badges };
    }),
    unlockCharacter: (id) => update((p) => {
      if (p.charactersUnlocked.includes(id)) return p;
      const list = [...p.charactersUnlocked, id];
      const badges = [...p.badges];
      if (!badges.includes("first_card")) badges.push("first_card");
      if (list.length >= 6 && !badges.includes("six_cards")) badges.push("six_cards");
      return { ...p, charactersUnlocked: list, points: p.points + 20, badges };
    }),
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
  }), [profile, update, awardBadge]);

  return <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
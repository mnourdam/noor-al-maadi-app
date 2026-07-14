// Daily Quest — one deterministic mission per local calendar day.
//
// Design:
//  - Mission is chosen deterministically from (localDate, userKey) so the
//    same account gets the same mission all day, and different accounts
//    get independent picks on the same device.
//  - State persists in localStorage per (userKey, localDate) so refreshes
//    and APK reopens do NOT reset progress or re-grant rewards.
//  - Progress is dispatched by call sites via `notifyQuestProgress(kind)`;
//    hooks live in the encyclopedia entity route, the game completion path
//    and the on-this-day view. Fully offline-safe: no network required.
//  - On completion we `addPoints` / `addDinars` on the profile (local +
//    cloud sync via existing profile pipeline) exactly once, then flip
//    the card to a completed state and dispatch `irth:daily-quest:completed`
//    so the UI can celebrate.

export const QUEST_UPDATED_EVENT = "irth:daily-quest:updated";
export const QUEST_COMPLETED_EVENT = "irth:daily-quest:completed";

export type QuestKind =
  | "read_article"
  | "complete_challenge"
  | "read_today_event";

export interface QuestDef {
  kind: QuestKind;
  emoji: string;
  title: string;      // Arabic mission title
  target: number;
  xp: number;
  dinars: number;
}

export interface QuestState {
  date: string;         // local YYYY-MM-DD
  kind: QuestKind;
  progress: number;
  target: number;
  xp: number;
  dinars: number;
  completed: boolean;
  rewarded: boolean;
}

const QUESTS: QuestDef[] = [
  { kind: "read_article",       emoji: "📖", title: "اقرأ مقالة موسوعية",     target: 1, xp: 10, dinars: 3 },
  { kind: "complete_challenge", emoji: "⚔️", title: "أكمل تحديًا واحدًا",       target: 1, xp: 15, dinars: 5 },
  { kind: "read_today_event",   emoji: "📅", title: "اقرأ حدث اليوم التاريخي", target: 1, xp: 8,  dinars: 2 },
];

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stableHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function storageKey(userKey: string): string {
  return `irth.daily-quest.${userKey}.v1`;
}

function readState(userKey: string): QuestState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestState;
    if (!parsed || typeof parsed !== "object" || !parsed.date) return null;
    return parsed;
  } catch { return null; }
}

function writeState(userKey: string, s: QuestState) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(QUEST_UPDATED_EVENT));
  } catch { /* ignore */ }
}

/** Pick today's quest for `userKey` — deterministic per (userKey, date). */
export function getTodayQuest(userKey: string): QuestState {
  const date = localDateKey();
  const existing = readState(userKey);
  if (existing && existing.date === date) return existing;
  const idx = stableHash(`${userKey}|${date}`) % QUESTS.length;
  const def = QUESTS[idx];
  const fresh: QuestState = {
    date,
    kind: def.kind,
    progress: 0,
    target: def.target,
    xp: def.xp,
    dinars: def.dinars,
    completed: false,
    rewarded: false,
  };
  writeState(userKey, fresh);
  return fresh;
}

export function questLabel(kind: QuestKind): { emoji: string; title: string } {
  const q = QUESTS.find((x) => x.kind === kind) ?? QUESTS[0];
  return { emoji: q.emoji, title: q.title };
}

interface ProgressResult {
  state: QuestState;
  justCompleted: boolean;
}

/** Called by the app when the user performs a quest-eligible action.
 *  Returns the updated state and whether this call flipped it to complete. */
export function advanceQuest(userKey: string, kind: QuestKind, delta = 1): ProgressResult {
  const cur = getTodayQuest(userKey);
  if (cur.kind !== kind || cur.completed) return { state: cur, justCompleted: false };
  const next: QuestState = {
    ...cur,
    progress: Math.min(cur.target, cur.progress + Math.max(1, delta)),
  };
  const justCompleted = !cur.completed && next.progress >= next.target;
  if (justCompleted) next.completed = true;
  writeState(userKey, next);
  return { state: next, justCompleted };
}

/** Mark rewards as granted so the profile is not double-credited on refresh. */
export function markQuestRewarded(userKey: string): QuestState {
  const cur = getTodayQuest(userKey);
  if (cur.rewarded) return cur;
  const next: QuestState = { ...cur, rewarded: true, completed: true };
  writeState(userKey, next);
  return next;
}

/** Fire a lightweight signal from any call site. UI listens in one place. */
export function notifyQuestProgress(kind: QuestKind, delta = 1): void {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("irth:daily-quest:progress", { detail: { kind, delta } }),
    );
  } catch { /* ignore */ }
}

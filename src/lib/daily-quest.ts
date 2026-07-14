// ============================================================
// Daily Quest — one deterministic encyclopedia-driven mission per
// local calendar day.
//
// Design highlights:
//  - The mission targets ONE specific canonical encyclopedia entity
//    picked deterministically from (userKey, localDate). Same account
//    on the same device on the same local day → same entity, always.
//  - Recent-history exclusion keeps the last 30 entities out of the
//    pool until the pool is exhausted; then it recycles.
//  - Selection is done against the offline snapshot so the quest
//    works offline. `isDisplayableEntity` guarantees only enabled,
//    canonical, content-bearing entities are picked (never archived,
//    merged, redirected, or stub rows).
//  - Completion is entity-scoped: reading a DIFFERENT article never
//    advances the quest — the target `entityId` must match.
//  - Rewards are granted exactly once via a `rewarded` flag persisted
//    in localStorage; refresh / cold restart cannot re-credit.
//  - Architecture is generic over quest kinds so we can add
//    `visit_atlas`, `read_today_event`, `complete_chapter`, etc.
// ============================================================

import {
  ensureLocalSnapshotLoaded,
  localEncyclopediaAll,
} from "@/lib/local-first-store";
import {
  isDisplayableEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";

export const QUEST_UPDATED_EVENT = "irth:daily-quest:updated";
export const QUEST_COMPLETED_EVENT = "irth:daily-quest:completed";
export const QUEST_PROGRESS_EVENT = "irth:daily-quest:progress";

/** Every kind the system knows about. Only `read_encyclopedia_entity`
 *  is currently offered; the rest are reserved so we can extend later
 *  without breaking persisted state. */
export type QuestKind =
  | "read_encyclopedia_entity"
  // Reserved for future rotations — do not remove these strings.
  | "complete_challenge"
  | "read_today_event"
  | "visit_atlas_location"
  | "complete_campaign_chapter";

export interface QuestTarget {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  entityType: string;
}

export interface QuestState {
  version: 2;
  date: string;          // local YYYY-MM-DD
  kind: QuestKind;
  target: QuestTarget | null;
  progress: number;      // 0 or 1 for read_encyclopedia_entity
  goal: number;          // usually 1
  xp: number;
  dinars: number;
  completed: boolean;
  rewarded: boolean;
}

/** Arabic type label used on the card. */
const TYPE_LABEL: Record<string, string> = {
  figure:   "شخصية",
  scholar:  "شخصية",
  state:    "دولة",
  city:     "مدينة",
  battle:   "معركة",
  event:    "حدث",
  landmark: "معلم",
  artifact: "أثر",
};

/** Types eligible for the daily read quest. */
const ELIGIBLE_TYPES = new Set<string>([
  "figure",
  "scholar",
  "state",
  "city",
  "battle",
  "event",
  "landmark",
  "artifact",
]);

const READ_QUEST_XP = 10;
const READ_QUEST_DINARS = 3;
const RECENT_HISTORY_LIMIT = 30;

// ---------- Local date + hash helpers -----------------------------

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

function stateKey(userKey: string): string {
  return `irth.daily-quest.${userKey}.v2`;
}

function historyKey(userKey: string): string {
  return `irth.daily-quest.history.${userKey}.v1`;
}

// ---------- Persistence -------------------------------------------

function readState(userKey: string): QuestState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(stateKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestState;
    if (!parsed || typeof parsed !== "object" || !parsed.date || parsed.version !== 2) return null;
    return parsed;
  } catch { return null; }
}

function writeState(userKey: string, s: QuestState) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(stateKey(userKey), JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(QUEST_UPDATED_EVENT));
  } catch { /* ignore */ }
}

function readHistory(userKey: string): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(historyKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function pushHistory(userKey: string, entityId: string): void {
  try {
    if (typeof window === "undefined") return;
    const list = readHistory(userKey).filter((x) => x !== entityId);
    list.unshift(entityId);
    while (list.length > RECENT_HISTORY_LIMIT) list.pop();
    window.localStorage.setItem(historyKey(userKey), JSON.stringify(list));
  } catch { /* ignore */ }
}

// ---------- Selection ---------------------------------------------

function eligiblePool(): SupabaseEncyclopediaEntity[] {
  const all = localEncyclopediaAll() as unknown as SupabaseEncyclopediaEntity[];
  return all.filter((e) =>
    ELIGIBLE_TYPES.has(e.entity_type) && isDisplayableEntity(e)
  );
}

/** Deterministic pick — excludes recent history until the pool is exhausted. */
function pickEntityFor(userKey: string, date: string): SupabaseEncyclopediaEntity | null {
  const pool = eligiblePool();
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const history = new Set(readHistory(userKey));
  const preferred = sorted.filter((e) => !history.has(e.id));
  const source = preferred.length > 0 ? preferred : sorted;
  const idx = stableHash(`${userKey}|${date}|read_encyclopedia_entity`) % source.length;
  return source[idx] ?? null;
}

// ---------- Public API --------------------------------------------

/** Ensure the offline snapshot is loaded before selection. */
export async function ensureQuestPoolReady(): Promise<void> {
  await ensureLocalSnapshotLoaded();
}

/** Pick today's quest for `userKey`. Deterministic per (userKey, date). */
export function getTodayQuest(userKey: string): QuestState | null {
  const date = localDateKey();
  const existing = readState(userKey);
  if (existing && existing.date === date) {
    // Guard: if the persisted target is no longer displayable (data update
    // hid the row), reselect.
    if (existing.target) {
      const all = localEncyclopediaAll() as unknown as SupabaseEncyclopediaEntity[];
      const row = all.find((e) => e.id === existing.target!.entityId);
      if (row && isDisplayableEntity(row)) return existing;
    } else {
      return existing;
    }
  }
  const entity = pickEntityFor(userKey, date);
  if (!entity) return null;
  const fresh: QuestState = {
    version: 2,
    date,
    kind: "read_encyclopedia_entity",
    target: {
      entityId: entity.id,
      entitySlug: entity.slug,
      entityTitle: entity.title,
      entityType: entity.entity_type,
    },
    progress: 0,
    goal: 1,
    xp: READ_QUEST_XP,
    dinars: READ_QUEST_DINARS,
    completed: false,
    rewarded: false,
  };
  writeState(userKey, fresh);
  pushHistory(userKey, entity.id);
  return fresh;
}

export function entityTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? "مقالة";
}

export interface QuestAdvanceResult {
  state: QuestState | null;
  justCompleted: boolean;
}

/**
 * Report meaningful reading of `entityId`. Advances only when the id
 * matches today's target. Reading a different entity is a no-op.
 */
export function reportEntityRead(userKey: string, entityId: string): QuestAdvanceResult {
  const cur = getTodayQuest(userKey);
  if (!cur || !cur.target) return { state: cur, justCompleted: false };
  if (cur.kind !== "read_encyclopedia_entity") return { state: cur, justCompleted: false };
  if (cur.target.entityId !== entityId) return { state: cur, justCompleted: false };
  if (cur.completed) return { state: cur, justCompleted: false };
  const next: QuestState = { ...cur, progress: cur.goal, completed: true };
  writeState(userKey, next);
  return { state: next, justCompleted: true };
}

/** Idempotently flip the rewarded flag once the profile has been credited. */
export function markQuestRewarded(userKey: string): QuestState | null {
  const cur = getTodayQuest(userKey);
  if (!cur) return null;
  if (cur.rewarded) return cur;
  const next: QuestState = { ...cur, rewarded: true, completed: true };
  writeState(userKey, next);
  return next;
}

// ---------- Legacy / future kinds (no-op advance) ------------------

/**
 * Kept for the older call sites (games/on-this-day). Since the current
 * daily quest is entity-scoped, these signals are silently ignored;
 * they remain part of the API so future quest rotations can consume
 * them without a second refactor.
 */
export function notifyQuestProgress(_kind: QuestKind, _delta = 1): void {
  /* reserved for future kinds — intentionally no-op today */
}

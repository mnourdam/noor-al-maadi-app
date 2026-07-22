// ============================================================
// Daily Quest — one deterministic encyclopedia-driven mission per
// local calendar day.
//
// This module owns:
//   • Selection: deterministic weighted pick per (userKey, localDate).
//     Weighting favors historically important types, rich content,
//     featured entities, and iconic battles/figures/states.
//   • Priority tiers: never-opened → opened-not-completed →
//     completed-long-ago → everything else. Falls back gracefully
//     when a tier is empty.
//   • Persistence: today's quest, per-user recommendation history,
//     and per-entity open/completion telemetry — all in localStorage.
//   • Reading gate: exports a minimum on-page dwell time consumed by
//     the entity route so quick scroll-to-bottom never completes.
//   • Reward idempotency: `rewarded` flag persists across refresh.
//
// Same account, same device, same local day → same entity, always.
// Reading a different entity is a no-op. The completion event is
// fired exactly once per (userKey, day).
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

/** Minimum time (ms) the user must dwell on the recommended article
 *  before completion is allowed. Consumed by the entity route. */
export const MIN_READ_MS = 20_000;

export type QuestKind =
  | "read_encyclopedia_entity"
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
  date: string;
  kind: QuestKind;
  target: QuestTarget | null;
  progress: number;
  goal: number;
  xp: number;
  dinars: number;
  completed: boolean;
  rewarded: boolean;
}

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

/** Type-level base weights — iconic battles, major states, and famous
 *  figures rank higher than landmarks/artifacts. Kept deterministic. */
const TYPE_WEIGHT: Record<string, number> = {
  state:    5.0,
  battle:   4.5,
  figure:   4.0,
  scholar:  3.8,
  city:     3.0,
  event:    2.8,
  landmark: 2.2,
  artifact: 2.0,
};

const ELIGIBLE_TYPES = new Set<string>(Object.keys(TYPE_WEIGHT));

const READ_QUEST_XP = 10;
const READ_QUEST_DINARS = 3;
const RECENT_HISTORY_LIMIT = 30;
/** After this many days a completed entity is considered "long ago"
 *  and re-enters the pool at a low priority. */
const COMPLETED_COOLDOWN_DAYS = 45;

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

/** Deterministic PRNG seeded from a hash — used for weighted picks. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stateKey(userKey: string): string   { return `irth.daily-quest.${userKey}.v2`; }
function historyKey(userKey: string): string { return `irth.daily-quest.history.${userKey}.v1`; }
function readsKey(userKey: string): string   { return `irth.daily-quest.reads.${userKey}.v1`; }

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

/** Skip the write when the payload is byte-identical to what's already
 *  on disk. Prevents pointless storage churn on every re-render. */
function writeState(userKey: string, s: QuestState) {
  try {
    if (typeof window === "undefined") return;
    const key = stateKey(userKey);
    const next = JSON.stringify(s);
    if (window.localStorage.getItem(key) === next) return;
    window.localStorage.setItem(key, next);
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

// ---------- Per-entity read telemetry -----------------------------
// Tracks which entities the user has opened and which they've
// completed, plus timestamps. Used by the recommendation tiering.

interface EntityRead {
  opens: number;
  lastOpenedAt: number;
  completedAt: number | null;
}
type ReadsMap = Record<string, EntityRead>;

function readReads(userKey: string): ReadsMap {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(readsKey(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ReadsMap) : {};
  } catch { return {}; }
}

function writeReads(userKey: string, map: ReadsMap): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(readsKey(userKey), JSON.stringify(map));
  } catch { /* ignore */ }
}

/** Record that the user opened an entity article. Idempotent per call. */
export function recordEntityOpen(userKey: string, entityId: string): void {
  if (!entityId) return;
  const map = readReads(userKey);
  const cur = map[entityId] ?? { opens: 0, lastOpenedAt: 0, completedAt: null };
  const now = Date.now();
  // Coalesce rapid re-opens (route re-mounts, HMR) inside a 60s window.
  if (now - cur.lastOpenedAt < 60_000 && cur.opens > 0) return;
  map[entityId] = { ...cur, opens: cur.opens + 1, lastOpenedAt: now };
  writeReads(userKey, map);
}

function markEntityCompleted(userKey: string, entityId: string): void {
  const map = readReads(userKey);
  const cur = map[entityId] ?? { opens: 1, lastOpenedAt: Date.now(), completedAt: null };
  if (cur.completedAt) return;
  map[entityId] = { ...cur, completedAt: Date.now() };
  writeReads(userKey, map);
}

// ---------- Scoring & Selection -----------------------------------

function bodyRichness(body: unknown): number {
  if (!body) return 0;
  if (typeof body === "string") return Math.min(1, body.length / 800);
  if (typeof body !== "object") return 0;
  const b = body as Record<string, unknown>;
  let n = 0;
  if (Array.isArray(b.sections)) n += b.sections.length * 0.6;
  if (Array.isArray(b.blocks))   n += b.blocks.length * 0.4;
  if (Array.isArray(b.timeline)) n += b.timeline.length * 0.2;
  if (Array.isArray(b.facts))    n += b.facts.length * 0.1;
  if (typeof b.overview === "string")     n += Math.min(1.5, b.overview.length / 500);
  if (typeof b.introduction === "string") n += Math.min(1.5, b.introduction.length / 500);
  return Math.min(6, n);
}

function isFeatured(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return m.featured === true || m.is_featured === true || m.hero === true;
}

/** Non-negative weight; higher = more likely to be picked. */
function scoreEntity(e: SupabaseEncyclopediaEntity): number {
  let w = TYPE_WEIGHT[e.entity_type] ?? 1.0;
  w += bodyRichness(e.body);                                     // rich articles
  if (typeof e.summary === "string" && e.summary.length >= 120) w += 0.6;
  if (e.image_url || e.image_path) w += 0.8;                     // has hero image
  if (isFeatured(e.metadata)) w += 3.0;                          // curator flag
  if (Array.isArray(e.aliases) && e.aliases.length > 0) w += 0.4; // recognizable
  return w;
}

/** Deterministic weighted pick from `pool` using `seed`. */
function weightedPick(
  pool: SupabaseEncyclopediaEntity[],
  weights: number[],
  seed: number,
): SupabaseEncyclopediaEntity | null {
  if (pool.length === 0) return null;
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[seed % pool.length] ?? null;
  const rand = mulberry32(seed);
  const target = rand() * total;
  let acc = 0;
  for (let i = 0; i < pool.length; i++) {
    acc += weights[i];
    if (target <= acc) return pool[i];
  }
  return pool[pool.length - 1] ?? null;
}

interface Tiered {
  neverOpened: SupabaseEncyclopediaEntity[];
  openedIncomplete: SupabaseEncyclopediaEntity[];
  completedLongAgo: SupabaseEncyclopediaEntity[];
  everything: SupabaseEncyclopediaEntity[];
}

function tierPool(pool: SupabaseEncyclopediaEntity[], reads: ReadsMap): Tiered {
  const now = Date.now();
  const cooldown = COMPLETED_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const neverOpened: SupabaseEncyclopediaEntity[] = [];
  const openedIncomplete: SupabaseEncyclopediaEntity[] = [];
  const completedLongAgo: SupabaseEncyclopediaEntity[] = [];
  for (const e of pool) {
    const r = reads[e.id];
    if (!r || r.opens === 0) neverOpened.push(e);
    else if (!r.completedAt) openedIncomplete.push(e);
    else if (now - r.completedAt >= cooldown) completedLongAgo.push(e);
  }
  return { neverOpened, openedIncomplete, completedLongAgo, everything: pool };
}

function eligiblePool(): SupabaseEncyclopediaEntity[] {
  const all = localEncyclopediaAll() as unknown as SupabaseEncyclopediaEntity[];
  return all.filter((e) =>
    ELIGIBLE_TYPES.has(e.entity_type) && isDisplayableEntity(e)
  );
}

function pickEntityFor(userKey: string, date: string): SupabaseEncyclopediaEntity | null {
  const pool = eligiblePool();
  if (pool.length === 0) return null;
  // Stable ordering so weighted picks are reproducible.
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const recent = new Set(readHistory(userKey));
  const fresh = sorted.filter((e) => !recent.has(e.id));
  const base = fresh.length > 0 ? fresh : sorted;
  const reads = readReads(userKey);
  const tiers = tierPool(base, reads);
  const seed = stableHash(`${userKey}|${date}|read_encyclopedia_entity`);
  const candidates =
    tiers.neverOpened.length > 0     ? tiers.neverOpened :
    tiers.openedIncomplete.length > 0 ? tiers.openedIncomplete :
    tiers.completedLongAgo.length > 0 ? tiers.completedLongAgo :
    tiers.everything;
  const weights = candidates.map(scoreEntity);
  return weightedPick(candidates, weights, seed);
}

// ---------- Public API --------------------------------------------

export async function ensureQuestPoolReady(): Promise<void> {
  await ensureLocalSnapshotLoaded();
}

/** Pick today's quest for `userKey`. Deterministic per (userKey, date). */
export function getTodayQuest(userKey: string): QuestState | null {
  const date = localDateKey();
  const existing = readState(userKey);
  if (existing && existing.date === date) {
    // Guard: if the persisted target is no longer displayable (snapshot
    // updated to hide the row), reselect. Otherwise return as-is — the
    // recommendation MUST NOT re-roll during the same day.
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
  markEntityCompleted(userKey, entityId);
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

/**
 * Server-authoritative completion hydrator.
 *
 * Daily Reading completion is keyed by (user_id, local_date, entity_id) —
 * the same tuple that seeds the reward's stable `delta_id`. If the server
 * shows a matching row in `applied_profile_deltas`, the quest was already
 * completed and rewarded on some prior install / device, so we upgrade
 * the local state to `completed=true, rewarded=true` silently.
 *
 * Reinstall + login therefore restores the completed-checkmark UI without
 * re-granting the reward (the stable `delta_id` primary key already
 * prevents double-grant server-side).
 */
export function markQuestCompletedAndRewardedFromServer(userKey: string): QuestState | null {
  const cur = getTodayQuest(userKey);
  if (!cur) return null;
  if (cur.completed && cur.rewarded) return cur;
  const next: QuestState = { ...cur, progress: cur.goal, completed: true, rewarded: true };
  writeState(userKey, next);
  if (cur.target?.entityId) markEntityCompleted(userKey, cur.target.entityId);
  return next;
}

// ---------- Legacy / future kinds (no-op advance) ------------------

export function notifyQuestProgress(_kind: QuestKind, _delta = 1): void {
  /* reserved for future kinds — intentionally no-op today */
}

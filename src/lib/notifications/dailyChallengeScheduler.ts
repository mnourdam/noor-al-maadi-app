// ============================================================
// Smart Daily Challenge notification scheduler (Phase 2c).
// ------------------------------------------------------------
// Replaces the legacy server-driven FCM `daily_challenge` job
// with a per-device local-notification schedule.
//
// Guarantees:
//   • Exactly ONE pending reminder at any time (fixed id 8801).
//   • Fire time falls inside the local 16:00–21:30 window.
//   • Cadence is ~every 2 days, staggered per user so not
//     everyone wakes on the same days.
//   • Deterministic — same (userKey, period) → same fireAt and
//     same message. No Math.random anywhere.
//   • No two consecutive periods reuse the same minute or the
//     same catalog entry when alternatives exist.
//   • Suppressed & immediately cancelled when the reminder is
//     no longer eligible (see SUPPRESSORS).
//   • Standard `schedule.at` — no SCHEDULE_EXACT_ALARM,
//     no USE_EXACT_ALARM, no allowWhileIdle.
//
// Web / SSR: everything is a no-op except the pure helpers,
// which are exported for unit tests.
// ============================================================

import { hash32, pickCatalogEntry, CATALOG_LENGTH } from "./dailyChallengeCatalog";
import { loadDailyChallengeState } from "@/lib/games/dailyChallengeService";
import { readCanonicalNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";


/** Fixed local-notification id — the single pending reminder. */
export const DAILY_CHALLENGE_NOTIF_ID = 8801;

/** Local-time window (minutes from midnight). Configurable in one place. */
export const WINDOW_START_MIN = 16 * 60;      // 16:00
export const WINDOW_END_MIN = 21 * 60 + 30;   // 21:30 (exclusive)
export const WINDOW_LENGTH_MIN = WINDOW_END_MIN - WINDOW_START_MIN;
/** Cadence: schedule one reminder per this many days. */
export const PERIOD_DAYS = 2;
/** Deterministic collision offset for consecutive-period minute clashes. */
const COLLISION_MINUTE_OFFSET = 37;

/** Local-storage key for the last-fired schedule metadata (no-repeat rule). */
const LAST_META_KEY = "irth.dailyChallengeReminder.lastMeta.v1";

interface LastMeta {
  userKey: string;
  period: number;
  minute: number;
  msgIdx: number;
}

// ─── Pure helpers (used by tests + runtime) ─────────────────

/**
 * Milliseconds-since-epoch → integer *local* day index. We do it
 * via getFullYear/getMonth/getDate → Date.UTC so the returned
 * integer is a stable local-calendar day (no DST/TZ drift).
 */
export function localDayIndex(nowMs: number): number {
  const d = new Date(nowMs);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * Period number for `nowMs` under `PERIOD_DAYS`, staggered per
 * user by `offset ∈ {0,1}` so users don't all cycle on the same
 * calendar day.
 */
export function periodFor(userKey: string, nowMs: number): {
  period: number;
  offset: number;
  anchorDayIndex: number;
} {
  const offset = hash32(`${userKey}|offset`) % PERIOD_DAYS;
  const day = localDayIndex(nowMs);
  const shifted = day - offset;
  const period = Math.floor(shifted / PERIOD_DAYS);
  const anchorDayIndex = period * PERIOD_DAYS + offset;
  return { period, offset, anchorDayIndex };
}

/**
 * Convert a local-day index back to that day's local-midnight ms.
 * Uses UTC year/month/day components (that's the frame the index
 * was minted in) and reconstructs a local-time midnight so DST
 * edges resolve to the device's own wall-clock 00:00.
 */
export function localMidnightOfDayIndex(dayIndex: number): number {
  const anchorUtc = new Date(dayIndex * 86_400_000);
  return new Date(
    anchorUtc.getUTCFullYear(),
    anchorUtc.getUTCMonth(),
    anchorUtc.getUTCDate(),
    0, 0, 0, 0,
  ).getTime();
}

/**
 * Compute (fireAt, minute, period, msgIdx) for the *next* reminder.
 * Deterministic + no-repeat corrected against `previous`.
 *
 * If the anchor day's slot has already passed at `nowMs`, roll
 * forward to the following period.
 */
export function computeNextSchedule(
  userKey: string,
  nowMs: number,
  previous: LastMeta | null,
): { fireAt: number; minute: number; period: number; msgIdx: number } {
  let { period, offset, anchorDayIndex } = periodFor(userKey, nowMs);

  // Candidate minute for this period.
  let minute = deriveMinute(userKey, period);
  let fireAt = localMidnightOfDayIndex(anchorDayIndex) + (WINDOW_START_MIN + minute) * 60_000;

  // If the computed fire time is already in the past for this
  // period, advance to the next period so we always schedule the
  // future.
  if (fireAt <= nowMs) {
    period += 1;
    anchorDayIndex = period * PERIOD_DAYS + offset;
    minute = deriveMinute(userKey, period);
    fireAt = localMidnightOfDayIndex(anchorDayIndex) + (WINDOW_START_MIN + minute) * 60_000;
  }

  // No-repeat correction (minute) against the *previous* period
  // of the same user.
  if (
    previous &&
    previous.userKey === userKey &&
    previous.period === period - 1 &&
    previous.minute === minute
  ) {
    minute = (minute + COLLISION_MINUTE_OFFSET) % WINDOW_LENGTH_MIN;
    fireAt = localMidnightOfDayIndex(anchorDayIndex) + (WINDOW_START_MIN + minute) * 60_000;
    // If the correction just pushed us into the past, roll one more period.
    if (fireAt <= nowMs) {
      period += 1;
      anchorDayIndex = period * PERIOD_DAYS + offset;
      minute = deriveMinute(userKey, period);
      fireAt = localMidnightOfDayIndex(anchorDayIndex) + (WINDOW_START_MIN + minute) * 60_000;
    }
  }

  const prevMsgIdx =
    previous && previous.userKey === userKey && previous.period === period - 1
      ? previous.msgIdx
      : null;
  const { idx: msgIdx } = pickCatalogEntry(userKey, period, prevMsgIdx);

  return { fireAt, minute, period, msgIdx };
}

/** Derive a minute-of-window from `(userKey, period)`. */
function deriveMinute(userKey: string, period: number): number {
  return hash32(`${userKey}|time|${period}`) % WINDOW_LENGTH_MIN;
}

/** Absolute local time (HH:MM) for a minute-of-window value. */
export function windowMinuteToClock(minute: number): { hh: number; mm: number } {
  const total = WINDOW_START_MIN + minute;
  return { hh: Math.floor(total / 60), mm: total % 60 };
}

// ─── Last-meta persistence (used for no-repeat) ─────────────

export function readLastMeta(): LastMeta | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastMeta;
    if (
      typeof parsed?.userKey === "string" &&
      Number.isInteger(parsed?.period) &&
      Number.isInteger(parsed?.minute) &&
      Number.isInteger(parsed?.msgIdx) &&
      parsed.msgIdx >= 0 &&
      parsed.msgIdx < CATALOG_LENGTH
    ) {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function writeLastMeta(meta: LastMeta): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(LAST_META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

export function clearLastMeta(): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(LAST_META_KEY); } catch { /* ignore */ }
}

// ─── Suppression ────────────────────────────────────────────

export type SuppressionReason =
  | "master_disabled"
  | "category_muted"
  | "permission_not_granted"
  | "no_published_games"
  | "todays_picks_done"
  | "all_eligible_exhausted";

export interface DailyStateShape {
  totalPublished: number;
  allEligibleExhausted: boolean;
  todaysPicksDone: boolean;
}

/**
 * Pure suppression rule — deterministic given inputs. Runtime code
 * loads the real prefs / daily state; tests inject fakes.
 * Order matters: cheapest / most-decisive first.
 */
export function evaluateSuppression(inputs: {
  prefs: NotificationPrefs;
  permissionGranted: boolean;
  dailyState: DailyStateShape | null;
}): SuppressionReason | null {
  const { prefs, permissionGranted, dailyState } = inputs;
  if (prefs.master === false) return "master_disabled";
  if (prefs.dailyChallenge === false) return "category_muted";
  if (!permissionGranted) return "permission_not_granted";
  if (dailyState) {
    if (dailyState.totalPublished === 0) return "no_published_games";
    if (dailyState.allEligibleExhausted) return "all_eligible_exhausted";
    if (dailyState.todaysPicksDone) return "todays_picks_done";
  }
  return null;
}

/**
 * Runtime wrapper — loads canonical prefs and the daily-challenge
 * state from the app's real sources, then defers to
 * `evaluateSuppression`. Failures in either loader are treated as
 * "allow" so a transient network hiccup does not silently mute
 * the reminder.
 */
export async function suppressionReason(
  opts: { permissionGranted: boolean },
): Promise<SuppressionReason | null> {
  const prefs = readCanonicalNotificationPrefs();
  let dailyState: DailyStateShape | null = null;
  try {
    const state = await loadDailyChallengeState();
    dailyState = {
      totalPublished: state.totalPublished,
      allEligibleExhausted: state.allEligibleExhausted,
      todaysPicksDone: state.todaysPicksDone,
    };
  } catch { /* content check unavailable → allow */ }
  return evaluateSuppression({ prefs, permissionGranted: opts.permissionGranted, dailyState });
}


// ─── Native bridge helpers ──────────────────────────────────

function isNativeAndroid(): boolean {
  try {
    const cap = (globalThis as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "android";
  } catch { return false; }
}

async function loadPlugin(): Promise<
  | typeof import("@capacitor/local-notifications").LocalNotifications
  | null
> {
  if (!isNativeAndroid()) return null;
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch { return null; }
}

/**
 * Check current permission WITHOUT prompting. We deliberately do
 * not call `requestPermissions()` here — Phase 2c must not add a
 * new permission prompt just for this reminder.
 */
async function checkPermissionSilently(): Promise<boolean> {
  const LN = await loadPlugin();
  if (!LN) return false;
  try {
    const res = await LN.checkPermissions();
    return res.display === "granted";
  } catch { return false; }
}

async function resolveUserKey(): Promise<string> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? "guest";
  } catch { return "guest"; }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Unconditionally cancel any pending daily-challenge reminder.
 * Safe to call on web / SSR (no-op). Idempotent.
 */
export async function cancelDailyChallenge(reason: string): Promise<void> {
  const LN = await loadPlugin();
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: DAILY_CHALLENGE_NOTIF_ID }] });
    // eslint-disable-next-line no-console
    console.log("[daily-challenge-notif] cancelled", { reason });
  } catch (err) {
    console.warn("[daily-challenge-notif] cancel failed", err);
  }
}

/**
 * Re-evaluate suppression rules and schedule (or cancel) exactly
 * one pending local reminder. Always cancels the previous entry
 * first so duplicates cannot accumulate.
 *
 * Idempotent — safe to call from every lifecycle trigger.
 */
export async function rescheduleDailyChallenge(reason: string): Promise<
  | { status: "scheduled"; fireAt: number; minute: number; period: number; msgIdx: number }
  | { status: "cancelled"; reason: SuppressionReason }
  | { status: "noop"; reason: string }
> {
  const LN = await loadPlugin();
  if (!LN) return { status: "noop", reason: "not_native_android" };

  const permissionGranted = await checkPermissionSilently();
  const suppress = await suppressionReason({ permissionGranted });

  if (suppress) {
    await cancelDailyChallenge(`suppressed:${suppress}`);
    return { status: "cancelled", reason: suppress };
  }

  const userKey = await resolveUserKey();
  const now = Date.now();
  const previous = readLastMeta();
  const { fireAt, minute, period, msgIdx } = computeNextSchedule(userKey, now, previous);
  const { message } = pickCatalogEntry(
    userKey,
    period,
    previous && previous.userKey === userKey && previous.period === period - 1
      ? previous.msgIdx
      : null,
  );

  // Always cancel the previous one first — guarantees single pending id.
  try {
    await LN.cancel({ notifications: [{ id: DAILY_CHALLENGE_NOTIF_ID }] });
  } catch { /* ignore */ }

  try {
    await LN.schedule({
      notifications: [
        {
          id: DAILY_CHALLENGE_NOTIF_ID,
          title: message.title,
          body: message.body,
          // Standard `at` scheduling — no allowWhileIdle, no exact-alarm.
          // Android may batch the delivery slightly; acceptable for a
          // natural ~2-day, 5.5-hour-window reminder.
          schedule: { at: new Date(fireAt) },
          extra: {
            type: "daily_challenge",
            category: "daily_reminder",
            deep_link: "/adventure#daily-challenges",
            local: true,
          },
        },
      ],
    });
  } catch (err) {
    console.warn("[daily-challenge-notif] schedule failed", err);
    return { status: "noop", reason: "schedule_failed" };
  }

  writeLastMeta({ userKey, period, minute, msgIdx });
  // eslint-disable-next-line no-console
  console.log("[daily-challenge-notif] scheduled", {
    reason,
    fireAt: new Date(fireAt).toString(),
    minute,
    period,
    msgIdx,
  });
  return { status: "scheduled", fireAt, minute, period, msgIdx };
}

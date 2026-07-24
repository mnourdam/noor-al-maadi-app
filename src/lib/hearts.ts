// ============================================================
// Hearts (Energy) System — shared math
// ------------------------------------------------------------
// The profile stores `hearts` (last committed value) and
// `heartsAt` (ms epoch of that commit). Effective hearts are
// derived on read so the timer works without background timers.
// ============================================================

import type { ProfileState } from "./profile";

export const HEART_MAX = 5;
export const HEART_RECOVERY_MS = 15 * 60 * 1000;        // 15 minutes per heart
export const ACTIVITY_COOLDOWN_MS = 30 * 60 * 1000;     // 30 min between activity-heals per source

/** Activity sources that may restore one heart (with cooldown). */
export type HeartActivity =
  | { kind: "today-in-history"; id: string }
  | { kind: "document"; id: string }
  | { kind: "museum-artifact"; id: string }
  | { kind: "knowledge-card"; id: string }
  | { kind: "investigation"; id: string };

export function activityKey(a: HeartActivity): string {
  return `${a.kind}:${a.id}`;
}

export function getEffectiveHearts(p: ProfileState, now: number = Date.now()): number {
  const base = Math.max(0, Math.min(HEART_MAX, p.hearts ?? HEART_MAX));
  if (base >= HEART_MAX) return HEART_MAX;
  const at = p.heartsAt ?? now;
  const elapsed = Math.max(0, now - at);
  const gained = Math.floor(elapsed / HEART_RECOVERY_MS);
  return Math.min(HEART_MAX, base + gained);
}

export function msUntilNextHeart(p: ProfileState, now: number = Date.now()): number {
  const eff = getEffectiveHearts(p, now);
  if (eff >= HEART_MAX) return 0;
  const at = p.heartsAt ?? now;
  const elapsed = Math.max(0, now - at);
  const rem = HEART_RECOVERY_MS - (elapsed % HEART_RECOVERY_MS);
  return rem === 0 ? HEART_RECOVERY_MS : rem;
}

/**
 * Compute the next committed `{ hearts, heartsAt }` after a delta-driven
 * change (lose / buy / recover). Preserves partial regeneration progress so
 * losing a heart at 4/5 while a timer is ticking does NOT reset the timer.
 *
 * Rules:
 *   - newEff clamped to [0, HEART_MAX].
 *   - At MAX: anchor = now (no active timer).
 *   - Below MAX: anchor = rolling anchor (last regen tick moment), so the
 *     in-flight regeneration interval continues unbroken across the change.
 *   - From a previously-full state, the anchor starts fresh at `now`.
 */
export function commitHearts(
  p: ProfileState,
  newEff: number,
  now: number = Date.now(),
): { hearts: number; heartsAt: number } {
  const clamped = Math.max(0, Math.min(HEART_MAX, Math.floor(newEff)));
  if (clamped >= HEART_MAX) return { hearts: HEART_MAX, heartsAt: now };
  const base = Math.max(0, Math.min(HEART_MAX, p.hearts ?? HEART_MAX));
  const at = p.heartsAt ?? now;
  if (base >= HEART_MAX) return { hearts: clamped, heartsAt: now };
  const elapsed = Math.max(0, now - at);
  const gained = Math.floor(elapsed / HEART_RECOVERY_MS);
  let rolling = at + gained * HEART_RECOVERY_MS;
  if (rolling > now || now - rolling >= HEART_RECOVERY_MS) rolling = now;
  return { hearts: clamped, heartsAt: rolling };
}

/** Format milliseconds as "MM:SS" for the next-heart timer. */
export function formatHeartTimer(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Streak milestones; idempotent claim via profile.streakMilestonesClaimed. */
export interface StreakMilestone {
  days: number;
  xp?: number;
  dinars?: number;
  badge?: string;
  artifact?: string;
  title?: string;
  label: string;
}

/**
 * Canonical Irth calendar day timezone (Phase 3A).
 * The server (`record_streak_activity`) is authoritative for whether the day
 * has been counted for authenticated users. Guest mode may still fall back to
 * device-local time because it grants no server economy rewards.
 */
export const IRTH_DAY_TIMEZONE = "Asia/Riyadh";

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3,   xp: 50,    dinars: 30,   label: "ثلاثة أيام متتالية" },
  { days: 7,   xp: 150,   dinars: 60,   badge: "streak_week",          label: "أسبوع كامل" },
  { days: 30,  xp: 500,   dinars: 200,  artifact: "streak_chronicle",  label: "شهر من الإصرار" },
  { days: 100, xp: 1500,  dinars: 500,  title: "حافظ التاريخ",         label: "مئة يوم في رحاب التاريخ" },
  { days: 365, xp: 10000, dinars: 3650, badge: "streak_year_guardian", artifact: "streak_year_chronicle", title: "حارس الإرث لعامٍ كامل", label: "سنة كاملة في حضرة التاريخ" },
];
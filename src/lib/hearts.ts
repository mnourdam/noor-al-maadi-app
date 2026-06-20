// ============================================================
// Hearts (Energy) System — shared math
// ------------------------------------------------------------
// The profile stores `hearts` (last committed value) and
// `heartsAt` (ms epoch of that commit). Effective hearts are
// derived on read so the timer works without background timers.
// ============================================================

import type { ProfileState } from "./profile";

export const HEART_MAX = 5;
export const HEART_RECOVERY_MS = 30 * 60 * 1000;        // 30 minutes per heart
export const ACTIVITY_COOLDOWN_MS = 30 * 60 * 1000;     // 30 min between activity-heals per source

/** Activity sources that may restore one heart (with cooldown). */
export type HeartActivity =
  | { kind: "today-in-history"; id: string }
  | { kind: "document"; id: string }
  | { kind: "museum-artifact"; id: string }
  | { kind: "knowledge-card"; id: string };

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

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3,   xp: 50,   dinars: 30,  label: "ثلاثة أيام متتالية" },
  { days: 7,   xp: 100,  dinars: 60,  badge: "streak_week",      label: "أسبوع كامل" },
  { days: 30,  xp: 300,  dinars: 200, artifact: "streak_chronicle", label: "شهر من الإصرار" },
  { days: 100, xp: 1000, dinars: 500, title: "حافظ التاريخ",     label: "مئة يوم في رحاب التاريخ" },
];
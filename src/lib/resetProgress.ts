// Full local gameplay/profile progress reset.
// Clears every Irth localStorage key tied to a player's progress, hearts,
// xp, dinars, streak, museum/collection unlocks, achievements, campaign
// progress, local notification inbox, onboarding gates, and guest/session
// keys. Does NOT clear admin-authored content packs (irth_admin_campaigns,
// irth_admin_backups, irth_content_registry) or device audio settings.

const PROGRESS_KEYS = [
  // Profile (xp, level, dinars, hearts, streak, achievements, badges,
  // unlocked characters/artifacts, season progress, settings, avatar, etc.)
  "hakaya.profile.v2",

  // Campaign progress + ledger
  "irth_campaign_progress",
  "campaign-unlocks",

  // Local notification inbox + dedupe + last-opened marker
  "irth.notifications.inbox.v1",
  "irth.notifications.fired.v1",
  "irth.lastOpenedAt",

  // Friend-request notification dedupe
  "irth.friends.seen.v1",
  "irth:friend-notifications:debug",

  // Opening / first-launch gates so the player gets a fresh start
  "irth.cinematic-opening.completed-version.v1",
  "irth.firstLaunch.choice.v1",

  // Offline snapshot of player data
  "irth.offline.snapshot.v1",
  "irth-offline",

  // Migration flags (re-run on next login if needed)
  "irth.orphanUnlocks.migrated.v1",

  // Pending push token bound to previous session
  "irth.pendingFcmToken",

  // Debug toggles
  "irth.debug.encyclopedia",
];

export function clearLocalPlayerProgress(): string[] {
  if (typeof window === "undefined") return [];
  const cleared: string[] = [];
  for (const k of PROGRESS_KEYS) {
    try {
      if (window.localStorage.getItem(k) !== null) {
        window.localStorage.removeItem(k);
        cleared.push(k);
      }
    } catch {
      /* ignore quota / access errors */
    }
  }
  try {
    window.dispatchEvent(new Event("irth:notifications:updated"));
  } catch {
    /* no-op */
  }
  return cleared;
}

export const RESET_PROGRESS_KEYS = PROGRESS_KEYS;

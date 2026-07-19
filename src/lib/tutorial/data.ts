// ============================================================
// Guided Tutorial — Bundled configuration
// ------------------------------------------------------------
// The single source of truth for the first-time tour. Bundled as a
// TypeScript constant (never fetched at runtime) so Android APK
// builds work fully offline.
//
// Phase 2A ships the STRUCTURAL registration only:
//   - stable step ids
//   - target ids
//   - placement/shape/padding/scroll policy
//   - `allowTargetInteraction: false` for every step
//   - `skipIfTargetUnavailable` set only for the Worlds step
//
// Final Arabic copy will be wired in a later phase; `titleKey` /
// `bodyKey` are placeholders that identify the message but are not
// rendered anywhere yet.
// ============================================================

import type { TutorialConfig } from "./types";

export const IRTH_FIRST_TIME_TUTORIAL: TutorialConfig = {
  id: "irth-first-time",
  version: 1,
  startRoute: "/",
  scope: "device",
  deferOnDeepLink: true,
  steps: [
    {
      id: "campaigns",
      targetId: "nav-campaigns",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      titleKey: "tutorial.step.campaigns.title",
      bodyKey: "tutorial.step.campaigns.body",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
    },
    {
      id: "encyclopedia",
      targetId: "nav-encyclopedia",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      titleKey: "tutorial.step.encyclopedia.title",
      bodyKey: "tutorial.step.encyclopedia.body",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
    },
    {
      id: "atlas",
      targetId: "nav-atlas",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      // Label surfaced to the player remains "الأطلس"; the route
      // itself remains `/map` and is not renamed.
      titleKey: "tutorial.step.atlas.title",
      bodyKey: "tutorial.step.atlas.body",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
    },
    {
      id: "museum",
      targetId: "nav-museum",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      titleKey: "tutorial.step.museum.title",
      bodyKey: "tutorial.step.museum.body",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
    },
    {
      id: "worlds",
      targetId: "home-worlds-section",
      route: "/",
      placement: "adaptive",
      shape: "rounded-rect",
      padding: 12,
      scroll: "into-view-smooth",
      titleKey: "tutorial.step.worlds.title",
      bodyKey: "tutorial.step.worlds.body",
      allowTargetInteraction: false,
      // Worlds query may still be loading, resolve empty, or fail;
      // the step is silently skipped in all failure modes.
      skipIfTargetUnavailable: true,
      onMissingTarget: "skip",
    },
    {
      id: "profile",
      targetId: "nav-profile",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      titleKey: "tutorial.step.profile.title",
      bodyKey: "tutorial.step.profile.body",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
    },
  ],
} as const;

/** Target-resolution window (ms). If a step's target isn't measurable
 *  within this window, the engine either waits (per `onMissingTarget`
 *  = "wait") or silently skips (per "skip"). Consumed by the engine
 *  when the locate/measure phases are wired in Phase 2B. */
export const TUTORIAL_TARGET_RESOLUTION_WINDOW_MS = 2500;

/** Frames to settle after Home mounts before the tour may start. */
export const TUTORIAL_HOME_STABLE_FRAMES = 2;

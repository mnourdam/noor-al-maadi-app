// ============================================================
// Guided Tutorial — Bundled configuration (Phase 2B.5)
// ------------------------------------------------------------
// Single source of truth for the first-time tour. Bundled as a
// TypeScript constant (never fetched at runtime) so Android APK
// builds work fully offline. Final Arabic copy is embedded here
// verbatim.
//
// Phase 2B.5 adds three metadata fields per step:
//   • enabled       — toggle steps in/out without deleting them
//   • analyticsId   — stable identifier propagated to every hook
//   • debugColor    — palette hint for future debug tooling
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
      title: "الحملات",
      body: "ابدأ رحلتك بلعب الحملات وعِش قصص الحضارات الإسلامية خطوة بخطوة.",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
      enabled: true,
      analyticsId: "tutorial_campaigns",
      debugColor: "gold",
    },
    {
      id: "encyclopedia",
      targetId: "nav-encyclopedia",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      title: "الموسوعة",
      body: "استكشف الأعلام والأحداث والأماكن، وتعمّق في تفاصيل كل حضارة.",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
      enabled: true,
      analyticsId: "tutorial_encyclopedia",
      debugColor: "blue",
    },
    {
      id: "atlas",
      targetId: "nav-atlas",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      // Player-facing label stays "الأطلس"; the underlying route
      // remains `/map` and is intentionally not renamed.
      title: "الأطلس",
      body: "تنقّل عبر خريطة إرث لتكتشف المدن والمواقع التاريخية.",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
      enabled: true,
      analyticsId: "tutorial_atlas",
      debugColor: "green",
    },
    {
      id: "museum",
      targetId: "nav-museum",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      title: "المتحف",
      body: "اجمع القطع النادرة التي تكتشفها وتفتحها بإتمام الحملات والتحديات.",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
      enabled: true,
      analyticsId: "tutorial_museum",
      debugColor: "purple",
    },
    {
      id: "worlds",
      targetId: "home-worlds-section",
      route: "/",
      placement: "adaptive",
      shape: "rounded-rect",
      padding: 12,
      scroll: "into-view-smooth",
      title: "عوالم إرث",
      body: "اختر عالماً لتبدأ منه: كل عالم يجمع حملاته وموسوعته وأطلسه ومتحفه في مكان واحد.",
      allowTargetInteraction: false,
      // Worlds query may still be loading, resolve empty, or fail;
      // the step is silently skipped in all failure modes.
      skipIfTargetUnavailable: true,
      onMissingTarget: "skip",
      enabled: true,
      analyticsId: "tutorial_worlds",
      debugColor: "orange",
    },
    {
      id: "profile",
      targetId: "nav-profile",
      route: "/",
      placement: "top",
      shape: "rounded-rect",
      padding: 8,
      scroll: "none",
      title: "حسابي",
      body: "من هنا تتابع تقدّمك ومكتشفاتك وإنجازاتك، وتضبط إعدادات حسابك.",
      allowTargetInteraction: false,
      skipIfTargetUnavailable: false,
      onMissingTarget: "wait",
      enabled: true,
      analyticsId: "tutorial_profile",
      debugColor: "red",
    },
  ],
} as const;

/** Target-resolution window (ms). */
export const TUTORIAL_TARGET_RESOLUTION_WINDOW_MS = 2500;

/** Frames to settle after Home mounts before the tour may start. */
export const TUTORIAL_HOME_STABLE_FRAMES = 2;

/** Final tutorial copy shared by the coach-mark UI (Arabic). */
export const TUTORIAL_COPY = {
  next: "التالي",
  previous: "السابق",
  skip: "تخطي",
  begin: "ابدأ الرحلة",
  skipConfirmTitle: "هل تريد تخطي الجولة؟",
  skipConfirmBody: "يمكنك دائماً إعادة اكتشاف كل شيء بنفسك.",
  skipConfirmContinue: "متابعة الجولة",
  skipConfirmSkip: "تخطي",
  stepCounter: (current: number, total: number) => `${current} / ${total}`,
} as const;

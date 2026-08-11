# Phase 1: Safe High-Impact Performance Wins

Focus: Low-risk, measurable improvements for Android/Low-end devices without visual or logic regressions.

## 1. Idle Throttling
- Move **Notification Badge Recount** in `src/routes/index.tsx` to a deeper idle slot (e.g., 3s).
- Move **Daily Facts Sync** and **Manifest Integrity Checks** in `src/routes/__root.tsx` to `requestIdleCallback` with a safe fallback.
- Defer **Discovery Feed Refresh** and **Home Summary Sync** until after home LCP using `scheduleIdle`.

## 2. Perf-Lite Hardening (GPU/CSS)
- Add `perf-lite` specific rules in `src/styles.css` to disable:
    - `backdrop-filter: blur` (replace with solid opacity colors or simpler borders).
    - `animate-ken-burns` (force `animation-play-state: paused`).
    - `blur-3xl` glows in `CommunityHubSection` and `FirstLaunchGate`.
- Modify `src/components/stories/player/KenBurns.tsx` to bypass motion logic when `perfLite` is active.

## 3. Async Image Decoding
- Update `src/components/CachedImage.tsx` to add `decoding="async"`.
- Update `src/components/encyclopedia/SafeHeroImage.tsx` and story covers to use `decoding="async"`.

## 4. Stability & Verification
- **Safety**: No virtualization or bundle splitting.
- **Benchmark**: Compare Cold Boot, Route Transition, and Scroll FPS (6x CPU Throttling).

## Technical Details
- Files: `src/routes/index.tsx`, `src/routes/__root.tsx`, `src/styles.css`, `src/components/CachedImage.tsx`.
- Mechanism: `scheduleIdle` from `src/lib/idle.ts`.

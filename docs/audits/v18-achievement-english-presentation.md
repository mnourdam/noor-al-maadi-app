# Achievement English presentation (bounded preview)

All 88 canonical title/description keys now have English display text with compile-time key parity and Arabic fallback for missing/empty English or invalid locale. Unknown keys still resolve to null. Arabic bundle values and canonical achievement definitions, IDs, predicates, reward titles, rewards, persistence and claim logic remain unchanged. Registry validation always checks Arabic canonical keys, independently of display preferences.

The shared view hook passes the reactive device UI language explicitly into pure view construction and includes it in memo dependencies. It does not change the legacy achievement locale singleton, dispatch an engine event, earn or claim anything. Confirmed museum ownership projection remains read-only. Profile detail selection now stores an ID and derives the current view from the existing map, with no stale-object fallback for a missing ID; deep-link/click/close semantics are retained.

## Scope and limits

Only achievement titles/descriptions are translated here. Category, rarity, action, reward and notification chrome remains Arabic. Existing consumers may embed these display strings in otherwise Arabic DOM; this is not accessibility-language completeness, full achievement-page translation or complete English support. The preview disclosure names this limited scope. No authored historical or sacred content is translated.

Tests mount the actual shared view hook and actual AchievementWatcher with synthetic engine and SDK boundaries. They cover reactive Arabic↔English titles, stable IDs/nontext view fields and persistence for claimed, pending-reward, unlocked and projected museum rows, no locale-triggered push/claim/notification/banner/presentation mark, and a genuine later live transition still notifying once. Resolver tests exercise key parity, invalid locale, absent/empty translation and stable canonical registry validation. Explicit nonempty secret/hidden fixtures preserve concealment in both languages.

The Profile selection change is source-reviewed, not a full mounted Profile/account-route acceptance test. No claim that the actual open Profile dialog was exercised is made. Browser, native Android, persistence restart and translation accessibility acceptance remain separate. No server, browser, production mutation or publication was performed for this slice. Fresh command results and independent review belong to the integrating coordinator.

## Reviewed integrated gates

Candidate `766cf46c` received independent source/translation review and 49/49 focused tests passed. The reviewer compared all 88 Arabic values unchanged, exact English key parity and preserved numeric thresholds. Integrated source `0d711165` passed both TypeScript projects, **1,959/1,959** offline tests across **106 files**, source-drift and whitespace checks, and a direct Android SPA compilation with synthetic loopback constants (4.50 seconds). The static build did not generate a snapshot, APK or native runtime; no release acceptance follows.

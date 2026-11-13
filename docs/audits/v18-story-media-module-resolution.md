# Story media module resolution: bundled offline artwork

Scope: isolated repair from cbda07b. No production/backend calls, content changes, image generation, uploads or resolver configuration changes.

## Finding and correction

Actual Vite build resolution (config/env/public disabled, output in memory) selected `src/lib/stories/media/url.js` for the extensionless production import. Its generated sibling shadowed the newer TypeScript implementation. Delete only that JS sibling; the same build now selects `url.ts`. No explicit imports of the JS filename were found.

After transpilation and printer normalization, the complete behavioral difference is:

1. Import `localStoryMediaPath` and return the packaged path by media ID before cache/signing in `resolveCachedStoryMediaUrl`.
2. Skip packaged IDs in `prefetchStoryMediaRows` before constructing signed fetch work.

Signing, expiration, memoization, cache keys, error handling and React hook lifecycle otherwise match. Direct `signStoryMediaUrl` remains a private-bucket signing API, not a bundled-path API. Consumers include story image/layout components, covers/export, campaign-intro warming and offline snapshot warming. This does not change direct intro signing behavior.

## Evidence

The first eight regression cases on the old module produced **2 FAIL / 6 PASS**: bundled offline resolution and bundled prefetch exclusion failed. A separate initial reproduction checked the complete packaged file list and one actual offline resolution (**1 PASS / 1 FAIL**).

Final new suite: **9 PASS**, including all **1,785** declared bundled IDs resolving locally without CacheStorage, signing or HTTP; file existence for each declared path; bundled prefetch exclusion; absent/nonbundled offline miss; cached-byte hit; signed fallback/memoization; signing-error explicit retry; nonbundled verified prefetch; and a real hook changing between distinct canonical bundled sources. SDK, CacheStorage, Image bytes and HTTP responses are synthetic test boundaries; resolver, image-cache and React hook are actual source imports.

Together with chapter bundled-image and image-cache source-contract suites: **19/19 PASS**. Outbox TypeScript validation passes. Local Bun is unavailable; pinned Bun CI remains required after reviewed publication. No browser server or device was launched.

## Boundaries

File presence and returned paths are not image decoding, editorial correctness, WebView or clean-device acceptance. No real signed token or account was accessed. The hook key remains bucket/path/processing-version, not media ID. The checked source migration declares UNIQUE(storage_bucket, storage_path) on story_media; it does not admit simultaneous different IDs for the same canonical path. Deletion/recreation across time or malformed synthetic rows may still change ID without changing the hook key; that transition is not repaired or claimed covered here. Hosted schema state is unknown. This patch activates the existing TypeScript implementation, rather than changing its lookup policy or the build's entire JS resolution order.

## Integrated local gates

At local commit `37bd1a41c69a701cf3eca541c27ab4dd8836e504` (tree `15034783b55bafd3ff7ff70b349070debeb8ab92`), both TypeScript projects and the full isolated suite passed: **1,913 tests across 100 files**. Direct Android SPA compilation also passed with environment-file loading disabled and synthetic backend constants; snapshot generation, backend requests, APK packaging and device execution were not performed. Economic ingress drift and whitespace checks passed. These follow-up resolver changes are separate from the earlier 26-file public commit `7efc7077`; remote npm/Bun/Android verification remains pending for this exact follow-up source.

# Chapter image runtime module resolution

## Reproduced runtime gap

The repository tracked both `src/lib/image-cache.js` and its newer TypeScript source. A real isolated Vite build of the ordinary extensionless import resolved **image-cache.js**, not TypeScript. The old JavaScript lacked bundled chapter-image lookup. The positive offline test therefore mapped all 637 manifest entries to existing repository files but failed when calling the actual imported `resolveImageUrl`: it returned null instead of the same-origin bundled path.

No explicit `image-cache.js` imports were found. The repair removes **only** that redundant shadow file; no global extension preference, other JavaScript files, URLs, image content or TypeScript logic changes. A second real Vite build resolves `image-cache.ts` after removal.

## Full reviewed activation scope

Normalized JavaScript emission comparison identified exactly three runtime behavior groups present in TypeScript but absent from the stale shadow:
1. Bundled chapter-image fast path before Cache Storage or HTTP.
2. `reclaimDisposableImageCaches`, used by snapshot quota recovery; only existing `irth-images*` disposable caches qualify.
3. Existing storage-budget admission/accounting/stop checks in both plain and keyed prefetch functions.

This is not merely a one-line image path correction. Tests cover all three groups. The cache hook, collector and other resolver behavior were otherwise unchanged in the normalized comparison. Earlier hero component tests exercised the extensionless JavaScript implementation of that shared cache hook; its lifecycle behavior was identical, but those tests did not prove the TypeScript-only bundled fast path or reclamation export.

## Evidence and limits

Before removal, the initial eight new tests produced **5 failures / 3 passes**. After removal, tests validate all 637 bundled path resolutions offline with no HTTP or Cache Storage access, actual `saveSnapshot` quota retry through fake IndexedDB with real reclamation, preservation of unrelated cache names/local user bytes and no database deletion, both prefetch admission controls, available-budget controls, and byte-exhaustion stop behavior allowing already-admitted workers to finish.

Focused combined resolver, hero, quota and storage-retirement suite: **38/38 PASS**. Cache Storage/network/image behavior is synthetic; repository files are checked for presence, not real browser image decoding or APK asset packaging. No backend requests, content uploads or image generation occurred.

Local Bun is unavailable after environment replacement; no package/lock installation was performed merely for parity. Existing pinned Bun CI remains required after reviewed publication. npm/Vite results are not presented as Bun or native acceptance. Other duplicate JavaScript modules remain outside this change.

Integrated local validation after the reviewed six-item feature work: both TypeScript projects PASS; 1,904/1,904 tests across 99 files PASS. This is the npm-resolved local graph. Frozen Bun, browser-lane reruns and Android compilation remain remote CI gates for the correction; no APK/device acceptance follows from these local results.

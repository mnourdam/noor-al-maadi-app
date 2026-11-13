# Encyclopedia image readiness belongs to the current source

## Reproduction

Mounted actual `EncyclopediaHero` and `SafeHeroImage` with the actual `useCachedImageSrc`/resolver and synthetic Cache Storage, fetch and detached Image events. The old parent retained a successful image readiness flag after its source changed. The cache hook also intentionally retains its preceding resolved URL during replacement resolution. Together these could hide the original fallback while the replacement was pending or unavailable offline; a captured old probe callback could also enable the replacement layout.

Baseline: **4 failures / 4 passes** across eight cases. Failing cases were pending replacement, offline uncached replacement, retired callback, and good→null→same-source transition. No live images or accounts were used.

## Narrow correction

The public hero renders a source-keyed inner instance. Each exact source owns its parent readiness state, cache-hook instance and detached probe lifetime. Changing source retires all three together. No shared cache policy, URL normalization, entity content, fallback markup, hero styling, chapter asset or storage behavior changes. The existing SafeHeroImage cancellation cleanup suppresses retired probe callbacks once its instance is unmounted.

Corrected component suite: **8/8 PASS**. Controls cover null, successful probe, failed probe, offline cache hit, and the four replacement regressions. Cache resolution code is real; Cache Storage/fetch/Image implementations are synthetic. This establishes React lifecycle and resolver behavior, not real image decoding, browser persistence across process death or APK runtime acceptance.

## Existing chapter evidence

Separately ran unchanged `tests/campaigns/chapter-image.test.ts`: **6/6 PASS** (normalization, serialization, absent/blank handling, URL discovery and storage-path mapping). Also ran unchanged `chapter-image-offline-pack.test.ts`: **4/4 PASS**. These ten tests validate metadata/collection/path behavior, NOT that every chapter image byte is downloaded or available offline. No image generation, content upload, external network request or production deployment occurred.

## Routine CI inclusion

The two unchanged chapter-image files are now explicit entries in `vitest.outbox.config.ts`, not a broad campaigns glob. The normal isolated config runs **10/10 PASS**. Their executed code paths are pure validation, JSON serialization, URL collection/path parsing and bundled path lookup. `campaign-chapter-image.ts` imports the lazy Supabase proxy but these tests never access its properties or invoke signing/upload functions; image processing and image fetching are not called. No test assertions or application source changed for this inclusion. Evidence remains metadata/path coverage, not proof of cached artwork bytes or real offline rendering.

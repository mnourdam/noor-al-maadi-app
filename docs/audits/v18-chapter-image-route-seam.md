# Imported chapter image route seam (local only)

Existing six chapter-image normalization/serialization/discovery tests and four offline path tests covered the data/resolver boundary. The imported chapter reread route test mocked `CachedImage` to null, so it did not establish that the route consumed an assigned chapter image.

The test-only extension removes that mock and runs the existing actual imported route twice: image absent, and a synthetic in-memory signed URL containing the first existing `OFFLINE_CHAPTER_IMAGE_PATHS` entry. That entry's public file must exist. Actual `CachedImage` and image-cache resolution produce the exact same-origin packaged path offline, with zero fetch and zero CacheStorage-open calls. The no-image case has no image element. No candidate image was copied, approved, converted or bound; no production campaign, snapshot, map or asset changed.

Both cases repeatedly open and close the real reading review, retain the identical unsent input node/value and current question, and preserve exact post-setup localStorage, completed activity IDs, RPC call count and reward/heart counters. Progress/ledger modules are actual; the existing ActivityRenderer remains a small controlled input stub, query/profile/router boundaries are synthetic, and the input assertion does not establish every real activity renderer's behavior. JSDOM verifies the DOM source, not pixel decoding, visual quality, actual browser navigation or Android acceptance.

Local command passed 14/14 in four suites:
`npx vitest run --config vitest.outbox.config.ts tests/offline/outbox-chapter-reread-route.test.tsx tests/campaigns/chapter-image.test.ts tests/campaigns/chapter-image-offline-pack.test.ts tests/offline/outbox-chapter-image-bundled.test.ts`

All global navigator/fetch/CacheStorage overrides are restored by the existing per-case cleanup. Candidate art approval and final offline packaging remain separate work.

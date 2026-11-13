# Private player–staff feedback images (candidate, disabled)

## Scope and status
User clarified «محادثة اللاعب مع فريق إرث، مساهمات المجتمع». This candidate targets existing `/feedback/$id` and `/admin/community` threads only. No public comment changes, new chat service, production schema/storage changes, or activation.

Picker is disabled by default (`VITE_FEEDBACK_IMAGES_ENABLED` must explicitly equal `true`). Do not enable before the storage/RPC/RLS matrix is accepted against isolated Supabase. Client mocks are not proof of server authorization. Existing `is_feedback_staff(auth.uid())` dependency must be independently verified against deployed role semantics; do not substitute a broader editor predicate.

## Implemented candidate
- Up to three images, each input at most 2 MiB. JPEG/PNG/WebP signature checks, browser decoding, maximum 24 megapixels, resize to at most 1600 pixels, JPEG re-encoding to strip metadata. No SVG or remote URL input.
- Explicit send; local preparation does not upload. Pending send has a stable message UUID and frozen attachment IDs/visibility/body. Uncertain send retries same payload, not a new message. No automatic object deletion after uncertain commit.
- Owner/epoch and current-session checks surround awaits. Unmount retires continuation. Private download validates bytes and displays a local blob URL on explicit request; no public or persisted signed URL.
- Both thread surfaces remount on identity/thread change, avoiding transfer of attachment drafts. Internal notes retain staff-only intent.
- Unapplied SQL proposal outside `supabase/migrations` creates private bucket, immutable upload reservation, size/count/rate limits, server-linked attachment submission and transactional idempotency. Object read depends on attached message visibility. No client UPDATE/DELETE policy on stored images.

## Verification
29 focused synthetic tests passed (including mounted renderer retirement, blob URL revocation and actual player-thread lifecycle): magic/size/type validation, path allowlist, successful send, immutable retry, upload failure/conflict, foreign reservation path, account ABA, session mismatch, unmount, private download validation; mounted composer text/image/internal/repeated-send/limit flows. These use mocked Supabase and do not execute SQL or real Android image selection.

## Remaining release gates
1. Independent SQL/security review of `docs/proposals/v18-feedback-private-images.sql`, including effective bucket policies inherited from any existing permissive policies. SQL policies are additive: existing broad policies must be audited before this bucket is created.
2. Isolated real Supabase acceptance: player A/B, anonymous, explicit staff/nonstaff, owner-staff internal and external, closed/deleted issue behavior, path forgery, reservation expiry, object MIME/size, concurrent/replayed/uncertain submission, direct table attempts, removed authority, malformed input. Verify existing message RPC returns descriptors and realtime payload is adequate.
3. Server-side media decoding/re-encoding or isolated scanning before wider rollout. Bucket metadata checks enforce declared type/size but are not a trusted binary-content scanner; client decoding is bypassable. Renderer allows only inert raster decoding, not HTML/SVG execution.
4. Real object-byte cleanup remains an activation gate. Synthetic PostgreSQL now verifies the unchanged account-purge message→issue→auth deletion order no longer fails on new FKs. Message/issue/uploader cascades retire authorization metadata and a trigger durably queues paths for Storage API deletion. A dormant cleanup primitive removes bytes through the API before queue acknowledgement, preserves errors, and supports retries. Random-ID tombstones contain no owner/thread/path/content and prevent cleanup from deleting a later object under a reused path. A privileged expiry function can retire >1-hour uncommitted reservations, but no schedule, credentials or live worker is installed. This does NOT prove actual byte erasure or solve in-flight uploads racing deletion: a real Storage integration must verify late-upload handling/reconciliation, deletion completion reporting, retention deadlines, service-role execution and exhausted retries before activation. Never call SQL `DELETE storage.objects` a byte deletion.
5. Actual mobile picker/cancel/retry, image quality, screenreader labels, app restart, upload on slow network, and private download tests. No offline upload queue; files/draft not persisted across restart.
6. Existing text-only send remains legacy behavior; no claim of text-message idempotency. Feature is attachment-enabled existing conversations, not attachments in the initial issue creation form.


## Deletion correction evidence
Original proposed NO ACTION FK was reproduced in synthetic PostgreSQL: `DELETE feedback_messages WHERE author_id=...` failed with SQLSTATE23503. Revised proposal runs 22 checks in PGlite (actual PostgreSQL engine with synthetic auth/storage metadata schemas), including private read denial, role contract, internal visibility, idempotent response, message/issue/uploader cascades, queue ACL and retired ID reuse. It explicitly verifies object metadata rows still remain: no Storage byte service exists in this fixture. This tests the relevant purge sequence, not every table of the deployed purge service or its effective catalog.

`node --test tests/sql/feedback-private-images/cleanup.test.mjs` passes six mocked cleanup cases. The primitive has no credentials, CLI entry point, scheduler or production URL. No account deletion was performed outside the in-memory fixture.

To repeat the PostgreSQL fixture, install pinned `@electric-sql/pglite@0.3.14` in an isolated tools directory (not the app lockfile), then run:

```
PGLITE_MODULE=/absolute/path/to/tools/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/feedback-private-images/acceptance.mjs
```

`PGLITE_MODULE` is a trusted local tool dependency path, never user image metadata. No database URL or credential is accepted by this fixture.


## Historical feedback regression checks
Three actual mounted player-route tests preserve text-only legacy attribution (including owner-authored rows historically labeled admin), staff reply/player follow-up, close→rating, identity draft retirement and deep-linked thread IDs. The new image submit inserts into the existing `feedback_messages` table, leaving its existing notification trigger path unchanged. These client/metadata tests do not prove actual external push delivery, staff notification/deep-link transport, or deployed moderation/role behavior; that full lifecycle stays in real Supabase/mobile acceptance. No existing historical bug is asserted to be currently deployed.

## Recovery validation

The local candidate was restored after workspace loss. SQL proposal, cleanup implementation and SQL test sources were recovered from retained source; renderer/thread tests and client sources were transcribed from retained text. The API-test prefix was retained but its remaining cases were reconstructed; composer tests were newly reconstructed. The post-validation scope guard was reapplied. This is a new review candidate, not a claim of byte-identical restoration of the earlier commit. Fresh restored checks passed 27/27 focused, both TypeScript projects, 1,868 aggregate tests, 22 synthetic PostgreSQL checks and six cleanup checks. Two additional focused regressions now explicitly cover A→B→A identity retirement and non-conflict upload failure; their focused result and updated aggregate must be verified separately.

## Reconstructed integrated gates

Fresh independent review cleared the recovered client/source and the added ABA/upload-error controls. At integrated local `f8bf7c1fb2dbf093d99f70d5bf5bd53b349bc4a3` (tree `68f47684cf34fb3f227e90b3f9921565529dc1c0`), both TypeScript projects and **1,948 tests across 105 files** passed, including all 29 focused community cases. The integrated fixture also passed **22 PGlite metadata checks** and **six mocked cleanup checks**. This fresh result supersedes no deployment or Storage-byte gate; UI remains off and proposal SQL remains outside automatic migrations.

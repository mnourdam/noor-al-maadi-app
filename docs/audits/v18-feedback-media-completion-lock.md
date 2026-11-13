# Disposable Storage completion-lock experiment (runtime pending)

This test-only lane leaves the application, SQL proposal, policies and cleanup worker unchanged. No hosted system or local Docker was used while authoring. The original 44-case terminal-upload contract probe remains byte-identical and runs before a separate synthetic actor/reservation. This is not a feature-activation gate clearance.

## Named-module correspondence, not whole-image attestation

Official immutable source revision: `supabase/storage@872757184c35626fef3d84f35e0b3c4fa82af1b6`.
The three input hashes and compiled hashes are recorded in `tests/sql/feedback-media-lock/reproduction.json` (historical script) and `portable-comparison.json` (current portable script). Independently reproduced exact compiled lengths/hashes match runtime observation run43407075684, artifact14026904975. The image ID/digest and all three compiled hashes are checked again at runtime. Source maps alone are insufficient; the older provenance observation remains accurately UNSUPPORTED.

The narrow supported order is uploader `await backend.uploadObject` → completion advisory lock → second authorization probe → metadata upsert. It does not establish actual physical byte persistence, entrypoint selection, every module, asynchronous orphan cleanup or full binary provenance.

Recover the following inputs from immutable URLs, not vendor scripts:
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/storage/uploader.ts
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/storage/database/pg.ts
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/internal/hashing/string-to-int.ts
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/tsconfig.json
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/build.js
- https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/package-lock.json

The captured official lock text (with one final newline) SHA256 is `e4f02ea3f4cee8ef4a75c476a60a57a18e10dcffb09e9fb54cdd62c87f408511`; it pins esbuild0.28.1 and the registry integrity recorded in both comparisons. Obtain this official package in a separate temporary tools directory with scripts disabled, not the application lock. `tree.json` is the JSON array of blob paths in the immutable recursive GitHub tree response, in response order, compact JSON serialization without extra spaces/newline. Its hash and config hash are guarded by the portable script. Preserve the official repository licensing for separately obtained sources; no third-party source is vendored here.

Place the three files under `src/` in a separate reproduction directory, plus exact tsconfig and tree inventory. Set `REPRO_SOURCE_ROOT`, `REPRO_ESBUILD_MODULE` (explicit installed compiler module), and `REPRO_COMPILER_LOCK` (isolated npm lock). Run the tracked `reproduce.cjs`. It checks source/config/inventory hashes, compiler version/integrity, uses custom static esbuild invocation and path rewrite matching inspected build flags, and writes only reproduction outputs. It never executes vendor build.js or target modules. Portable rerun reproduced all three exact outputs. Historical script hash is retained rather than rewritten.

## Bounded interleaving

The key is the actual unsigned32 DJB2-XOR hash of `feedback-images/<owner>/<issue>/<attachment>`, passed as one bigint. PostgreSQL lock identity is classid0/objid=unsigned hash/objsubid1. Reject pre-existing key collisions. Hold the transaction advisory lock in a separate pinned-container admin psql connection, with an idle transaction deadline. Start exactly one synthetic native PUT. Observe a sole ungranted matching lock whose PID is a Storage role session, whose wait event is advisory/Lock, whose query contains the actual lock operation, and whose blocker is the controller PID. Polling waits for this predicate; elapsed time alone is not evidence.

Only after the predicate, attempt issue retirement on an independent bounded connection (600ms lock and1200ms statement deadlines). After committed retirement, require the same waiter PID still blocked by the same granted controller lock and the upload still pending; otherwise ordering is inconclusive. Always release and verify absence of the controller lock, then await terminal upload. No triggers, native function changes, RLS changes or fabricated Storage behavior. If the waiter never appears, retirement blocks, upload times out, or HTTP failure is unknown, report UNSUPPORTED/inconclusive, not a denial or race PASS. A known permission failure and accepted upload are distinct observations; accepted late publication is not treated as safety success. Ordered acceptance is an explicit COUNTEREXAMPLE and nonzero exit. Bounded policy-denial observation can be green only with recognized absent service object, zero metadata/reservation rows and exactly one retained cleanup row. All inconsistent or lost-order outcomes remain UNSUPPORTED.

After terminal response, collect service visibility (exact synthetic bytes / recognized object absence / other), metadata count/versions, reservation count and durable queue count. Do not acknowledge the new queue, remove it, or redesign cleanup. Retention, physical orphan erasure, trusted decode, promotion fencing and deployed policies remain unresolved. Native5-second completion-lock timeout constrains the observation; no sleep-based retention claim.

## Static validation

Sixteen static/offline tests pass: key representation, invalid paths, exact three-module guard, distinct timeout/permission categories, portable script/evidence identity and narrow workflow trigger, plus mocked request wall-time kill/reap, controller-failure request cleanup, preverified SQL arguments, post-retirement waiter continuity and outcome nonvacuity. No stack/browser/server was run locally. Runtime and independent review pending for this draft.

## Wall-time and cleanup correction

Resolve and verify fixed admin-container command arguments before entering the lock interval; timed independent SQL subprocesses do not repeat Docker inspection outside their timeout. Upload runs in a separately terminable Linux child, with a parent monotonic22-second wall deadline, 4KiB IPC/evidence cap (after the inherited full response read, not a memory-allocation cap), kill and2-second reap. The service visibility read uses the same primitive with5seconds. This addresses trickled HTTP bodies that a socket-inactivity timeout alone does not bound. Controller release failure cannot skip request retirement; the first cleanup failure is retained. Explicit mocked controls cover these paths without server/network execution. The original44-case probe/setup still retains its pre-existing per-call/workflow bounds; this change does not claim to retrofit total deadlines into that older lane.

Controller fallback termination is constrained by unique application_name, PID, database, admin role and the exact still-held advisory key, never a bare PID. Two offline real-child controls additionally exercise small successful response and noncooperating sleep termination/reap; no server or network is used.

Native response diagnostics retain only fixed allowlisted code/error enum values and numeric HTTP-range statusCode. Arbitrary messages/bodies are never reported. Legacy error tags are diagnostic only and do not widen the strict known-policy classifier; unknown/legacy outcomes remain inconclusive.

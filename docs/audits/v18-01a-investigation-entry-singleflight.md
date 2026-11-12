# V18: investigation concurrency before hashing

## Trigger and cause

Remote runtime run [43181238594](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43181238594)
on `af89ae21ae704fb6390254c7152d2bcb8b7a65ae` failed one existing assertion:
`investigation: double completion shares a single live request`, with two RPC
calls instead of one. The other 1,174 cases, including the new auth-boundary
checks, passed; later CI steps were skipped. This run is not recorded as PASS.

The investigation recorder awaits session lookup, asynchronous stable-ID hashing,
and another session check before reaching saveGameplay's singleflight map. Two
invocations can overlap at entry but reach that map far enough apart for the
first operation to finish and release its slot. This is a real preparation-lifetime
concurrency gap. The auth-boundary change touches flush.ts, not this path. No
assertion is weakened and no arbitrary sleep is increased.

## Bounded repair design

Register investigation-recorder singleflight synchronously before its first await,
scoped to captured owner, identity epoch, investigation ID, normalized score and
correct-count payload. Capture caller values so mutation during preparation cannot
alter the operation. Keep the existing authentication checks and stable delta-ID
algorithm. Different payloads/owners/epochs are not equivalent operations.
Release only the matching promise when work settles. Completed results are not
cached; later intentional calls still reach the server's existing idempotency path.

This reduces concurrent duplicate requests, not a claim that client singleflight
proves exactly-once delivery. Independent devices, other tabs and sequential retry
still require server-side idempotency and valid inclusion semantics. No baseline,
reward amount, schema, backend permission, or deployment is changed. V18 remains
HOLD and production NO-GO.

## Deterministic evidence

Deferred hashing/authentication tests target the preparation gap rather than a
wall-clock timing assumption. Additional checks distinguish payloads, identity
ABA, later retry and failure cleanup. Deterministic original-source runs failed both delayed-hash and delayed-auth
regressions. The fixed source passes **98/98** across the new suite plus unchanged
gameplay and investigation suites. The new suite uses the actual recorder and
persistence with controlled identity/session and crypto dependencies; it is not
live authentication or a native-device test.

The slot is published before invoking the existing synchronous auth startup,
including reentry from an auth hook. Input getters are evaluated once by snapshot
capture, and preparation errors still return rejected promises rather than new
synchronous throws. Numeric key components retain NaN/Infinity distinctions
rather than conflating them through JSON null serialization. No existing
assertions, response interpretation, or hash algorithm were altered.

Final independent review, full tests/typecheck/build and remote CI are recorded
below after verification.

Independent source review: **CLEAR**; independently rerun initial nine cases
passed. A tenth test injects a post-slot identity-access exception after auth:
both joined callers reject, no RPC starts, and a fresh retry succeeds. Final new
suite **10/10 PASS**. Full final suite **1,185/1,185 PASS** across 47 files and
final typecheck **PASS**. Offline client/SSR build of the unchanged final source
also **PASS** (before only the extra test was appended). Diff check **PASS**.
Remote CI on this corrective commit is pending at publication.

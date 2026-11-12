# V18 public-stats transport acknowledgment

## Scope and contract

`social.ts:pushPublicStats` previously returned void on both skipped work and
completed RPCs, and ignored an RPC's returned error. It now returns a boolean:
false for a guarded skip, missing/mismatched session, returned RPC error,
malformed response, or revoked local owner/epoch/caller scope after the response.
True requires an actual awaited non-array response object with exactly null
`error` and null `data`, while the captured local request scope remains current.

The latest checked-in `sync_my_public_stats` definition
(`20260905143448_69d67dc7-08a1-40ec-a877-e59fc988f19e.sql`) RETURNS void. Its generated
TypeScript undefined return is not a runtime response. The installed real
PostgREST client was exercised with an injected local fake fetch: both HTTP 204
with empty body and HTTP 200 with JSON null produce `{data:null,error:null}`.
No local stack or hosted backend was contacted for that adapter check.

True is only an error-free void RPC completion acknowledgment, not proof that
specific public fields matched, that a balance was accepted, or that any grant
was included. The server can silently decline individual fields. False is not
proof of rollback. No new authentication request, automatic retry, status read,
backend mutation beyond the existing requested call, or economic authority is
introduced. The final scope check is local lifecycle validation, not a new SDK
session verification.

Existing canonical-count fallback, positive count override, captured profile,
transport payload, preflight session checks, and thrown RPC exception behavior
are preserved. This slice does not edit AccountProvider or wire its save guards
to the new return value; existing callers that ignore the result remain unchanged.

## Evidence

New actual-helper suite:
`tests/offline/outbox-public-stats-acknowledgment.test.ts`.

Before source change, the original suite: **21/21 failed** because the helper
provided no explicit acknowledgment result. After change and a reentrant getter
control: **22/22 pass**. Combined with the unchanged cloud writer-fence suite:
**35/35 pass**.

Cases cover error-free void success, null/undefined/array/string/missing-field/
nonvoid/error responses, foreign owner, revoked caller, absent session, auth error,
owner/ABA/caller revocation during RPC, unchanged four preflight auth reads,
canonical empty/error fallback, caller snapshot mutation and propagated transport
exceptions, plus one-time receipt-field capture and post-getter scope fencing.
RPC and canonical lookup are mocked; no real profile is read or written.

Whitespace diff check passes. Independent review cleared this source and independently ran 35/35 focused tests.
Combined final local validation with account wiring passed 1,573/1,573 tests
across 63 files, both TypeScript projects, client/SSR build and 41/41 scheduler
checks. Remote CI remains pending publication. V18 remains HOLD and production NO-GO. This is acknowledgment plumbing,
not a completed economic migration or release gate.

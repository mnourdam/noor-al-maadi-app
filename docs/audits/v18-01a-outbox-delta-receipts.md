# V18: retain profile deltas until a usable acknowledgment

## Defect and bounded repair

The actual profile_delta flush handler previously accepted any truthy `ok`.
Bodies such as `{ok:"yes"}` or `{ok:true}` could delete durable pending work
without an explicit applied/no-op acknowledgment. This is a concrete queue-loss
path, distinct from universal economic authority or server grant verification.

The daily reward classifier is now shared in the dependency-free
`src/lib/economy/profile-delta-receipt.ts`. Its accepted shapes are unchanged:
strict boolean success plus applied true, or applied false with absent reason
or already_applied. Contradictory and unknown bodies are not acknowledgments.

Only the profile_delta branch changes. Unknown/unauthenticated receipts return
fixed `profile-delta-receipt-unresolved`, a non-permanent failure. Existing attempt
bookkeeping can advance, but the operation ID and payload remain queued. Remote
receipt reasons are not promoted to permanent rejection/dead-letter authority.
Other outbox kinds and SDK error handling are unchanged. The response revision
comparison and existing post-response identity fence remain in effect.

## Evidence

New tests use real enqueueWithId, flushOutbox, peekAll, dead-letter and storage
code with fake IndexedDB/browser storage and mocked Supabase transport. There is
no substitute queue or mocked flush implementation.

The old flush failed **12 of 17 new tests**. The repaired suite passes **17/17**;
combined daily/recovery/dead-letter/new focused suites pass **146/146**.

Covered: malformed/truthy/contradictory and unauthenticated receipts stay queued
across module reload, no dead-lettering from arbitrary receipt reasons, documented
valid acknowledgments remove matching work, retry preserves the stable ID/payload,
newer same-ID replacement survives an old reply, and an account switch while
awaiting a reply does not acknowledge either owner's work.

Module reload with fake IndexedDB is not a native browser/process power-loss
claim. A validated response remains weaker than a typed backend inclusion proof:
UUID/payload conflict semantics, direct ledger writes, baseline admission and
legacy economic writers remain open. V18 remains **HOLD**, production **NO-GO**.

## Prior daily adapter result

The daily acknowledgment repair was separately verified at commit
`187180ddbf7aee31501fa04ae710859903527c86`, runtime CI
[43179521106](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43179521106)
**SUCCESS**. This shared-parser extraction must retain those passing regressions.

Final independent review, full regression/typecheck/build and branch CI results
will be recorded after verification. No live backend or player data is used.

Independent review: **CLEAR**, including separately rerun **79/79** daily and
receipt tests. Final local full suite: **1,170/1,170 PASS** across 45 files.
Application/regression typecheck, offline client/SSR build and diff check: **PASS**.
Remote branch CI is pending at publication. This slice does not close separate
identity changes occurring during the initial asynchronous auth lookup; those
require a dispatch-boundary guard rather than receipt validation.

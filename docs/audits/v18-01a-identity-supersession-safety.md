# V18 identity supersession and achievement continuation safety

Base remote: `31e7bfad2faa4f8518b8521b487c55f2c30d6a03`.

## Lifecycle defect and design

The original identity reset could finish an older Alice request after Bob had
already initialized, switch active owner back to Alice, and signal readiness.
The AccountProvider continuation guard ran after these mutations. A guest reset
could also resume a deferred sanitizer while Bob's namespace was active.

The reset lifecycle now uses a monotonically increasing request generation and
an explicit pending target. Duplicate pending requests for that target coalesce;
a request for the currently active guest does not accidentally coalesce with a
pending login. Superseded continuations stop after awaits and between externally
callable cleanup/event boundaries, before touching owner, query cache, sanitizer,
readiness or events. Only the current generation releases its pending slot.
Stale results report changed=false and the actual active owner. Existing
best-effort teardown error policy remains unchanged.

Eleven deterministic tests exercise the real owner/epoch/readiness modules with
mocked cleanup import boundaries. They cover inverse completion, login→guest,
coalescing, initialization idempotence, late query cancellation, deferred guest
sanitization, stale finalization, cache imports, owner/event reentrancy, teardown
failure policy and ABA. Bob storage/cache sentinel bytes must survive old work.
Original-source counterfactual: 10/11 fail; the best-effort error-policy case is
the unchanged passing case. Corrected lifecycle: 11/11 PASS.

## Downstream scope

Lifecycle fencing alone cannot stop an already-started achievement operation.
The achievement engine therefore binds asynchronous continuations to its reset
generation, captured identity owner/epoch and expected engine user. Late mirror,
claim, repair, baseline and delayed guest-write results are discarded rather than
being applied to a successor's state. An invalid reset target is rejected before
clearing the active mirror. In-flight and queued-work ownership must survive
reentrant callbacks as well as asynchronous completion.

Legacy guest migration admission is not redesigned: its existing pre-hydration
calling order is retained. Only continuation/cleanup is fenced; stale completion
must not remove another owner's bytes. This does not establish source provenance,
server authority, or safe handoff enrollment.

## Evidence boundaries

Tests use synthetic accounts/storage and mocked backend functions. They do not
send claims, delete accounts, migrate real progress or access a hosted backend.
Identity supersession is not cross-tab wallet CAS or economic writer admission.
No production gate, settlement, guest-handoff activation, legacy-wallet import,
SQL migration or paused cost work changed. V18 remains HOLD, P1-04/P1-05/P1-06
remain OPEN; hosted Supabase and Android force-stop acceptance remain pending.

Already-issued server requests are not canceled or undone by these client-side
fences. Server authorization and operation attribution still require independent
integration evidence; rejecting a late client result is not server transaction
isolation. Tests of engine operations stub backend calls and do not prove that
live transports retain account credentials across session transitions.

## Achievement engine regression evidence

15 focused tests PASS. They cover A/B and ABA mirror responses, same-user reset
generation, mismatch rejection preserving Bob's existing mirror/readiness,
owner-only changes, historical repair/baseline, live claim/notification, reentrant
emissions, guest delayed writes, migration cleanup and preserved pre-hydration
migration invocation, plus successor cycle-slot ownership. The original engine
fails 14/15; the unchanged legacy migration positive case passes.

Tests now use the real snapshot builder/providers. Resetting only canonical inputs
had left old snapshot/evaluation slices visible, and partial rebuilds deliberately
carry unchanged slices forward. The accepted reset now empties these derived
in-memory views alongside the existing input reset. Alice campaign/xp data cannot
carry into Bob's pending reset or later partial patch. Persisted canonical gameplay
records are not rewritten by this view reset.

Independent review found synchronous callbacks could start successor work before
an old pending-slot assignment. Assignments and finalizers are both ownership
checked. Removing only the assignment guards makes the dedicated successor-queue
regression fail (Bob's campaign update is lost). This is distinct from the tests
of asynchronously delayed finalizers.

## Final local checks

- Full isolated outbox/startup suite: 1,074 tests / 42 files PASS.
- Mocked scheduler: 41/41 PASS.
- Original Bun identity suite: 10/10 PASS, 149 assertions.
- Full application and outbox typecheck: PASS, exit 0.
- Offline client/SSR build: PASS, exit 0.
- `git diff --check`: PASS.

Independent cross-review found the pending-slot issue described above; after
repair, no additional introduced engine blocker was found. This review did not
certify backend authorization, economic settlement or device behavior.

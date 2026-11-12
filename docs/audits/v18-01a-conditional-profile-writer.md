# V18 conditional profile persistence receipt

## Contract

`useProfileWriter.prepareConditional()` captures this provider's readable frame,
identity epoch/generation and admission sequence. It returns a pre-apply
`current()` check and a single-use `apply(change): Promise<boolean>` capability.
The change callback must be a pure React updater: React may evaluate it more
than once. The capability is not cross-tab CAS, a backend authorization, a grant
receipt, or economic admission.

Apply reserves its own admission ticket. The functional updater checks that
exact ticket and the captured frame snapshot again before computing a new value.
A reducer never resolves a promise or publishes an event. Instead immutable
attempt metadata travels in the frame. Only the matching committed frame's
successful localStorage persistence effect with exact serialized readback can resolve true.
Nonthrowing setItem alone is insufficient because the real partition adapter can
silently quarantine a guest write. Generic writer persistence behavior is unchanged.

False means unresolved, NOT rollback. A remote action or local write may already
have happened. No caller may infer that retrying a non-idempotent purchase is safe.
`current()` is a pre-apply guard and becomes false when consumed; callers need
separate identity/lifecycle checks after awaiting apply.

## Rejection and lifecycle

Intervening admitted writes, reset, hydrate, owner changes and unmount settle
outstanding work false. A rejected updater records an immutable rejection marker
without changing the profile value, snapshot or revision, and retains a previous
queued frame's requested persistence. This covers an ordinary update queued
before capability capture but not rendered yet.

A 10-second bounded timeout settles otherwise suspended work false and revokes
only its own still-current admission ticket. Every settlement clears its timer.
Persistence failures settle false and retain the existing error-boundary throw.
This does not add disk fsync, transactional rollback, durable purchase retry,
server reconciliation or coordination between providers/devices.

## Evidence

`tests/offline/outbox-profile-conditional-writer.test.tsx`: **19/19 PASS**.
Tests use the actual writer and React StrictMode. Cases cover matching persisted
confirmation, single use, intervening admission, queued-before-capture rejection
with prior-write durability/revision preservation, deferred supersession,
owner/ABA/reset/hydrate/unmount, reducer exceptions, write failure, suspended
expiry, newer conditional token ownership, identity change during storage write,
unreadable input, nonthrowing storage no-op, mismatched readback, identity reentry
during readback, and actual guest-partition quarantine. No live backend or user data is used.

No prior version exposes this capability, so no before-fix production behavior
is claimed from this primitive's tests. Heart hook/provider integration has its
own regression evidence. Independent review and full checks remain pending.
V18 HOLD and production NO-GO remain unchanged.

Independent adversarial review: **CLEAR**. Review caught and corrected the
nonthrowing partition-quarantine gap before publication: conditional success
requires exact serialized readback plus identity/ticket checks. Actual partition
quarantine, no-op storage, mismatched bytes and identity reentry tests are included.
The authenticated proof does not extend to the unchanged guest reducer.

Final local validation: **1323/1323 tests across 53 files PASS**, both TypeScript
projects PASS, client/SSR build PASS. Initial typecheck caught five new test-only
implicit-any annotations; these were corrected and the full sequence rerun.
No production-source change or removed assertion was needed. Remote branch CI
is pending for this source commit. This is not release/deployment approval.

# V18: finite guards for legacy spending methods

## Bounded repair

`spendDinars(NaN)` and `buyHint(scope, nextIndex, NaN)` previously passed
less-than affordability checks, then persisted NaN as JSON null. Negative Infinity
and subtraction of a large finite negative cost can similarly persist Infinity
as null. A new hint purchase can also advance its count alongside that corruption.

spendDinars now rejects nonfinite cost before update admission. Both methods
require the prospective subtraction result to be finite before changing state
or setting their internal success flag. buyHint validates cost after the existing
already-revealed and sequential-index branches, preserving those decisions.

Finite negatives and zero retain their historical behavior. Prohibiting negative
costs is a separate monetary policy, not part of this repair. trySpendDinars is
untouched. The legacy methods' boolean return depends on React eager/deferred
updater timing and remains unchanged; this patch does not redesign payment APIs.
In particular, StrictMode tests observe false before an already-owned hint's
updater executes, both before and after this patch.

Invalid new buyHint calls, and rejected computed results, can still consume the
writer's admission sequence. Tests assert unchanged state, bytes and persistence
receipt, not unchanged admission. Guard placement intentionally preserves queued
hint ordering rather than consulting an older rendered hint count.

## Evidence

New actual-provider suite: `outbox-profile-spend-validation.test.tsx`.
Exact HEAD source counterfactual: 6 failures / 13 passes. The failures are NaN,
negative Infinity and finite subtraction overflow for each of the two methods.
Positive Infinity was already unaffordable and its existing no-write behavior is
preserved. After repair: 19/19 pass. Combined with stats/cloud ingress, capability,
writer-fence and authority suites: 156/156 pass across six files.

Controls include finite debits, zero and negative costs, exact bytes/state/
persistence preservation, no new hints, remount, existing-owned hints,
affordability/order constraints and unchanged trySpendDinars rejection behavior.
No historical assertions were changed. No live data or network was accessed.

Independent review and full release checks pending. No new economic authority,
baseline or activation. V18 HOLD; production NO-GO. Arithmetic overflow in other
profile methods and other unvalidated ingestion paths remain separate work.

Independent review **CLEAR**, independently rerun **19/19 PASS**. Full local
validation: **1279/1279 tests across 51 files PASS**, both TypeScript projects PASS,
and client/SSR build PASS. Remote CI pending for this commit; no deployment.

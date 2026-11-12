# V18 region unlock finite-cost boundary

## Scope and finding

`ProfileProvider.unlockRegion(id, cost)` previously accepted NaN and negative infinity costs, or a finite negative cost whose subtraction overflowed. It persisted a nonfinite points balance together with the new region flag. Positive infinity was already rejected by affordability. No application caller was found outside the provider definition/public capability; the public capability remains callable.

The reducer now checks a finite cost and finite subtraction result before setting success or adding a region. The already-owned branch remains first. Existing finite negative, zero and fractional costs, affordability, queued reducer ordering and immediate/deferred boolean behavior are unchanged. This does not establish a new pricing policy or economic authority.

Invalid operations can still consume writer admission. The guarantee is no profile mutation/new unlock or changed persisted bytes from the invalid operation, not an unchanged admission sequence. This is not comprehensive profile validation, a cross-tab transaction or a backend permission check.

## Evidence

New actual StrictMode provider suite: `tests/offline/outbox-profile-region-validation.test.tsx`.

Before source change: 3 failed, 11 passed. The failures reproduced NaN, negative infinity and finite subtraction overflow corrupting the balance and marking a region unlocked. Positive infinity and compatibility controls passed on the original source.

After change: 14/14 pass. Combined with unchanged historical capability tests: 80/80 pass. Tests cover exact state/storage preservation, valid retry after rejection, remount durability, finite positive/negative/zero/fractional controls, duplicate/owned-region behavior including invalid cost, insufficient funds, and queued updates retaining legacy deferred boolean timing.

`git diff --check` passes. Full repository validation and publication are owned by the coordinating task. No backend calls, live balances, migration, production activation or economic baseline changes were performed.

Independent review **CLEAR**, independently rerun **14/14 PASS**. Full local
validation: **1403/1403 tests across 55 files PASS**, both TypeScript projects PASS,
and client/SSR build PASS. Remote CI pending for this source commit. No deployment.

Remote runtime CI **SUCCESS**: [43190268479](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43190268479), tested commit `8af451b953793647783b65cf900e863adc8d196d`.
Verified job `131087494710` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment. These checks use npm, not Bun or
an Android release build.

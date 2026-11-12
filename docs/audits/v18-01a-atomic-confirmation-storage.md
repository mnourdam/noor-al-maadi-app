# V18: dormant atomic confirmation storage

## Decision and boundary

This is a restricted composition capability, **not atomic reward delivery or
universal writer admission**. V18 remains HOLD and production NO-GO. No baseline
is inferred, no V17 data imported, no real balance or gate changed, no app caller
connected. The existing default transaction API retains its exact four methods.

The native CAS work demonstrated cooperating callers serialize, but direct IDB
writers can bypass that primitive. A universal admission claim would additionally
require trustworthy opening state and enforcement covering localStorage,
legacy/server writers, other devices, and every economic ingress. Those contracts
are not available. A local flag or extra revision would not supply them.

## Why not expose entitlement replacement or delivered?

`validateEntitlement` is a structural validator, not a transition or authorization
validator. Arbitrary replacement would allow rewriting terms, source, evidence,
and attempt history; a structurally valid row may already say delivered. Existing
evidence and terms are opaque strings. Economy/applied marker values are generic
JSON, not a typed authoritative grant or verified inclusion contract.

Moreover, introducing delivered now would conflict with existing confirmation
replay: `settle(confirmed, rewardDue: true)` expects delivery_pending and rejects
delivered as a different decision. No such semantic change is made. Delivery
requires a separately reviewed typed grant/inclusion/admission and replay contract.

## Implemented narrow capability

`confirmationTransactionsForOwner(owner).run(scope)` is a separate dormant entry
point. It adds only:

`compareSettleEntitlement(key, expectedFullRow, binding, decision)`

It clones arguments before asynchronous reads, validates full expected and current
rows, compares their full canonical snapshots, and applies the same existing
confirmation/rejection transition as `settlementForOwner().settle()`. Shared
transition extraction preserves binding checks, immutable history/source/terms,
terminal idempotency and decision conflicts. The result cannot introduce delivered.
Missing rows are errors, not initialization. Duplicate entitlement mutations and
reads after queued entitlement mutation are rejected. Identity is checked before
mutation and on completion. All four stores share one native IDB transaction.

There is no arbitrary entitlement setter, insert, delete, delivery method, network
call, or automatic companion write. Existing `transactionsForOwner` cannot gain
this method by supplying an extra argument; its runtime scope remains unchanged.
The existing generic compareWrite still rejects the entitlements store.

Confirmation can now commit or abort with synthetic companion records. This proves
storage atomicity, not that arbitrary companion amounts are correct, that evidence
is authentic, or that any grant should be issued. The caller still must have a
trusted adapter and a future domain contract. There is no production caller.

## Evidence

Independent adversarial review cleared the narrow source and browser harness.
Focused new + historical suites: **70/70 PASS**, including 17 new cases.
Full offline suite: **1,124/1,124 PASS** across 44 files. Existing historical
assertions are unchanged. New tests exercise full-row conflicts,
identity, immutable caller capture, invalid evidence/bindings, terminal replay,
forbidden delivered transitions, duplicate targets, asynchronous callbacks and
rollback. Native tests extend the earlier eight checks with four-store commit,
abort after four successful native puts, independent-tab competing confirmations,
and orderly browser restart. The raw-writer bypass negative control remains.

An orderly restart is not Android force-stop, disk-fsync or power-loss acceptance.

The native fixture bundles and typechecks. Local Chromium launch remains blocked
before assertions by process singleton socket restrictions, including the permitted
escalated invocation. Native behavioral acceptance subsequently **PASSED on CI, all twelve checks**,
not locally. The dedicated repair-branch workflow used synthetic records and a
temporary profile. No user browser profile was used.

The full-row JSON contract conservatively rejects explicit undefined optional
fields in the new CAS API; this does not alter existing settle behavior.

Application/regression TypeScript checks and offline client/SSR build: **PASS**.
An initial new test-helper parameter inferred the confirmed-only subtype; its
explicit SettlementDecision union annotation was corrected before these final
checks. No application behavior changed for that correction. Locked npm install
also passed (695 packages) after restoring the replaced temporary workspace.

## Verified remote evidence

Tested commit: `3c8b193791f626649ce0e316f4de856d7d97347d`.

- Native browser run [43178171758](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43178171758): **SUCCESS**, 12 checks.
- Full runtime run [43178171628](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43178171628): **SUCCESS**, including locked install, offline regressions, scheduler, typecheck and build.
- Downloaded artifact `13924957676`, verified archive SHA-256
  `34494134a9c1cc67e4409fdb6f7ebde1c0122210382ff2b56eabc5757a0c2119`.
- Inspected JSON saved at [v18-atomic-confirmation-43178171758.json](evidence/v18-atomic-confirmation-43178171758.json).
  Chromium version `151.0.0.0` is the browser's reduced user-agent value,
  not an exact binary patch version.

The raw-IDB negative control still successfully bypasses the cooperating API.
No assertion of universal admission, atomic reward delivery, baseline import,
hosted-staging acceptance, Android release, or production readiness follows.

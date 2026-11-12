# V18: authenticated heart purchase receipt boundary

## Reproduced problems

The previous hook replaced the entire profile captured before the purchase RPC.
A delayed receipt could erase newer same-owner progression or spending. It also
accepted nonfinite balances and could return purchased for malformed receipts,
and publish success after identity changes or unmount despite refused writes.
Initial actual-hook/provider regression: 15 failures / 1 pass (16 cases).

## Scoped integration

ProfileProvider exposes captureHeartPurchase, a scoped single-use adapter over
the separately tested conditional writer. Capture occurs before RPC dispatch.
The operation validates integer/domain receipt values and applies only dinars
and, for purchased status, the existing commitHearts tuple. The timestamp is
captured outside the React reducer. An old saved hook callback cannot capture
a newer rendered profile as its own baseline.

The hook verifies the authenticated session before dispatch and guards identity,
epoch and mounted lifecycle after asynchronous work. Unknown/malformed receipts
and transport uncertainty yield unresolved without balances. Purchased success
and the purchase event require matching conditional persistence evidence, not an
optimistic updater flag. Later admitted updates, reset, identity or lifecycle
changes can invalidate that application. Already-issued server operations are
not cancelled or rolled back by these guards.

Known hearts_full/insufficient_dinars receipts preserve historical dinar-only
reconciliation. Guest spendDinarsForHeart retains its prior reducer, pricing and
immediate boolean behavior; it does NOT obtain the new persistence proof.

The only hook caller is HUDStatPopovers. It describes unresolved outcomes as
possibly completed and asks the user to verify their balance before buying
again, without promising background verification or suggesting retry/reload.
An unresolved latch blocks further requests for this hook mount. It is NOT a
durable, cross-tab or cross-device idempotency guarantee. No new automatic
reconciliation job or retry is introduced; purchase_heart still has no operation
idempotency key.

## Evidence and limits

Expanded hook/provider suite covers same-owner progression/spending/queued edits,
Alice→Bob and ABA, unmount, malformed receipts, valid persisted purchase,
conditional write failure through the existing error boundary, no-state-change
supersession, saved callbacks, nonpurchase statuses, guest compatibility,
reentrant event identity change and repeat-request suppression after uncertainty.
The capability classification test adds an explicit factory category and tests
both retained factory and returned capability against owner switching; all
existing assertions remain.

Latest integration run: 90/90 tests in heart-boundary and profile-capabilities
suites. Conditional writer tests, independent review, full typecheck/build and
branch CI are tracked separately and must be verified before publication.

No server pricing, RPC SQL, production gate, economic baseline or global authority
changes. V18 remains HOLD; production NO-GO. Exact current-page storage evidence
is not a device-crash durability proof or verified server-side grant inclusion.

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

Remote runtime CI **SUCCESS**: [43188945069](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43188945069), tested commit `cd1c25a7e9de78843d6bc8ec2833b4fff8dc752e`.
Verified job `131083078790` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment.

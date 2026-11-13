# Native launch receipt and bounded cold-boot trial

## Exact baseline and measured problem

Prepared against local `4d2835391aaf0c7c0346cb80958c72e1ae1c9f39`, tree
`d02701bf15c7c0838f2f3114d18d1caf83f04bc8`, equal to public
`b718faedef50ffb9182d6d6a323b0d7a8ab143c8`. This is not a claim those
commit identities are interchangeable.

The independently verified split-runner run `43461622696` built and transferred
the exact two files, verified the full manifest, then missed its normal 600-second
boot gate. The separately labeled exploratory path installed and verified the
actual guest APK SHA256, but its single `am start -W` timed out before Page/CDP.
That command may have had a side effect. Historical launch outcome remains
unknown; this change cannot reconcile an already-destroyed AVD retrospectively.
No onboarding, Home, six-feature or release acceptance was obtained.

## Two explicit changes, no application changes

1. Parent-authorized new normal cold-boot trial ceiling is **900 seconds**, with
   the same exact `sys.boot_completed == '1'` condition, same image/HVF/emulator
   arguments and no CPU, graphics, host permission or security changes. This is
   a deliberate prospective budget change, not retroactive acceptance or a
   further automatic extension. The earlier app-free first positive query
   563.192–563.520s and repeated late boot during exploration support trying a
   larger finite budget, not a reliable latency or causal conclusion.
   First positive query start/end times are relative to polling start just after
   emulator spawn/stream setup. End <=600 records `observed_by_600`; a query
   straddling 600 explicitly records `observation_straddles_600`; start >600
   records `observed_only_after_600`. None dates the actual property transition.
   The query timeout is capped to remaining900; a positive response ending after
   900 cannot admit boot. Other properties/services never substitute for it.
2. Normal initial and exploratory launches share a one-dispatch receipt. A
   bounded boot sample immediately precedes dispatch; sample elapsed brackets,
   stage, dispatch-attempt flag and command-completion flag are distinct.
   Budget preflight precedes the dispatch flag. A dispatch flag records attempted
   invocation, not proof Android received it. `am start -W` remains 15 seconds
   maximum (smaller if an exploratory budget is nearly exhausted).

A failed dispatched command retains its original exception and outcome. A
separate read-only reconciliation observes exact-package process state,
recognized resumed-activity fields and exact WebView socket name for the same
PID sampled before/after. No PID, component of another app, raw dump, token or
command error text is emitted. Multiple PIDs are ambiguous. Missing fields mean
not observed in a complete capture, not proof the activity does not exist.
Capture failures/truncation do not mean absence. Socket evidence is not UI/JS
readiness, and two identical PID samples are not proof against PID reuse.

Reconciliation uses a 12-second operation budget with each capture <=2 seconds,
<=64KiB, at most four read-only adb processes; the reused capture helper separately
allows <=1-second owned-process reap per probe. These are operation allowances,
not an OS-preemptive hard wall. Cleanup/reap capture states remain explicit.
Any import/parser/reconciliation exception is sanitized and cannot replace the
original launch error. No duplicate launch, Page/CDP connection, input, settings
change or acceptance promotion is allowed after failure, even when all sampled
observations are positive. Owned AVD teardown remains the final cleanup boundary.

## Validation and remaining limits

Offline unit tests cover exact one-dispatch/15s contract, pre-dispatch expiry,
positive reconciliation still rethrowing original timeout, import/collector
failures, strict PID/activity/socket parsing, replacement-process rejection,
bounded probes, and 600/900 boundary-straddling/non-exact boot values. Existing
normal/exploratory isolation and install controls remain in the test run.
No local emulator, SDK, application server or native runtime was executed.
Independent source review is required before publication. Full app journeys,
release-like shrinking, authored English and private-media activation gates
remain open. This trial does not promise success or release readiness.

### Frozen local validation

Independent reviewer cleared the eight-path implementation and independently
reran all127 native offline controls. A subsequent compatibility run of the
separate app-free observer found one stale test asserting the old actual-runner
600 constant (seven other observer tests passed). The ninth path changes only
that test's name and expected actual-runner constant to the explicitly approved
900; observer900 limit, independent600 classification and argv-equality check
remain unchanged. The native direct-file test entry point was also moved below
all its classes, so direct execution no longer omits the two boot-boundary tests.
Final local discovery: **127/127 native +8/8 observer PASS**, diff check clean.
These are offline controls, not fresh emulator evidence.

### Observer trigger scope

The tenth path narrows the app-free workflow's push path filter from its whole
observer directory to `tests/native-boot-observer/observe.py`, retaining its own
workflow path and explicit `workflow_dispatch`. Pure observer-test edits alone
therefore no longer trigger a separate emulator observation. Exact trigger-block
control protects the branch, both paths and manual dispatch; permissions, runtime
controls and acceptance remain unchanged. Publishing this workflow edit itself
still matches the workflow path and can schedule one observation. It is not a
claim this same publication will skip that workflow. Final observer controls:
9/9 PASS; prior127 native controls unchanged.

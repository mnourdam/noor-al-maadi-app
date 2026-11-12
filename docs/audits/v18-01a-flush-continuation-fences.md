# V18: identity fences across outbox continuations

## Scope

The earlier guard closes the initial getSession wait. Later awaited module loads,
canonical-count lookups, network replies and cleanup imports can still resume
after an owner change. The captured flush epoch must apply to these continuations,
not only queue acknowledgment at the outer loop.

This slice fences streak, avatar and reflection preparation/cleanup and guards
post-response event publication. Per-event checks also handle synchronous event
listeners changing identity between two publications. The outer flushed event
must not publish an old identity's result into a new identity's UI.

The avatar canonical-count rejection path is included: catching a failed await
is not permission to proceed with stale work. No receipt semantics, reward values,
server calls for a still-current operation, or stable queue identifiers change.
Already-issued RPCs are not cancelled, reversed or certified uncommitted.

## Deterministic evidence

New tests use actual enqueue/flush/queue code with mocked transport and delayed
module/helper boundaries. Fresh mock factories ensure import barriers execute in
each case. They test Alice→Bob and Alice→Bob→Alice, late network dispatch,
namespace-sensitive cleanup, post-response events and current-owner controls.
The unmodified source fails **20 cases and passes 4 controls**. Exact post-fix
results and independent review will be recorded after execution.

These are controlled browser-storage tests, not live SDK credential selection,
real backend authorization or native Android force-stop acceptance. No live data,
production deployment, V17 import or economic authority gate is changed. V18
remains **HOLD**, production **NO-GO**.

After implementation: **27/27 continuation tests PASS**, including three added
synchronous-publication cases. Combined continuation/auth/receipt suites:
**49/49 PASS**, independently rerun by the reviewer. Source review **CLEAR**.
The tests do not certify asynchronous internals of imported helpers or revoke
already-issued backend requests. Full-package validation and CI follow below.

Final combined local package: **1,225/1,225 tests PASS** across 48 files; application/regression typecheck, offline client/SSR build and diff check **PASS**. Both source changes independently reviewed. Branch CI pending at publication; no deployment.

Remote runtime CI **SUCCESS**: [43184352900](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43184352900), tested commit `a3bcbf78ff14827d38dea5715ccbf67d54c5d941`; verified job `131067726508` passed every step, including regressions, scheduler, typecheck and build. No deployment.

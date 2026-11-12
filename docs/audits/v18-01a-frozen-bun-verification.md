# V18 frozen Bun dependency verification and test portability

## Scope

The repository contains separate npm and Bun lockfiles. Their dependency graphs
are not identical. This change does not regenerate either lock, change a runtime
API, install production dependencies, deploy an application, or establish Android
runtime acceptance. The existing npm regression lane remains unchanged.

A separate branch-only `v18-bun-dependency-verification.yml` lane installs the
existing `bun.lock` with Bun **1.4.4**, `--frozen-lockfile --ignore-scripts`, then
uses **Node 24** through the existing npm scripts to execute tests, scheduler
contracts, typechecks and client/SSR build. It tests a Bun-installed dependency
graph, not the Bun JavaScript runtime. Manifest and both lockfiles are checked
for modifications immediately after install and at the end. There are no project
secrets, production endpoints, deployment steps or browser/user-profile artifacts.

The official `oven-sh/setup-bun` v2 ref was resolved with `git ls-remote` to
`0c5077e51419868618aeaa5fe8019c62421857d6` and pinned in the workflow. No mutable
action version is used for installing Bun. Checkout disables persisted credentials;
workflow token permissions are read-only contents.

## Timer assertion diagnosis

The isolated frozen-Bun snapshot's conditional-writer suite originally passed
18 tests and failed one global zero-timer assertion. Instrumentation showed both
10,000ms conditional-writer timeouts were cleared. The remaining timer was jsdom's
zero-delay `bound _dispatchStorageEvent`, associated with the profile storage write.
It was not a writer timeout leak.

The test now drains **zero milliseconds** inside React `act` before retaining its
exact `vi.getTimerCount() === 0` assertion. This drains jsdom's storage event, not
the writer expiry. On the isolated Bun graph all 19 writer tests then passed.
As a counterfactual, removing only `clearTimeout(attempt.timer)` still fails this
same assertion with **two pending timers**. The cleanup guarantee is not weakened.

## Supported validator API versus optional alias

The builder test still requires `validator` to be a function and verifies actual
POST schemas, defaults, normalization, middleware, rejected invalid inputs, and
no backend invocation. Only the assertion that the deprecated `inputValidator`
alias must be absent is removed: presence of an unused compatibility alias varies
between locked dependency graphs and is not a functional regression. No application
source or existing functional schema/auth assertion is changed.

## Evidence and limitations

- Current npm graph: conditional-writer and real-builder suites **36/36 PASS**.
- Isolated Bun graph: writer portability test **19/19 PASS**; timer-cleanup
  counterfactual fails as required (expected zero, actual two).
- Cross-graph full-suite/typecheck/build evidence and remote lane result remain
  pending and must be recorded independently, with the tested source revision.
- Whitespace diff check passes. Lockfiles and package manifest are untouched.

V18 remains HOLD; production remains NO-GO. Passing this lane would show only
that the checked source works with its frozen Bun dependency graph under Node.
It is not dependency graph equality, Bun runtime certification, hosted integration,
Android acceptance or permission to activate economic authority.

Independent review **CLEAR** with installer-config trigger added. Isolated frozen
Bun graph full rerun **1403/1403 across 55 files PASS**, scheduler **41/41 PASS**.
Exact source was local `b6cd46bf`, tree `ad66c3a3`, plus only the two portable test
changes, not the latest 1431-test source. The same isolated graph/base previously
passed both typechecks and client/SSR build. Current npm graph full rerun passed
**1431/1431 across 56 files** after the portability changes. Remote frozen-Bun
CI must still verify the latest source. No locks or production code changed.

Remote latest-source dual-graph acceptance: tested commit
`61d763ecf6e4976b949d8b8d28b3b6de2ebb55bc`.
- Frozen Bun graph CI [43192680048](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43192680048): **SUCCESS**, verified job `131095675042`.
  Bun 1.4.4, Node 24.22.2; **1431/1431 tests across 56 files PASS**, scheduler,
  both typechecks, client/SSR build, and both unchanged-lock checks passed.
- npm graph CI [43192679946](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43192679946): **SUCCESS**, verified job `131095674157`, all steps passed.

This proves both frozen dependency graphs work for this source under Node; it
does not make their package versions equal or establish hosted Lovable/Android
release runtime acceptance. No lock regeneration or production deployment.

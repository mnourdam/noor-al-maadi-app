# V18: atomic numeric validation for local reward operations

## Reproduction

Variable reward methods previously decorated the profile with completion IDs,
streak/day changes or daily-claim markers before adding XP and dinars. Nonfinite
reward input or finite addition overflow could persist null balances together
with those markers. A guard that simply returned an arithmetic helper's input
would retain the already-decorated marker and permanently suppress a valid retry.

Initial actual-provider suite: 39 failures / 19 passes across 58 cases. It covers
six variable entrypoints (investigation, timeline, decision, mission, campaign,
daily claim) and standalone XP/dinar additions. No historical assertions changed.

## Bounded repair

A pure localRewardTotals calculation validates reward and the resulting XP/dinars
before any variable operation accepts its metadata. Failure returns the original
outer profile, leaving completion and daily markers retryable. claimDaily sets
its existing internal success flag only after validation succeeds. Duplicates
retain their existing no-op decisions. Standalone addPoints/addDinars separately
validate finite operands and final results.

Preserved policies: finite zero/negative/fractional rewards, floor/minimum dinar
conversion, existing nonnegative dinar clamp, and legacy React-dependent boolean
return timing. A finite negative dinar addition whose raw sum underflows still
clamps to zero as before; this does not introduce a new negative-cost policy.

Fixed-reward helpers and their callers, unlockRegion, nested map validation,
replaceProfile and economic authority are outside this slice. Invalid compound
operations may still consume writer admission, despite unchanged state/bytes and
persistence receipt; this is not a promise of unchanged admission.

## Evidence

New `tests/offline/outbox-profile-reward-validation.test.tsx`: 66/66 pass after
adding fractional and negative-underflow controls. Combined with unchanged
profile capability/writer/authority suites: 169/169 across four files.

Tests assert original profile identity and exact bytes on invalid operations,
no partial completion, preserved persistence receipt, valid retry for the same
ID, remount preservation, finite positive overflow and negative XP overflow,
existing dinar clamp, duplicate behavior and finite reward compatibility.

No backend, real player data, new baseline or production activation. Independent
review/full validation/CI pending. V18 HOLD; production NO-GO.

Independent review **CLEAR**, independently rerun **66/66 PASS**. Full local
validation: **1389/1389 tests across 54 files PASS**, both TypeScript projects PASS,
and client/SSR build PASS. Remote CI pending for this source commit. No deployment.

Remote runtime CI **SUCCESS**: [43189598428](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43189598428), tested commit `1c3b1e790f84e99c2043bbb7d8f70d51ad184966`.
Verified job `131085249665` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment.

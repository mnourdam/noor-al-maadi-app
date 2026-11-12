# V18: prevent non-finite server statistics from corrupting local profile

## Concrete risk

applyServerStats previously checked only typeof value === number for XP, dinars
and streak. NaN and infinity satisfy that check and survive Math.max/floor.
JSON persistence then converts them to null, overwriting valid stored values.
Later hydration can quarantine invalid economic fields, but cannot restore the
bytes already overwritten. Validation after reading storage is too late.

## Bounded repair

Capture only the scalar fields this method consumes before React schedules its
updater. Reject the whole supplied snapshot if any written numeric XP/dinars/
streak field is non-finite, before calling the profile writer or admitting a new
operation. Caller mutation after invocation cannot bypass that validation.

Preserve all existing finite-number behavior, including legitimate decreases,
zero, negative-number clamping and streak flooring. Null/omitted fields retain
their current semantics. Hearts are not written by this method and are not newly
validated. No alternate balance, guessed compensation, baseline import, global
writer fence or economic authority is introduced.

## Evidence scope

Use actual ProfileProvider/useProfile and persistence with synthetic storage and
mocked external dependencies. Invalid fields, mixed valid/invalid snapshots and
caller mutation must not alter current state, exact stored bytes or persistence
receipt. Valid decreases/zero and remount controls must still work.

Other ingress paths, arithmetic overflow and cloud-merge compatibility remain
separate work. Finite values are not proof of a trusted grant or inclusion. V18
remains **HOLD**, production **NO-GO**. No live player data or backend is used.

Counterfactual, independent review and final tests/CI are recorded after execution.

Counterfactual: old source **12 failures / 4 control passes**. Final new suite
**17/17 PASS**, independently rerun; source review **CLEAR**. The additional unused
getter control confirms hearts and day-without-numeric-streak are not newly read.
An in-flight streak test verifies rejected invalid stats do not consume the
writer's admission sequence. Transition mutation tests verify captured valid
inputs cannot become nonfinite before deferred execution. Historical writer,
authority and capability assertions remain unchanged.

Final local validation: **1242/1242 tests in 49 files PASS**, both TypeScript
projects PASS, and production build PASS. A test-only unsupported activity label
was corrected to the existing `campaign_chapter` union member before this full
rerun. No historical assertion was removed. Remote CI remains pending for this
commit; build success is not deployment authorization.

Remote runtime CI **SUCCESS**: [43185681670](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43185681670), tested commit `5e13b53a4e681eed8bdd1040663f3be4846ab07f`.
Verified job `131072117313` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment.

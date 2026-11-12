# Persisted local heart recovery receipt

## Reproduction

A real ProfileProvider deferred update returned `ok:false` from the historical synchronous `recoverHeartFromActivity`, while both rendered and persisted hearts increased from two to three. The investigation caller immediately used that return to count displayed recovery. The isolated baseline regression failed its receipt assertion after both state and storage assertions passed.

## Bounded integration

The existing legacy API remains unchanged. An additive `recoverHeartsFromActivities` projects the same sequential cooldown, duplicate-key and maximum-heart rules, then submits one conditional profile write. Its `written` receipt counts recovery only after the existing writer confirms the committed frame's exact storage readback. `unchanged` means no eligible recovery; `unresolved` reports no confirmed count, not rollback. Finite existing heart arithmetic and cooldown duration remain unchanged. No new earning eligibility or server request is introduced.

Local ordering deliberately changes: after server acknowledgment, the investigation awaits this batch BEFORE enqueuing its completion marker and badge profile writes. Those earlier queued writes would otherwise invalidate the conditional baseline. If still mounted/current, completion and badge behavior proceeds even when local heart persistence is unresolved; the UI displays zero confirmed local recovery and an explicit warning, without retrying the already-acknowledged completion RPC. Identity/unmount retirement suppresses subsequent UI and profile effects. The legacy server reward receipt remains distinct from confirmed local heart gain.

## Evidence and boundaries

- Baseline actual Provider: persisted heart increase with false synchronous outcome.
- Initial integrated focused run: **105/105 PASS** across receipt, mounted route, historical campaign boundary and profile capability suites. Two additional provider controls then pass in the five-case provider suite.
- Provider controls: persisted multi-key recovery/remount, duplicates, full/cooldown, silent write drop, queued intervening write, stale callback, identity retirement, existing cooldown preservation.
- Mounted real route + real Provider: normal acknowledged two-heart completion; silent persistence failure still finishes without retry/false heart gain; unmount while server acknowledgment pending leaves bytes unchanged.
- Route transport/completion response and unrelated presentation/streak dependencies are synthetic. No real server reward, native/device or hosted acceptance is asserted.
- Public API capability enumeration adds the new mutator without removing historical assertions. Legacy recovery callers/signature remain intact.

This is per-provider local persistence acknowledgment, not cross-tab CAS, authoritative reward delivery, crash rollback, or durable retry idempotency. Existing queued writes can still make the batch unresolved. No automatic retry is added. Production/native/economic HOLD remains.

## Economic ingress inventory check

Neither changed source file is an existing economic-ingress client candidate.
Manual comparison confirmed unchanged literal RPCs (`my_claimed_streak_rewards`
in the provider and `get_my_profile` in the route), with no direct table literals.
No pins or dependent manifest hash were changed, and the inventory scope was not
expanded. Seven integrity tests and the drift checker pass; this does not certify
all wrapper/local mutation paths or economic authority.

## Aggregate fixture compatibility correction

The first coordinator aggregate passed both TypeScript projects but failed 11 historical tests because two mocked Profile APIs did not expose the new batch method. This was a test-contract omission, not a passing aggregate. Updated only the mocks in `outbox-investigation-pending.test.tsx` and `outbox-gameplay-ui.test.tsx` to call their existing per-key heart spy and sum its successful outcomes into the asynchronous receipt. All historical assertions remain unchanged, including replay/zero-heart/cooldown/count behavior. Both suites then passed **40/40**. Final aggregate rerun and independent delta review remain coordinator gates.

Final aggregate validation after the fixture-contract correction: both TypeScript projects PASS; all 1,755 tests across 84 files PASS. Independent review cleared the source, eight new provider/route cases, the type-only route fixture cast, and the two historical mock adapters with assertions unchanged. Remote CI remains separate.

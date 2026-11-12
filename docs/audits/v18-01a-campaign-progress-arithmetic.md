# Imported campaign progress arithmetic containment

## Defect and actual caller

`recordActivity` previously added authored values directly to chapter and campaign totals, then marked activities/chapters/campaigns complete and serialized the result. Non-finite input or finite addition overflow produced non-finite totals that JSON serializes as null, alongside completed/unlock markers. This is a separate progress blob; profile reward guards do not protect it.

The imported chapter route calls `recordActivity(..., persist=false)` before its server/outbox write, and calls it again for local persistence before reward claims. Returning an unchanged object on invalid input would not stop that caller from continuing into reward claims. The repair therefore throws the fixed `invalid-progress-arithmetic` error before any mutation. The existing route try/catch reports inability to save and its finally releases the submission lock. No route behavior was changed.

## Scope

Validate only the operands and derived sums consumed by the selected correct/wrong branch. All correct-answer XP/coin sums are computed and checked before completion markers; both wrong-answer heart sums are checked before heart accounting. Both persisted and projected operations use the same checks. Invalid operations neither write nor initiate sticky completion recording.

Finite negative/fractional/zero behavior is intentionally preserved, with no new clamping, reward cap or eligibility rule. The existing already-completed fast path remains unchanged, including its no-addition behavior for malformed new inputs. Unused reward inputs on wrong answers and unused heart penalties on correct answers are not newly rejected. This is not comprehensive validation or repair of historical progress blobs, other untouched fields, or other progression methods.

## Evidence

- Original-source focused suite: **22 FAIL / 2 PASS** across 24 cases.
- Repaired focused suite plus unchanged campaign boundary tests: **56/56 PASS** (24 new, 32 existing).
- NaN and both infinities in each consumed authored field, both projection/persistence modes; finite overflow in XP/coin/heart paths; exact stored-byte preservation; valid retry; duplicate control; legitimate negative/fractional/zero values; nonpersisted projection.
- Real progress adapter with synthetic authored inputs/local storage. Completion-recording dependency is mocked to prevent unrelated network effects. No live data, backend grant or full mounted-route malformed-content acceptance claim.

Multi-store progress/reward settlement, trusted economic authority and hosted/native acceptance remain separate unresolved gates. Production/economic/native HOLD remains.

Manual ingress review confirmed unchanged literal table candidates
`user_campaign_progress` and `user_campaign_completions`, and no direct RPC
literals. Only this source file's hash and the dependent semantic-review manifest
hash were refreshed. Seven inventory integrity tests and the drift checker pass;
no other source pins were regenerated. Invalid-input/overflow tests also assert
that the mocked completion recorder was not called, with call state reset per test.

Final aggregate validation: both TypeScript projects PASS; 1,735/1,735 offline tests across 81 files PASS. Independent review cleared the final 24-case suite including explicit no-completion-recorder assertions on rejected operations. Remote CI remains a separate publication check.

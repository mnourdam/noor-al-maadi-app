# V18 heart penalty dedup owner isolation

## Actual-provider reproduction

The module-level `heartPenaltyDedup` previously stored attempt strings alone. ChapterQuiz supplies deterministic campaign/chapter/quiz/question strings. In one tab, Alice lost a heart for a question, then Bob's fresh provider/profile skipped the same question's penalty because Alice had already populated the set. The baseline actual-provider reproduction failed: Alice changed from two hearts to one; Bob remained at two instead of one. This is transient cross-owner bookkeeping contamination, not proof of a historical player's reported symptom.

## Minimal repair

After the existing current-capability guard, key the set by `JSON.stringify([profileOwner, attemptKey])`. This uses the capability's owner, not a later owner, and avoids delimiter collisions. Retain the same module-level set, global 500-entry cap, insertion/eviction order, empty-attempt behavior and same-owner provider-remount/rapid-tap semantics. No identity-reset behavior, eligibility policy, durable attempt ledger, server reward authority or heart arithmetic changes. The existing pre-updater insertion and persistence limitations are not repaired or recharacterized by this scope.

## Evidence

One actual-provider baseline red test established the defect before source modification. Six new regressions cover Alice/Bob, Alice/Bob/Alice remount and rapid taps, stale callbacks, distinct attempts, guest versus authenticated owners and delimiter collision resistance. Focused new six plus unchanged nine full-anchor tests: 15/15 PASS. Source change is one tuple-key declaration and replacing the set lookup/insertion arguments, plus comment precision. Independent review and aggregate checks are coordinator-owned; no production activation.

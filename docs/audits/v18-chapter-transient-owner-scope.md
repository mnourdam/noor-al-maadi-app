# Chapter transient attempt/ack owner isolation

## Reproduction
A temporary actual-route + real owner-partition probe on the preceding main source reproduced a user-facing defect: A's wrong answer remained in component-local wrongFlash after switching to B on the same activity. B had no completed activity in its own progress partition but saw A's error banner and received 2 XP/1 coin on its first correct answer instead of authored 5 XP/2 coins. This was a fresh B callback, not the already-fixed stale A callback.

## Repair
Wrong-attempt and pending-ack maps now carry an owner+epoch scope and expose empty maps synchronously on scope mismatch. Updates initialize only their own scope. A→B→A cannot resurrect old transient maps because each epoch has a distinct scope. Canonical persisted progress/ledger data and reward scaling formulas are untouched.

Only interactive ActivityRenderer and ReviewActivity child keys include owner/epoch to retire local input/feedback. The surrounding route remains mounted. Same-owner in-play reading overlay preserves activity input and wrong-attempt penalty exactly.

Duplicate-submit locks carry the same owner scope and a unique lock object. B can start while retired A is pending, and A's finally releases only its own lock, not B's. Retired rejected saves cannot toast into the new owner; genuine current-owner rejection still reports its existing message. Existing current-admission/epoch/post-await retirement guards remain. Already-dispatched server work is not canceled or rolled back.

## Verification
Actual route tests use real progress/partition/ledger adapters with SDK/profile/memory boundaries mocked. Controls cover A wrong→B first-correct full reward, pending ack and unsent input retirement, A→B→A, stable surrounding heading, same-owner in-play reread preserving input and half-reward penalty, A/B overlapping deferred saves with B duplicate still blocked after A finally, retired reward suppression, and stale-vs-current rejection feedback. Existing normal completion and completed-review regression suites remain included.

The key change for the injected memory ReviewActivity is source-reviewed; a full real memory-engine interaction is not claimed by the mocked route fixture. No reward formula, persisted ownership schema, content, navigation or broader route remount was changed. No backend/network/browser/native execution, publication or deployment.

## Synchronous wrong-answer callback boundary
A current-owner guard immediately after loseHeartOnce prevents a synchronous owner change inside that profile callback from carrying the old attempt/UI or activity-level resume pointer into the new owner. The actual route control permits B's legitimate ordinary chapter-entry pointer but rejects any old activity pointer and proves B's fresh full reward. This does not claim to audit or repair every synchronous callback inside the separate correct-answer reward pipeline.

## Integrated dependency-graph gates
At source `5113240291102938bc1e9b0b02a76cdd2a7f680c`, the npm graph and the unchanged frozen Bun-installed graph each passed 2,056 tests across 116 files under Node. Both TypeScript projects and economic source-drift checks passed. The Bun-installed direct synthetic Android SPA build passed on sequential retry. Initial outbox TypeScript/build attempts terminated with exit 137 without a compiler diagnostic while another typecheck may have overlapped; the cause is not conclusively established. The isolated retry used a 1,536 MiB heap and passed without source/dependency changes. Package/lock hashes stayed unchanged and checkouts were clean. These are local source/build gates, not browser, native, hosted service or deployment acceptance. The separate actual-ProfileProvider route fixture remains under review and is not counted in these results.

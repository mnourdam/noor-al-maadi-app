# Campaign reward marker acknowledgment

## Reproduction and bounded repair

The actual campaign ledger returned `granted: true` whenever `localStorage.setItem` did not throw. A silent drop or replacement therefore authorized the caller's reward branch without a readable deduplication marker. Before the repair, the initial 13-case suite had **7 failures and 6 passing controls**. Thrown write failures already denied acknowledgment.

`campaignLedger.write` now serializes once, writes once, and requires exact immediate byte readback in the same identity epoch. Epoch checks fence synchronous serialization/storage reentry; readback exceptions deny acknowledgment. It does not rewrite, roll back, or automatically retry uncertain writes. All three claim APIs retain their existing reward amounts, caps, eligibility assumptions, duplicate behavior and result shape. Other void-returning callers of the shared writer do not acquire a new delivery guarantee.

## Actual flow and remaining gap

The imported chapter route first awaits server/outbox progress acceptance, then persists `recordActivity`, then calls the activity reward claim. Only a `granted` result enters its separate profile XP/coin and campaign-grant writes. Chapter/campaign claims similarly use the ledger. This test exercises the real local adapters in that order after the acknowledgment boundary, not a mounted full route or a real server.

A denied claim remains indistinguishable from a duplicate to existing UI callers. Progress can already be completed while no reward is applied, and the route can continue its existing acknowledgment/advance behavior. Conversely, a marker may have been written before its readback fails, or the process may stop after the marker but before profile delivery. Neither case is rolled back or made automatically retryable by this change. Exact readback is not durable crash proof, a cross-tab lock, an atomic multi-store transaction, or economic authority. These unresolved reward-loss/uncertainty windows require a separately justified settlement design, not blind retry.

## Evidence

- Original source: 7 FAIL / 6 PASS in the first 13 regressions.
- Final focused suite: **17/17 PASS**.
- Earlier 16-case revision plus unchanged campaign boundary tests: **48/48 PASS**.
- Tests cover silent drop/mismatch/thrown writes for activity/chapter/campaign, normal readable deduplication, real progress-before-claim boundary, owner changes during set/read, readback throw after actual write, and real identity-partition Alice/Bob/Alice isolation.
- Storage faults are synthetic; local ledger/progress/identity implementations are real. No live backend, player data, full UI journey, deployment or native run.

Production/economic/native HOLD remains. Aggregate validation and independent review are coordinated separately.

## Reviewed ingress pin refresh

Manual comparison confirmed unchanged literal ingress candidates in
`src/lib/campaignLedger.ts`: no direct RPC literals and the existing
`user_campaign_progress` table candidate. Only this file's SHA256 and the
semantic-review manifest SHA256 were refreshed; no inventory regeneration or
other pin acceptance occurred. Seven integrity tests and the drift checker pass.
These pins do not certify reward settlement or whole-claim identity atomicity:
the claim's initial ledger read precedes the writer's epoch capture.

Final local aggregate verification: both TypeScript projects PASS; 1,705/1,705 offline tests across 79 files PASS. Independent bounded source review cleared all 17 new cases. Remote CI remains a separate publication check; no release acceptance is implied.

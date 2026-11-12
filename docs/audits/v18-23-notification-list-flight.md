# V18-23: notification list request lifetime and identity

## Scope and baseline

The actual Notification Center bridge independently fetched each requested list. Center requests 150, HUD and Home each derive unread count from 200, and the realtime banner requests 20. A synthetic concurrent call group issued four RPCs, including duplicate 200 requests. Shared realtime subscriptions did not coalesce these reads. There was no bounded read wait in this module.

A separate synthetic baseline using the real identity partition demonstrated an originating response returning old-owner rows and writing them into the successor's cache partition. This is a source-level reproduction, not evidence about live accounts or deployed server behavior. Eight prospective tests against the old source yielded six failures and two valid offline controls. No live service or personal notification data was accessed.

## Bounded repair

List reads capture owner, identity epoch and mutation generation before asynchronous work. They require matching non-null session UID before RPC. Retired operations return an empty list without reading or writing the successor cache. Same-owner unavailable auth and network failure retain the existing offline fallback; a non-null mismatched UID fails closed. Cache serialization checks the operation again before writing.

Only simultaneous exact-limit calls in the same scope share a flight. Requested 20/150/200 windows remain separate; there is no TTL, result cache, pagination normalization or cross-limit reuse. Existing successful-list cache replacement behavior remains, including a smaller list replacing a larger offline cache.

Read-affecting mutation helpers invalidate the generation at entry and current-owner completion. This prevents joining pre-mutation work and prevents reads begun while mutation was pending from overwriting its later state. Mutation continuations cannot update successor-owner cache or emit from a retired scope. Existing optimistic/error handling and remote mutation semantics remain; this does not cancel or reverse a submitted RPC or establish server write acknowledgment.

A 10-second maximum waiting policy covers both authentication and list RPC. Expiration resolves current-owner cache fallback and releases the shared slot without automatic retry. A subsequent explicit caller may start a new request. Late work remains fenced. This is logical retirement, not transport cancellation or a guarantee that a stalled service request stopped executing.

## Evidence

Final focused suite: **16/16 PASS**, actual bridge plus identity/partition modules with synthetic SDK responses and jsdom storage. Cases include duplicate suppression, distinct limits, Alice→Bob and ABA, delayed auth, mismatched UID, guest and signed-in offline fallback, mutation entry/completion races, retired mutation cache protection, old cleanup versus successor flight, hung RPC/auth deadlines and late response after explicit successful retry. Fake timers test deadlines; no real backend, browser/native runtime, or production request-cost measurement is claimed.

## Remaining boundaries

Mounted UI state and banner queues have separate identity/lifecycle behavior not repaired here. Shared realtime channel ownership/reconnection is also outside this slice. Mutation request authorization remains the existing SDK/server contract; this patch fences their local continuations, not already-issued server writes. Unread fallback behavior and the 200-row window are unchanged. No permission, delivery, earning, guest-transfer, production or economic gate is activated.

Final local regression gates: both TypeScript projects PASS; 1,831/1,831 tests across 88 files PASS; seven economic inventory checks and drift PASS without repinning (notification reads are outside that inventory scope). Independent source/test review cleared the bounded sixteen-case slice. These are synthetic regression gates, not deployed backend or native notification acceptance.

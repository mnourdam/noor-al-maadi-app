# V18 guest heart purchase receipt

## Reproduced defect

With the actual ProfileProvider and useBuyHeart, a guest purchase from 100 dinars and two hearts persisted 80 dinars and three hearts, yet returned `failed`. The legacy synchronous `spendDinarsForHeart` boolean is written inside a deferred React updater, after its caller can already have observed false. The prior guest regression checked balances but not the result. Two new baseline tests failed, including a silently dropped persistence write; this is a deterministic local defect, not a proven explanation of historical player reports.

## Bounded repair

The already captured conditional heart capability gains a guest-only fixed-price purchase method. It validates the current captured frame, guest identity, available heart capacity and finite resulting balance, then submits a pure scalar patch through the existing conditional writer. The promise succeeds only for its committed, exactly persisted token. Fractional finite guest dinars remain supported; the 20-dinar price, heart regeneration policy and legacy synchronous provider method are unchanged. Authenticated purchase parsing, RPC and receipt application remain unchanged.

The hook awaits that local receipt before publishing purchased. An unconfirmed admitted write or identity change returns unresolved and sets the existing mount-local reconciliation latch, rather than authorizing a second purchase. This is not rollback, cross-tab CAS, durable idempotency or automatic reconciliation. The existing UI already distinguishes unresolved. No server authority, baseline, production activation or protected guest-compatibility files change.

## Tests and scope

Eight new actual-provider cases cover persisted successful receipt/remount, silent durable drop, fractional balance, superseding queued admission with no purchase event, full/insufficient no-write results, unresolved retry suppression and guest identity ABA. The historical guest test starts its promise inside act and awaits it after effect flushing, preserving every prior assertion; awaiting a persistence effect inside the same act would deadlock the test harness. Authenticated historical tests remain included. Local focused suite: 32/32 PASS. Full regression/type/build remain coordinator-owned and pending.

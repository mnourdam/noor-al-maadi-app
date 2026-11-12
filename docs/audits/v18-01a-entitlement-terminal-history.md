# V18 entitlement terminal-confirmation history invariant

## Actual invariant and defect

The dormant `settlementForOwner().prepare()` refuses to append a new binding when
any existing attempt is confirmed (`already-confirmed`). This applies equally to
confirmed `delivery_pending`, `delivered`, and `not_due` states. Pending, rejected,
and legacy-unknown attempts may legitimately be superseded.

The shared persisted-row validator previously checked each attempt independently,
without enforcing that history constraint. A raw/corrupt row containing a
confirmed attempt followed by another pending, legacy-unknown, rejected, or
confirmed attempt could pass read/list and transaction validation. Some such rows
could then acquire another confirmation through the actual confirmation API.

The validator now rejects a confirmed attempt at any index other than the last.
This also ensures at most one confirmed attempt. Invalid rows fail with the
existing `settlement:corrupt-record` category. They are not repaired, truncated,
reordered, migrated, or deleted. All consumers of the actual shared validator
receive the same rule; no parallel economic model or new protocol is added.

## Compatibility and limits

Legitimate superseded pending/rejected/legacy-unknown history remains accepted.
A final delivered attempt remains readable: this patch does not create a delivered
API, widen eligibility, or change its existing confirmation-replay conflict.
Same-binding prepare remains idempotent; rebinding after final confirmation stays
forbidden. Immutable terms/source/history and owner isolation remain unchanged.

A structurally valid final confirmation still does not authenticate its opaque
evidence, prove an admitted baseline, validate a grant amount, or prove economic
inclusion. Direct raw writers remain possible. This is validation of an existing
transition invariant, not global writer exclusion or typed grant authority.

## Adversarial evidence

New suite: `tests/offline/outbox-entitlement-terminal-history.test.ts`.
It exercises the actual database/settlement/transaction modules using isolated
fake-indexeddb storage and synthetic rows; external fetch is forbidden.

Before source change: **60 failed / 6 passed**. All twelve forbidden combinations
(three earlier confirmation reward states by four successor progress states)
were tested through read, list, settle, transactional entitlement read, and atomic
confirmation composition. Existing source either accepted the corrupted history
or reported a later decision conflict instead of rejecting the corrupt record.

After repair: **66/66 pass**. Combined with unchanged settlement, schema and atomic
confirmation suites: **136/136 pass** across four files. Every rejection compares
the full four-store raw snapshot before/after, proving queued synthetic companion
writes are not committed and invalid source rows remain intact. Controls construct
legitimate supersessions through actual APIs and retain final delivered shape
compatibility without making a delivery call.

No application wiring, backend calls, schema changes, player balances, grants,
legacy imports, protocol gate activation or protected P1-06B files changed.
Independent review cleared the bounded change and independently reran 136/136
focused tests. Combined local acceptance with the separate Back lifecycle repair:
1,506/1,506 offline tests (58 files), both TypeScript projects, client/SSR build,
and 41/41 scheduler tests passed. Remote CI remains pending publication.
V18 remains HOLD; production remains NO-GO.

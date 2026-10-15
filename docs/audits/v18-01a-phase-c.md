# V18-01A Phase C: archive durability and account isolation

Scope: local Outbox, permanent-rejection archival, and archive diagnostics only.
No SQL, server reward, Cloud Save, deployment, or gameplay UI changes.

## Storage contract

- IndexedDB remains `irth-offline-outbox`, version **1**, store `items`, keyPath `id`.
  There is no schema upgrade or rewrite of server idempotency keys.
- Recovery selects the existing IDB owner for a colliding id (or one fallback
  owner if the IDB key is free). Other owners remain in
  `irth.outbox.fallback.v1`. Their receipts, reads, updates and acknowledgements
  use **both userId and id**, plus the expected revision/snapshot.
- A collision does not stop copying or processing unrelated operations.
  Removal of a primary owner frees the IDB key for another owner's recovery.
- Shared fallback writes still require Web Locks. Without them, unsafe fallback
  changes fail closed; unrelated IDB acknowledgements can continue.
- Permanent rejections are archived under independent keys prefixed by
  `irth.outbox.dead-letter.v1:entry:`. Identity includes the complete source
  snapshot and reason, so different owners/revisions never replace each other.
- The original `irth.outbox.dead-letter.v1` V17 array is still read. Migration
  validates all sources, confirms each independent write, then cleans matching
  legacy snapshots. Interrupted copies remain readable and deduplicate on retry.
- New archival stops at 500 records with an explicit error; existing records
  are never evicted. Oversized historical archives are preserved. Large keys
  or quota failures are explicit errors, not successful receipts.
- Archive mutation/capacity/clear use one Web Lock. `archiveRejected` holds that
  lock through conditional Outbox removal, excluding an intervening clear.
  Failure after archival leaves a retryable Outbox row and an idempotent archive.
- A permanent rejection always counts as failed, never flushed. Failure to
  archive or dequeue leaves the operation pending and does not stop other items.
- Clearing validates a complete archive first and removes only the requested
  user's entries. Errors propagate; diagnostics await clear and display errors.

These guarantees apply to cooperating current clients. Reading V17 formats is
supported; concurrently running older application code does not participate in
these locks. Unknown revision ancestry and corrupt/partial reads still fail
closed rather than choosing or deleting a version.

## API follow-up reserved for Phase D

`remove(id)` is intentionally rejected: callers must retain the receipt and use
`remove(id, receipt)`. These old direct acknowledgements currently catch that
error and leave the row for the revision-aware flush driver:

- `src/lib/stories/progress.ts`: story progress and story completion callbacks.
- `src/lib/tutorial/persistence.ts`: tutorial completion acknowledgement.
- `src/lib/streak-activity.ts`: live streak acknowledgement.

Do not treat this as completion of gameplay enqueue-error handling. Phase D must
review those callers and StoryPlayer/campaign/investigation failure UX separately.
`recordDeadLetter` and `clearDeadLetters` now return promises; the production
flush uses `archiveRejected`, and archive diagnostics await clear. No remaining
production call site assumes synchronous archival/clear.

## Repeatable verification

- `npm run test:outbox`: A/B storage and recovery tests, C archive/account tests,
  and existing streak tests. Tests use fake IndexedDB/localStorage, Web Lock
  simulation, isolated JavaScript realms, and a mocked server only.
- `npm run typecheck:outbox`: application TypeScript and Outbox test/config types.
- `git diff --check`.

Failure injection covers quota/write/confirmation/read errors, 500-record and
concurrent capacity boundaries, restart during V17 migration, interruption after
archive before dequeue, stale permanent responses, archive-vs-clear ordering,
and same-id owners without changing the v1 IndexedDB schema.

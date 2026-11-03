# V18-01A — E-FIX-04/05 Stage 3A

Non-Destructive Schema & Atomic Transaction Foundation. Date: 2026-11-03.
Branch: `v18-01a-outbox-recovery`. Base HEAD: `f1be642cac62a186725e651400ef4da923401067`; branch, HEAD and clean status verified before changes.

**V18 remains HOLD. P1-04/P1-05 remain open. No real economic authority or reward delivery is activated.**

## AUDIT

Reviewed the preceding Stage 2 architectural decision in the conversation, the Foundation report and current settlement implementation. The Stage 2 report was delivered in chat, not stored as a separate repository file. Existing Foundation storage was an IDB v1 database with one out-of-line-key store, `entitlements`. Each operation opened its own connection/transaction and closed it afterward. It had no shared multi-store transaction API, grant path or delivered mutation. Its old opener explicitly requested version 1.

The approved subset is independent of ProfileProvider, balances, reward rules and V17 profile import. No broad architectural modification is necessary for this additive schema change.

## RISK

- Recreating/migrating entitlement rows could lose exact snapshots or attempt order. The upgrade must never read/write/delete those rows.
- Opening an already-upgraded DB with version 1 produces VersionError. Old code must not be silently redirected to a new database or empty store.
- An uncooperative old connection blocks upgrade; a rejected open must not later upgrade behind its caller's back.
- Multiple queued comparisons inside the same transaction can see the same pre-put row; blindly allowing duplicate write targets would bypass CAS.
- Schema existence, a generic economic record or successful synthetic transaction does not establish migration readiness or reward delivery.
- These are local browser transaction guarantees, not proof of physical disk survival, server idempotency or Android force-stop behavior.

## MINIMUM FIX

Keep database name `irth-reward-settlement-v1`; upgrade its numeric version to 2. Add only the three approved stores. Centralize opening/schema validation and provide an internal callback-based multi-store transaction scope. Keep entitlements read-only in that new scope. Route the existing Foundation opener through the shared schema opener without changing its existing state-transition rules.

No commands, syncIntents, serverObservations, legacySnapshots or economic baseline stores are added. Those require later approved contracts; no real import or synchronization is performed now.

## IMPLEMENT — schema

| Numeric version | Stores | Upgrade behavior |
| --- | --- | --- |
| 1 | entitlements | Existing store and keys/values retained |
| 2 | entitlements, economy, appliedGrants, migrationState | Add missing new stores only; never recreate entitlements |

All stores use out-of-line keys, no auto-increment. `entitlements` retains its original JSON `[owner, entitlementKey]` key encoding and value schema/history. Neither its schema version field nor history order is transformed.

`onupgradeneeded` creates entitlements only for a genuinely new database (`oldVersion=0`). Existing v1 missing entitlements or with an incompatible keyPath fails and aborts upgrade. Schema validation aborts malformed layouts rather than deleting data. Failed upgrade rolls back newly created stores along with the version change.

New stores are initially empty. Their internal staging envelope is:

- `schema: 1`, explicit `owner`, logical `key`;
- safe positive integer `revision`, assigned by the transaction API;
- `value`: validated finite JSON data.

This envelope is storage infrastructure, not a finalized economy/profile model. There is no default balance, migration-ready flag, seed, profile reader or automatic economic activation. Tests alone write synthetic payloads and an explicitly `uninitialized` migration fixture. Future import must define strict domain-specific payload schemas before treating any record as authority.

### Connection lifecycle and mixed versions

`openSettlementDatabase()` requests numeric version 2 and validates all required store layouts before resolving. Successful connections install `onversionchange = close`; active transactions may finish before a close takes effect. Callers close connections in finally blocks.

`onblocked` rejects with `settlement:database-blocked`. The pending request is marked abandoned. If it later reaches upgrade after the blocker closes, it aborts that upgrade; a caller must explicitly retry. A late successful abandoned connection is closed. There is no timeout-driven delete/reset, version fallback or automatic reload.

An actual v1-only client opening version 1 after upgrade receives the native VersionError. A future database version also causes the v2 opener to report VersionError. Neither error is hidden. Prior-build tabs do not acquire new compatibility by this change; uncooperative tabs can continue to block until closed. This is reported, not bypassed.

### Internal transaction API

`transactionsForOwner(owner)` captures the real identity epoch and owner. `run(scope => ...)` opens one readwrite transaction over the four shared stores. The transaction is short-lived and has no React, localStorage, RPC or network dependency.

The scope exposes only:

- `read(store, key, receive)` for the new record envelopes;
- `readEntitlement(key, receive)` with strict existing entitlement validation;
- `compareWrite(store, key, expected, value)` for economy/appliedGrants/migrationState;
- `abort()`.

There is no raw DB/store handle in this scope, entitlement write, grant calculation, delivered method, delete, clear or authority-activation API. The schema opener itself remains an internal storage module needed by the existing Foundation adapter and tests; it is not a sandbox against arbitrary same-origin JavaScript.

All physical keys use the captured owner, never the currently active replacement owner. Checks run before opening, before operations/writes and after commit. Owner change aborts a pending transaction. A completed commit is not compensated/deleted: it remains under its original owner, while a late caller can receive identity-changed and must re-read with a new valid owner handle.

`compareWrite` clones its expected snapshot and next value, reads the current record inside the same transaction, validates both and compares the full canonical snapshot. Undefined expected means insert-only. On match it assigns revision+1; stale snapshots fail without last-writer-wins. Unknown/corrupt data and invalid JSON fail rather than becoming an empty/default record.

Two transactions competing on these stores serialize through IndexedDB. Both may succeed if each computes from a fresh read inside its own transaction; two updates carrying the same stale pre-read snapshot cannot both succeed. Different owners have isolated physical keys, although this conservative transaction store scope serializes their writes as well; parallel throughput is not claimed.

Within one run, a second write to an already-targeted store/key aborts (`duplicate-write-target`). Reading after a write to the same target is rejected (`read-after-write`) rather than returning a misleading pre-put value. Callers must gather required reads, compute synchronously and schedule one replacement per target. Dependent asynchronous work must not be placed into this scope.

Callbacks must synchronously enqueue IDB operations. Thenables from the initial callback or read callbacks abort the transaction; rejected async results are observed to avoid unhandled rejection noise. This enforces a synchronous callback contract, not a general sandbox that can prevent arbitrary caller side effects. No network/RPC is awaited by the implementation. The run promise resolves only after `transaction.oncomplete`, never on request success.

### Atomicity argument

All compare reads, record replacements and error handling belong to one IDB transaction. A thrown validation/CAS/quota error, failed request, explicit abort or identity-change abort prevents the entire write set from committing. Successful request events do not announce success. A complete event means all records in the write set have committed together.

This proves storage atomicity across synthetic economy/appliedGrants/migrationState records and consistent entitlement reads. It **does not prove atomic reward delivery with entitlements**: this phase deliberately exposes no entitlement mutation in the shared scope and does not update ProfileProvider. A later reviewed transaction adapter must join real grant effects and delivered state; invoking two separate transactions is still insufficient.

## TEST

New suite: `tests/offline/outbox-settlement-schema.test.ts`. Uses fake-indexeddb, jsdom, real owner/epoch guards, independent module contexts/connections and forbidden external fetch. Fixtures contain no real balances/accounts. Reopening connections and module reload simulate context loss; aborting transactions simulates pre-commit interruption. These are not native-browser or physical Android crash tests.

Coverage:

1. Fresh v2 with exactly four empty stores and absent migration readiness.
2. Real v1 fixture with two owners and multi-attempt entitlements, including revisionless history; exact JSON/key/value/history equality after upgrade.
3. Corrupt old row retained unchanged; malformed v1 store layout aborts schema upgrade without replacement.
4. Three-store synthetic commit with a strictly validated, unchanged entitlement read.
5. Synchronous quota failure and asynchronous duplicate-key request failure roll back the entire write set.
6. Abort after put success but before commit; no partial row survives.
7. Committed record survives reopening/module-context restart; no result is announced on request success before complete.
8. Same-owner independent contexts competing on a stale snapshot: one winner, one CAS rejection; fresh in-transaction increments both survive.
9. Independent Alice/Bob module identities concurrently persist isolated owner records.
10. Identity switch after put aborts; switch at complete preserves the original owner's committed record while rejecting the stale caller.
11. Corruption/read failure rejects without replacing an existing record or returning default readiness.
12. Initial/read async callbacks abort, full-snapshot CAS rejects forged values with unchanged revision, invalid sparse JSON aborts, duplicate-target and read-after-write hazards fail closed.
13. Cooperative versionchange closes an old connection; uncooperative v1 connection blocks, abandoned upgrade aborts, explicit retry retains data; older/newer incompatible version requests expose VersionError.
14. No entitlement write/delivered operation in the scope, no network call, no economic activation.

The prior Foundation test helper that deliberately opens raw storage now omits the hard-coded version argument, so it inspects the existing schema rather than emulating obsolete v1-only application code. **No previous assertion was changed or removed.** Genuine old-version incompatibility is tested explicitly in the new suite. All A/B/C/D and E-FIX suites remain included.

Validation results:

| Check | Result |
| --- | --- |
| `npm run test:outbox` | **285/285 passed**, 11 files: 259 existing + 26 new Stage 3A cases |
| `npm run typecheck:outbox` | Passed: application and Outbox TypeScript projects |
| `npm run build` | Passed: local web build only; existing deprecation/bundling warnings |
| `git diff --check` | Passed |

Focused Foundation/initial Stage 3A tests passed before the full run. The final full run includes the duplicate-write-target, read-after-write, fresh concurrent increment, cooperative-upgrade and commit-boundary cases. No old assertion was relaxed and no existing case was skipped to obtain these results.

## CLOSE / next stage

Changed files:

- `src/lib/rewards/database.ts` (new shared schema opener)
- `src/lib/rewards/transaction.ts` (new internal transaction scope)
- `src/lib/rewards/settlement.ts` (shared opener and shared strict validator)
- `tests/offline/outbox-settlement-schema.test.ts` (new acceptance suite)
- `tests/offline/outbox-settlement.test.ts` (raw fixture opener only)
- this report

No production gameplay caller uses the new transaction scope. No ProfileProvider/profile, campaignLedger, gameplay route, XP/dinar/heart rule, Cloud Save, RPC/SQL, streak/level, help purchase or campaign unlock condition was modified. No V17 data is imported, cleared or reinitialized. No baseline or real economic record is generated.

Next stage still requires an approved V17 owner-scoped importer, strict economic payload model, migration-readiness contract and failure recovery without seed substitution. Later stages must protect all existing writers, define source-specific server reconciliation, add atomic delivered mutation only alongside real effects, and prove native browser/device crash behavior before activation. Guest P1-06 and P1-07 remain separate. The prior investigation suite's ten passing repetitions did not prove timing-flake impossibility; no investigation test was changed here.

No blocker identified for this additive inactive subset. Data-preserving rollback means retaining the v2 database and using compatible code; deploying v1-only code after upgrade will encounter VersionError and is not a transparent rollback. No database deletion or downgrade is proposed. Physical eviction, clear-app-data and storage corruption are not solved by IDB transaction atomicity. Network/server and cross-device exactly-once guarantees are not claimed.

Authorized delivery after green checks: one commit and push to the current V18 work branch only. No Production connection, SQL, Cloud Save operation, release, deployment or merge. Stop before V17 import or real reward delivery. **V18 HOLD; P1-04/P1-05 open.**

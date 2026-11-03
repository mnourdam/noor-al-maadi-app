# V18-01A E-FIX-04/05 — Stage 3B-2E

## Decision / scope

**Inactive test-only IndexedDB durable-intent and atomic-receipt prototype.** V18 remains **HOLD**. P1-04 and P1-05 remain open. No ProfileProvider integration, V17 migration, baseline import, staged snapshot, actual reward, `delivered`, boot fence activation or production schema change.

Starting branch: `v18-01a-outbox-recovery`. Verified HEAD `f405e557934670b111dca49d55fa82f54c486f56` and clean Git before changes. Followed AUDIT → RISK → MINIMUM FIX → IMPLEMENT → TEST → CLOSE within this isolated scope.

## AUDIT → RISK → MINIMUM FIX

Reviewed Stage 3B-2C/2D reports, their test-only receipt helper/React suite, and the existing `writer-fence.ts`, `database.ts`, `transaction.ts`, `settlement.ts` contracts. Stage 2D proves only a synthetic in-memory atomic store and has no durable pending-intent discovery. Production settlement schema v2 has inactive transaction infrastructure but no atomic real-profile grant integration. The fence is explicitly in-memory and cannot establish global writer exclusion.

Risks: request success before transaction completion, lost commit replies, absent or inconsistent rows, identity changing during queued IDB callbacks, concurrent connections, revived terminal operations, and treating a recovered record as recovered writer authority. Minimum fix is a **new tests-only** IDB helper with three isolated stores, independent of both the Stage 2D Map and production storage. No existing source or test assertion changes.

## Schema and identities

Only database names beginning `irth-test-durable-intent-` are accepted. Test schema version is **1**, unrelated to production version 2. Stores use explicit keys, no auto-increment:

| Store               | Key                    | Record                                                                                                                                    |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `durableIntents`    | `[owner, operationId]` | schema, owner, stable ID, immutable normalized command, full command fingerprint, admission session, state, optional disposition evidence |
| `syntheticEconomy`  | owner                  | schema, owner, synthetic integer value, revision                                                                                          |
| `appliedOperations` | `[owner, operationId]` | schema, owner, stable ID, command fingerprint, before/after values, revision, transaction ID, application session                         |

Synthetic example: value 100, increment by 50. There is no real ProfileState or economic interpretation of these values. Fixtures explicitly insert synthetic initial rows; the adapter **never** initializes an absent economy or imports V17 data.

A session contains owner, epoch, fence-generation label and instance ID, captured immutably. Every operation checks the current injected session at entry, IDB callbacks, mutation, and completion. Optional synchronous identity notifications abort active transactions on account change. Returning Alice after Bob requires a new epoch/context; the original context is stale. Persisted `admittedBy` is historical provenance, not permission to use that old identity. A fresh authorized Alice context may resume Alice's valid pending intent; it records its own application session.

Operation key and fingerprint intentionally survive epoch/context changes for the same owner. Fingerprint encodes schema, owner, operation ID, and the complete supported command `{kind:'increment', by}`. Unknown command fields and invalid arithmetic are rejected rather than omitted from the fingerprint. Different command payloads for the same key conflict. Optional expected economic revision is an application-time CAS precondition, not an implicit command payload or permission to revise terms.

## Durable admission and states

`admit` checks the session, reads the existing intent and orphan applied key, and writes a pending intent in a readwrite transaction. It returns **only after `transaction.oncomplete`** and a final identity guard. No computation/economic write occurs in admission. A retry with identical command returns the existing intent, including terminal state, without replacing it. Corruption (including a stored null) does not become an empty row.

| Intent state | Automatic behavior                                                 |
| ------------ | ------------------------------------------------------------------ |
| `pending`    | Eligible for one local synthetic application after validation      |
| `applied`    | Read/validate saved applied evidence; never add the effect again   |
| `rejected`   | Persisted explicit reason/transaction/session; never apply         |
| `cancelled`  | Persisted explicit cancellation or `no-effect` reason; never apply |
| `unresolved` | Retain evidence and stop automatic application; no guessed grant   |

A no-op is saved as `cancelled` with reason `no-effect`, without incrementing economy revision or creating a false applied key. Explicit rejection/cancellation/unresolved records are durable terminal dispositions for this prototype; the API provides no automatic reopening or compensation. Revision mismatch persists `unresolved/revision-conflict`. Caller wait timeout/cancellation has no such semantic effect.

## Atomic application algorithm and receipt

Every application uses **one IndexedDB readwrite transaction spanning all three stores**, including across independent database connections:

1. Read latest intent, owner economy and matching applied record inside the transaction.
2. Validate key/owner/schema, complete fingerprint, admission provenance, economy revision/value and consistency of intent/applied evidence. Missing economy is an error, never a default balance.
3. If already applied, validate and return the original applied evidence after this read transaction completes. If rejected/cancelled/unresolved, return that state without a grant.
4. For pending only, verify any explicit expected revision. Mismatch stores unresolved evidence and does not apply.
5. Calculate the synthetic effect synchronously. Check safe-integer overflow. The test hooks cannot return promises or keep an IDB transaction open through awaits.
6. Queue economy value/revision, applied-operation key, and applied intent/disposition in the **same transaction**. Identity guards cover request callbacks and writes.
7. Resolve the outcome only from **`oncomplete`**, never from any `put.onsuccess`. Abort rejects and rolls back all three stores.

The applied row and applied intent share transaction ID, owner, command fingerprint and application session. The outcome includes this persisted evidence; a replay returns the same applied row. These are local transaction receipts, not signed server evidence or a `delivered` assertion. The helper has no separate receipt authenticity cache/Map or Web Locks. IDB transaction serialization and persisted operation keys, not in-memory coordination, prevent duplicate application.

If identity changes after commit, the old-owner data stays committed, while response publication is blocked. If completion notification is lost, the promise can reject despite an actual commit: callers must **discover/reconcile**; they must not infer rollback from rejection. Another connection sees pending or applied as actually committed and can retry safely.

## Discovery / corruption / storage failure

`discover` scans explicit keys within a single readonly transaction, returns only the current owner's records, validates associated economy/applied evidence, and resolves after all queued reads and transaction completion. It finds pending intents without the caller already knowing their IDs. It also finds an orphan applied key with no intent.

Invalid intent rows, mismatched/missing applied records, owner/revision inconsistencies and orphan applied keys surface as **unresolved**, retaining their raw durable evidence. Discovery does not rewrite corrupt rows into a made-up valid state or issue an automatic compensation. The unresolved classification for corruption is derived on each read of preserved records; it is not a successful repair. Malformed storage keys fail closed. Applying corrupt/missing records rejects; no empty fallback or automatic repair is used. Validation detects the tested structural and cross-record inconsistencies, not arbitrary coordinated tampering with every record or authenticated historical truth.

Quota/abort preserves the last committed state. Admission failing before commit leaves no discoverable intent; application failure retains the previously committed pending intent. Failed opening has no alternate empty store. Unit quota tests inject `QuotaExceededError` at controlled request-success boundaries; they do **not** claim to fill a physical disk or measure browser quota. Blocked open rejects rather than hanging, and an abandoned eventual connection is closed. No database clear/delete is used by the adapter.

## Crash matrix

Tests close/reopen connections and discard contexts, and explicitly abort transactions at controlled boundaries. Native tests additionally close and reopen the Chromium process with a temporary persistent browser profile. This is not a simulated hardware power failure.

| Boundary                                                 | Durable evidence / recovery                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: before durable intent                                 | No intent exists; nothing can be automatically recovered. Failed/aborted admission has the same absence.                                             |
| B: intent committed, before computation                  | New connection discovers pending command and admission provenance; new authorized session can apply.                                                 |
| C: during calculation                                    | Aborted application leaves pending intent and old economy; a new context can retry.                                                                  |
| D: during readwrite transaction                          | All effect writes roll back together; previous pending intent remains.                                                                               |
| E: successful put, abort before commit                   | Tested after each effect-store request success: no economy delta, applied key or applied intent survives.                                            |
| F: commit complete, notification lost                    | Both admission and application cases tested. Discover actual pending/applied state; never assume failure.                                            |
| G: restart / pending discovery                           | Fresh context enumerates intents from IDB, not an old Map/fence.                                                                                     |
| H: retry from another context                            | Same key/command yields one effect and the same persisted applied evidence.                                                                          |
| I: applied before UI projection                          | Stored state/receipt survives missing render; replay does not increment again.                                                                       |
| J: corrupt intent/applied/economy or missing counterpart | Preserved unresolved evidence; no guessed grant or data reset.                                                                                       |
| K: quota / open failure                                  | Reject without partial writes or empty fallback; absence before admission is not recoverable.                                                        |
| L: account switch in transaction                         | Notification aborts active work; old context stays stale after Alice→Bob→Alice. After commit, block old response and reconcile original owner later. |

## Concurrency evidence

Independent connections to the **same database** are used in unit tests; independent same-origin pages are used in native tests. They share IDB storage, not a helper Map. Scope includes all three stores, so transactions currently serialize even for different owners; this is a conservative correctness choice, not a parallel-throughput claim.

- Same ID/same payload: one persisted applied key, one value delta/revision, identical receipt on replay.
- Same ID/different payload: one admission wins; other conflicts; original durable command remains.
- Different IDs/same owner: each reads the latest committed economy; both deltas retained with successive revisions.
- Same ID/different owners: distinct intent/applied keys and balances; discovery is owner-scoped.
- Expected revision conflict: unresolved disposition survives restart and blocks automatic grant.
- Lost callback: new context observes committed evidence and does not repeat the effect.
- Alice→Bob→Alice: original session cannot resume; a fresh Alice epoch can reconcile Alice's stored operation.

## Writer Fence and guarantee boundaries

The helper does **not** change or restore Writer Fence authority. Tests use the real unchanged core to show that timeout/cancel leaves accepted work unresolved, and another context applying a durable intent does not silently ACK the old ticket. A new fence refuses an old foreign ticket. Even an empty new fence's local quiescence result retains the prior-context blocker and HOLD.

| Guarantee                        | Evidence / limit                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Transaction atomicity            | fake-indexeddb and native Chromium commit/abort tests across the three experimental stores                 |
| Durable intent discovery         | Reopened connections and native persistent-profile browser reopen discover committed pending intents       |
| Idempotent local application     | Persisted applied key + matching intent + shared IDB transaction; tested concurrent/restart retries        |
| Per-owner isolation              | Composite keys, owner validation, current-session guards; tested two owners and identity transitions       |
| Writer Fence local quiescence    | Unchanged in-memory core; only registered local work, not an automatic consequence of IDB discovery        |
| Global writer exclusion          | **Unproven**; no production writers fenced/discovered; import remains HOLD                                 |
| Physical device durability       | **Unproven**; no Android/power-loss/eviction/fsync proof; normal IDB completion is the observable boundary |
| Server/cross-device exactly-once | **Unproven**; no RPC/server or shared backend protocol is involved                                         |

No transaction exists between this experimental database and production Outbox, settlement or localStorage. No inference is made from missing Outbox receipts, RPC results or flush completion.

## Test execution

Unit tests run through the existing isolated Vitest configuration and fake-indexeddb dependency. Previous 416 cases/assertions remain unchanged. New suite blocks fetch and ambient player localStorage/sessionStorage; storage is explicitly injected.

Native command: `python3 tests/offline/browser/durable-intent-native.py`. Existing Python Playwright and `/usr/bin/chromium` were available; **no dependencies were installed**. The script transpiles the same helper using existing TypeScript, serves only temporary files at a loopback origin, restricts page requests to that origin, and uses a fresh temporary persistent Chromium profile. It never loads the deployed app. The ordinary command sandbox denied local socket creation (`PermissionError: [Errno 1] Operation not permitted`); a scoped `require_escalated` execution allowed this loopback-only test. Proxy variables/policy were not changed.

Native result on final helper: **PASS, 7 scenarios**, Chromium **151.0.7922.173**, actual persistent browser-process reopen. Scenarios: pending intent restart/application; same-ID two-page race; distinct-ID concurrent writes; successful put followed by abort/retry; commit reply loss/replay; no-op and rejection persistence; identity-switch abort/new-session recovery. Synthetic final value 325/revision 7 matches exactly the intended effects. Native restart here uses orderly close/reopen; abrupt process kill and device crash are separate future checks.

Final verification results:

- `npm run test:outbox`: **PASS, 453 tests / 16 files** (416 unchanged prior cases + 37 new cases).
- `npm run typecheck:outbox`: **PASS**, both application and isolated Outbox TypeScript projects. Initial new-helper control-flow narrowing errors were corrected before the passing run; no old assertions or production types were changed.
- `npm run build`: **PASS**, snapshot already current and client/server builds completed. Existing chunk/plugin warnings were non-fatal; no deploy was run.
- `git diff --check` and staged diff check: **PASS**.
- Final native Chromium run after the returned-evidence isolation change: **PASS**, 7 scenarios, same results above.
- Python runner syntax and new TypeScript/Markdown formatting: **PASS**.

The final unit suite also verifies that mutating returned admission/application evidence cannot mutate the private captured session or stored command: results are detached structured clones.

## Future settlement v2 contract (not implemented)

1. Keep this database entirely test-only. Do not transplant its synthetic seeds or use them as player balances. No V17 imports/staging are authorized.
2. Design an approved v2-compatible record mapping for durable intents, command/revision/snapshot fingerprints, terminal no-op/cancellation and applied-grant evidence; preserve existing entitlements and legacy_unknown. A durable intent is not server confirmation or reward entitlement by itself.
3. Bind future local grant, applied-key and entitlement/delivery transition inside **one transaction in the authoritative database**. Existing production transaction API does not expose an entitlement write/grant protocol; adding that requires a separately reviewed contract and compatibility tests. A second database cannot supply atomicity for v2.
4. Inventory/fence all profile writers before choosing any authority cutover. Add versioned owner/epoch-aware React projections, hydration, old-write rejection and restart reconciliation. Do not integrate this prototype into ProfileProvider or boot as a shortcut.
5. Preserve server-authoritative rewards as a separate reconciliation path; never replay a local increment from RPC success. Guests remain under P1-06. Keep economy values/caps and strict campaign progress unchanged.
6. Before activation: browser/Android abrupt-restart and storage-failure tests, intent retention/compaction and corruption UX policy, trusted operation IDs/terms, owner lifecycle, multi-writer coverage/global exclusion contract, rollback/version compatibility, and acceptance of the limits of local versus server/cross-device guarantees.

Rollback of this stage removes test/report files only; no production records were read/migrated/written. A future production rollback must retain durable evidence and reject obsolete writers, never clear/delete a database or revert authority to an unfenced old writer.

## Files changed

- `tests/offline/helpers/indexeddb-intent-prototype.ts`: inactive injected IDB intent/application contract.
- `tests/offline/outbox-indexeddb-intent.test.ts`: fake-indexeddb concurrency/crash/identity/fence tests.
- `tests/offline/browser/durable-intent-native.py`: optional existing-tool native Chromium runner.
- `docs/audits/v18-01a-e-fix-04-05-stage-3b2e.md`: this report.

Stop after this prototype and report. No production integration is approved by a green test result.

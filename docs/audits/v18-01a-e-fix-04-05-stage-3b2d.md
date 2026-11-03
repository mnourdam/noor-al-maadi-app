# V18-01A E-FIX-04/05 — Stage 3B-2D

## Decision and scope

AUDIT → RISK → MINIMUM FIX → IMPLEMENT → TEST → CLOSE, for an **inactive test-only receipt adapter prototype**. Starting branch was `v18-01a-outbox-recovery`, HEAD `fa56e2ae66616450501c17a542b06482b0a789ca`, with clean Git status. Reviewed Stage 3B-2C, `writer-fence.ts`, `profile.tsx`, `transaction.ts`, and `settlement.ts`.

No production modules, existing assertions, dependencies, schemas, gameplay, economy, boot, identity, migration, Cloud Save or settlement states are changed. No real ProfileState, V17 balances, baseline import, XP or `delivered` is created. P1-04/P1-05 remain open; V18 remains **HOLD**.

## Audit and risks

The existing ProfileProvider computes React state and persists it later through a localStorage effect. A React callback, reducer result, effect return, or read after `setItem` does not prove atomic inclusion of a particular operation, and localStorage has no cross-context compare-and-swap transaction. Separate profile and reward/receipt keys cannot establish atomic reward delivery. The real Writer Fence deliberately tracks computation separately from durable acknowledgment, retains unresolved accepted work, and only establishes local quiescence; global writer exclusion remains unproven.

Minimum change: keep the prototype under `tests/offline/helpers`, inject storage, use synthetic `{ value, flags }`, and exercise the unchanged real Writer Fence. This avoids making an unproven adapter available to production callers.

## Data and receipt contract

An accepted operation contains a stable caller-supplied ID, immutable command fingerprint, owner, identity epoch, fence instance, generation and monotonically increasing context-local change version. `writer.accept` precedes calculation and mutation. Repeating the same ID and payload returns the same accepted object; a changed payload conflicts. New contexts do not reset persisted inclusion history.

An immutable batch captures its base snapshot and selected accepted operations. Its pure computation is safe to replay: no registration, storage, ACK or projection occurs inside the reducer/updater. A snapshot contains owner, revision, transaction ID, synthetic profile and the inclusion ledger. Each inclusion entry records the operation ID, fingerprint, original identity binding/change version, and first included revision.

A receipt binds the **actual committed** transaction ID, owner, revision, exact immutable frame signature, actual snapshot and actual included-operation entries. The store issues it only after commit. The injected store authenticates receipt objects; copied/forged receipts fail. This WeakSet authenticity is a test capability, not a persistent receipt-signing or restart-authentication mechanism. Production must derive evidence from the authoritative transaction result and persisted records, not trust a caller-created object.

The adapter matches frame, identity/generation, transaction, revision, operation fingerprint and persisted inclusion before calling the real fence ACK. A receipt for A never acknowledges newer B. An excluded/no-effect operation is not acknowledged even if the save succeeded. Excluded operations deliberately remain unresolved: a future durable cancellation/no-op disposition contract is needed before they can safely drain. They are not silently discarded.

## Atomic storage model and concurrency

`SyntheticAtomicStore` is an injected **in-memory model of a future atomic store**, not IndexedDB, disk durability or an Android persistence implementation. Tests preserve its committed rows while discarding adapters/fences to model restart. They do not prove survival of browser process termination, power loss or storage eviction.

Within one serialized synchronous transaction:

1. Resolve exact-frame retry against prior committed results.
2. Compare the complete authoritative owner row with the captured base (CAS).
3. Recheck owner/epoch/generation and accepted-ticket validity at the write boundary.
4. Recompute effects into an isolated working copy; record only operations that actually change state and are not excluded.
5. Publish profile and inclusion ledger as **one owner row** and issue a receipt. No asynchronous gap exists inside this atomic section.

An exception during draft construction publishes neither profile nor ledger. Gates/delays occur outside the atomic section; an injected async callback inside it is rejected. Concurrent contexts sharing this store cannot both overwrite the same base: the loser must refresh and recompute. These guarantees come from the explicit injected transaction contract, not from localStorage. Separate store instances are not claimed to coordinate. Persisted records are never replaced by an empty fallback on missing read.

A lost reply after commit leaves the fence unresolved. Retrying the identical frame obtains the original receipt without another effect/revision. After a modeled restart, a known ID with matching payload found in the saved inclusion ledger returns `already_committed`, without registering/reapplying it. This requires the caller to know that ID; it is not discovery of an uncommitted pending intent. Durable command fingerprints/IDs and ledger retention policy still need production design.

Submission-attempt failure is recorded separately from accepted-operation completion: it does not forge an ACK or terminal outcome. The prototype intentionally does not invoke the fence's sticky `storageFailed` for a retryable attempt; accepted work remains unresolved until verified retry. Existing core failure semantics are unchanged. Production must define transient versus terminal storage-failure policy explicitly.

## React and lifecycle separation

The isolated React harness mounts no ProfileProvider. A batch can include multiple accepted operations; StrictMode and functional-updater replay repeat pure calculation and effects but not acceptance or actual mutation. Exact-frame persistence retry deduplicates the save. Tests exercise actual StrictMode, updater replay, unmount/remount, and DOM projection; other cases control delayed persistence and stale callbacks directly.

The stages remain distinct:

- computation finished: the pure captured frame is calculated and explicitly marked;
- submitted: an attempt exists, potentially blocked before transaction;
- committed: the store atomically published profile and inclusion ledger;
- fence ACK: only verified included tickets receive durable evidence;
- projection dispatch: a current receipt schedules/passes a snapshot;
- React render: the harness separately observes the rendered DOM;
- local quiescence: all accepted local work drains under the real fence;
- global exclusion: **unproven**, regardless of any local proof.

An ACK is not a React render. A projection callback is not proof of storage. Projection rejects a stale store transaction or revision; a production React reducer must also revalidate current identity/revision when applying a queued state update. Snapshot checks before dispatch alone cannot guarantee freshness after another tab writes. Neither cross-tab UI synchronization nor global exclusion is claimed here.

Changing identity before calculation/effect, during a delayed attempt, or after commit blocks old-owner ACK/projection. A commit that already happened belongs to its original owner and is not undone or attributed to the new owner. Timeout/cancel ends waiting, not the accepted work or close lease. Unmount does not fabricate completion.

## Crash boundaries and restart

| Boundary                          | Stored facts and tested result                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: before admission               | No accepted intent or new snapshot. Fresh context invents nothing.                                                                                                                                        |
| B: accepted, before calculation   | Only old context memory knows the operation. No recovery is claimed.                                                                                                                                      |
| C: calculated, before persistence | Same limitation as B; computation does not survive as an intent.                                                                                                                                          |
| D: during transaction             | Draft abort leaves profile, revision and inclusion ledger unchanged together.                                                                                                                             |
| E: commit, before fence ACK       | Snapshot and included IDs survive the modeled context restart; old fence is not magically recovered. Known-ID replay is rejected as already committed. Lost reply can be retried in the original context. |
| F: ACK, before projection         | Stored state is already authoritative; missing UI update does not repeat the mutation.                                                                                                                    |
| G: fresh context                  | Reloads only the stored snapshot/ledger. Unknown prior-context work remains a blocker and import stays HOLD.                                                                                              |

A separate durable intent protocol is required to discover/reconcile accepted work across B/C or process death before commit, and to represent cancellation/no-op outcomes. The current in-memory fence and this prototype do not provide it. After restart, receipt WeakSets and prior frame-response caches are not asserted recoverable; persisted inclusion, not their memory, prevents replay of a known committed operation.

## Acceptance evidence

The new independent suite has 28 cases covering stable registration/versioning, pure replay, commit/ACK/projection separation, exact batch inclusion, actual store exclusion, no-op/excluded work, forged receipts, quota failure/retry, delayed effect, old version ACK, stale CAS, independent concurrent contexts, identity changes, cancel/timeout, duplicate submission, crash A–G, lost commit reply, real StrictMode/updater replay, unmount/remount, and missing snapshot without initialization. Ambient localStorage/sessionStorage/IndexedDB and fetch are blocked in this suite: only the injected synthetic store is usable.

Verification on this branch:

- `npm run test:outbox`: PASS, **416 tests across 15 files** (388 existing + 28 new). Existing test files/assertions unchanged.
- `npm run typecheck:outbox`: PASS (application TypeScript and isolated Outbox TypeScript).
- `npm run build`: PASS (client/server build; no deployment). Build emitted chunk/plugin timing warnings without failing.
- `git diff --check`: PASS.

The focused new suite also passed independently: 28/28. No production endpoint was contacted by the new tests; no SQL, RPC, Cloud Save or gameplay operation was performed.

## Later production integration: prerequisites and minimum slice

1. Prove an actual IndexedDB implementation of the same atomic row/ledger transaction using controlled abort/commit/reopen tests and Android WebView checks. A request-success event alone is insufficient; wait for transaction completion. Define durability/eviction assumptions honestly.
2. Design durable intents and terminal no-op/cancellation outcomes, plus owner/epoch/version validation, restart reconciliation and ledger retention. Do not infer delivery from a missing Outbox receipt or an RPC result.
3. Fence **all** profile writers and prevent legacy React/localStorage/Cloud Save snapshots from overwriting the newer authority. Define a versioned projection API with identity validation inside the React state application, hydration, error and unmount behavior. Do not activate merely by adding an effect.
4. Start with a disabled, non-economic synthetic field and a controlled provider harness; prove stale-writer rejection and restart before approving a real field. No V17 baseline/import or production staging is authorized by this phase.
5. Obtain separate approval for any first real local mutation, preserve caps and economy, and atomically bind the real entitlement/applied-key state to the grant. Server-authoritative rewards require a distinct refresh/reconciliation contract; guests retain P1-06. Neither can be treated as a replayable local increment.

Rollback for this stage is removing test-only artifacts; no real data was written. A future durable-source rollout needs read-compatible versioned records and an authority fence; rolling back to an unfenced old writer or clearing storage is unsafe. No production integration or global readiness is established by these tests.

## Files

- `tests/offline/helpers/profile-receipt-prototype.ts`: injected contract model, atomic synthetic store, adapter.
- `tests/offline/outbox-profile-receipt.test.tsx`: independent unit/lifecycle/React/crash suite.
- `docs/audits/v18-01a-e-fix-04-05-stage-3b2d.md`: this report.

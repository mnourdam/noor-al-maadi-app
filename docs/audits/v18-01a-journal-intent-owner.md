# Dormant journal-owned pre-transport intent prototype

## Representation and authority boundary

The engineering choice is one durable journal command before transport, not an outbox receipt invented before enqueue. New `journal-intents.ts` provides fixed `prepare` and readonly `readCommitted` APIs; there is no dispatcher, arbitrary store callback, RPC/outbox import, confirmation/delivery, balance, grant or enrollment operation.

An immutable version-1 command records its owner, command ID, protocol/type (`chapter-progress-attempt` only), campaign/chapter/activity description, payload and complete target/terms/level list. Its journal revision is explicitly 1. `payloadCanonical` is exact sorted JSON, not a cryptographic digest or earning evidence. The command validates campaign/chapter payload matching; declared activity/tier/target descriptions remain untrusted intent metadata, not proof of completion or eligibility.

Pending references are root version 2 with the `journal-command-v1` binding discriminator and journal command revision/canonical payload. This is distinct from existing version-1 outbox binding semantics. Both use existing `[owner,key]` addresses. Collision with a v1 row or another command fails without conversion. Existing v1 validators and confirmation APIs remain unchanged and reject v2 rows. A v1 list for an owner containing v2 rows intentionally fails closed; another owner's v2 records do not poison a v1-only owner's list. This is why the prototype is dormant, not a transparent live migration.

## Atomicity and schema

Schema version 3 adds only `intents`. Existing `SETTLEMENT_STORES` and `transaction.ts` remain the fixed four-store contract. Schema validation uses a separate five-store list. A v2 upgrade requires all four existing stores with their expected unkeyed/non-autoincrement shape before adding intents; missing/corrupt v2 stores are not repaired. V1 requires its existing entitlement store and validates any existing additional stores before upgrade completion. A new installation creates all five. An aborted upgrade rolls back version and store additions.

Input is cloned/validated as strict finite plain JSON synchronously before IDB awaits; sparse arrays, accessors, symbols and unsupported shapes fail. A single readwrite transaction over intents+entitlements validates old rows, then inserts command and every reference together. An exact duplicate validates every referenced row and immutable command field; missing/conflicting references are not repaired. A readonly two-store transaction validates the command and all its references, returning a clone only after completion and current-identity checks.

Accepted means this local transaction completed, not a server decision. Proposed command IDs are not receipts until commit. Retry/recovery must inspect the same proposed ID rather than generate another one. Existing old wallet/profile data is never imported or initialized.

## Evidence checkpoint

Initial implementation: 22 new fake-IndexedDB cases plus existing schema/settlement/atomic-confirmation suites passed **92/92**. Existing schema tests change only their declared target schema version/store list and the deliberately newer-version fixture; historical behavioral assertions remain.

Coverage includes immutable exact duplicate, changed payload/terms/refset, invalid JSON/targets, missing reference, old row collision, mixed-owner list behavior, concurrent contenders, held first write transaction with second transaction observed open before release, abort after all three intent/reference add-success events, mid-write identity retirement, v1/v2 upgrades, corrupt v2 missing/configured stores, interrupted upgrade and retained bytes, and fresh connection reads of committed intent. A synthetic test spy consumes `readCommitted` data only; no real dispatch occurs.

These are actual source operations against fake IndexedDB, not native browser/Android or process-crash acceptance. Connection close/reopen is not OS crash recovery. Raw legacy writers still do not participate in this journal, and no universal exclusion is claimed. Existing native browser settlement fixtures have no hardcoded schema-v2 assertion found in the initial read; new API browser acceptance remains a separate reviewed step.

## Still required before live use

A genuine server command/idempotency receipt and reward eligibility issuer; defined entitlement identity across content edits; admitted baseline/inclusion contract; transactional writer exclusion; and explicit guest/offline/old-client policies. The current chapter-progress RPC does not supply these. No live route imports this prototype. Production/economic/guest handoff/native HOLD remains.

Invariant review found that truthiness/get-only reads could confuse malformed persisted intent values with absence. Presence is now checked via `getKey` in the same transaction for both command and target rows. Stored undefined/null/false/zero/empty-string intents reject rather than being repaired; all five new cases pass. Focused journal suite: **27/27 PASS**. Activity IDs and target level/key mapping remain opaque declared descriptions: only payload campaign/chapter scope matching is validated, not domain eligibility or entitlement mapping.

Coordinator review required binding the entire immutable command, not payload alone. Both the intent and every v2 reference now carry `commandCanonical`, covering protocol/type, IDs, payload and complete target/terms/level set. Validation recomputes it and compares referenced rows exactly. One-sided target removal, level change or activity-ID change fails; even rewriting the intent's canonical text cannot match old references. This is structural consistency, not cryptographic tamper authenticity or protection against coordinated malicious rewrites of all stores. Four additional controls pass; focused journal suite **31/31**.

## Native browser lane extension (verified browser-only)

The existing isolated Chromium settlement fixture now imports the real journal API. Five additional checks cover intent plus two pending references committing, rollback after all three native add-success events, two-tab conflicting commands and compatible replay, orderly persistent-profile browser restart, and missing-reference read/replay denial without repair. All twelve prior checks, including the raw-writer bypass negative control, remain. Two-tab launches alone do not establish overlapping lock waits; no native overlap claim is made. Native upgrade behavior is not added here; upgrade evidence remains the unit suite above.

Local Vite bundle and Python AST checks passed; no local browser/server was launched. Actual native-IDB execution subsequently passed in the existing reviewed CI lane, as recorded below. This is browser-only, synthetic descriptions with no SDK/dispatch or earning authority, not Android, arbitrary process-crash durability or issuer proof. No workflow, environment or security settings changed.

Final local gates: both TypeScript projects PASS; 1,807/1,807 offline regressions across 86 files PASS; seven economic inventory checks and source drift PASS with no pin changes. Independent reviewers cleared 101 focused/historical cases and the bounded existing-browser-lane extension. These local gates alone were not runtime native-IDB acceptance. The separate Chromium result below supplies the bounded native-IDB evidence; neither set of results establishes Android or live-release acceptance.


## Verified Chromium execution and artifact reconciliation

[Run 43307459131](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43307459131), job `131494419053`, passed at source commit `e44e6c45f55bf901d9748c89ee490946aabc36a9`. The coordinator mapped that source to local commit `ae977fcb`; independent review verified the local tree `d1e2da8e810a320d45639700321f2a3a0f7012cf` and that the reviewed journal/database/browser-fixture files have no changes from that commit.

Artifact `13984417184` contains exactly one member, `native-settlement-result.json`. Independent review recomputed the coordinator-downloaded ZIP SHA-256 as `17aab6feae15b5346b60fa6d9b225cd69c686340dec8820f1594aab527617af9`, verified the sole-member list, and compared its parsed contents with the extracted result. The artifact reports **NATIVE PRIMITIVE ACCEPTANCE PASS**, Chromium **151.0.0.0**, and **17 grouped checks**. These are grouped assertions, not 17 independent crash scenarios.

The five added journal groups passed against the actual source and native browser IndexedDB:

1. The immutable journal command and both v2 pending references commit together, with matching full-command binding.
2. Explicit transaction abort after all three native add-success events leaves neither command nor reference rows committed.
3. Two tabs submitting conflicting command variants yield one winner; compatible exact replay returns the same committed command. Observed lock overlap is not asserted.
4. Orderly persistent-profile browser restart preserves the exact command, all references and compatible replay.
5. Deleting one required reference makes read and replay reject without repairing or otherwise changing the damaged rows.

All twelve previous groups also passed. Crucially, the raw same-origin writer negative control still bypasses the primitive: **global writer exclusion remains UNPROVEN**. The runtime result does not authenticate caller-declared eligibility, authorize balances, implement dispatch/idempotency reconciliation or deliver a reward. Native schema-upgrade behavior remains outside these five groups. Orderly restart and explicit transaction abort are not arbitrary process-crash or OS force-stop proof; this is Chromium, not Android acceptance. Production activation and V18 release remain on HOLD.

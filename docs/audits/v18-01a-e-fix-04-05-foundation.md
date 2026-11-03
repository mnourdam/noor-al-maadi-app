# V18-01A — E-FIX-04/05 Foundation

Date: 2026-11-03. Branch: `v18-01a-outbox-recovery`.
Base HEAD: `1060ce10652212bc198f81c3c914f558ce35ac5d`; branch, HEAD and clean status verified before implementation.

**Foundation only. V18 remains HOLD. P1-04 and P1-05 remain open.** No gameplay/reward integration is enabled.

## AUDIT

Reviewed Phase E, E-FIX-03, the historical reproduction README/R2, `profile.tsx`, `campaignLedger.ts`, gameplay-write, flush and the gameplay progress paths during the preceding audit. Rechecked the current profile persistence and claim code for this phase.

`campaignLedger.claim()` writes a claim key before the caller grants anything. Profile mutations update React state; a later effect writes the profile to localStorage. XP/dinars, heart cooldowns, badges and collection writes do not share one transaction with the claim. `applyServerStats` assigns authoritative XP/dinars but is not a durable per-entitlement acknowledgement. Therefore two successful independent writes cannot prove atomic delivery.

R2 was reproduced on this base in the preceding audit: queued acceptance followed by permanent rejection. The existing 59-case Gameplay suite passed ten consecutive runs then; that does not prove the investigation double-completion timing failure impossible. Its tests and implementation remain unchanged here.

## RISK

- Changing only the reward gate would exchange premature rewards for potentially lost rewards after restart.
- A delivered marker in this new store plus a separate profile write would preserve the same atomicity defect.
- A disappeared Outbox row can mean confirmation, rejection, unreadable storage or other removal. Flush counters are not per-reward delivery evidence.
- Stable operation IDs do not make different revisions equivalent, and UUID ordering is not an ordering of player intent.
- V17 completion/claim facts cannot distinguish all previously delivered and undelivered grants. Replaying them automatically would fabricate certainty.

## MINIMUM FIX

Implement an isolated, opt-in entitlement store with transactional creation, snapshot CAS, terminal decisions and resumable discovery. Do not import it into production gameplay or attach RPC/profile effects. Do not offer a public `markDelivered`/grant callback until the profile transaction contract exists. This safe independent subset requires no ProfileProvider redesign now.

## IMPLEMENT — data and state model

New database `irth-reward-settlement-v1`, version 1, store `entitlements`. It does not open, migrate, clear or delete any old database/key. There is no localStorage fallback: unavailable IDB fails closed rather than weakening concurrency guarantees.

One record is keyed by the exact encoding `JSON.stringify([owner, entitlementKey])`:

- schema version, explicit owner, stable entitlement key;
- immutable source (`server`, `local`, `guest`) and immutable reward-terms identifier;
- append-only attempt history, with the last attempt active;
- each attempt binds operation ID, revision (nullable for V17) and exact snapshot string;
- progress, reward state and durable decision evidence.

The shared vocabulary includes all approved progress states: `storage_pending`, `save_failed`, `pending`, `confirmed`, `rejected`, `legacy_unknown`. Only durable facts are stored: `pending`, `legacy_unknown`, `confirmed`, `rejected`. A storage timeout/failure is a caller observation, not a successful durable row; this foundation adds no timeout that could falsely claim cancellation.

Reward vocabulary: `awaiting_confirmation`, `delivery_pending`, `delivered`, `not_due`.

| Transition | Stored result |
| --- | --- |
| Prepare new attempt | pending / awaiting_confirmation |
| Explicit legacy import | legacy_unknown / awaiting_confirmation |
| Matching confirmation, reward due | confirmed / delivery_pending |
| Matching confirmation, no entitlement due | confirmed / not_due |
| Matching permanent rejection | rejected / not_due, reason/evidence preserved |
| Apply profile reward / mark delivered | **Not implemented or exposed** |

`delivered` is reserved in the schema for a later atomic delivery integration. Its presence in the vocabulary is not a delivery guarantee. No currently exposed method can create it. No amounts, caps, reward calculations, unlock rules or economy effects are introduced.

### API contract

`settlementForOwner(owner)` captures owner and current identity epoch. `read(key)` reads one record; `list()` discovers all that owner's records after a cold start. Both reject storage failures/corruption instead of returning an empty substitute.

`prepare({key, source, terms, binding, expected, legacy?})` creates an entitlement or explicitly appends a new attempt with CAS against the current binding. Exact duplicates are idempotent; changed source/terms conflict. A confirmed entitlement cannot acquire another reward attempt. Reusing an obsolete binding is rejected; rejected attempts remain in history.

`settle(key, binding, decision)` requires a matching active snapshot and explicit trusted-adapter evidence. Confirmed/rejected decisions are terminal and exact replay is idempotent. Conflicting decisions fail; late decisions cannot acknowledge a newer attempt. The API never observes RPC, Outbox absence or counters itself. Evidence is a caller assertion, not cryptographic proof: future adapters must supply validated, stable evidence and decide `rewardDue` from the source's actual contract, not merely an RPC `applied=false` replay flag.

Callers must use a stable logical entitlement key across retries/revisions/restarts, covering reward kind and content identity. The owner is added by storage. They must provide a deterministic exact snapshot serialization, including relevant reward terms, not a lossy payload hash. Idempotency is scoped to that key; inventing another key is not deduplicated by this foundation. A source label selects no automatic grant behavior.

### Owner and concurrency isolation

Each call checks the captured owner/epoch before open, in storage callbacks and after transaction completion. Owner changes abort active transactions where still abortable. Keys always retain the captured owner, never the newly active account. A commit that completed before an identity change may remain under its original owner while its caller receives identity-changed; retry/read under a new valid handle safely resolves that ambiguity.

Read/compare/append-or-settle/put run inside one IDB readwrite transaction. IndexedDB serializes competing transactions on this store across connections, independent of module globals or Web Locks. CAS compares the full binding. Histories are never replaced with an empty array after a read error. No destructive clear/reset API exists. Connections are closed after each operation; blocked opens reject and late-opened abandoned connections are closed.

Corrupt records fail strict validation; list rejects rather than publishing partial owned results. Owner filtering uses the physical record key before interpreting another owner's value. A malformed physical key fails the scan conservatively. Quota/abort cannot commit a partial row. All history stays retained; there is no eviction policy that could silently forget deduplication.

## Atomicity boundary and required integration contract

**Proven unit:** an entitlement row and its complete attempt history/decision transition commit together in one IDB transaction. This prevents conflicting foundation decisions and duplicate intent creation for the same key.

**Not proven:** applying any reward to the existing profile, collection or heart stores exactly once. The foundation performs zero grants, so its idempotent retries cannot themselves repeat a reward; it does not make existing gameplay grants safe.

### Local campaign/game rewards

Before enabling delivery, a durable profile authority must include both the reward's actual effects and its applied entitlement key in the **same atomic persistence unit**. For example, migrate the authoritative local profile and applied-key set into a single IDB transaction with this entitlement store in the same database; any separately stored collection/cooldown effects must join that unit or have their own durable idempotent delivery contract. A transaction spanning two databases is not available. Merely copying today's profile into this database while ProfileProvider still writes independently is not sufficient.

Required delivery transaction: read authoritative profile and entitlement; verify owner, active binding and confirmed/delivery_pending; if the stable key is not applied, calculate the approved existing effect and persist the updated profile plus applied key; mark delivered in that same transaction. Then publish the committed snapshot to React. On restart, reload that authority before allowing writers. Concurrent writers must use this authority too, so stale React effects cannot overwrite it. Abort before commit leaves neither effect nor delivered; commit leaves both. This is the technical crash-safety argument, **a future integration contract, not implemented proof against today's provider**.

### Server-authoritative rewards

Persist intent before RPC; preserve stable server idempotency identifiers. After acknowledgment/replay, reconcile using the existing server-authoritative contract and re-read balances where needed. Never re-add a local delta for a reward already granted by the server. A historical server replay with `applied=false` is not proof the local profile consumed the original grant. Local delivered can only mean a validated authoritative view was durably adopted with its reconciliation marker; reliable re-fetch/retry must survive restart. Aggregate balances do not identify a particular reward by themselves. Validate each existing RPC's readback/replay guarantees before wiring; this phase changes no RPC or SQL.

### Guest rewards

Guest source metadata can be retained, but no guest delivery path is enabled. P1-06 and durable guest completion validation remain prerequisites. No user entitlement is silently promoted from a guest record.

## Later gameplay integration plan (requires review)

1. Establish and test the atomic local profile authority/delivery contract above, or a separately reviewed source-specific alternative.
2. Campaigns: capture the existing capped/scaled reward terms before persistence; use stable activity/chapter/campaign entitlement keys. Separate local progress from confirmed completion. Preserve all sequential chapter requirements and explicit unlock conditions. Replace claim-before-grant only after resumable delivery exists.
3. Stories: keep scene progress durable, expose pending completion explicitly, reconcile server reward results without local delta replay. No final success inferred from queued.
4. Investigations: keep pending separate from canonical server completed sets. Delay final badge/heart effects to their approved source-specific delivery path. Add a controlled scheduling test delaying stableDeltaId resolution around duplicate calls and the single-flight lifetime; do not change the existing investigation assertions to mask timing sensitivity.
5. Games: replace pending-row/Set-as-delivery-evidence with durable entitlement status. A failed completion read stays unknown. Preserve current economy caps.
6. Direct saves and flush must feed the same receipt-bound decision adapter. Keep pending proof until the decision is durably recorded; server retries must be safe across the gap. A rejected archive is retained before dequeue, and old decisions cannot settle newer snapshots.
7. At cold bootstrap, enumerate the active owner's records; reconcile awaiting confirmation and delivery_pending independently of component mounts. Account switch invalidates handles. Never use missing receipts as proof of delivery.
8. Tutorial remains local-completion UX with separate server status; no economy integration is needed here.

## V17 policy

No automatic import or old-storage mutation occurs. A later explicit adapter can prepare `legacy_unknown` with revision=null and an exact legacy snapshot. Local completion/claim alone proves neither server confirmation nor delivery. Preserve old data, failed reads and ambiguity; do not grant compensation, revoke rewards, or replay completion automatically. Unknown historical delivery may require a reviewed reconciliation policy; this store cannot manufacture missing evidence.

## TEST

New suite `tests/offline/outbox-settlement.test.ts`: fake IndexedDB/jsdom, real owner/epoch module, external fetch forbidden. Tests use independent connections and also independently reloaded modules sharing storage. Restart tests close connections/reload modules; they do not simulate physical Android force-stop or browser disk loss.

Coverage includes durable creation, duplicate creation/retry, source preservation, confirmation/no-reward/rejection, terminal conflicts, stale revision and exact V17 snapshot, owner switch during open and after put, epoch invalidation after switch-back, discovery on restart, concurrent CAS and terminal decisions, quota, failed read, corrupt row/list, no partial/empty replacement, old-data preservation, no receipt inference, abort before first commit, and abort/restart around delivery_pending. The fixture aborts transactions to model pre-commit crashes; committed-row reload models post-commit recovery. There is intentionally no test claiming delivered/profile atomicity, since no delivery adapter exists.

Validation:

| Command | Result |
| --- | --- |
| `npm run test` | Passed: **259/259**, 10 files; 232 existing + 27 foundation cases |
| `npm run typecheck` | Passed: application and Outbox TypeScript projects |
| `npm run build` | Passed: local web build; deprecation and bundling warnings in existing modules |
| `git diff --check` | Passed |
| Prettier check on new TypeScript files | Passed |

An intermediate typecheck caught unknown-key narrowing in the new scan. The throwing helper was changed to a function declaration so TypeScript recognizes the terminating branch; this did not change storage semantics. The complete 259-case suite passed again after that correction. No investigation test or assertion was modified.

## CLOSE

Changed files only:

- `src/lib/rewards/settlement.ts`
- `tests/offline/outbox-settlement.test.ts`
- `docs/audits/v18-01a-e-fix-04-05-foundation.md`

No production caller imports the foundation. No gameplay routes, ProfileProvider, campaignLedger, investigation tests, Cloud Save, SQL, migrations, RPC definitions, economy values, campaign progression or A/B/C/D/E-FIX-01/02/03 behavior were changed. No Supabase/Production connection, Android release, deployment or merge. Authorized delivery is a commit/push on this work branch after green checks. No blocker found for this isolated foundation subset; atomic delivery and gameplay integration remain explicitly deferred, **not closed defects**. V18 stays HOLD.

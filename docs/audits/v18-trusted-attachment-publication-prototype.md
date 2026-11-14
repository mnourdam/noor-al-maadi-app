# Isolated trusted attachment publication prototype

Isolated prototype, not deployed; exact disposable runtime evidence is recorded below. Seven new test/workflow/audit files; application, dormant proposal, media flags and existing74-record lane remain unchanged. Builds on verified c05c decoder/Storage evidence and exact checkpoint49 promotion fixture SHA256 974a6b38689cc1cb5f69164c47fb4357b39001a8d2929f2f8c186f051c736d77, with fresh derived SQL authority/publication tests. No scheduler, retention SLA or hosted access.

## Concrete implementation

Private fixture schema retains reservation generation, immutable attempt/token, scope/input/output digest/revision, WRITING/TERMINAL distinction, durable cleanup_due and irreversible cleaning fence. Canonical key becomes ownerUUID/attemptUUID to match the existing strict disposable Storage path contract. Terminal receipt additionally records exact output size. Service-only RPC requires JWT service role and explicit execute grants; private schema/functions/tables and direct public receipt view mutations are denied to actors.

Actual service worker fetches quarantine bytes through existing bounded native Storage adapter, verifies trusted expected input hash before real Sharp decode, claims current write authority, performs a fresh immutable output PUT, then GETs exact bytes and checks digest/size before writing terminal receipt and attestation. No terminal receipt or attestation follows failed PUT, verification failure or simulated post-PUT crash. Scope/revision/digest/generation/token mismatches reject attestation.

Authenticated finalization requires current attested receipt and exact owner/issue/internal scope. Message replay is idempotent only for identical author/body/internal/attempt. Canonical Storage SELECT joins current generation/accepted receipt and published message: intended owner/synthetic staff can read only after publication, other actors cannot, and internal content is synthetic-staff-only. Retirement removes read/publication authority immediately. No real application RPC/client integration is implied.

## Intended native tests

Run unchanged74 baseline sequential records first, then actual native Auth/JWT, SQL RPC and Storage controls: actor forged receipt/direct write denial; unattested and mismatched finalization rejection; canonical-only publication and exact intended-reader roundtrip; before-publication/other-owner/internal/retirement denials; replay conflict; retirement after observed PUT before attestation; generation replacement; cleanup-first prevents publish and publish-first prevents cleanup; wrong-key deletion refusal; unresolved crash intent survives service removal and404. The crash fixture observed a PUT returning a successful terminal response; SQL lacks a terminal receipt. Native physical durability is not established. It does not claim to reproduce a truly live late writer. No absence observation clears unresolved intent.

Cleanup obligations are never deleted in this prototype, even after recognized removal. This is deliberately conservative, not a complete cleanup/retention implementation or physical erasure guarantee. Native concurrency, installed worker scheduling, crash-recovery leases, deployed inherited policies and client rollout remain unproven.

## Local verification

Six Python orchestration/guard controls PASS, with actual worker callback order and failure/retirement fences under synthetic transport. A separate actual PGlite PostgreSQL run passes fixture SQL, service receipt binding, actor publication/read predicate, idempotency conflicts, retirement, irreversible cleanup and role denial controls. PGlite0.3.14 installed only in isolated tools directory from official registry; application manifests/locks unchanged. These local tests preceded the exact native SQL/Auth/Storage CI evidence below. No local stack was launched.


## First native run and exact-row probe correction

Public64ff run stopped after the74 baseline and four added case entries, at `actor direct receipt mutation denied`. Artifact14106368051 SHA2568adeb0f422a58db7e400678890c2d358f18a2277de64ee838808cbe0a8e91320 was independently source/digest/CRC verified; unique-project cleanup succeeded. The response status/code was not retained, so this does not establish an ACL defect or its cause. Trusted publication was not reached.

The original PATCH targeted the entire view without a filter. The corrected probe targets only the existing immutable attempt UUID, first positively proving that exact row exists. POST is unchanged; both still require HTTP403 with SQLSTATE42501. Each attempt records only fixed actor index/method, bounded HTTP status, allowlisted code, and exact private SQL state-fingerprint equality; raw rows, identifiers, response text and hashes are not emitted. A changed fingerprint fails independently of response classification.

[PostgREST's official safe-update documentation](https://docs.postgrest.org/en/v14/integrations/pg-safeupdate.html) explains that unfiltered updates can be rejected before their intended mutation. That is a plausible ambiguity, **not a verified explanation of64ff**. The exact-row correction does not relax ACL acceptance. Actual PGlite role controls now separately require42501 for direct INSERT and filtered UPDATE; the native result for the corrected exact-row probe is recorded below. Seven Python controls and the expanded SQL run pass locally.


## Verified integrated disposable result

Exact public source `804b61df5aa8fc54bc380794f72050c678fa208b`, run `43576472752`, job `132391691670`: SUCCESS. Artifact `14106526865` (3,168 bytes), SHA256 `f271a36b57427954a4b330ab55bfd14593793a699f96ceef127c402040edb569`; independent reviewer checked GitHub source association, archive hash, clean CRC, sole `acceptance.json` and local fixture/worker source hash correspondence. All152 **sequential records** passed (74 baseline +78 prototype), not152 independent scenarios. Unique disposable project stopped without backups.

All six actor POST/PATCH probes returned exactly403/42501 and preserved the full attempt-state fingerprint. The actual service worker fetched bound quarantine bytes, invoked actual Sharp child processing, verified canonical byte roundtrip and attested the result. Owner and synthetic staff retrieved canonical bytes only after publication; other-owner, internal-player and retired reads/publication were denied. Exact message replay succeeded while changed replay and mismatched attestation bindings failed. Controlled retirement and generation replacement fenced stale work; cleanup-first irreversibly blocked publication, publication-first blocked deletion, wrong-key cleanup was refused, and unresolved WRITING intent survived a sampled404 without acknowledgment.

The earlier64ff failure remains an unknown response mechanism. Corrected exact-row PASS does not retrospectively prove safe-update was its cause. The inherited `not_proven: server image decoding` means deployed production integration is still unproven; it does not negate the observed actual isolated decoder/service-worker execution. The result remains `LOCAL STACK PASS; SYNTHETIC WORKER PUBLICATION ONLY; ACTIVATION BLOCKED`.

### Remaining delivery blockers

1. The application client and dormant production proposal still use the original MIME/size-only attachment path, not this fixture worker/publication API or canonical bucket.
2. These are serial native transactions and controlled interruption points, not multi-connection races or an installed worker's lease/restart/reconciliation proof.
3. Durable cleanup intents cover canonical attempts, not the original quarantine lifecycle. There is no complete drain/scheduler or retention SLA, and unresolved obligations are deliberately never discarded. Object absence is not physical erasure proof.
4. The decoder V8 bound is not a full native-memory budget. Full-app Android and release-device acceptance remain separate and unproven.

No new implementation or production-enabling action is authorized or implied by this evidence update.

## Original-quarantine cleanup extension (pre-run implementation record)

A six-file test-only delta closes the prototype's missing input obligation: an immutable input intent is created before each owner PUT, binding attempt, captured reservation generation/owner/scope and source key/digest. Ordinary actors cannot write these receipts. A fixture-only service terminal receipt follows an explicitly observed successful PUT response plus exact service byte read. That fact is supplied by this controlled testbench, **not** by client completion claims, arbitrary TTL, one404 or an asserted production lease. It does not prove no concurrent in-flight write exists in deployment.

Input upload RLS now admits only the current generation's exact WRITING intent. TERMINAL or cleaning intent cannot admit new owner uploads, including re-creation after deletion. The worker checks input admission before fetching, and reservation/input fences again before output write and attestation. Explicit decoder validation rejection retires authority; decoder infrastructure exceptions leave it unresolved for retry.

Cleanup is eligible only for terminal input writers with a current published canonical result or retired reservation. Reservation→attempt→input locks serialize the irreversible cleaning claim before external deletion. Successful-publication input cleanup does not revoke canonical reads. Exact source digest must be observed by the same service credentials before DELETE; a durable positive-read marker supports retry after a deletion-response crash. Recognized API absence plus SQL metadata absence records removal observation, but the input obligation is never deleted. Unknown WRITING intent is ineligible even when the fixture manually deletes bytes and observes404. A delayed already-fetched decoder cannot start writing after retirement/input cleanup; wrong source or canonical keys cannot substitute for the input key.

Prepared native controls cover original cleanup after publication and malformed rejection, unchanged readable canonical bytes, denied original reupload, retirement, crash-after-delete retry/idempotence, unknown writer404 retention and prefetched worker retirement. Local13 Python controls and expanded actual PGlite checks pass. At this local checkpoint native execution was pending; prior804b did not cover this extension. Exact subsequent d810 runtime evidence follows. No scheduler, production trusted-writer completion, lease recovery, retention SLA, physical erasure or client rollout is inferred.


## Verified original-quarantine cleanup runtime

Exact source `d810e464ad11216ed9d9772ab3f7f94d2dbd852d`, run `43577283398`, job `132394185337`: SUCCESS. Artifact `14107665336` (3,486 bytes), SHA256 `1bb1aa4211ae826849a99f2f41dfe71f18f69ab775ea977f206a445b3c30bbd9`; independent reviewer verified GitHub source association, archive hash/CRC, sole `acceptance.json` and matching fixture/worker hashes. All205 sequential records passed, not205 independent scenarios; the six actor receipt mutations still returned403/42501 with state unchanged. Unique disposable project stopped without backups.

Actual service cleanup removed original quarantine bytes after successful publication while canonical bytes stayed readable. Newly admitted original reuploads were denied. Rejected-decode cleanup, post-delete interruption/retry, unknown WRITING intent surviving404, prefetched worker retirement fence and wrong-key/canonical-key refusal all passed. Removal observations retain durable input obligations rather than discarding them.

The runtime explicitly used **harness-observed successful terminal PUT plus exact service read**, not a client completion claim or deployed lease authority. It does not prove no earlier in-flight writer exists. Serial controlled interruption points are not independent-connection race acceptance. Active superseded terminal inputs remain conservatively retained until reservation retirement; this is not a complete drain, retention SLA or physical-erasure guarantee.

### Current delivery gates

- Integrate the real application/proposal with the trusted worker and canonical publication path; this fixture does not enable that path.
- Verify multi-connection races and actual worker lease/restart/terminality, including already-in-flight PUTs, before deploying cleanup authority.
- Define and validate complete drain/retention behavior without prematurely discarding unresolved obligations.
- Bound native decoder resource use beyond the V8 heap limit.
- Complete real Android/full-app and release-artifact acceptance.

The exact result remains `LOCAL STACK PASS; SYNTHETIC WORKER PUBLICATION ONLY; ACTIVATION BLOCKED`. This update changes evidence only, not application code, authority or deployment.

## Prepared two-connection transaction-order controls

A four-file test-only extension leaves fixture functions, application and budgets unchanged. Two contending native PostgreSQL sessions and a third observer operate only through the existing exact-project/container admin boundary. Candidate canonical bytes are first uploaded and positively verified by the same service credentials; the receipt is terminal but not yet attested.

Publish-first: one transaction calls actual `promotion_model.publish` and must return true while holding its reservation lock. A second calls actual `claim_cleanup(abandon=true)`. The observer must see the exact same identified waiter blocked on the holder's transaction ID, with matching unique application markers, backend start, role/database, expected query, holder idle-open transaction and granted transaction lock. Only then is the winner committed. Cleanup must return SQL NULL normally; persisted generation/accepted/cleaning state is verified, then real actor HTTP finalization and canonical byte read must succeed.

Cleanup-first: the holder's actual claim must return the exact canonical key. The competing publish must be positively observed waiting on the same transaction; after commit it must return false normally. Persisted irreversible cleaning/generation/empty publication state is checked, followed by service exact-byte GET, exact-key removal, recognized absence and SQL metadata absence. Unrelated published bytes must remain readable.

No sleep is used as evidence. Each contender has a separate bounded3-second unique-marker startup admission; empty initial observations are not mistaken for permanent absence. Query/result/deadlock/timeouts or lost identity/wait observations fail, never become denial success. SQL statement/lock/idle-transaction timeouts and operation deadlines bound the experiment; the3-second observation window caps each observer call to remaining time, and late responses cannot qualify. Reaping has separate bounded allowances. Finally both sessions are independently released/reaped and original identities/locks checked absent. Any fallback termination matches exact PID, backend start, unique marker, role and database; no broad backend kill. The primary failure is retained if cleanup also fails. Reports contain fixed boolean receipts only, not PIDs/queries/rows.

Local22 Python controls pass, including exact-wait counterfactuals and primary-error preservation. Actual two-connection runtime is pending; previousd810 proves only serial controlled cuts. This is attestation versus irreversible canonical cleanup arbitration, not concurrent HTTP, universal races, production lease recovery or late-PUT acceptance.

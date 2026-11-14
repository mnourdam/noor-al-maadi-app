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

## Prepared original-quarantine cleanup extension (not yet runtime-accepted)

A six-file test-only delta closes the prototype's missing input obligation: an immutable input intent is created before each owner PUT, binding attempt, captured reservation generation/owner/scope and source key/digest. Ordinary actors cannot write these receipts. A fixture-only service terminal receipt follows an explicitly observed successful PUT response plus exact service byte read. That fact is supplied by this controlled testbench, **not** by client completion claims, arbitrary TTL, one404 or an asserted production lease. It does not prove no concurrent in-flight write exists in deployment.

Input upload RLS now admits only the current generation's exact WRITING intent. TERMINAL or cleaning intent cannot admit new owner uploads, including re-creation after deletion. The worker checks input admission before fetching, and reservation/input fences again before output write and attestation. Explicit decoder validation rejection retires authority; decoder infrastructure exceptions leave it unresolved for retry.

Cleanup is eligible only for terminal input writers with a current published canonical result or retired reservation. Reservation→attempt→input locks serialize the irreversible cleaning claim before external deletion. Successful-publication input cleanup does not revoke canonical reads. Exact source digest must be observed by the same service credentials before DELETE; a durable positive-read marker supports retry after a deletion-response crash. Recognized API absence plus SQL metadata absence records removal observation, but the input obligation is never deleted. Unknown WRITING intent is ineligible even when the fixture manually deletes bytes and observes404. A delayed already-fetched decoder cannot start writing after retirement/input cleanup; wrong source or canonical keys cannot substitute for the input key.

Prepared native controls cover original cleanup after publication and malformed rejection, unchanged readable canonical bytes, denied original reupload, retirement, crash-after-delete retry/idempotence, unknown writer404 retention and prefetched worker retirement. Local13 Python controls and expanded actual PGlite checks pass. No new native execution has occurred yet; prior804b does not cover this extension. No scheduler, production trusted-writer completion, lease recovery, retention SLA, physical erasure or client rollout is inferred.

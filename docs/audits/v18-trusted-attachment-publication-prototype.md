# Isolated trusted attachment publication prototype

Prepared only, not deployed or runtime-accepted. Seven new test/workflow/audit files; application, dormant proposal, media flags and existing74-record lane remain unchanged. Builds on verified c05c decoder/Storage evidence and exact checkpoint49 promotion fixture SHA256 974a6b38689cc1cb5f69164c47fb4357b39001a8d2929f2f8c186f051c736d77, with fresh derived SQL authority/publication tests. No scheduler, retention SLA or hosted access.

## Concrete implementation

Private fixture schema retains reservation generation, immutable attempt/token, scope/input/output digest/revision, WRITING/TERMINAL distinction, durable cleanup_due and irreversible cleaning fence. Canonical key becomes ownerUUID/attemptUUID to match the existing strict disposable Storage path contract. Terminal receipt additionally records exact output size. Service-only RPC requires JWT service role and explicit execute grants; private schema/functions/tables and direct public receipt view mutations are denied to actors.

Actual service worker fetches quarantine bytes through existing bounded native Storage adapter, verifies trusted expected input hash before real Sharp decode, claims current write authority, performs a fresh immutable output PUT, then GETs exact bytes and checks digest/size before writing terminal receipt and attestation. No terminal receipt or attestation follows failed PUT, verification failure or simulated post-PUT crash. Scope/revision/digest/generation/token mismatches reject attestation.

Authenticated finalization requires current attested receipt and exact owner/issue/internal scope. Message replay is idempotent only for identical author/body/internal/attempt. Canonical Storage SELECT joins current generation/accepted receipt and published message: intended owner/synthetic staff can read only after publication, other actors cannot, and internal content is synthetic-staff-only. Retirement removes read/publication authority immediately. No real application RPC/client integration is implied.

## Intended native tests

Run unchanged74 baseline sequential records first, then actual native Auth/JWT, SQL RPC and Storage controls: actor forged receipt/direct write denial; unattested and mismatched finalization rejection; canonical-only publication and exact intended-reader roundtrip; before-publication/other-owner/internal/retirement denials; replay conflict; retirement after observed PUT before attestation; generation replacement; cleanup-first prevents publish and publish-first prevents cleanup; wrong-key deletion refusal; unresolved crash intent survives service removal and404. The crash fixture observed a PUT returning a successful terminal response; SQL lacks a terminal receipt. Native physical durability is not established. It does not claim to reproduce a truly live late writer. No absence observation clears unresolved intent.

Cleanup obligations are never deleted in this prototype, even after recognized removal. This is deliberately conservative, not a complete cleanup/retention implementation or physical erasure guarantee. Native concurrency, installed worker scheduling, crash-recovery leases, deployed inherited policies and client rollout remain unproven.

## Local verification

Six Python orchestration/guard controls PASS, with actual worker callback order and failure/retirement fences under synthetic transport. A separate actual PGlite PostgreSQL run passes fixture SQL, service receipt binding, actor publication/read predicate, idempotency conflicts, retirement, irreversible cleanup and role denial controls. PGlite0.3.14 installed only in isolated tools directory from official registry; application manifests/locks unchanged. These local tests do not replace pending native SQL/Auth/Storage CI. No local stack was launched.

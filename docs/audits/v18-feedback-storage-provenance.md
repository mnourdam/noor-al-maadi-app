# Storage provenance preflight: observation only

Test-only four-path slice based on exact public3eba treec9c101fd via local wrapperba955b83. Existing proposal, cleanup, 44-record disposable contract lane and application remain unchanged. No feature activation.

## Why provenance precedes the race
The prior disposable runtime observed Storagev1.84.19 imageID `sha256:2b7ca2e35a0c54663fd0942a0fe99650d138515e4f3a3e36697a5104e99c5bd2` and repository digest `sha256:a0420573837ee08c0afdc9cd01f90b4b8027579da99e0b9a159fe912ef756c99`. Official tag currently resolves to immutable commit `872757184c35626fef3d84f35e0b3c4fa82af1b6`. This is not proof that the inspected image executes matching compiled code.

Read-only GitHub source at that commit shows uploader preauthorization → backend upload → completion object advisory lock → second caller authorization → metadata upsert. Permission probes themselves insert inside rolled-back transactions; an AFTER INSERT trigger is therefore NOT a unique post-byte barrier. The file backend stages then renames bytes before returning. Database object lock hashes bucket/path via unsigned DJB2-XOR (`hash >>> 0`), not a guessed signed key. These are source facts only.

Official Dockerfile copies `/app/dist`; official build.js emits nonbundled CommonJS and source maps. The preflight therefore reads ONLY six fixed files: compiled/map pairs for storage/uploader, storage/database/pg and internal/hashing/string-to-int. Target modules are never imported/evaluated. Standard-library Node filesystem/crypto code uses exact realpaths, O_NOFOLLOW, regular-file/1MiB limits, bounded parsing and a15s command deadline. Output contains fixed paths, lengths, SHA256 hashes, embedded source hashes, sanitized OCI revision/version and booleans only. No env dump, directory scan, source strings, keys, URLs or arbitrary exception messages are emitted. Missing files produce unavailable observations, never inferred matches.

Expected embedded-source hashes come from immutable official source text (including final newline). Source maps and OCI labels are evidence inputs, NOT binary attestation. `compiled_order_attested` and `barrier_authorized` always remain false, even if all source hashes match. Collection completion and embedded-source matches are reported separately from provenance status. Provenance remains UNSUPPORTED and this preflight exits nonzero even if all embedded hashes match; the always-run artifact retains the observations for review. Missing maps/mismatches never count as a new provenance PASS. The new workflow retains exact branch/path/event/local-project/container/loopback guards inherited from the reviewed harness and always cleans up. It does not call the proposal's acceptance probe or mutate application data/policies.

Sources: https://github.com/supabase/storage/tree/872757184c35626fef3d84f35e0b3c4fa82af1b6 (Dockerfile, build.js, src/storage/uploader.ts, src/storage/database/pg.ts, src/storage/backend/file.ts, src/internal/hashing/string-to-int.ts).

## Subsequent experiment, not implemented or authorized by these results
After independent source-to-image/compiled-order verification, use the EXISTING completion advisory lock. Controller holds the precisely derived bucket/path key; actual native waiter must be positively identified in pg_locks/pg_stat_activity for the synthetic request before retirement. Independent bounded connections attempt retirement/cleanup; release always in finally. Native5s lock timeout, failure to reach waiter, blocked retirement, denied upload and late publication are distinct outcomes, not success by timeout. Inspect terminal request, service-visible bytes, metadata version and durable queue separately. API404/metadata absence never proves physical orphan-byte erasure; async versioned Storage cleanup needs separate evidence. No new trigger/native-function/RLS changes and no cleanup acknowledgment redesign here.

Quarantine/service-controlled canonical output, trusted decoder and durable reconciliation/retention policy remain separate design gates. No arbitrary sleep proves a commit boundary or deletion deadline.

## Local verification
Seven pure provenance safety tests pass. No Docker, local server, Auth/Storage runtime or publication was performed. Independent review and authorized CI observation remain pending; barrier remains blocked.

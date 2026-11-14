# Disposable native Storage to trusted decoder boundary

Test-only lane, with exact-public-revision disposable runtime verified below; no application activation, hosted access, migrations or production edits. Base local17c166d is coordinator-verified current public6dcb tree.

## Provenance

Restored child/runner/test from verified checkpoint49 ZIP SHA256 b9f985cd89ee4f9899faa25e9851d5e70e39d425e99c2c498b7082907aab0f3c. Original decoder hashes: child3c4865f547c066be536dbfa913ecdf1b25f054932129d886292548d3401a71f0; runnerdb3aad1ca4deacd6532ebd11cc552712cd98819acb05033d3f66582788bf3205; test3a232a56e4a839833a5738ce01e7edef222ab128d55f865eab4d7c22144b4847. Fresh reviewed delta distinguishes child exit2 validation rejection from other exit/signal infrastructure failure, with actual child controls. Fresh child delta now reserves exit2 for explicit locally constructed ValidationRejection (magic/framing/type/dimension/frame checks). All Sharp exceptions including native timeout, and post-encode verification errors, exit3. Some malformed inputs may therefore fail as processing/infrastructure, never falsely qualify the specific malformed acceptance control. Known malformed controls use explicit magic/PNG framing rejection; actual invalid-JPEG native exception is separately tested as infrastructure.

Five additional files recovered from retained372318ff author payload, NOT certified as original git blobs and NOT previously security-cleared. This revision resolves their retained review findings rather than inheriting clearance. Locked Sharp0.35.5 is already present; package and locks unchanged.

## Actual proposed acceptance

Subclass the unchanged disposable Auth/Storage harness and run its44 baseline sequential case records first. Its existing exact CLI, branch/event, loopback ports, project/container/admin identity, no redirect/proxy, credentials withholding and unique-project teardown remain unchanged. Historical baseline runtime does not imply this new lane executed.

Create two synthetic private buckets outside migrations. A real authenticated owner can INSERT only its own quarantine prefix; there is no actor SELECT policy, so original quarantine bytes remain unreadable to owner, other player and synthetic staff. Same-token upload positives prevent vacuous authentication-denial claims. Only service credentials fetch quarantine bytes and create/read canonical output. No actor canonical write/read policy is installed.

Before decoding, bind exact fetched bytes to trusted synthetic fixture SHA. Actual Sharp decoder runs in a separate credential-free child, strips metadata and emits bounded canonical JPEG. Upload to fresh immutable output key; service exact byte roundtrip is required. Actor canonical creation/overwrite/read denials are checked with narrow recognized errors and service positive control; output must remain unchanged. Malformed and truncated MIME-matching quarantine bytes must be fetched exactly and produce validation rejection, with no added canonical metadata.

HTTP calls use a fixed-size shared memory response buffer and owned child join deadline, not blocking Pipe.recv after poll. Every read is capped at2MiB+1; request operation budget8s plus separate cleanup join2s. Cleanup kill/join/state checks are independently attempted. Original failure is preserved; cleanup uncertainty is explicitly flagged. Decoder outer operation8s and process-group reap2s are separate from decoder child's5s deadline. These are bounded operations, not OS-preempted universal hardwall guarantees. Decoder exit2 only means validation rejection; deadline/spawn/output-limit/nonvalidation child exit/signal is failure, never accepted as malformed input rejection.

## Verification and limits

Author14 decoder tests PASS,13 new lane Python controls PASS,13 inherited isolation controls PASS. These include actual valid/malformed decoder execution, substituted-byte no-decoder control, infrastructure exit/signal, cleanup failures, response caps and workflow dependency coverage. These local controls preceded the independently verified disposable CI execution below. No local Docker/server run was performed by the author.

This is service-mediated byte processing under synthetic policy prerequisites, not an installed trusted worker, publication CAS, retention SLA, late-write reconciliation, crash-safe cleanup scheduler, full account deletion, deployed policy acceptance or native app acceptance. Native decoder memory is not fully constrained by the V8 limit. Canonical output is deliberately unreadable to all actors; attachment publication is not implemented. Picker remains OFF; no feature or production promise follows.


## Verified disposable runtime (current evidence)

Exact public source `c05c63fbcfd4b16da1df3e4e12f497fb04e41966`, coordinator-recorded tree `9a591abd`, run `43574611453`, job `132386026584`: SUCCESS. Artifact `14106091157` (2,412 bytes), SHA256 `51e349b9968b7bcdb4253cf087e2ee713410312f2626b0c719312ebe8ed39096`; independent reviewer verified archive digest, clean ZIP CRC, sole `acceptance.json`, exact source and source hashes. All 74 sequential records passed (44 inherited baseline plus 30 added records), not 74 independent scenarios.

The actual disposable Auth/Storage route accepted owner quarantine uploads, denied actor quarantine reads, fetched exact trusted-input-bound bytes with service credentials, ran the real Sharp child process, uploaded canonical output, verified service byte equality, and denied actor canonical access. Malformed/truncated quarantine controls produced no canonical object. CLI was 2.122.1; Storage was v1.84.19, image ID `sha256:2b7ca2e35a0c54663fd0942a0fe99650d138515e4f3a3e36697a5104e99c5bd2`. Unique-project cleanup completed without backups. Decoder runner/child/CLI hashes, proposal SHA9c503b31… and fixture SHA466820f8… were independently matched to the reviewed source.

The inherited report field `not_proven: server image decoding` is not a denial of this measured child-process execution. It identifies the still-unproven **production-integrated trusted worker and publication authority**. This run does not install that worker, make canonical output actor-readable, prove deployed policies, retention/late-PUT reconciliation, account deletion or native behavior. Its explicit result remains `LOCAL STACK PASS; DECODED BYTE ISOLATION ONLY; ACTIVATION BLOCKED`.

### Concrete remaining delivery boundary (read-only source finding)

The unchanged dormant proposal `reply_with_feedback_images` still selects the original `feedback-images` object and accepts storage metadata MIME/size (proposal lines90–92). It does not require a service-attested decoder result or point the message at canonical output. The current client still uploads directly to that original bucket. Therefore this isolated successful route is not yet the product attachment path. A next narrow disposable regression should first demonstrate that metadata-only boundary, then test a service-attested publication requirement while retaining owner/issue/internal/idempotency semantics. No production proposal, client or permission edits are part of this evidence update.

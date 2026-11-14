# Disposable native Storage to trusted decoder boundary

Prepared test-only lane. Not executed against Storage in this revision; no application activation, hosted access, migrations or production edits. Base local17c166d is coordinator-verified current public6dcb tree.

## Provenance

Restored child/runner/test from verified checkpoint49 ZIP SHA256 b9f985cd89ee4f9899faa25e9851d5e70e39d425e99c2c498b7082907aab0f3c. Original decoder hashes: child3c4865f547c066be536dbfa913ecdf1b25f054932129d886292548d3401a71f0; runnerdb3aad1ca4deacd6532ebd11cc552712cd98819acb05033d3f66582788bf3205; test3a232a56e4a839833a5738ce01e7edef222ab128d55f865eab4d7c22144b4847. Fresh reviewed delta distinguishes child exit2 validation rejection from other exit/signal infrastructure failure, with actual child controls. Fresh child delta now reserves exit2 for explicit locally constructed ValidationRejection (magic/framing/type/dimension/frame checks). All Sharp exceptions including native timeout, and post-encode verification errors, exit3. Some malformed inputs may therefore fail as processing/infrastructure, never falsely qualify the specific malformed acceptance control. Known malformed controls use explicit magic/PNG framing rejection; actual invalid-JPEG native exception is separately tested as infrastructure.

Five additional files recovered from retained372318ff author payload, NOT certified as original git blobs and NOT previously security-cleared. This revision resolves their retained review findings rather than inheriting clearance. Locked Sharp0.35.5 is already present; package and locks unchanged.

## Actual proposed acceptance

Subclass the unchanged disposable Auth/Storage harness and run its44 baseline sequential case records first. Its existing exact CLI, branch/event, loopback ports, project/container/admin identity, no redirect/proxy, credentials withholding and unique-project teardown remain unchanged. Historical baseline runtime does not imply this new lane executed.

Create two synthetic private buckets outside migrations. A real authenticated owner can INSERT only its own quarantine prefix; there is no actor SELECT policy, so original quarantine bytes remain unreadable to owner, other player and synthetic staff. Same-token upload positives prevent vacuous authentication-denial claims. Only service credentials fetch quarantine bytes and create/read canonical output. No actor canonical write/read policy is installed.

Before decoding, bind exact fetched bytes to trusted synthetic fixture SHA. Actual Sharp decoder runs in a separate credential-free child, strips metadata and emits bounded canonical JPEG. Upload to fresh immutable output key; service exact byte roundtrip is required. Actor canonical creation/overwrite/read denials are checked with narrow recognized errors and service positive control; output must remain unchanged. Malformed and truncated MIME-matching quarantine bytes must be fetched exactly and produce validation rejection, with no added canonical metadata.

HTTP calls use a fixed-size shared memory response buffer and owned child join deadline, not blocking Pipe.recv after poll. Every read is capped at2MiB+1; request operation budget8s plus separate cleanup join2s. Cleanup kill/join/state checks are independently attempted. Original failure is preserved; cleanup uncertainty is explicitly flagged. Decoder outer operation8s and process-group reap2s are separate from decoder child's5s deadline. These are bounded operations, not OS-preempted universal hardwall guarantees. Decoder exit2 only means validation rejection; deadline/spawn/output-limit/nonvalidation child exit/signal is failure, never accepted as malformed input rejection.

## Verification and limits

Author14 decoder tests PASS,13 new lane Python controls PASS,13 inherited isolation controls PASS. These include actual valid/malformed decoder execution, substituted-byte no-decoder control, infrastructure exit/signal, cleanup failures, response caps and workflow dependency coverage. Runtime remains pending independent review and coordinator-owned disposable CI. No local Docker/server run.

This is service-mediated byte processing under synthetic policy prerequisites, not an installed trusted worker, publication CAS, retention SLA, late-write reconciliation, crash-safe cleanup scheduler, full account deletion, deployed policy acceptance or native app acceptance. Native decoder memory is not fully constrained by the V8 limit. Canonical output is deliberately unreadable to all actors; attachment publication is not implemented. Picker remains OFF; no feature or production promise follows.

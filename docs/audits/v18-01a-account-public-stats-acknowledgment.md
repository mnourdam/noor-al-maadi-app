# V18 account timestamp clearing requires public-stat acknowledgment

## Bounded caller integration

The reviewed `pushPublicStats` boolean means an error-free void RPC response while the request remains current; it is not a proof of affected rows, exact balances or economic inclusion. AccountProvider now captures that result and requires `statsAcknowledged === true`, together with cloud-save success and its existing identity/source/ticket checks, before clearing the pending-local-change timestamp in debounce, online reconnect and explicit `syncNow`.

Cloud-save `lastSyncAt` behavior and `syncNow`'s return value remain based on cloud-save success. A successfully saved blob is not relabeled failed because the separate public-stat mirror request failed. The final sign-out path remains unchanged. There are no automatic retries, new server requests, authority rules or changes to the existing four-second expiry window.

## Actual-provider evidence and compatibility

New `tests/offline/outbox-account-stats-acknowledgment.test.tsx` mounts actual ProfileProvider and AccountProvider. The public-stat error/no-session/success scenarios load the actual social helper with mocked transport; no live endpoint is contacted. Three paths each cover explicit false, reported RPC error, missing session and successful void result. A further case revokes the source profile during the actual helper's awaited RPC response.

Before account wiring: **9 failed / 4 passed** in an isolated temporary suite. After wiring: **13/13 pass**. Combined account failed-save, writer-fence, protocol-gate, capability, public-stats helper and cloud-writer suites: **93/93 pass across seven files**. Tests verify actual profile/storage results, successful cloud timestamps and unchanged manual return meaning, as well as revision fencing.

Four historical suites explicitly modeled successful public-stat calls with `mockResolvedValue(undefined)` under the old void signature. Those fixtures now return true in `outbox-account-failed-save-guard`, `outbox-account-writer-fence`, `outbox-account-protocol-gate` and `outbox-account-capabilities`; their assertions were not changed. Other fixture behavior is untouched. `git diff --check` passes.

This retains the existing temporary stale-realtime guard when public-stat acknowledgment is unavailable; it does not extend that guard beyond four seconds, serialize cross-tab writers, cancel already-issued requests, establish a baseline or prove the cause of historical player reports. Independent review cleared the exact wiring and fixture changes and independently ran 80/80 related tests. Combined final local validation passed 1,573/1,573 tests across 63 files, both TypeScript projects, client/SSR build and 41/41 scheduler checks. Remote CI remains pending publication.

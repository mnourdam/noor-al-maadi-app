# Campaign ledger hydration identity boundary

## Demonstrated defect

`hydrateLedgerFromCloud` previously accepted the session returned after asynchronous imports/authentication without binding it to the active storage owner. A held Alice chapter-progress query could finish after switching to Bob, then read and write Bob's current ledger partition. An Alice-to-Bob-to-Alice transition also admitted the obsolete response into the successor Alice session. These are deduplication markers, not reward grants, but foreign markers can suppress later local claims.

The initial actual-adapter suite reproduced **4 FAIL / 2 PASS**: delayed-query cross-owner/ABA, stable session-owner mismatch, and retirement during authentication. Tests use real owner state, storage partition, campaign cache, and ledger; only SDK authentication/query responses are synthetic. No hosted request or actual player data is involved.

## Bounded repair

Capture owner and epoch before the first await, require a user owner, and require the returned session UID to match it. Check identity after the client import, authentication, chapter query, and campaign cache import, around local reads, and before the final write/result. Retired attempts return null. Current-owner completed-row expansion, existing markers/active position/pending queue, and no-grant/no-enqueue semantics remain unchanged.

The boot caller and SIGNED_IN callback still invoke the same API. A delayed caller beginning after an identity transition can hydrate only the current matching session; this is not a receipt for the earlier auth event. No automatic account merge or transfer is introduced.

## Evidence and limits

- Focused hydration suite: **6/6 PASS**.
- Hydration plus unchanged marker persistence suite: **23/23 PASS**.
- Two passing controls cover current-owner expansion/idempotency and no-session/query-error behavior.
- This suite does not separately hold each dynamic import. The source fences those continuations, but the directly exercised delayed boundaries are authentication and the SDK query.
- `keysAdded` retains its historical candidate-count meaning even when `write` fails. It is not a persisted acknowledgment. This slice deliberately does not broaden that return contract.
- No changes to earning eligibility, completion interpretation, reward values, authority, cloud schema, or publication gates. The earlier multi-store marker/profile atomicity gap remains unresolved.

Production/native/economic HOLD remains. Independent review and aggregate checks are coordinated separately.

Final validation: independent bounded review cleared 23/23 focused cases; both TypeScript projects and all 1,711 offline tests across 80 files PASS. The ingress pin refresh was manually limited to this source hash and dependent manifest hash, with unchanged literal RPC/table candidates; seven integrity checks and drift PASS. Remote CI remains separate from these local checks.

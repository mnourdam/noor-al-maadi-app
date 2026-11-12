# Reflection operation identity isolation

## Synthetic reproduction

Real reflection/identity/partition code with mocked SDK and queue boundaries demonstrated seven failures and two passing controls before the patch. Delayed hydration could merge an obsolete owner's synthetic note into the current partition. Saved content could be queued under a later authenticated owner; delete continuation could create or clear a successor's tombstone. No real reflection content, account, or hosted service was inspected. This establishes source-level behavior, not a deployed incident.

## Repair

Capture owner and epoch before local work/authentication. Authenticated mirror operations require a session matching that originating owner. Retire continuations after authentication, module imports, enqueue/flush, query responses and before further direct SDK calls/local effects. Local change-event reentry cannot transfer content or clear successor tombstones. Guest writes remain local-only. Hydration timestamp merging and existing authenticated mirroring policy are unchanged; no guest/account transfer or new sharing is introduced.

Corrected the obsolete header claim that all notes never leave the device: existing signed-in mirroring already sends notes to its account backend. No additional destination is introduced.

## Evidence and limits

- Initial 9 cases: **7 FAIL / 2 PASS** before repair.
- Final 11 cases plus unchanged flush continuation tests: **38/38 PASS**.
- Includes real storage partitions for guest/Alice/Bob/guest, retained bytes across partition uninstall/reinstall, delayed hydration and ABA, auth/session mismatch, queued-save retirement, delete-response retirement, synchronous event reentry, positive authenticated save/delete, and current hydration/local pushback.
- The offline/reload control is an in-process storage-partition reinstall with retained localStorage, not a native restart or browser process durability claim. SDK, enqueue and flush boundaries are synthetic; no actual backend acceptance or real outbox durability claim.
- Already-issued network requests and already-accepted originating-owner queue entries are not canceled or rolled back. This prevents later continuations from using a new identity, not transactions across browser state/server state.
- Existing persistence acknowledgment, same-owner concurrent edit/replay ordering and tombstone revision semantics are unchanged. No automatic retry/transfer or economic authority work.

Independent review/aggregate validation are separate. Production/native/economic HOLD remains.

## Ingress evidence scope

Manual comparison confirmed the same three `user_reflections` table-call literals
and no direct RPC literals. This file is not part of the economic-ingress
manifest's candidate set, so no source pin or dependent manifest hash was changed
and the inventory scope was not expanded. Seven integrity tests and the drift
checker pass. This is source-evidence maintenance, not a deployed security claim
or additional authority acceptance.

Final validation: independent review cleared 11 new lifecycle cases; both TypeScript projects PASS and all 1,746 offline regressions across 82 files PASS. Remote CI remains separate from these local results; no hosted/native or release acceptance is implied.

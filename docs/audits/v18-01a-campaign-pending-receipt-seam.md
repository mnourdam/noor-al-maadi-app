# Dormant campaign pending-receipt integration

## Implemented boundary, not settlement closure

`saveGameplay` optionally exposes a frozen receipt of its exact accepted outbox write after matching immediate storage readback. Opt-in is false by default; ordinary callers retain their result shape and behavior. `recordChapterProgress` forwards this explicit option and receipt type. No live route opts in or imports the new adapter.

The receipt records owner, operation ID, revision, kind and serialized accepted payload. A private WeakMap registers its originating invocation epoch. Copies, JSON rehydrations and retired owner/ABA objects cannot be consumed through the adapter. This is same-runtime interface provenance, not authentication against hostile same-origin JavaScript or trusted modules calling journal APIs directly. It is not restart authentication. No public mint-from-shape helper exists.

An enqueue return alone is insufficient: the existing fallback may silently lose a storage write. The opt-in seam calls the actual outbox reader and requires exact matching item bytes/identity/revision before minting. Read failure/deadline/mismatch omits the receipt without reinterpreting the existing save outcome. The reader may run its existing fallback recovery; that is not a new writer-exclusion guarantee. A later dequeue or replacement does not erase the historical proof, and the adapter never substitutes the latest queue row for the issued snapshot.

`prepareCampaignPending` reuses `settlementForOwner.prepare`. It checks the issued capability, owner/epoch, chapter kind/IDs, exact operation/revision/payload and immutable terms. Non-pending existing/returned history is refused, including legacy_unknown and confirmed. Expected-binding CAS remains explicit. Caller terms describe attempted authored/tier intent only; they do not prove eligibility. This API writes pending/awaiting_confirmation only. It has no confirmation, delivered, balance, grant or collection path.

## Evidence

- Final focused integration suite: **20/20 PASS**. The preceding 18-case revision plus unchanged gameplay and settlement suites passed **104/104**; a final aggregate is still required.
- Actual saveGameplay, chapter recorder, outbox, settlement and fake IndexedDB; SDK transport synthetic.
- Issued receipt→pending journal; unchanged default shape; copied/altered receipt/terms/IDs refusal; owner ABA; exact chapter matching; legacy/confirmed refusal; replacement revision conflict; historical snapshot retention; retired RPC response capability rejection.
- Silent fallback drop after synthetic IDB write failure yields RPC acknowledgment but no receipt. An isolated-copy counterfactual removing only readback failed that assertion (1 FAIL, 11 skipped). Shared source was not swapped.
- All economy/appliedGrants/migrationState stores remain empty in the positive integration test. A separate check shows an accepted outbox intent without a settlement row until the adapter is explicitly called. This is evidence of the remaining cross-store gap, not its repair.

## Sole-intent-owner direction (C)

For future live integration, prefer the settlement journal as the sole durable intent owner **before transport**. The transport queue should reference/reconstruct that immutable committed intent, rather than authorize it or create an independent second attempt. Confirmation and eventual admitted delivery must attach to that same journal identity, not the newest queue revision. A+B currently runs after save and therefore is only a correlation seam; it is not that coordinator.

Before implementing the live owner, the journal must contain the complete immutable command required to reconstruct transport, and actual dispatch must reject journal absence/conflict. Current `Entitlement.Binding.snapshot` is not by itself a production eligibility source, and the existing source/terms fields do not grant economic enrollment. Need a reviewed schema/command contract, crash-cut/restart design, and real issuer/admission policy. Do not activate two competing intent owners or copy old profile balances.

## Remaining limits

No atomic outbox+journal transaction, recovery/import/enrollment, trusted reward issuer, universal writer exclusion, server receipt validation, balance baseline or delivered transition. Unknown legacy rows remain unknown; missing claim markers do not establish freshness. API callers can still label an attempted intent incorrectly, so pending storage is not trusted earning evidence. Existing unresolved enqueue outcomes are never mutated later to add proof. The delayed enqueue-notification case is covered below; fallback mismatch and every intermediate await are not exhaustively tested.

Production/native/economic HOLD remains. Independent review and final aggregate gates remain separate.

## Review corrections and final focused boundary

The first draft split identical save flights by receipt opt-in and checked journal history outside the prepare transaction. Both were rejected in review. Default and opt-in callers now share the original operation key/dispatch, with per-caller result projection; default callers never gain a receipt field. Opt-in is captured at call admission, not read from a mutable options object later. A late subscriber after the readback point may receive no receipt; it must not trigger another enqueue/RPC to manufacture one.

The journal's additive `pendingOnly` option checks history inside the same read/write prepare transaction; existing callers default to their historical behavior. Forced ordering in actual fake IndexedDB reads pending B, commits a rejection of B, then attempts C with expected binding B. It rejects without changing the rejected row. Removing only the atomic predicate in an isolated source copy makes that regression fail. Adapter pre/post checks are not presented as the concurrency protection.

The final suite includes the following additional controls. Added mixed-caller arrival orders (one dispatch, unchanged default shape), mutable option control, journal-write failure, and an actual IDB transaction whose completion notification is withheld until after the UI enqueue deadline. That outcome stays unresolved/no receipt/no RPC after the late notification is released. This is a controlled fake-IDB notification delay, not a native crash test. Tests do not install the storage identity-partition adapter; they use real owner state and owner-keyed actual outbox/journal implementations. Fallback replacement and every intermediate await are not exhaustively covered by this suite.

Late opt-in after an ordinary dispatch is explicitly covered: no receipt, no second request. Final focused suite is **20/20 PASS**, including rejection of matching numeric campaign/chapter IDs, numeric keys, and an empty attempt-key suffix. Per-caller default projections are cached by the underlying flight Promise, preserving the established identical-default-call Promise identity contract as well as shared work and result shape.

## Narrow economic ingress inventory maintenance

Manual comparison of the changed files found unchanged literal ingress:
`offline/record.ts` still calls only `record_campaign_progress_v2`, with no direct
table literals. The other two changed modules and new `campaign-pending.ts` have
no literal RPC/table calls and no existing candidate entries. Only the existing
record adapter source hash and dependent semantic manifest hash were refreshed.
Seven integrity tests and the drift checker pass, including the new-file scan.
No inventory scope expansion or authority/cutover acceptance is implied.

## Aggregate compatibility correction

The first coordinator aggregate passed types but exposed one unchanged historical Promise-identity assertion (1774 PASS / 1 FAIL). No assertion was weakened. Default result projections now reuse a WeakMap-cached Promise per underlying flight; opt-in callers share the core flight. A mixed-opt-in regression explicitly verifies repeated default calls retain identical Promise identity and no receipt field. Final focused counts follow coordinator validation.

Final aggregate validation: both TypeScript projects PASS and 1,776/1,776 offline tests across 85 files PASS. Independent adversarial review reran 127 focused/historical tests, including the unchanged default-Promise identity assertion. Remote CI is separate; this remains dormant same-runtime pending correlation, not pre-transport intent ownership, crash recovery, confirmation or delivery.

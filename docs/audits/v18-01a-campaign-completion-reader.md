# Whole-campaign completion reader and identity lifetime

## Repository schema evidence

`20260620133350_7d93861b-8f9d-4e22-b7b6-3077ae47a764.sql` defines `user_campaign_progress` per `(user_id,campaign_id,chapter_id)`, with default `unlocked` status and nullable completion time. A row is not evidence that the campaign is finished. Even filtering completed chapter rows would incorrectly promote one completed chapter to a whole-campaign completion.

`20260721101841_3c3a3b62-ffe6-482f-bd5d-8b4e2a8980e5.sql` explicitly separates chapter state from the sticky `user_campaign_completions` ledger. The backfill in `20260722044332_7e47ccda-8b4f-4c7c-a4fe-102e0bed36f4.sql` requires all published required chapter IDs in completed evidence before inserting the campaign fact. The reader's existing documented contract is the whole-campaign ledger, but its query mistakenly selected unfiltered chapter-progress rows.

## Reproductions and correction

Two baseline tests failed: a table-aware query returned unlocked/partial campaign IDs instead of the distinct completed-ledger ID; an Alice→Bob→Alice request returned old completion IDs. The real reader is exercised with synthetic query responses and real identity lifecycle, not a live database.

The read query now targets the intended `user_campaign_completions` table. No chapter eligibility is inferred, no history migrated, and no ledger rows or rewards are written. Owner/epoch is captured before the first continuation; in-flight keys include that lifetime, and stale responses are discarded. Cleanup is registered after promise publication and removes only the matching slot, including synchronous query failures. The union helper returns no local/profile/server contributions if its captured lifetime retires; its current-owner union policy is unchanged.

Nine focused cases cover table selection, ABA, pre-request switch, synchronous query failure/fresh retry, same-epoch coalescing and successor cleanup, stale union contributions, positive normalized union, unavailable ledger and guest-local behavior. Baseline 2 FAIL; corrected 9 PASS. Missing-ledger errors keep the server contribution empty rather than falling back to chapter presence. Existing local/profile evidence remains eligible under the prior union policy; this is not a trusted bootstrap or universal authority repair.

Deployed catalog/migration state is unknown. No hosted SQL, real account, live reward, native emulator or production acceptance was exercised. Independent review and aggregate checks remain required before publication.

The dedicated ledger is the intended completion-display/history contract, not verified earning or eligibility authority. Its repository schema grants authenticated own-row insertion, and `record_campaign_completion` is caller-declared history (economic inventory row 18). Selecting it does not make those declarations trustworthy entitlement evidence or satisfy V18 server-owned issuance requirements. ACL hardening and deployed-state verification are separate unresolved work; production HOLD remains unchanged.

## Manual ingress evidence refresh

The reviewed client entry for `src/lib/campaigns/completions.ts` now pins these
bytes and lists `user_campaign_completions` instead of `user_campaign_progress`.
That changed table call is read-only; the literal `record_campaign_completion`
RPC and its existing write path are unchanged. Only this entry and the dependent
semantic-review manifest hash were updated, without regenerating the inventory
or accepting other source drift. Seven integrity tests and the drift checker
pass. The ledger remains caller-declared history, not trusted earning authority.

Coordinator verification: both TypeScript projects PASS; normal offline suite 1,681/1,681 tests across 77 files PASS; seven inventory integrity tests and source-drift check PASS. Independent source/fixture review CLEAR. No hosted database, native device, production or trusted-entitlement acceptance is implied.

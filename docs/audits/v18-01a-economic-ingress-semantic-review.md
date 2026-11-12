# V18 economic ingress: manual source dispositions

HOLD. The table interprets the 29 pinned candidate bodies, not 29 live wallet writers.
No source, migration, balance or catalog is changed. Proposed dispositions are not activation.
Full source statement/file SHA256 and line ranges are in `tests/economic-ingress/semantic-review.json`.

| # | Exact signature / source lines | Direct semantics | Dependencies and proposed disposition |
|---|---|---|---|
| 1 | `public.handle_new_user()`<br>`20260718102652_b4c33ce8-f920-4969-ae96-5880f0db3400.sql:13-72` | genesis + transitive grant: profiles INSERT: id/identity/referral fields, dinars=300; referrals INSERT | gen_referral_code; grant_signup_reward; profile INSERT triggers. Fresh enrollment must replace/interlock signup genesis; no reinterpretation of existing300. Referral metadata can invoke separate50grant. |
| 2 | `public.sync_my_public_stats(jsonb)`<br>`20260905143448_69d67dc7-08a1-40ec-a877-e59fc988f19e.sql:254-331` | absolute wallet overwrite: profiles UPDATE xp,dinars,hearts,level and public counters/cosmetics; admin_balance_grants consumed_at | emblem_is_equippable_v1; profile UPDATE triggers. Legacy-only; enrolled users need typed economic route. Streak is explicitly not assigned despite comment mention. |
| 3 | `public.set_my_display_name(text)`<br>`20260620134034_e0115621-d4f4-46be-885e-268a47f1cbec.sql:79-96` | cosmetic body: profiles display_name,updated_at | profile UPDATE triggers. Candidate non-economic allowlist only after trigger closure; no direct xp/dinars/hearts. |
| 4 | `public.touch_my_last_active()`<br>`20260624222042_1c3e9350-b777-4ce8-9de0-39e1206bdf7e.sql:80-91` | activity metadata body: profiles last_active | profile UPDATE triggers. Candidate metadata allowlist after trigger closure; no direct balance write. |
| 5 | `public.admin_adjust_balance(uuid,text,integer,text)`<br>`20260625010400_24d65a19-fc84-47be-a564-8cc6e0519d75.sql:75-106` | privileged wallet adjustment: profiles xp OR dinars,updated_at; bounded p_delta addition under row lock | is_user_manager; log_admin_action; profile UPDATE triggers. Must use enrolled authority adjustment with reason/idempotency; admin access is not bypass permission. |
| 6 | `public.admin_set_account_status(uuid,text,text)`<br>`20260625010400_24d65a19-fc84-47be-a564-8cc6e0519d75.sql:108-125` | privileged account status: profiles account_status,updated_at | is_user_manager; log_admin_action; profile UPDATE triggers. Separate security/account lifecycle policy; no direct wallet write, do not conflate disabling account with zeroing wallet. |
| 7 | `public.grant_signup_reward(uuid)`<br>`20260624222636_57b4f34d-652e-4e6d-9c65-c4777f144bf8.sql:46-102` | transitive referral grant: profiles dinars+50,updated_at; referral_rewards INSERT; referrals stage/stage1_at/signup_reward_at; notifications INSERT/DELETE | log_admin_action; profile UPDATE triggers. Still active source despite public referral stubs. Must be fenced for enrolled referrer, not merely new referred user. |
| 8 | `public.profiles_level5_reward_trigger()`<br>`20260624222636_57b4f34d-652e-4e6d-9c65-c4777f144bf8.sql:161-177` | profile BEFORE UPDATE trigger: NEW.longest_streak when NEW.streak exceeds old longest; no direct wallet assignment | grant_level5_reward on level crossing; latest called helper is inert July24 stub. Not a current100dinar producer. Metadata side effect means cosmetic updates are not entirely side-effect-free. |
| 9 | `public.set_my_username(text)`<br>`20260627175013_a64405c5-6e5f-416e-8198-fafda5144986.sql:1-31` | identity metadata body: profiles username,updated_at | profile UPDATE triggers. Candidate non-economic allowlist after trigger closure; validates format/uniqueness, no direct balance. |
| 10 | `public.apply_profile_delta(uuid,integer,integer,integer,text)`<br>`20260711073913_7b89dce5-3fe2-4a7a-b135-4ad9b7855c64.sql:30-68` | arbitrary delta producer: applied_profile_deltas INSERT owner/amount/source; profiles xp,dinars,hearts,last_active | profile UPDATE triggers. Legacy-only; caller amounts and source are not entitlement evidence. Duplicate UUID does not compare entire payload/owner. |
| 11 | `public.admin_repair_chapter_completions_stickiness()`<br>`20260712193327_0ef75a77-200b-45fd-a370-0d30a4f41323.sql:19-84` | privileged history repair: user_campaign_progress completed_at,status,updated_at for earlier chapters | progress UPDATE triggers. No profile balance assignment; synthesizes completion evidence and therefore cannot mint authority grants from resulting history. |
| 12 | `public.purchase_heart()`<br>`20260718103514_9fd57de5-8051-44f6-b086-170c088610fc.sql:1-47` | wallet debit + heart grant: profiles dinars-=20,hearts+=1 capped5,updated_at under row lock | profile UPDATE triggers. Typed spend route with stable request receipt needed; existing RPC has no request identity, so lost-response retry may buy again. |
| 13 | `public.complete_investigation_v2(uuid,uuid,integer,integer)`<br>`20260718134245_94f5a894-96f3-4133-816c-ef8e1c63cf5e.sql:42-227` | catalog grant + mutable evidence: UIP completion/reward snapshot; applied_profile_deltas; profiles xp,dinars,hearts,last_active; user_collection | UIP count trigger; profile UPDATE triggers. Known reproduced snapshot forgery/delta collision. Deny enrolled route until guarded producer replaces all write paths. |
| 14 | `public.backfill_investigation_completion(text)`<br>`20260718124131_67ca98ae-8f01-486b-8c4b-c5175ed80e42.sql:183-237` | single legacy progress backfill: UIP INSERT completed status with zero earned amounts and legacy_key; no reward_snapshot column assigned | UIP count trigger. No direct reward; legacy progress only. Must not promote completed row to verified earning. |
| 15 | `public.backfill_investigation_completions(text[])`<br>`20260718134245_94f5a894-96f3-4133-816c-ef8e1c63cf5e.sql:230-332` | batch legacy progress backfill: UIP INSERT zero earned amounts and reward_snapshot=NULL | UIP count trigger. No wallet/collection grant. Preserve distinction between completion history and reward evidence. |
| 16 | `public.sync_investigations_completed_count()`<br>`20260718132317_16c580e7-4c4e-42bd-ba23-42cd014e79fd.sql:7-32` | UIP AFTER mutation trigger: profiles investigations_completed = count(completed UIP) | profile UPDATE triggers. Counter mirror, not wallet grant. Trigger may transitively touch profile metadata. |
| 17 | `public.claim_achievement_rewards(text[])`<br>`20260720140545_c6b3a175-52d7-4854-b2ce-3ce2429de679.sql:101-205` | registry grant on claimed IDs: user_achievements INSERT/update rewards payload and timestamps; profiles xp,dinars; user_titles INSERT | profile UPDATE triggers. Registry membership alone not gameplay eligibility; existing own-row insert/repair paths affect dedupe. |
| 18 | `public.record_campaign_completion(text,integer,text)`<br>`20260721101841_3c3a3b62-ffe6-482f-bd5d-8b4e2a8980e5.sql:43-79` | campaign completion marker: user_campaign_completions INSERT identity/version/source | table triggers. No direct profiles/delta grant. Caller-declared completion must not become verified eligibility. |
| 19 | `public.record_campaign_progress_v2(text,text,boolean,integer,integer,integer)`<br>`20260722063554_8fc784b1-6f3c-4cfc-a54b-1ff205627568.sql:1-114` | campaign progress + completion markers: user_campaign_progress status/score/xp_earned/coins_earned/completed_at/updated_at; user_campaign_completions version/source/updated_at | admin_campaigns read; table triggers. Earned columns are client-supplied/maxed evidence fields, NOT profile wallet changes. Completion receipt first_time flag needs separate semantic review. |
| 20 | `public.mark_achievement_notified(text,text)`<br>`20260722090647_d3a02c98-42af-4f39-8837-d6cfc3740be2.sql:11-41` | presentation metadata: user_achievements notified_at,presentation_origin | table triggers. Candidate non-economic allowlist; does not grant or establish eligibility. |
| 21 | `public.mark_achievement_presented(text[],text)`<br>`20260722090647_d3a02c98-42af-4f39-8837-d6cfc3740be2.sql:43-79` | presentation metadata: user_achievements presented_at,notified_at,presentation_origin | table triggers. Candidate non-economic allowlist; no balance/title changes. |
| 22 | `public.repair_historical_achievements(text[],jsonb)`<br>`20260722090647_d3a02c98-42af-4f39-8837-d6cfc3740be2.sql:81-188` | historical achievement suppression: user_achievements INSERT zero xp/dinars payload with historical_repair and reward_grant_suppressed; presentation/repair metadata UPDATE | achievement_registry read; table triggers. Deliberately no wallet/title grant; consumes achievement identity and cannot establish prior earned amount. |
| 23 | `public.complete_story_v2(text)`<br>`20260722131710_5eeadb86-0ac7-46e5-8334-ab0b7bbaf5ff.sql:490-566` | story completion + transitive grant: user_story_completions INSERT reward identity/contentversion/amounts | stable_delta_uuid; apply_profile_delta; profile UPDATE triggers indirectly. Ignores nested delta result; caller-writable completion evidence and ledger preemption remain blockers. |
| 24 | `public.record_streak_activity(text,text)`<br>`20260724183924_2e10401a-e926-4c13-a1a0-8ac0e2fa6897.sql:16-196` | older streak grant producer: profiles streak,longest_streak,last_streak_day,last_active/updated_at then xp,dinars; streak claims INSERT; titles/collection conditional INSERT | content_registry read; profile UPDATE triggers. Still separate callable signature. Serverdate does not prove activity eligibility; collectibles can fail independently while balances grant. |
| 25 | `public.admin_investigation_reward_reconcile(boolean,uuid[])`<br>`20260725233017_33892245-f931-4aed-bf74-4aa930981bc8.sql:105-234` | privileged historical wallet grant: applied_profile_deltas; profiles xp/dinars/hearts; UIP earned fields/snapshot/artifact/badge; user_collection; admin_audit_log | has_role; stable_delta_uuid; profile/UIP triggers. Dry-run is read-only; false grants CURRENT catalog amounts to history without matching ledger. Must deny/replace for enrolled cohort; not verified baseline recovery. |
| 26 | `public.profiles_hearts_anchor()`<br>`20260727014220_439da4d0-ea96-4ed7-bcb1-2aeead165652.sql:16-41` | profile heart timing trigger: NEW.hearts_at and NEW.hearts_full_notified_at on INSERT/changed hearts | none beyond builtins. No count/balance change but regeneration timing is economically relevant; preserve atomic association with authorized heart writes. |
| 27 | `public.mark_hearts_full_notified(uuid)`<br>`20260727014220_439da4d0-ea96-4ed7-bcb1-2aeead165652.sql:49-56` | service notification marker: profiles hearts_full_notified_at | profile UPDATE triggers. No balance assignment. Service-only declared grant; owner argument intentional service contract, effective catalog still unverified. |
| 28 | `public.purge_user_account_data(uuid)`<br>`20260731195901_ffc37355-fee6-4d34-87b9-07363591d073.sql:1-77` | destructive account purge: DELETE profiles and economic ledgers/completions/collection/cloud/progress; many personal tables; null shared content references | auth.users read; DELETE/FK cascades and triggers. Service-only declared grant, no internal auth check. Must coordinate enrolled authority deletion/tombstone/retention; cannot leave replayable or re-enrollable identity. |
| 29 | `public.record_streak_activity_v16(text,text,date,text)`<br>`20260828232904_00255dba-a92e-4049-a8b9-6dcce8a32a41.sql:1-209` | newer streak journal + grants: user_streak_days INSERT including legacy_bridge; profiles streak,longest,lastday,activity then xp/dinars; claims/titles/collection INSERT | serverdate/window checks; profile UPDATE triggers. Not protected historical proof: seeds up to4000days from legacy profile if dayledger empty. Reject-old activity may still bridge/recompute/grant; product behavior not changed here. |

## Source uncertainties now narrowed

- The July 24 compatibility migration disables `grant_level5_reward` and four
  public referral RPCs, but not `grant_signup_reward`. Latest signup still calls
  the latter. Therefore “all referrals removed” would be a wrong writer decision.
- Known profile triggers change timestamps, longest-streak mirror and heart
  regeneration anchors. The level-crossing helper is now inert. Cosmetic setters
  do not directly write balances, but their table updates still run triggers;
  no blanket bypass is approved without catalog confirmation.
- `record_campaign_progress_v2` writes client `xp_earned`/`coins_earned` history,
  not profiles XP/dinars. Its completion `ON CONFLICT DO UPDATE` row count also
  becomes `first_time_completion`; a true value is not necessarily first insertion.
  No current application consumer of that exact response field was found.
- `repair_historical_achievements` deliberately stamps zero reward payload with
  suppressed-grant metadata. A rewards_granted_at timestamp there is not proof of
  payment. Single/batch investigation backfills similarly do not grant economy.
- Purge is destructive and service-only in declared source grants, with no internal
  auth guard. Authority enrollment must account for deletion/tombstone semantics,
  not just adding and spending. No deletion was executed.
- `admin_balance_grants` has references in two September sync definitions but no
  CREATE/ALTER/GRANT/POLICY or issuance definition in this migration corpus. Its
  real producer and permissions cannot be resolved from the supplied repository.

## Additional private review pending

A security-sensitive authorization/helper call-chain requires separate private
review of definer ownership and exception behavior before reproduction details or
repair proposals are published. No deployed vulnerability or safe fix is claimed.
The pinned helper evidence remains subject to that review.

## Still unresolved

All effective production ACLs, function owners, role memberships, deployment
ordering, external jobs and deployed trigger bindings remain unknown. Function
renames/dynamic SQL from the initial manifest are not silently resolved by this
manual table. Source-declared service/admin access is not an authorization to run
it, and a direct harmless body is not proof of a harmless transitive runtime path.
The next useful work is closing the admission contract over this explicit table,
not declaring all candidates active wallet writers or auto-enrolling accounts.

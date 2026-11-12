# Repository economic ingress inventory and drift gate

**HOLD. This is reviewed-source evidence, not universal writer admission.** No SQL,
backend, migration, production config or player balance is executed or changed.

The manifest pins 278 migration files and records 29 conservative function
candidates, 239 relevant security statements and 27 literal client-entry files at
this revision. Those numbers are inventory records, NOT distinct live writers.
Some candidates are cosmetic setters or administrative deletion paths; names,
comments and table mentions are deliberately insufficient to classify authority.

`build_inventory.py` uses externally installed pglast 8.7 to parse top-level SQL,
track chronological CREATE/REPLACE definitions by input signature and explicit
DROP signatures, and retain statement byte ranges/hashes. PL/pgSQL body table
writes and call edges are lexical candidates, not resolved execution graphs.
Explicit overloads are preserved. Source evidence includes triggers, policies,
column/table/function grants, owner/default privilege changes and relevant DROPs.

`check_drift.py` uses only Python's standard library. It rejects added/deleted or
changed migration files, changed statement slices, and added/removed/changed
literal client RPC/table entrypoints. It does not regenerate or silently accept
new pins. A maintainer must review changes and regenerate the manifest explicitly.
Passing means only that this bounded evidence hasn't drifted. Dynamic calls,
wrappers, local-only writers and omitted tables remain unknown.

## Concrete unresolved source

`20260806104500_refresh_export_rpc.sql` is a pasted psql display headed
`pg_get_functiondef`, with separator lines and trailing `+` formatting. It is not
parseable migration SQL. It is recorded and pinned, never executed or silently
normalized. It concerns admin export, not a newly proved economic write, but it
prevents claiming that the complete migration corpus applies as a valid sequence.
No full migration application is attempted (other files may contain jobs/network
hooks). Actual deployed functions, privilege grants and migration application
state remain unknown.

## Manually reviewed consequential paths

- Latest `sync_my_public_stats(jsonb)`: 20260905143448, profiles XP/dinars assigned
  from bounded client totals; hearts from client payload clamped 0..5. Its admin
  grant reconciliation updates `admin_balance_grants.consumed_at`. Streak is
  explicitly NOT assigned here despite appearing in comments. It calls
  `emblem_is_equippable_v1` for avatar authority, not economic authority. App
  `social.ts` and outbox both call this path; the recently hardened boolean
  acknowledgment does not turn client totals into authoritative earned facts.
- `apply_profile_delta(uuid,integer,integer,integer,text)`: 20260711073913 accepts
  caller XP/dinars/hearts/source and inserts a globally keyed delta; authenticated
  own-row INSERT is separately granted. It is idempotency, not eligibility proof.
- `complete_investigation_v2`: latest 20260718134245 uses catalog rewards but its
  progress snapshot is own-row writable under earlier table privileges/policies.
  Delta collision can stamp completion with reward_granted=false. Provenance
  fixture proved both cases; neither snapshot alone proves grant inclusion.
- `complete_story_v2`: 20260722131710 has stable user/story identity and delegates
  to apply_profile_delta. Own-row completion INSERT and ignored delta result mean
  its record isn't a protected complete earning history.
- `claim_achievement_rewards`: 20260720140545 checks registered IDs, not underlying
  gameplay eligibility; writes profiles, achievements and titles. Own achievement
  INSERT and historical repair paths must be included in any admission closure.
- `purchase_heart`: latest 20260718103514 writes profiles dinars/hearts. It must
  share enrolled-wallet transaction admission with grants and absolute sync.
- Both `record_streak_activity` and later `record_streak_activity_v16` remain
  distinct signatures in repository SQL. The latter and `user_streak_days` need
  coverage; do not infer replacement merely from the newer function's name.
- Signup/referral helpers and profile triggers, admin_adjust_balance, campaign
  progress, repair/reconcile and purge routines are separate candidate producers
  or destructive writers. Service/admin paths cannot be excluded from admission
  by checking only authenticated RPC grants.

## Acceptance required before authority enrollment

1. Resolve each candidate's actual economic write set and transitive helpers,
   triggers, overloads, dynamic SQL and external jobs; explicitly allow harmless
   cosmetic writes only after proving they cannot invoke economic triggers.
2. Obtain an authorized catalog snapshot of functions/owners/config, table and
   column ACLs, RLS/policies, role memberships/defaults and triggers. Compare it
   against reviewed source pins. No current live catalog was accessed here.
3. Every enrolled-owner mutation, including direct table/service/definer/admin
   routes, must acquire the same server-controlled admission lock/version contract
   used for enrollment. Unknown routes deny admission. Client headers and local
   provider revisions are not this contract.
4. A disposable test of the resolved manifest must challenge every listed route
   and prove enrollment versus legacy-write races, not merely assert a list exists.

Run: `python3 -m unittest discover -s tests/economic-ingress -p 'test_*.py' -v`
and `python3 tests/economic-ingress/check_drift.py`.

The separate `v18-economic-ingress-drift.yml` lane runs standard-library tests and
this checker only on the repair branch. It never runs SQL, installs database
clients, connects to a backend or runs the inventory generator. A source drift
failure requires explicit review; CI must not regenerate pins to hide changes.
Green means unchanged reviewed evidence only, not admission or cutover readiness.

Review corrections: literal `.rpc (...)` / `.from (...)` calls with intervening
spaces or newlines are included. SQL candidate names are case-normalized for
unquoted identifiers. Quoted identifiers, TypeScript generic calls, optional
chaining and computed member access are not semantically resolved. Function,
type, table-column and index renames/schema moves are explicitly listed as
unresolved instead of silently interpreted. In particular the two July 30 story
import function renames require manual resolution; the candidate list is not a
complete name/overload resolver. These limits are reasons admission remains HOLD,
not reasons to treat an unchanged pin as comprehensive coverage.

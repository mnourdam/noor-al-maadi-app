# Phase 2b — Remove per-read unlock normalize/validate overhead: results

Deployed: **2026-09-03 ~07:35 UTC**. Scope: database functions plus one additive internal table. No RLS policy changes on existing tables, no client changes, no APK dependency, no offline-snapshot changes, no RPC signature or return-shape changes.

Rollback source: `docs/audits/rollback/phase2b-pre-rewrite-functions.sql` (complete `pg_get_functiondef` output for all 15 functions in the call graph, captured immediately before replacement).

---

## 1. What changed

| # | Change | Where | Why |
| --- | --- | --- | --- |
| 1 | Unlock specs are normalized **and validated at write time**, not on every read | new trigger `trg_story_unlock_norm_sync_v2` on `public.stories` → `public.story_unlock_norm_v2` | `normalize_unlock_spec_v2` (recursive PL/pgSQL) and `validate_unlock_spec_v2` (stack-machine over JSONB) ran once per story per call — 186×2 per full list. |
| 2 | Prerequisite leaves are extracted **once at write time** | `_story_unlock_leaves_v2`, stored in `story_unlock_norm_v2.leaves` | `_story_prereqs_v2` re-normalized the same spec a second time and then ran its own `WITH RECURSIVE` walk — a duplicate tree walk per story. |
| 3 | Prerequisites for the **whole list** are resolved in one set-wise pass | `list_stories_v3`, `list_stories_guest_v3` | Replaces 186 per-row `_story_prereqs_v2` calls with a single flatten → distinct-ref → title/satisfied resolve → re-aggregate pipeline. |
| 4 | New prepared evaluators that take an already-normalized expr | `_eval_unlock_prepared_v2`, `_eval_unlock_prepared_guest_v2` | Same semantics as `evaluate_unlock_spec_v2` / `evaluate_unlock_spec_guest_v2` minus the normalize+validate prelude. |

`normalize_unlock_spec_v2`, `validate_unlock_spec_v2`, `evaluate_unlock_spec_v2`, `evaluate_unlock_spec_guest_v2`, `_story_prereqs_v2`, `_eval_unlock_node_v2`, `_eval_unlock_node_guest_v2` and `story_is_campaign_intro` are **untouched** — other callers keep their exact behavior.

### Staleness is structurally impossible

`story_unlock_norm_v2` stores the source `unlock_spec` alongside the derived values. Both list RPCs only use a cached row when `c.spec IS NOT DISTINCT FROM s.unlock_spec`; otherwise that single row transparently falls back to the original `evaluate_unlock_spec_v2` / `_story_prereqs_v2` path. So a missed trigger, a bulk load, or a manual `UPDATE` can cost performance but can never change output.

The table has RLS enabled with no policies and no `anon`/`authenticated` grants; it is read exclusively by the `SECURITY DEFINER` list functions. The four new helper functions had `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated`.

Coverage after backfill: 186/186 stories cached, **0 stale**, 106 stories carry at least one prerequisite leaf.

## 2. Gate 1 — byte-identical output (10/10)

Same recipe as Phase 1/2: `sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False))`, same accounts, same parameters.

| Fixture | State | Result |
| --- | --- | --- |
| `anon_list_stories_v2.json` | anonymous | MATCH |
| `anon_world_prophetic_v2.json` | anonymous + `p_world_slug` | MATCH |
| `guest_list_stories_guest_v3.json` | guest, empty evidence | MATCH |
| `guest_evidence_list_stories_guest_v3.json` | guest with story + entity evidence | MATCH |
| `guest_collection_hijra_v3.json` | guest + `p_collection_id` | MATCH |
| `auth_zero_list_stories_v2.json` | signed-in, zero progress | MATCH |
| `auth_zero_world_andalus_guest_v3.json` | signed-in zero progress + world filter | MATCH |
| `auth_light_list_stories_v2.json` | 12 stories / 60 discoveries | MATCH |
| `auth_heavy_list_stories_v2.json` | 66 stories / 412 discoveries / 21 campaigns | MATCH |
| `auth_heavy_list_stories_guest_v3.json` | heavy account via the guest RPC | MATCH |

**10/10 byte-identical.** Covers unlock results, prerequisite titles/ordering/`satisfied`, hidden and mystery redaction, guest evidence behavior, campaign-linked stories, world filters, collection filters, and anonymous vs signed-in paths.

## 3. Gate 2 — no test regressions

- Vitest: **607 passed / 3 failed** — identical to the Phase 2 run. The three failures (`tests/notifications/daily-priority.test.ts`, `tests/startup/reconciliation.test.ts`) are pure client logic with no database involvement.
- Bun (`tests/stories`, `tests/offline`, `tests/campaign`): **259 passed / 39 failed** — identical to the Phase 2 run. All 39 are `permission denied for function …` from the sandbox's restricted psql role.

No new failures in either suite.

## 4. Gate 3 — execution time (controlled post-deploy deltas)

Measured as `pg_stat_statements` deltas across bursts run immediately after deployment, not cumulative counters. Server-side time only (excludes HTTP and JSON transfer). Full list = 116 returned rows out of 186 published stories.

| Call | Baseline (pre-Phase-2) | Post-Phase-2 | **Post-Phase-2b** |
| --- | ---: | ---: | ---: |
| `list_stories_v2`, anonymous, full list | 1,737.5 ms | 229.5 ms | **45.3 ms** (20-call burst, 905.2 ms total) |
| `list_stories_v2`, signed-in, full list | 1,737.5 ms | ~229 ms | **52.0 ms** (20-call burst, 1,039.6 ms total) |
| `list_stories_guest_v3`, guest, full list | 1,683.3 ms | 575.8 ms | **57.3 ms** (21-call burst, 1,203.5 ms total) |

All three land inside the 50–80 ms acceptance band; the anonymous path is below it. Cumulative improvement versus the original baseline: **~30–38×**.

Wall-clock over HTTP for the same payloads (includes network + ~1 MB JSON): 0.19–0.29 s, down from 1.7–1.9 s at baseline. The residual wall-clock is now dominated by payload serialization and transfer, not by query execution.

### Where the remaining ~50 ms goes

With normalize/validate removed from the read path, the residual is: `_eval_unlock_node_v2` / `_eval_unlock_node_guest_v2` recursion (one PL/pgSQL call per story, unavoidable without changing evaluator semantics), `_story_redact_summary_v2` (one call per story, builds the output object), and `jsonb_agg` of the 116-row result. Per-story marginal cost dropped from ~1.9–2.4 ms to ~0.35 ms. Further reduction would require folding the evaluator itself into a set-wise recursive CTE — out of scope for Phase 2b and not needed to hit the target.

## 5. Gate 4 — no reintroduced sequential scans

`pg_stat_user_tables` deltas over a controlled 10-call anonymous burst:

| Table | Pre-Phase-2 | Post-Phase-2 | Post-Phase-2b |
| --- | ---: | ---: | ---: |
| `encyclopedia_entities` | ~210 scans/call | 0 | **0** |
| `investigations` | ~211 scans/call | 0 | **0** |
| `stories` | ~214 scans/call | 0.5 | **0.4** |
| `admin_campaigns` | ~330 scans/call | 0.5 | **0.4** |

No regression; the two remaining scans per call are the single `stories` base scan and the single `admin_campaigns` intro-id scan, both already set-wise.

## 6. Effect on the downgrade case

At baseline the two story RPCs were 75.8% of database CPU at ~1.7 s mean. At ~50 ms mean their steady-state share falls to roughly **3–5%** of the original total. `realtime.list_changes` (1.6 M calls, 6.52 ms mean) is now unambiguously the largest remaining consumer and is the correct next target (Phase 3).

Infrastructure target remains **Medium**. Small was tested previously, left the app constrained, and is excluded permanently.

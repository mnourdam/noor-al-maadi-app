# Phase 2 — Set-wise story-list rewrite: results

Deployed: **2026-09-03 ~07:07 UTC**. Scope: database functions only. No tables, RLS policies, RPC signatures, offline-snapshot behavior, or client call sites were touched.

Rollback source: `docs/audits/rollback/phase2-pre-rewrite-functions.sql` (complete `pg_get_functiondef` output for all 13 functions in the call graph, captured immediately before replacement).

---

## 1. What changed

Three root causes, all fixed at the source. Semantics unchanged in every case.

| # | Change | Function(s) | Why |
| --- | --- | --- | --- |
| 1 | Native UUID comparison instead of `uuid::text = text` | `_eval_unlock_node_v2`, `_story_prereqs_v2` | The cast disabled every index on `encyclopedia_entities.id`, `investigations.id`, `user_entity_discoveries.entity_id`, `user_investigation_progress.investigation_id`. Measured 445 → 3 buffers per lookup. |
| 2 | One targeted scalar lookup per leaf instead of four full-table `LEFT JOIN`s per leaf | `_story_prereqs_v2` | Each prerequisite leaf previously joined `admin_campaigns` + `investigations` + `stories` + `encyclopedia_entities`, even though only one of the four is ever used. Leaves are also de-duplicated before resolution now. |
| 3 | Campaign-intro detection computed once per call, set-wise | `list_stories_v3`, `list_stories_guest_v3` | `story_is_campaign_intro()` is `SECURITY DEFINER`, so Postgres cannot inline it — it ran once per story row and full-scanned `admin_campaigns` each time (186+ scans per call). The inlined predicate is logically identical; the function itself is left untouched for its other callers. |

New helper: `public._uuid_or_null_v2(text) → uuid`, `IMMUTABLE`, `SET search_path`. It casts **only** strings matching `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` — i.e. exactly the canonical lowercase form a `uuid::text` cast produces. Anything else returns `NULL` and matches nothing, which is precisely what the old text comparison did. This is what makes the native comparison provably equivalent rather than merely equivalent-in-practice (an uppercase or braced UUID literal would have matched under a naive `::uuid` cast but not under the old `::text` compare).

Expression indexes were deliberately **not** used: fixing the comparison removes the cast at the source, as requested.

## 2. Acceptance gate 1 — byte-identical output

All 10 captured states re-run after deployment and hashed with the same recipe (`sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False))`):

| Fixture | State | Result |
| --- | --- | --- |
| `anon_list_stories_v2.json` | anonymous | MATCH |
| `guest_list_stories_guest_v3.json` | guest, empty evidence | MATCH |
| `guest_evidence_list_stories_guest_v3.json` | guest with story + entity evidence | MATCH |
| `guest_collection_hijra_v3.json` | guest, `p_collection_id` filter | MATCH |
| `anon_world_prophetic_v2.json` | anonymous, `p_world_slug` filter | MATCH |
| `auth_zero_list_stories_v2.json` | signed-in, zero progress | MATCH |
| `auth_zero_world_andalus_guest_v3.json` | signed-in zero progress, world filter | MATCH |
| `auth_light_list_stories_v2.json` | 12 stories / 60 discoveries | MATCH |
| `auth_heavy_list_stories_v2.json` | 66 stories / 412 discoveries / 21 campaigns | MATCH |
| `auth_heavy_list_stories_guest_v3.json` | same account via the guest RPC | MATCH |

**10/10 byte-identical.** That covers unlock results, prerequisite titles and ordering, `satisfied` flags, hidden/mystery redaction, guest evidence handling, campaign-linked stories, world and collection filters, and signed-in vs anonymous paths.

## 3. Acceptance gate 2 — no test regressions

- Vitest suite: **607 passed, 3 failed**. The three failures (`tests/notifications/daily-priority.test.ts`, `tests/startup/reconciliation.test.ts`) are pure client-side TypeScript logic with no database involvement — pre-existing and untouched by this change.
- Bun suite (`tests/stories`, `tests/offline`, `tests/campaign`): **259 passed, 39 failed**. All 39 failures are `ERROR: permission denied for function …` from the sandbox's restricted psql role, which cannot execute *any* database function — including `get_story_access`, which this change never touched. Environmental, pre-existing.
- No new errors, no timeouts, no non-2xx responses across ~25 live RPC calls.

## 4. Acceptance gate 3 — execution time

`extensions.pg_stat_statements`, post-deployment statements (new plan = new `queryid`):

| Statement | Calls | Mean |
| --- | ---: | ---: |
| story-list RPC **before** (cumulative since boot) | 23,377 | **1,737.5 ms** |
| story-list RPC **before**, guest variant | 8,260 | **1,684.0 ms** |
| story-list RPC **after** | 14 | **339.8 ms** |
| story-list RPC **after**, second shape | 4 | **575.8 ms** |

Wall-clock over HTTP, same payloads before and after:

| Call | Before | After |
| --- | ---: | ---: |
| anon `list_stories_v2(null)` | 1.803 s | 0.39–0.45 s |
| guest `list_stories_guest_v3` | 1.825 s | 0.297 s |
| guest + collection filter | 0.274 s | 0.177 s |
| anon + world filter | 0.624 s | 0.224 s |
| heavy account `list_stories_v2` ×3 | 1.737 / 1.735 / 1.779 s | 0.354 / 0.737 / 0.307 s |
| light account | 1.937 s | 0.379 s |
| zero-progress account | 1.897 s | 0.332 s |

**~5× faster (1,737 ms → 340 ms mean).**

## 5. Acceptance gate 4 — sequential scans

Measured as a controlled delta on `pg_stat_user_tables` across exactly 10 anonymous `list_stories_v2` calls, compared against the baseline's per-call rate (`total scans since boot ÷ 31,588 RPC calls`):

| Table | Before (scans/call) | After (scans/call) | Reduction |
| --- | ---: | ---: | --- |
| `encyclopedia_entities` | ~210 | **0.0** | eliminated (now 83 index scans/call) |
| `investigations` | ~211 | **0.0** | eliminated |
| `stories` | ~214 | **0.5** | ~430× |
| `admin_campaigns` | ~330 | **0.5** | ~660× |

Sequential tuple reads over those 10 calls: `encyclopedia_entities` **0** (was ~2,123 per leaf), `investigations` **0**, `stories` 930, `admin_campaigns` 390.

Every table clears the "at least one order of magnitude" bar by two to three orders. The residual 0.5 scans/call on `stories` and `admin_campaigns` is the single set-wise `intro_ids` pass — one small scan per call instead of one per row.

## 6. Residual cost and what is next

340 ms is still not free. The remaining time is per-story PL/pgSQL overhead: `normalize_unlock_spec_v2` and `validate_unlock_spec_v2` run once per story inside the evaluator and `normalize` runs again inside the prereq builder — roughly 560 function invocations per call doing pure JSONB manipulation, with no table access left to blame. Folding those into a single set-wise pass is a candidate for a later phase; it is not required for the Large → Medium downgrade and was out of Phase 2's scope.

Extrapolated effect on the baseline's CPU profile: the two story RPCs accounted for 75.8% of database CPU at ~1.7 s mean. At ~0.34 s mean, that share drops to roughly **15%** of the original total, i.e. about **60 percentage points of total database CPU removed**.

## 7. Rollback

Re-apply `docs/audits/rollback/phase2-pre-rewrite-functions.sql` (or just the four replaced functions from it: `_eval_unlock_node_v2`, `_story_prereqs_v2`, `list_stories_v3`, `list_stories_guest_v3`). All four are `CREATE OR REPLACE FUNCTION` with unchanged signatures, so rollback is a single transaction with no dependency or client impact. `_uuid_or_null_v2` can be left in place; nothing else references it.

**No new APK is required** — this is entirely server-side and the RPC contract is unchanged.

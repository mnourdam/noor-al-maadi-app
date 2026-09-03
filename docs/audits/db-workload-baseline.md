# Database Workload Baseline — Phase 0

Captured: **2026-09-03 06:42 UTC**
Instance: **Large** · Postgres boot: **2026-08-24 17:39 UTC** (≈9.5 days uptime)
Statistics window: `pg_stat_database.stats_reset` is `NULL` → all counters below are **cumulative since boot**.

Read-only capture. No code, schema, index, view, job, schedule, or client behavior was changed.

---

## 1. Instance configuration

| Setting | Value |
| --- | --- |
| `shared_buffers` | 2 GB |
| `effective_cache_size` | 6 GB |
| `max_connections` | 160 |
| `work_mem` | 12 MB |
| Database size | 189 MB |

The 189 MB database is *tiny* relative to a Large instance. Sizing is driven entirely by CPU burned on queries, not by data volume.

## 2. CPU / memory / connection utilization

`supabase--db_health` returned `metrics_unavailable: metrics payload exceeded size cap`, so the managed CPU/RAM gauges could not be read this cycle. Retry it each phase; the SQL proxies below are the fallback and must be captured either way.

| Metric | Value | Read |
| --- | --- | --- |
| Total connections | 34 / 160 | **21.3%** — no connection pressure |
| Active connections | 2 | idle-dominated |
| Idle in transaction | 0 | healthy |
| Buffer cache hit ratio | **100.00%** | working set fully in RAM; memory is *not* the bottleneck |
| Deadlocks (since boot) | 0 | healthy |
| Rolled-back transactions (since boot) | 495,933 | high; mostly PostgREST/RLS-denied and aborted reads — track the trend, not the absolute |
| WAL LSN position | 422 GB | large write/replication churn, consistent with heavy realtime traffic |

**CPU is the constraint, not RAM or connections.** 100% cache hit + 21% connection use + 189 MB data means a smaller instance is plausible *once query CPU drops*.

## 3. Top 20 statements by total execution time (since boot)

| # | Statement | Calls | Total ms | Mean ms |
| --- | --- | ---: | ---: | ---: |
| 1 | RPC `list_stories_v2(p_world_slug)` | 23,358 | **40,594,644** | **1,737.9** (max 7,139.9) |
| 2 | RPC `list_stories_guest_v3(p_world_slug, p_collection_id, p_evidence)` | 8,230 | **13,875,498** | **1,686.0** (max 2,992.6) |
| 3 | `realtime.list_changes(...)` (WAL polling) | 1,604,537 | **10,469,806** | 6.5 (max 13,784) |
| 4 | `campaigns_public` (id, slug, **data** JSONB, …) | 22,604 | 1,113,014 | 49.2 |
| 5 | `games` full-row read | 39,875 | 604,059 | 15.2 |
| 6 | RPC with `p_since, p_story_ids` (story delta sync) | 10,614 | 595,468 | 56.1 |
| 7 | `games` full-row read (variant) | 39,906 | 547,822 | 13.7 |
| 8 | `campaigns_public` (variant) | 10,634 | 509,917 | 48.0 |
| 9 | `encyclopedia_entities` full read | 9,047 | 491,131 | 54.3 |
| 10 | `encyclopedia_entities` full read (variant) | 8,333 | 462,762 | 55.5 |
| 11 | `encyclopedia_entities` (variant) | 27,674 | 384,044 | 13.9 |
| 12 | `encyclopedia_entities` (slug/title projection) | 31,104 | 369,312 | 11.9 |
| 13 | story delta RPC (variant) | 4,535 | 351,769 | 77.6 |
| 14 | RPC `p_include_on_demand` (snapshot/manifest) | 3,196 | 346,398 | 108.4 |
| 15 | RPC `p_include_on_demand` (variant) | 2,553 | 282,629 | 110.7 |
| 16 | RPC `p_story_id` (single story) | 52,924 | 221,064 | 4.2 |
| 17 | `encyclopedia_entities` (variant) | 14,917 | 203,667 | 13.7 |
| 18 | RPC `p_limit, p_before` (feed/list) | 59,803 | 175,365 | 2.9 |
| 19 | `investigations_public` | 3,158 | 130,549 | 41.3 |
| 20 | `campaigns_public` full row | 2,926 | 118,268 | 40.4 |

**Total of top 20 ≈ 71.9 million ms ≈ 20.0 CPU-hours in ~9.5 days.**
Share of that total:
- `list_stories_v2` + `list_stories_guest_v3` → **54.5 M ms = 75.8%**
- `realtime.list_changes` → **10.5 M ms = 14.6%**
- campaigns + encyclopedia + games content reads → **4.7 M ms = 6.5%**
- everything else → ~3%

## 4. Table access patterns (since boot)

| Table | Seq scans | Seq tuples read | Index scans | Live rows | Size |
| --- | ---: | ---: | ---: | ---: | ---: |
| `encyclopedia_entities` | 6,642,893 | **14.10 B** | 224,249 | ~0* | 9.6 MB |
| `investigations` | 6,658,692 | 1.56 B | 1,970 | ~0* | 2.4 MB |
| `stories` | 6,749,518 | 1.26 B | 713,349 | 186 | 2.0 MB |
| `admin_campaigns` | 10,404,653 | 0.81 B | 52,505 | 78 | 3.2 MB |
| `notifications` | 62,024 | 80.3 M | 26,980 | 2,483 | 1.7 MB |
| `user_story_completions` | 773,707 | 72.2 M | 11,834,300 | 417 | 208 kB |
| `games` | 79,781 | 56.1 M | 949 | ~0* | 888 kB |
| `story_media` | 17,627 | 33.3 M | 1,075,456 | 36 | 2.1 MB |
| `story_scenes` | 17,629 | 29.6 M | 854,024 | 2,448 kB | 2.4 MB |
| `profiles` | 15,465 | 15.7 M | 449,256 | 1,188 | 1.0 MB |
| `atlas_entities` | 15,360 | 13.6 M | 3,221 | ~0* | 480 kB |
| `user_roles` | 174,431 | 1.04 M | 19 | ~0* | 72 kB |
| `user_entity_discoveries` | 627 | 925,529 | 3,426,402 | 12,610 | 3.7 MB |
| `user_campaign_progress` | 193 | 690,178 | 300,890 | 6,532 | 2.1 MB |

\* `n_live_tup` of 0 is a stale-analyze artifact on small tables, not an empty table.

Millions of sequential scans over tables with tens-to-hundreds of rows means the scans are happening **inside loops in the RPCs**, not from a single client list read. `encyclopedia_entities` alone was read 14.1 billion tuples.

## 5. Client-side repetition already known (unchanged, for reference)

- `src/lib/offline-content-update.ts` — manifest/content check every 5 min per open client + on `online`.
- `FriendNotificationsPoller.tsx`, `PersonalInboxBell.tsx` — 60 s polls.
- Realtime subscriptions — the 1.6 M `realtime.list_changes` calls.
- Admin diagnostics pages refresh while open.

---

## 6. What this changes about the plan

The Phase 0 numbers **re-rank the optimization plan**. The originally prioritized items (campaigns JSONB, encyclopedia bodies, games catalogue) together account for only ~6.5% of database CPU. The real cost centers are:

1. **`list_stories_v2` / `list_stories_guest_v3` — 75.8% of all query CPU**, at ~1.7 s mean per call. These are the unlock-evaluation RPCs; they appear to loop per story over `stories`, `encyclopedia_entities`, `investigations`, and `admin_campaigns`, which explains the billions of sequentially-scanned tuples. **This is the single change that makes a downgrade possible.**
2. **Realtime WAL polling — 14.6%**, 1.6 M calls, plus the 422 GB WAL churn.
3. Content list reads (campaigns / encyclopedia / games) — 6.5%, still worth the low-risk index + projection work.

Phase 1 should be re-scoped before implementation to put the unlock RPCs first. That re-scope is a plan revision, not part of Phase 0.

---

## 7. Exact baseline query set (repeat verbatim after every phase)

Run all of these, in order, and append a dated section to this file. Also attempt `supabase--db_health` each time.

```sql
-- Q1 · instance config + capture timestamp
select now() as captured_at,
       pg_postmaster_start_time() as pg_boot,
       current_setting('shared_buffers') as shared_buffers,
       current_setting('effective_cache_size') as effective_cache_size,
       current_setting('max_connections') as max_connections,
       current_setting('work_mem') as work_mem,
       pg_size_pretty(pg_database_size(current_database())) as db_size;

-- Q2 · connection / memory / health proxies
select (select count(*) from pg_stat_activity) as total_conns,
       (select count(*) from pg_stat_activity where state='active') as active_conns,
       (select count(*) from pg_stat_activity where state='idle in transaction') as idle_in_tx,
       (select setting::int from pg_settings where name='max_connections') as max_conns,
       (select round(100.0*count(*)/(select setting::int from pg_settings where name='max_connections'),1) from pg_stat_activity) as conn_pct,
       (select sum(xact_rollback) from pg_stat_database) as rollbacks,
       (select sum(deadlocks) from pg_stat_database) as deadlocks,
       (select round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),2) from pg_stat_database) as cache_hit_pct,
       (select pg_size_pretty(sum(pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0'))::bigint)) as wal_pos;

-- Q3 · top 20 statements by total execution time
select left(regexp_replace(query,'\s+',' ','g'),140) as q,
       calls,
       round(total_exec_time::numeric,0) as total_ms,
       round(mean_exec_time::numeric,2) as mean_ms,
       rows
from extensions.pg_stat_statements
order by total_exec_time desc
limit 20;

-- Q4 · full text of the top 3 offenders (identify the RPC by name)
select left(regexp_replace(query,'\s+',' ','g'),400) as q,
       calls,
       round(total_exec_time::numeric,0) as total_ms,
       round(mean_exec_time::numeric,1) as mean_ms,
       round(max_exec_time::numeric,1) as max_ms
from extensions.pg_stat_statements
order by total_exec_time desc
limit 3;

-- Q5 · table access patterns
select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables
where schemaname='public'
order by seq_tup_read desc
limit 20;

-- Q6 · statistics window (confirms whether counters were reset)
select stats_reset from pg_stat_database where datname=current_database();
```

Notes on comparability:
- `extensions.pg_stat_statements` — the extension is **not** on the default `search_path`; the schema prefix is required.
- Counters are cumulative since boot. A restart or resize resets them, so always record `pg_boot` and normalize to **ms per day** when comparing across phases.
- Compare on **mean_ms** and **share of total** as well as absolutes, so a change in traffic volume doesn't read as a regression.

## 8. Downgrade gate (unchanged from the plan)

Downgrade only when, over 14 consecutive days: top-20 mean stays under ~50 ms per statement, no statement exceeds ~5% of total CPU on its own, seq-tuple counts on the hot tables drop by an order of magnitude, cache hit stays ≥99%, and connection peak stays well under the smaller instance's `max_connections`. Then step Large → Medium, observe 7 days, then consider Small.

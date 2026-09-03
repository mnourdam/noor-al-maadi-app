# Phase 3D — Large → Medium resize log

Target: **Medium (final)**. Small is excluded. Phase 4 is NOT part of this
operation.

## 1. Pre-resize verification — 2026-09-03 08:35:46 UTC

**Health / connectivity:** backend up and responding; auth reachable (122 ms),
database reachable (128 ms), auth→database reachable (193 ms). No unhealthy or
transitional state.

**Immediate pre-resize baseline (counters frozen for the post-resize delta):**

| Metric | Value |
| --- | --- |
| Instance sizing | `shared_buffers` 2 GB, `effective_cache_size` 6 GB, `work_mem` 12 MB, `max_connections` 160 → **Large (8 GB)** |
| Postgres start | 2026-08-24 17:39:29 UTC (uptime 231 h) |
| DB size / WAL | 190 MB / 144 MB |
| Backends | 33 (active 2, idle-in-transaction **0**, lock waits **0**) |
| Cache hit rate | **99.9999 %** (9,202,045,204 hits / 5,735 reads) |
| Deadlocks / temp bytes | 0 / 0 |
| Live realtime subscriptions | 6 |
| `realtime.subscription` writes (cumulative) | 329,349 |

Cumulative statement counters at freeze (post-resize deltas are computed
against these):

| Statement | Calls | Total ms |
| --- | --- | --- |
| `list_stories_v2` | 23,782 | 40,647,459 |
| `list_stories_guest_v3` | 8,347 | 13,919,309 |
| `realtime.list_changes` | 1,618,232 | 10,549,881 |
| `campaigns_public` | 33,387 | 1,629,959 |
| games catalogue | 80,268 | 1,157,592 |
| encyclopedia (3 shapes) | 91,564 | 1,916,543 |
| all statements | 20,540,549 | 73,937,661 |

**Rollback path to Large:** confirmed available. The same in-chat resize
control that performs Large → Medium also offers Large as a target, so the
revert is a single approved action. Constraint to be aware of: instance
resizes are rate-limited, so a revert may not be executable in the first few
hours after the downsize; the acceptance checks below are therefore run in
full before the change is declared final.

## 2. Resize execution

Pending — see the scheduling note in chat. The approved window is
**03:00–05:00 UTC**, i.e. 2026-09-04 03:00–05:00 UTC (18.5 h after approval).

## 3. Post-resize acceptance checks

Pending resize. Checklist and thresholds are those defined in
`docs/audits/phase3c-peak-remeasure.md`.

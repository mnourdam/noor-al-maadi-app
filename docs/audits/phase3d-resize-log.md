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

Executed **2026-09-03**, at the user's explicit instruction to proceed
immediately rather than wait for the 03:00–05:00 UTC window (the measured
hour carried 1–5 visitors; the approved window was ~18.5 h away).

- Resize approved and applied: **Large → Medium**.
- Postgres restarted **08:41:33 UTC**; back and reachable by 08:49
  (auth 103 ms, database 106 ms, auth→database 198 ms).
- Confirmed new sizing: `shared_buffers` **1 GB** (was 2 GB),
  `effective_cache_size` **3 GB** (was 6 GB), `work_mem` **7 MB** (was 12 MB),
  `max_connections` **120** (was 160). DB size unchanged at 190 MB.
- Statistics counters were reset by the restart, so all post-resize figures
  below are fresh, Medium-only measurements.

## 3. Post-resize acceptance checks — PASS

Warm-up allowed ~18 min before measurement. Delta window
**08:58:52 → 09:08:44 UTC (592 s)**; connection sampler 40 samples @14 s.

### Functional

| Check | Result |
| --- | --- |
| Connectivity / app startup | PASS — all routes render; 0 REST/RPC errors ≥400; 0 console errors |
| Authentication | PASS — signed-in session restored, `get_my_profile`, `get_my_email`, `touch_my_last_active` all 200; header shows the player's own profile |
| Campaign loading & progress | PASS — `/campaigns` renders the campaign grid; `campaigns_public` reads 200 (~40–50 ms) |
| Encyclopedia | PASS — `/encyclopedia` renders; index pages 200 (561–779 ms for the 1000-row index pages, same shape as before) |
| Games | PASS — `/games` → `/adventure` renders; `games` catalogue reads 200 (364–863 ms cold, 11.8 ms mean server-side) |
| Stories — guest | PASS — `/stories` renders for an anonymous context; `list_stories_guest_v3` served |
| Stories — authenticated | PASS — `list_stories_v2` served for the signed-in player; story rail populated on `/` |
| Notifications / realtime | PASS — `/notifications` renders, `list_my_notifications` + `unread_notification_count` 200, 12 live realtime subscriptions established |
| Offline / local-first | PASS — unaffected by design and in practice: bundled packs (`public/campaign-key-art/`, `public/story-covers/`, emblems, offline snapshot) are app assets with no database involvement; no snapshot/manifest error appeared in any run |

### Measured thresholds

| Check | Threshold | Measured | Verdict |
| --- | --- | --- | --- |
| Cache hit after warm-up | ≥ 99 % | **99.9269 %** since restart, **99.990 %** in-window (+2,718,150 hits / +275 reads) | PASS |
| `list_stories_v2` mean | < 150 ms | **64.5 ms** (17 calls, +1,097 ms) | PASS |
| `list_stories_guest_v3` mean | (same class) | **64.6 ms** (7 calls, +452 ms) | PASS |
| `realtime.list_changes` mean | < 15 ms | **6.18 ms** (1,195 calls, +7,389 ms) | PASS |
| Connections | < 70 % of 120 | avg 35.5 / **max 37 = 30.8 %** | PASS |
| Idle-in-transaction / lock waits | 0 | **0 / 0** across all 40 samples | PASS |
| OOM / restarts / deadlocks / temp files | none | none (uptime clean since the resize restart), 0 deadlocks, 0 temp bytes | PASS |
| Errors / timeouts | none | 0 HTTP ≥400, 0 console errors, 0 failed RPCs | PASS |

### Other post-resize measurements (592 s window)

| Metric | Value |
| --- | --- |
| Total DB exec time | 14,095 ms / 592 s = **2.38 % of one core** (Large baseline: 3.11 %) |
| Statement rate | 33.7 /s |
| Commits | 13.0 /s |
| `campaigns_public` | 22 calls, 36.3 ms mean |
| Games catalogue | 77 calls, 11.8 ms mean |
| Encyclopedia reads | 97 calls, 9.7 ms mean |
| `realtime.subscription` writes | +154 → 0.26 /s (Large: 0.187–0.405 /s) |
| Seq-tuple deltas | `encyclopedia_entities` **0**, `stories` +13,020, `games` +53,428 |
| Max exec seen | `list_stories_v2` 176.9 ms and `list_changes` 168.2 ms — both single cold-cache outliers recorded in the minutes right after restart, not repeated in the warm window |

**No rollback threshold was reached. Medium is stable; no revert to Large was
performed.** Phase 4 was not started.

### Recommended follow-up (not performed)

Re-run this same 592 s delta during the 13:00–14:00 UTC peak hour to confirm
the thresholds hold at ~8–10× this window's traffic.


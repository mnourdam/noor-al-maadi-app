# Phase 3C — Post-Phase-2b / Phase-3B re-measurement (READ ONLY)

Measured 2026-09-03. Nothing was modified: no migration, no code change, no
resize, no Phase 4 work. Method is the Phase 0 methodology — two cumulative
`pg_stat_statements` / `pg_stat_*` snapshots and a delta over a bounded
window, plus a connection sampler.

## Window and representativeness (read this first)

| Item | Value |
| --- | --- |
| Delta window | 08:21:16 → 08:31:06 UTC (590 s) |
| Connection sampler | 55 samples @10 s, 08:21 → 08:31 UTC |
| Postgres uptime | 230.9 h (stats never reset — cumulative columns still contain pre-Phase-2 history, so **only the deltas below are post-fix**) |

The window is **off-peak**. Hourly analytics for 2026-08-27 → 09-03 put the
busiest hour at **26 visitors / 114 pageviews** (Aug 27 13:00 UTC), typical
daytime hours at 3–9 visitors, and the measured hour (08:00 UTC Sep 3) in the
1–5 visitor band. The true daily peak sits ~5 h after this measurement, so
every rate below is additionally reported **scaled ×10** — a deliberately
conservative envelope above the observed historical peak (≈7.6× median).

## Top statements by post-fix execution time (delta, 590 s)

| Statement | Calls | Δ total ms | Mean ms (in-window) | Share of Δ exec |
| --- | --- | --- | --- | --- |
| `realtime.list_changes` | 1,205 | 7,468 | **6.20** | 40.7 % |
| `list_stories_v2` | 43 | 2,278 | **52.98** | 12.4 % |
| `games` list (PostgREST) | 118 | 1,292 | 10.95 | 7.0 % |
| `campaigns_public` list | 29 | 1,257 | 43.35 | 6.9 % |
| `encyclopedia_entities` reads (3 shapes) | 108 | 1,170 | 10.83 | 6.4 % |
| `list_stories_guest_v3` | 6 | 337 | **56.17** | 1.8 % |
| everything else | ~32,796 | ~4,536 | — | 24.8 % |
| **total** | **34,305** | **18,338** | — | 100 % |

Cumulative (lifetime, pre-fix history included, for contrast only):
`list_stories_v2` 23,778 calls / mean 1,728 ms / max 7,139.9 ms / total
40,647 s; `list_stories_guest_v3` 8,346 calls / mean 1,669.9 ms / max
2,992.6 ms / total 13,919 s; `realtime.list_changes` 1,617,654 calls /
mean 6.52 ms / max 13,784.1 ms / total 10,546 s. No new max was set for
any of the three during the window — the maxima are all pre-Phase-2b.

### Requested per-RPC detail (post-fix, in-window)

| RPC | Calls | Rate | Mean | Max (in-window) | Δ total |
| --- | --- | --- | --- | --- | --- |
| `list_stories_v2` | 43 | 0.073 /s | 52.98 ms | no new max (lifetime 7,139.9 ms is pre-fix) | 2,278 ms |
| `list_stories_guest_v3` | 6 | 0.010 /s | 56.17 ms | no new max (lifetime 2,992.6 ms is pre-fix) | 337 ms |
| `realtime.list_changes` | 1,205 | 2.04 /s | 6.20 ms | no new max | 7,468 ms |

Phase 2/2b hold: story RPCs are ~53–56 ms against a ~1,670–1,728 ms lifetime
mean, i.e. **~31× faster** than the pre-optimization corpus.

## Realtime subscription write rate

| Measurement | Rate |
| --- | --- |
| Lifetime (pre-Phase-3B dominated) | 0.397 writes/s |
| Phase 3B verification window (08:12–08:15) | 0.187 writes/s |
| This window (590 s, +239 writes) | **0.405 writes/s** |

The two post-change windows straddle the lifetime average, so the honest
reading is: `realtime.subscription` churn is now **traffic-proportional**
(subscribe/unsubscribe per session) rather than mutation-proportional. The
structural duplication (6 notification channels → 2, profile channel rebuilt
per mutation → 1 per session) is removed; what remains scales linearly with
concurrent sessions, and `list_changes` call rate (2.03–2.04 /s) is poll-driven
and flat regardless.

## Connections

| Metric | Value |
| --- | --- |
| Total backends (avg / max over 55 samples) | 35.7 / **37** |
| Active | 1–2 |
| Idle | 28 |
| Idle in transaction | **0** |
| Lock waits | 0 |
| `max_connections` (Large) | 160 → **23 % used** |

The backend count is a near-constant floor (PostgREST + realtime + pooler
pools), not user-driven; it does not scale with pageviews.

## Cache, health and workload

| Metric | Value |
| --- | --- |
| Cache hit rate (lifetime) | **99.9999 %** (9.20 B hits / 5,735 reads) |
| Cache hit rate (in-window) | **100.000 %** (+3,012,825 hits, **+0** disk reads) |
| Buffer read rate | 5,106 hits/s |
| Commits | 20.4 /s |
| DB size | **190 MB** |
| WAL | 144 MB / 10 segments |
| Deadlocks / rolled-back growth / temp files / temp bytes | 0 / 0 / 0 / 0 |
| Live realtime subscriptions | 10 |
| Total DB exec time in window | 18,338 ms / 590 s = **3.11 % of one core** |
| Statement rate | 58.1 statements/s |

`supabase--db_health` returned `metrics_unavailable: metrics payload exceeded
size cap`, so no vendor CPU/RAM gauge was obtainable this session. The
substitutes above (exec-time share of a core, 0 disk reads, 0 OOM/deadlock
signals, 0 idle-in-transaction, stable 230 h uptime with no restart) cover the
same question. Current instance memory is confirmed by
`shared_buffers = 2 GB`, `effective_cache_size = 6 GB` → **8 GB RAM (Large)**,
`work_mem = 12 MB`, `max_parallel_workers = 2`.

## Hot-table sequential-scan deltas (590 s)

| Table | Δ seq_tup_read | Rate | Lifetime seq_tup_read |
| --- | --- | --- | --- |
| `encyclopedia_entities` | **0** | 0 /s | 14.12 B |
| `games` | 82,954 | 140.6 /s | 56.4 M |
| `stories` | 28,644 | 48.5 /s | 1.26 B |
| `admin_campaigns` | 15,054 | 25.5 /s | 812.5 M |
| `investigations` | 11,700 | 19.8 /s | 1.56 B |

The 14.12 B lifetime figure on `encyclopedia_entities` is entirely historical:
**zero** sequential tuples were read from it during the window, and its
`seq_scan` counter did not advance at all. Remaining scans are on small tables
(`games`, `admin_campaigns`, `investigations` are tens-to-hundreds of rows) and
are fully buffer-resident — hence 0 disk reads.

## Content-read workload (campaigns / encyclopedia / games)

| Surface | Calls in window | Rate | Mean | Δ total ms |
| --- | --- | --- | --- | --- |
| Campaigns (`campaigns_public`) | 29 | 0.049 /s | 43.35 ms | 1,257 |
| Games catalogue | 118 | 0.200 /s | 10.95 ms | 1,292 |
| Encyclopedia (3 read shapes) | 108 | 0.183 /s | 10.83 ms | 1,170 |
| **Combined** | 255 | 0.43 /s | — | 3,719 (20.3 % of Δ exec) |

All three are read-only, 100 % buffer-served, and none set a new max.

---

# Answer: is the current workload safely compatible with Medium?

**Yes.** With one stated caveat: the window was off-peak, so the verdict rests
on the ×10 scaled envelope below, which exceeds the highest hour observed in
the last 7 days.

## Expected headroom on Medium (2 vCPU / 4 GB)

| Dimension | Measured now | ×10 peak envelope | Medium capacity | Headroom at ×10 |
| --- | --- | --- | --- | --- |
| CPU (DB exec time) | 3.11 % of one core | 31 % of one core | 2 vCPU | **~84 % free** |
| Statements/s | 58.1 | 581 | — | comfortable |
| Connections | 37 | ~45 (floor + sessions) | 120 direct / ~600 pooled | **~62 % free** |
| Working set vs RAM | 190 MB DB, 144 MB WAL | unchanged (data size is traffic-independent) | ~1 GB shared_buffers, 4 GB total | DB fits in shared_buffers **~5×** over |
| Disk reads | 0 /s | ~0 /s | — | cache stays hot |

The decisive fact is that the entire database (190 MB) fits several times over
inside Medium's smaller shared_buffers, so the 100 % cache hit rate — the thing
that makes the current CPU profile so cheap — survives the downsize. This is a
CPU/RAM change only; database disk size is a separate control and is not
affected.

## Relevant Medium limits

- **Direct connections 120** (Large: 160). Current floor is 37; the app reaches
  Postgres through PostgREST/pooler pools, not per-user connections.
- **Pooler (transaction mode) ~600 client connections** — unchanged in practice.
- **RAM 4 GB** (Large: 8 GB) → `shared_buffers` roughly halves to ~1 GB and
  `effective_cache_size` to ~3 GB. Still ≥5× the 190 MB dataset.
- **2 vCPU, same as Large** — this resize does **not** reduce core count, only
  memory and burst budget. That is why the CPU headroom above is honest.
- `work_mem` will be re-tuned downward by the platform (currently 12 MB). Only
  the admin export/import queries sort large JSONB; they are single-call,
  operator-triggered, and can spill to temp files without user impact.

## Risks of the resize

1. **Brief downtime / connection reset** during the instance swap (typically a
   few minutes); in-flight requests fail and clients must reconnect.
2. **Cold cache after restart** — the first minutes will show real disk reads
   and slower story/encyclopedia RPCs until the 190 MB working set is paged
   back into shared_buffers. Expect a transient, not a regression.
3. **Halved shared_buffers** — safe at 190 MB today, but it is the metric that
   would bite first if the content corpus grew several-fold (e.g. a large media
   metadata or analytics table).
4. **Lower burst headroom** for admin bulk operations (story/campaign
   import-export, encyclopedia cleanup) which are the only heavy CPU spikes in
   the corpus.
5. **Resize cadence**: instance changes are rate-limited, so an immediate
   revert to Large may not be instant.
6. The measurement window was off-peak; residual risk is that a real peak is
   more than 10× this window (not supported by 7 days of analytics).

## Safest resize window

**03:00–05:00 UTC (06:00–08:00 Damascus).** Analytics show 0–3 visitors/hour
across that band on every one of the last 7 days — the global daily minimum —
while the historical maximum (13:00–14:00 UTC) is 8–10× higher. Additional
conditions: no admin import/export running, no APK cut or content publish in
progress, and not immediately before a notification broadcast.

## Post-resize acceptance checks (run in this order)

1. `supabase--db_health` — instance up, PgBouncer up, no OOM kills, no
   restarts beyond the resize itself.
2. Confirm the new sizing: `shared_buffers` ≈ 1 GB, `effective_cache_size`
   ≈ 3 GB, `max_connections` = 120.
3. Wait ~15 min for cache warm-up, then repeat **this exact 590 s delta
   methodology** and compare against the table above:
   - `list_stories_v2` mean ≤ 80 ms (vs 52.98 ms)
   - `list_stories_guest_v3` mean ≤ 85 ms (vs 56.17 ms)
   - `realtime.list_changes` mean ≤ 9 ms (vs 6.20 ms)
   - campaigns / games / encyclopedia means ≤ 1.5× the values above
4. Cache hit rate ≥ 99.9 % and disk-read rate back near 0 after warm-up.
5. Connections: total backends < 60, idle-in-transaction = 0, lock waits = 0.
6. Zero deadlocks, zero temp files at steady state.
7. Functional smoke on the app: `/stories` (signed-in **and** guest),
   `/campaigns`, `/encyclopedia`, `/games`, notification bell + in-app banner
   (realtime delivery), `/inbox`.
8. Re-check after one full peak hour (13:00–14:00 UTC) before declaring the
   downgrade final.

## Immediate rollback criteria (back to Large)

Roll back without further analysis if any of these appear within the first
24 h after the resize:

- Any **OOM kill** or unplanned Postgres restart.
- Cache hit rate stays **< 99 %** more than 30 min after warm-up, or a
  sustained non-zero disk-read rate.
- `list_stories_v2` or `list_stories_guest_v3` in-window mean **> 150 ms**
  (≈3× the measured value) at steady state.
- `realtime.list_changes` mean **> 15 ms** sustained, or realtime deliveries
  visibly lagging in the app.
- Connection saturation **> 70 %** of 120, or any client-facing connection
  refusal / pooler exhaustion.
- Sustained non-zero `idle in transaction`, new deadlocks, or temp-file spill
  during normal (non-admin) traffic.
- Any user-visible timeout on `/stories`, `/campaigns`, `/encyclopedia`, or a
  failed notification broadcast attributable to the database.

**Not done, per instruction:** no resize was performed and Phase 4 was not
started. Medium remains the only downgrade target; Small stays excluded.

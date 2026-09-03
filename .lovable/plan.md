# Safe Phased Plan: Reduce Database Workload → Downgrade Large → Smaller

Goal: cut read volume and CPU on the database enough that a downgrade from **Large** is provably safe, without touching offline behavior, progression, or features. Nothing is implemented in this plan — each phase ships and is measured separately.

Guiding rules for every phase:
- No feature removal, no destructive schema change, no change to the offline snapshot format or its sync contract.
- Additive-only database objects (new views/indexes/RPCs). Old paths stay callable until the new one is proven.
- Each phase ends with a metrics checkpoint before the next one starts.

---

## Phase 0 — Baseline & measurement harness (no product change)

- Capture the "before" numbers: `pg_stat_statements` top-20 by total time, `pg_stat_user_tables` seq scans/tuples for `admin_campaigns`, `encyclopedia_entities`, `games`, plus daily Database Server credits.
- Record them in `docs/audits/db-workload-baseline.md`.
- Repeat the same capture at the end of every phase using the identical query set.

Affected: docs only. Workload reduction: 0. Risk: none. Tests: none. APK: no. Rollback: n/a.

---

## Phase 1 — Low-risk database-side wins (indexes + column projections)

Purely server-side; the client keeps calling exactly what it calls today.

**1a. Indexes** (plain `CREATE INDEX`, additive)
- `admin_campaigns (status, updated_at DESC)` — kills the ~10.1M sequential scans behind `campaigns_public`.
- `encyclopedia_entities (status, updated_at DESC)` and `(kind, status)` — for hub/category/delta reads.
- `games (status, published_at DESC)`.
- `user_campaign_progress (user_id, updated_at DESC)` if not already covered.
- `friendships (status, created_at)` partial on pending — for the hourly reminder job.
- `device_tokens (user_id) where enabled` — for comeback push and segment sends.

**1b. Light projection views** (additive, no old object dropped)
- `campaigns_index_public`: id, slug, title, status, order, updated_at, and only the small display fields — no full `data` JSONB.
- `encyclopedia_index_public`: id, slug, title, kind, era, updated_at, cover ref — no `body`.
- `games_index_public`: id, mode, title, status, published_at, difficulty — no `stages`.
Each gets `GRANT SELECT` to the roles the current tables already allow, mirroring existing RLS intent.

Affected tables: `admin_campaigns`, `encyclopedia_entities`, `games`, `friendships`, `device_tokens`, `user_campaign_progress`.
Expected reduction: index work alone should remove most sequential-scan CPU (audit showed ~13.75B tuples read on encyclopedia); views are the enabler for Phase 2, not yet a reduction on their own.
Regression risk: **Low** — no client change, no behavior change.
Tests: `EXPLAIN (ANALYZE, BUFFERS)` before/after on each hot query; existing offline/campaign/encyclopedia test suites must stay green.
APK required: **No**.
Rollback: `DROP INDEX` / `DROP VIEW` — no data or client dependency.

---

## Phase 2 — Client fetch: list reads stop pulling heavy JSONB

Switch list/sync call sites onto the Phase 1 projections. Detail reads (opening a campaign, an entity, a game) keep fetching the full row exactly as today, so nothing renders with less data than it does now.

- `src/lib/cloudSync.ts` → `pullCampaignsFromCloud()` reads `campaigns_index_public`; the admin editors keep `admin_get_campaign_full`.
- Encyclopedia index build (`src/lib/encyclopedia/index-store.ts` and its delta sync path) reads the body-free projection; body loads on entity open only.
- Games catalogue read (`src/lib/games/store.ts`) drops `stages` from list queries; `stages` load when a game starts.
- Offline snapshot generation (`scripts/generate-offline-snapshot.mjs`, `scripts/lib/offline-snapshot-build.mjs`) is **unchanged** — the bundled snapshot keeps shipping full content, so Android offline behavior is identical.

Expected reduction: the audit's three largest workloads (~1.87M ms campaigns, ~1.88M ms encyclopedia, ~1.13M ms games) shrink roughly in proportion to payload size — realistically 60–85% of their total time.
Regression risk: **Medium** — a missing field in a projection shows as an empty label. Mitigated by typing the projection and keeping detail fetches intact.
Tests: encyclopedia index-gating and count-parity tests, campaign divider/progression tests, games daily-rotation and export tests, stories offline/local-first tests, plus a manual pass on hub → category → detail for all three domains.
APK required: **Yes eventually** — web/admin gets it immediately; Android picks it up with the next release. Old clients keep working because the old tables/views remain.
Rollback: revert the call sites to the full-row selects; the tables never changed.

---

## Phase 3 — Content-update polling: from 5-minute polls to version-only checks

Today `src/lib/offline-content-update.ts` polls every 5 minutes per open client and on `online`, and each check can fan out into content reads.

- Replace the periodic poll with: check on cold start, on `online`, and on visibility-return with a **minimum 6-hour cooldown** persisted locally.
- Make the check itself a single cheap version read (`get_content_manifest` reduced to a version/etag row, or a static versioned JSON served from the CDN), so an unchanged version costs no content read at all.
- Content delta fetch only runs when the version actually differs — same delta pipeline as today.
- The user-facing "content update available" banner and the manual refresh action stay exactly as they are.

Affected: `src/lib/offline-content-update.ts`, the manifest RPC (additive lightweight variant), and the pollers in `FriendNotificationsPoller.tsx` / `PersonalInboxBell.tsx` (60s → 5 min + visibility gating, or realtime where cheap).
Expected reduction: near-elimination of idle-tab database traffic — this is the phase that produces the "near-zero idle cost" property.
Regression risk: **Medium** — a stale client could notice new content later than before. Bounded by the cold-start and online checks.
Tests: offline content-update tests (`tests/offline/*`), quota-recovery tests, plus a manual check that a published content change still surfaces the banner after reopen.
APK required: **Yes** for Android to gain the idle savings.
Rollback: restore the 5-minute interval constant — single-file revert.

---

## Phase 4 — Background jobs & admin surfaces

- Batch and index the comeback (`irth-comeback-24h-hourly`) and friend-reminder (`friend-request-reminders-hourly`) queries so cost stops growing linearly with users; keep schedules and behavior identical.
- Admin diagnostics pages pause their refresh loops when the tab is hidden.

Expected reduction: small today, but removes the future growth curve.
Regression risk: **Low**. Tests: notification/announcement suites, manual admin page check. APK: **No**. Rollback: revert the job SQL to the current definitions.

---

## Phase 5 — Prove it, then downgrade

Downgrade only when, over **14 consecutive days** after Phase 3 ships to Android:
- peak CPU stays under ~40% of the Large instance,
- no query in the top-20 exceeds ~50ms mean,
- sequential-scan tuple counts on the three hot tables are down by an order of magnitude,
- connection peak comfortably fits the smaller instance's `max_connections`.

Then step down **one size at a time** (Large → Medium, observe 7 days → Small), during a low-traffic window, with the resize tool. Rollback is a resize back up — minutes, no data loss. If any metric regresses after a step, resize up and stop.

---

## Technical notes

- New database objects are additive views + indexes only; no table, RPC signature, or RLS policy is dropped or altered destructively.
- The Android offline snapshot pipeline and its bundled artifacts are deliberately untouched in every phase; savings come from *live* reads, not from what ships in the APK.
- Phases 1 and 4 are database-only and reversible in seconds. Phases 2 and 3 are the client-architecture changes and carry the real regression surface — they ship separately, each behind its own verification pass.

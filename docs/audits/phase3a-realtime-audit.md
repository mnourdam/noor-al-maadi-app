# Phase 3A — Realtime dependency audit (READ-ONLY)

Captured 2026-09-03 07:50 UTC. Nothing was modified: no publication change, no client change, no WAL/slot change, no polling change. Instance uptime at capture: 828,478 s (~9.6 days).

---

## 1. Exact subscription inventory

Six `supabase.channel(...)` call sites exist in the whole app. Five use `postgres_changes`; one uses Presence only (no WAL, no publication dependency).

| # | Channel name | File | Table(s) | Event | Filter | Screen / mount scope | Cleanup | Duplicate risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `profile-sync-${uid}` | `src/lib/account.tsx:502` | `profiles` | `UPDATE` | `id=eq.${uid}` | AccountProvider — **always mounted** | `removeChannel` in cleanup ✅ | **Yes — recreated on every profile mutation** (see §5) |
| 2 | `notif-deliveries-${uid}` | `src/lib/notifications/server.ts:201` | `notification_deliveries` | `*` | `user_id=eq.${uid}` | via `subscribeToMyNotifications` | ✅ | **Yes — 3 concurrent copies** (see §5) |
| 3 | `notif-inserts-${uid}` | `src/lib/notifications/server.ts:215` | `notifications` | `INSERT` | **none** | via `subscribeToMyNotifications` | ✅ | **Yes — 3 concurrent copies** |
| 4 | `profile-feedback-unread` | `src/routes/profile.tsx:1564` | `feedback_issues` | `*` | **none** | `FeedbackInboxLink` on `/profile` | ✅ | No (static name, one per client) |
| 5 | `feedback-thread-${id}` | `src/routes/feedback.$id.tsx:58` | `feedback_messages` (`issue_id=eq.$id`), `feedback_issues` (`UPDATE`, `id=eq.$id`) | `*` / `UPDATE` | row-scoped ✅ | `/feedback/$id` only | ✅ | No |
| 6 | `feedback-presence:${issueId}` | `src/lib/feedback/usePresence.ts:45` | — (Presence) | — | — | `/feedback/$id`, `/admin/community` | ✅ `untrack` + `removeChannel` | No |

`subscribeToMyNotifications` (channels 2+3) is called from **four** places: `__root.tsx → InAppBanner` (always mounted), `AppShell → HUD` (always mounted), `routes/index.tsx` (home), and `routes/notifications.tsx`.

**Every call site removes its channel on unmount. There is no leaked-channel bug.** The problems are duplication and effect-identity churn, not missing cleanup.

### Is each subscription actually required?

| Channel | User-visible behavior it drives | Already covered elsewhere? |
| --- | --- | --- |
| 1 `profiles` | Mirror an **admin balance adjustment** into the running client without a re-login | Largely, yes. The same effect already does a cold-start `get_my_profile()` reconciliation on mount, and Phase-2's `admin_balance_grants` ledger makes the adjustment survive the next `sync_my_public_stats` push regardless. The realtime path only shortens "visible now" to "visible on next app open". Also self-suppressed: the 4 s `REALTIME_GUARD_MS` window discards the client's own echo, which is what the overwhelming majority of these events are. |
| 2 `notification_deliveries` | Bell badge / center recount when a delivery is read, dismissed or deleted | Mostly. Read/dismiss/delete are all **locally originated** and already fire the `irth:notifications:updated` window event, which every consumer listens to. Its only unique job is cross-device sync of read state. |
| 3 `notifications` INSERT | New notification arrives → badge + gold in-app banner | **No — this is the only live-delivery path in the foreground.** FCM covers background only. Keep. |
| 4 `feedback_issues` `*` unfiltered | Unread-reply count on the `/profile` inbox link | Partly — `/profile` mounts fresh on each visit and calls `countMyUnreadFeedback()` immediately. Realtime only updates the number while the user sits on the settings screen. |
| 5 `feedback-thread-$id` | Live admin↔player chat | No. Keep — row-filtered and correctly scoped. |
| 6 Presence | Online/typing indicator | No. Keep — Presence, zero WAL cost. |

---

## 2. Publication audit

```
supabase_realtime = profiles, notification_deliveries, notifications, feedback_issues, feedback_messages
```

| Table | replica identity | ins | upd | del | HOT upd | avg row | live rows | Live subscribers observed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `profiles` | **FULL** ⚠ | 1,134 | **63,999** | 0 | 1,065 (1.7%) | 251 B × 33 cols | 1,189 | 1 |
| `notification_deliveries` | default | 11,954 | 1,538 | 1 | 135 | 505 B | 12,582 | 1 |
| `notifications` | default | 2,061 | 20 | 0 | 1 | 812 B | 2,483 | 1 |
| `feedback_issues` | default | 35 | 430 | 0 | 165 | 541 B | 43 | **0** |
| `feedback_messages` | default | 107 | 0 | 0 | 0 | 232 B | 123 | **0** |

Zero real client subscribers, effectively: **`feedback_messages`** (only ever subscribed while a single user has one specific thread open — 107 lifetime inserts) and **`feedback_issues`** (430 updates, mostly admin status changes).

High WAL volume with little realtime value: **`profiles`** — 63,999 updates, `REPLICA IDENTITY FULL`, and only 1.7 % HOT. It is 93 % of all write traffic across the five published tables.

### Why `REPLICA IDENTITY FULL` on `profiles` is the single worst setting here

With `FULL`, every UPDATE writes the **entire 33-column old row** into WAL in addition to the new tuple, and `realtime.list_changes` must decode both and run the RLS check against the full old image. With the default (`d`) only the primary key is logged. At 64 k updates this is roughly a 2× WAL amplification plus a materially heavier decode per record — and the client only ever reads four fields (`xp`, `dinars`, `hearts`, `streak`).

---

## 3. `profiles` WAL churn, attributed to the writer

All three writers were isolated in `pg_stat_statements`:

| Writer | Calls | Columns written | Gameplay-relevant? |
| --- | ---: | --- | --- |
| `sync_my_public_stats(jsonb)` | **49,572** | bio, title, level, xp, dinars, hearts, streak, campaigns_completed, artifacts_collected, discovery_pct, favorite_state_id, favorite_figure_id, avatar_id, **`last_active = now()`** | Sometimes |
| `touch_my_last_active()` | **6,231** | `last_active` only | **Never** |
| `PATCH /profiles {last_active}` (`cloud-save.ts:131`) | **4,269** | `last_active` only | **Never** |
| **Total** | **60,072** | matches the 63,999 counter | |

Two conclusions:

1. **`last_active` is written on 100 % of profile UPDATEs**, including inside `sync_my_public_stats`. Because `last_active = now()` always differs, Postgres can never elide the write, so *every* stat push is a real row version + a realtime event — even when xp/dinars/hearts/streak are byte-identical to what is already stored.
2. **~10,500 updates (17.5 %) are pure `last_active` touches** that change nothing a client subscribes to. Every one of them currently produces a full-row WAL record and a decoded realtime event that the receiving client then discards.

The client consumes **only** `xp`, `dinars`, `hearts`, `streak` from this channel (`account.tsx:513–521`). `last_active`, `bio`, `title`, `avatar_id`, `discovery_pct`, `favorite_*` are never read from the realtime payload by any component.

---

## 4. `notification_deliveries` — does any live subscriber exist?

**Yes.** `realtime.subscription` showed one live row for `notification_deliveries` at capture, and the code path (`subscribeToMyNotifications`) is mounted unconditionally by `InAppBanner` and `HUD`. So it is a genuine subscriber, not dead weight — but at 11,954 inserts / 1,538 updates it is the second-largest WAL contributor, and it is subscribed **three times over** per session.

---

## 5. Channel churn: the two real defects

### 5a. `profile-sync` is destroyed and rebuilt on every profile mutation

```
src/lib/account.tsx:528   }, [user?.id, applyServerStats]);
src/lib/profile.tsx:1100  }), [profile, hydrated, update, awardBadge, trySpendDinars]);
```

`applyServerStats` is a property of a `useMemo` whose dependency list includes `profile`. Any profile change — XP gain, a heart tick, a discovery, a streak update — produces a **new function identity**, which re-runs the effect, which calls `removeChannel()` and opens a brand-new `profiles` channel. Each cycle also re-runs the cold-start `get_my_profile()` RPC.

Evidence: `realtime.subscription` has **328,579 lifetime writes** — ~5× the number of profile updates, and by far the highest write count of any table in the database. That table is itself logically replicated through the second realtime slot, so the churn feeds back into WAL and into `list_changes` work.

### 5b. `subscribeToMyNotifications` runs three times concurrently

On the home screen the mounted consumers are `InAppBanner` (root) + `HUD` (AppShell) + `routes/index.tsx`; on `/notifications` they are `InAppBanner` + `HUD` + the route. Each opens two channels, so a session holds **6 postgres_changes subscriptions where 2 would do**, and each mount additionally issues its own `supabase.auth.getUser()` network call.

Every duplicate multiplies the per-event RLS evaluation and delivery work inside Realtime, and triples the `realtime.subscription` insert/delete traffic.

---

## 6. Realtime cost ranking

`realtime.list_changes`: **1,612,276 calls, 6.52 ms mean, 10,513,421 ms total** — the largest single statement in the database now that the story RPCs are down to ~50 ms. That is ~1.95 calls/s sustained, ~1.3 % of one core burning continuously, and after Phase 2b it is the dominant remaining statement-attributable CPU consumer.

`list_changes` cost is driven by (a) poll frequency, which is constant, and (b) how much WAL each poll has to decode and RLS-check. Ranking by (b):

| Rank | Table | Share of published write volume | Realtime value | Verdict |
| --- | --- | ---: | --- | --- |
| 1 | `profiles` | ~93 % (64.0 k) | Low — one narrow use case, self-echo suppressed 4 s, already reconciled at mount and protected by the grants ledger | **Biggest win** |
| 2 | `notification_deliveries` | ~19 % of the remainder (13.5 k) | Medium — cross-device read-state only; local events already cover same-device | Narrow / dedupe |
| 3 | `notifications` | 2.1 k | **High — only foreground live-delivery path** | **Keep** |
| 4 | `feedback_issues` | 0.5 k | Low-medium | Narrow |
| 5 | `feedback_messages` | 0.1 k | High for the two people in a thread, negligible volume | **Keep** |
| — | `realtime.subscription` | 328.6 k writes (self-inflicted) | — | Fix churn (§5a/§5b) |

---

## 7. Recommendations (NOT implemented)

Ordered by expected reduction ÷ risk.

| # | Change | Expected effect | Risk | Notes |
| --- | --- | --- | --- | --- |
| **R1** | Stabilise the `profile-sync` effect: keep `applyServerStats` in a ref, or memoize it independently of `profile`, so the deps become `[user?.id]` | Eliminates the bulk of **328 k** `realtime.subscription` writes and the repeated `get_my_profile()` calls. Largest single win, and it is a **pure client fix with zero publication impact** | **Low** | Behaviour identical; the channel simply stops being rebuilt |
| **R2** | Set `ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT` | ~2× less WAL per profile UPDATE and a materially cheaper decode; ~64 k records affected | **Low** | Only affects DELETE/UPDATE old-image availability. The client reads `payload.new` exclusively — verified, no `payload.old` consumer anywhere |
| **R3** | Hoist `subscribeToMyNotifications` into one shared module-level subscription with refcounting, consumed by all four callers | Cuts live channels per session 6 → 2, cuts `realtime.subscription` churn and per-event RLS work by ~66 %, removes 2 redundant `getUser()` calls per screen | **Low-medium** | Requires a small refcount helper; all four consumers already only need an `onChange` callback |
| **R4** | Stop writing `last_active` inside `sync_my_public_stats`; keep it only in the dedicated touch paths, and throttle those to once per session | Removes the "nothing actually changed" UPDATE class; realistically 20–40 % of the 64 k profile updates disappear | **Medium** | `last_active` powers `/admin/users` "آخر نشاط". Needs an explicit product decision on acceptable staleness |
| **R5** | Add a row filter to channel 4 (`feedback_issues`, currently unfiltered `*`) — e.g. `reporter_id=eq.${uid}` — or drop the channel and rely on the existing mount-time count | Every player currently receives an event for *every* feedback issue change app-wide, including other users' | **Low** | Confirm the column name against RLS before filtering |
| **R6** | Remove `feedback_issues` / `feedback_messages` from the publication | Small WAL win (0.6 k writes) | **High relative to benefit** | Would break live admin↔player chat, which is a real product feature. **Not recommended** |
| **R7** | Remove `profiles` from the publication entirely | Removes the #1 WAL source completely | **Medium** | Only viable after confirming the product accepts "admin balance edits appear on next app open" rather than instantly. R2+R4 capture most of the benefit without this trade-off. Recommend deferring, not doing it in Phase 3B |

**Recommended Phase 3B scope: R1 + R2 + R3 + R5.** All four are non-destructive, none removes a table from the publication, none changes a user-visible feature. R4 needs a product decision; R6 and R7 are not recommended now.

Expected combined effect: `realtime.subscription` write traffic down by roughly an order of magnitude, profile WAL bytes roughly halved, per-event realtime RLS work down ~66 % for notifications. `list_changes` **call count will not drop** — that is poll-driven — but its mean of 6.52 ms should fall because each poll decodes materially less. A conservative projection is a 30–50 % cut in the 10.5 M ms currently attributed to `list_changes`.

---

## 8. Regression risk and test plan

| Area | What could break | Test |
| --- | --- | --- |
| R1 | Stale closure — the channel keeps an old `applyServerStats` and writes into a dead store | Sign in, gain XP, then apply an admin +1000 XP via `/admin/users`; the running client must reflect it within seconds without reload. Then sign out / sign in as a second account and repeat — no cross-account bleed |
| R1 | Guard regression | Earn a reward and immediately trigger a server write; the 4 s `REALTIME_GUARD_MS` must still suppress the stale echo (existing behaviour test) |
| R2 | A consumer reading `payload.old` | Static check: `rg "payload.old"` must return nothing before applying. Rollback is one `ALTER TABLE ... REPLICA IDENTITY FULL` |
| R3 | Badge/banner stops updating on one of the four surfaces | Send a test notification and verify all four react: HUD badge, home badge, `/notifications` list, gold in-app banner. Then unmount `/notifications` and confirm the shared channel survives for HUD/banner; sign out and confirm it is torn down |
| R3 | Refcount leak on fast navigation | Navigate home → notifications → home 10× and assert `realtime.subscription` holds exactly 2 rows for that user |
| R4 (if approved) | `/admin/users` last-activity column goes stale | Product sign-off on the staleness window first |
| R5 | Filter column mismatch silently kills the unread badge | Open a feedback thread as admin, reply, and confirm the player's `/profile` unread count increments live |
| All | Offline / Android | Existing offline + notification suites; confirm `navigator.onLine === false` early-return in `subscribeToMyNotifications` still holds after the refactor |

Measurement gate after Phase 3B: re-run the Phase 0 six-query set plus `realtime.subscription` write-count delta and the `list_changes` calls/mean delta over a fixed window.

Infrastructure target remains **Medium**. Small is excluded permanently.

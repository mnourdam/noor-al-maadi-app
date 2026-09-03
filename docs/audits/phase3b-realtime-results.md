# Phase 3B — Realtime optimization results (R1 + R2 + R3 + R5)

Implemented 2026-09-03. Scope was limited to the four audited recommendations.
R4, R6 and R7 were **not** touched. No table was added to or removed from the
`supabase_realtime` publication.

Rollback record: `docs/audits/rollback/phase3b-pre-change.md`.

## Changes

| # | Change | File / object |
| --- | --- | --- |
| R1 | `profile-sync-${uid}` effect now depends only on `user?.id`; `applyServerStats` is held in a ref, so the channel is no longer torn down and rebuilt on every profile mutation (and the cold-start `get_my_profile()` no longer re-runs). Guard window, uid filter, identity check and `removeChannel` cleanup unchanged. | `src/lib/account.tsx` |
| R2 | `ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT` (was `FULL`). Verified `relreplident = 'd'`. Static check confirmed no `payload.old` consumer in the codebase. | migration |
| R3 | `subscribeToMyNotifications()` keeps the same signature but now opens **one shared, ref-counted** pair of channels for the whole session. The first subscriber opens `notif-deliveries-${uid}` (`user_id` filtered) and `notif-inserts-${uid}`; the last unsubscribe removes both. All four consumers (InAppBanner, HUD, home, `/notifications`) receive every event as before; the `navigator.onLine === false` early return is preserved. | `src/lib/notifications/server.ts` |
| R5 | `/profile` feedback inbox channel is now `profile-feedback-unread-${uid}` filtered by `reporter_id=eq.${uid}` instead of an unfiltered `feedback_issues` wildcard. Column verified against the table definition. Mount-time `countMyUnreadFeedback()` still runs, including for signed-out state. | `src/routes/profile.tsx` |

## Verification

- **Tests:** full suite `607 passed / 3 failed` — byte-identical to the
  pre-change baseline (`daily-priority` assertion + two `bun:test`-only files
  that Vitest cannot load). No new regressions.
- **Build:** `build OK`.
- **Publication intact:** `feedback_issues, feedback_messages,
  notification_deliveries, notifications, profiles`.
- **Live channels per session:** notification subscriptions reduced from 6
  (3 × 2) to 2; profile channel from "rebuilt per mutation" to 1 per signed-in
  session; feedback inbox channel from app-wide to own-rows only.

## Controlled post-deploy delta (203 s window, 08:12:16 → 08:15:39 UTC)

| Metric | Value |
| --- | --- |
| `realtime.list_changes` calls | +412 (2.03 calls/s — poll-driven, unchanged as predicted) |
| `list_changes` total exec time | +2,230 ms |
| **`list_changes` mean in-window** | **5.41 ms** (cumulative lifetime mean is 6.52 ms) |
| `realtime.subscription` writes | +38 → **0.187 writes/s** |
| Lifetime `realtime.subscription` rate before | 328,579 writes / 828,478 s = **0.397 writes/s** |

`realtime.subscription` write churn is down ~53 % in the measured window and
in-window `list_changes` mean is ~17 % below the lifetime mean. Both figures
are conservative: the window carried little live user traffic, and the
duplicate-channel/effect-churn savings scale with concurrent sessions. A
representative re-measure during peak usage is worth taking before the
Medium downgrade decision.

## Not done (per scope)

- R4 (`last_active` write reduction) — needs a product decision on staleness.
- R6 / R7 (removing tables from the publication) — not recommended.
- Phase 4 and the Large → Medium downgrade were not started. Medium remains
  the only downgrade target.

# V16 — Notifications Architecture Audit (READ-ONLY)

Date: 2026-08-29 · Branch inspected: v16-development · **Nothing was modified. No notification was sent.**

---

## 1. Architecture / call graph

**Admin manual send (immediate)**
`src/routes/admin.notifications.tsx` (composer + `SegmentPicker`)
→ `src/lib/notifications/admin/segments.ts` → RPC `admin_resolve_segment_v16(text,jsonb)` / `admin_segment_audience_v16` (matching / reachable / device counts)
→ `supabase.functions.invoke("send-notification", { title, body, type, target_type, target_user_id(s), target_segment_id, deep_link, image_url, dedupe_key })`
→ Edge `supabase/functions/send-notification/index.ts`
→ `audience-guard.ts:resolveTokenScope()` (pre-insert, fail-closed) → INSERT `public.notifications` (status `sent`)
→ `resolveTokenScope()` + `assertNoSegmentWidening()` again on the persisted row
→ `device_tokens where enabled = true [and user_id in scope]`
→ FCM HTTP v1 (`fcm.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/messages:send`, RS256 service-account JWT)
→ upsert `notification_deliveries (notification_id,user_id)` → invalid tokens (`UNREGISTERED` / `INVALID_ARGUMENT`) get `device_tokens.enabled=false`.

**Android receipt**
`IrthApp.java` creates channel `irth_notifications_v2` (custom sound `res/raw/irth_notification`, IMPORTANCE_HIGH) at Application start
→ `src/lib/pushNotifications.ts`:
- `pushNotificationReceived` (foreground) → dispatches `irth:notifications:banner` + `irth:notifications:updated` → `src/components/notifications/InAppBanner.tsx`
- `pushNotificationActionPerformed` (background/killed tap) → `markNotificationRead(data.notification_id)` → `resolveDeepLink()` → **`window.location.href = to`** (hard navigation, cold-start safe but full reload)

**In-app center**
`src/routes/notifications.tsx` → `src/lib/notifications/server.ts` → RPC `list_my_notifications(p_limit,p_before)` (SECURITY DEFINER, joins `notification_deliveries` per user, respects `profiles.notification_started_at` baseline) + realtime channels on `notification_deliveries(user_id=…)` and `notifications` INSERT.

**Automatic / scheduled**
11 `cron.job` rows → `net.http_post` → Edge `run-automatic-notifications` (jobs: `today_in_history` ×4 slots 08/11/14/17, `daily_fact` 09:00, `comeback_24h` hourly :15, `hearts_full` /30m, `streak_reminder` 20:00, `daily_challenge` 17:00, `incomplete_campaign`) → each re-invokes `send-notification` with a `dedupe_key`; run-level dedupe in `automatic_notification_runs(job_key, run_date)`. Plus SQL-only `send_friend_request_reminders()` hourly and `reauth_challenges_cleanup()`.

**Personal inbox (separate system)** — `personal_notifications` + `_emit_personal_notification()` + `list_my_notifications(p_cursor,p_limit)` overload → `src/lib/notifications/personal.ts`, `PersonalInboxBell.tsx`. **This is a second, parallel inbox** (social/friend events) and does not go through FCM.

---

## 2. DB / RPC / Edge inventory

**Tables**
- `notifications` — id, title, body, type, category, icon, image_url, deep_link, **payload jsonb**, priority, sender, target_type, target_user_id, **target_user_ids uuid[]**, **target_segment_id**, schedule jsonb, analytics jsonb, status, scheduled_at, sent_at, archived_at, dedupe_key (unique), created_by
- `notification_deliveries` — (notification_id,user_id) unique, token, status, error, sent_at/delivered_at/read_at/opened_at/dismissed_at/deleted_at
- `device_tokens` — user_id, token (unique conflict target), platform, device_model, app_version, enabled, last_seen_at
- `notification_preferences` — user_id, categories jsonb (read/written by client; **not enforced anywhere in the send path**)
- `automatic_notification_runs`, `pending_action_reminders`, `personal_notifications`

**RLS**
- `device_tokens`: own-row CRUD (`auth.uid()=user_id`) ✅
- `notification_deliveries`: SELECT only for `is_content_admin()`; user reads go through SECURITY DEFINER RPC ✅
- `notifications`: user SELECT = `status='sent' AND (target_type='all' OR target_user_id=auth.uid())`; manager (`is_user_manager()`) full CRUD. Note segment rows are *not* directly readable — visibility relies on `list_my_notifications`.
- `notification_preferences`: own-row ✅

**RPCs** (all SECURITY DEFINER): `list_my_notifications`, `my_unread_notification_count`, `mark_my_notification_read`, `mark_all_my_notifications_read`, `delete_my_notification`, `clear_my_notifications`, `record_notification_click`, `record_notification_dismissed`, `get_/set_my_notification_preferences`, `admin_notification_stats`, `admin_resolve_segment` (legacy), `admin_resolve_segment_v16`, `admin_segment_audience_v16`, `_feedback_notify_admin`, `emit_story_unlock_notification`.

**Edge Functions**: `send-notification`, `run-automatic-notifications`, `auth-email-hook`. Secrets: `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`. `supabase/config.toml` sets `verify_jwt=false` only for `auth-email-hook`.

**Production aggregates (read-only)**: 818 token rows — **667 enabled / 151 disabled, 715 distinct users**; last 30d deliveries: 4331 sent, 112 delivered, 61 failed; all-time failures: 130 × `404 NotRegistered`, 13 × `404 Requested entity was not found`; notifications 1346 sent / 7 failed; last 30d 1033 `user` + 37 `all`.

---

## 3. Current action model

Single canonical parser: `src/lib/notifications/deepLink.ts:resolveDeepLink()` — reused by push tap, `InAppBanner`, and the Notification Center. Precedence: informational-type short-circuit → today-in-history → `payload.url` (must start `/`) → `campaignSlug/campaignId/entitySlug/artifactId/achievementId/investigationId` → raw `deep_link` (must start `/`) → category fallback (`/campaigns`, `/encyclopedia`, `/investigations`, `/profile`, `/collection`, `/friends`) → `/notifications`.

- Malformed/unknown → `/notifications`; never throws. ✅
- **Absolute/external URLs are silently dropped** (both `payload.url` and `deep_link` require a leading `/`). So today an `https://…` link degrades to the Notification Center — safe, but non-functional.
- Cold start: tap uses `window.location.href`, so the router boots on the target path — safe but loses SPA state and re-runs splash.
- Admin composer builds links via `src/lib/notifications/admin/deep-links.ts` (internal paths only).

---

## 4. External URL readiness

`rg` finds **no** `Browser.open`, `window.open`, `@capacitor/browser`, or external-URL handling anywhere in the notification stack. Nothing to reuse; nothing unsafe today.

Recommended V16 model (not implemented):
- New optional field `payload.external_url` (do **not** overload `deep_link`, which is internal-path-typed everywhere).
- Validation twice: admin compose (`admin.notifications.tsx` + edge pre-insert) and client tap. Allow `https:` only; reject `javascript:`, `data:`, `file:`, `intent:`, `market:`, `content:`, protocol-relative `//`, and anything unparsable by `new URL()`.
- Optional host allowlist for phase 1 (youtube.com/youtu.be/t.me/playirth.com) with a confirm sheet for other hosts.
- Open with `@capacitor/browser` (Custom Tab) on Android — keeps the app alive, back-button returns; `window.open(url,'_blank','noopener')` on web.
- Offline: detect `navigator.onLine === false` → Arabic toast, do **not** mark the notification consumed; the row stays in the Center so the same link can be reopened (Center already re-resolves the row on every tap, so reopen is free).

---

## 5. Contribution → admin push

Current path: `StoryComments.tsx` → `src/lib/social/comments.ts:add_story_comment_v2` (writes `social_comments`) → a comment becomes a *contribution* only when an editor calls `mark_contribution_v2` (`src/routes/admin.contributions.tsx`, `list_contribution_queue_v2`, `apply_contribution_v2`, `archive_contribution_v2`). **There is no user-initiated "contribution submit", and no admin notification on new comments.**

Precedent that already works: `_feedback_notify_admin(p_admin,…)` — SECURITY DEFINER, resolves the admin server-side via `_feedback_main_admin_id()` (hardcoded email lookup) and INSERTs a `notifications` row (`target_type='user'`, deep link `/admin/community`). In-app only; **no FCM push** (nothing calls `send-notification`).

Options:
| Model | Verdict |
|---|---|
| Client-triggered invoke | ✗ client would choose recipients; spoofable |
| DB trigger → insert notification row | ✓ safest for in-app; no push (triggers can't call Edge cleanly) |
| DB trigger + `pg_net` → `send-notification` | ✓ recommended: server-owned, atomic-adjacent, recipients resolved in SQL |
| Async queue table + cron drain | ✓ best retry/dedupe story, slightly more machinery — good "later" upgrade |

Recommended: AFTER INSERT trigger on `social_comments` → SECURITY DEFINER `notify_admins_of_contribution_v16()` that resolves admins from `user_roles`, builds a `dedupe_key = 'contribution:'||comment_id`, inserts the row and `pg_net.http_post`s `send-notification` with `target_type='segment'`, `target_segment_id='admins'`, `target_user_ids=<resolved admin ids>` (keeps the existing fail-closed guard in the path).

Push text (no PII, lock-screen safe): title `مساهمة جديدة`, body `وردت مساهمة جديدة على قصة «{story_title}»` — never the comment body, never the user email. Tap → `/admin/contributions?comment={id}`.

---

## 6. Admin resolution

Roles live in `public.user_roles` (`app_role` enum: owner/admin/editor/player) with `has_role(uuid,app_role)`; gates are `is_content_editor()` → `is_content_admin()` (alias) and `is_user_manager()`. Resolution must happen inside SECURITY DEFINER SQL; admin ids must never reach a normal client.

Admins use the **same** `device_tokens` table, so multi-device is automatic (one token row per device, `onConflict: token`). One `notification_deliveries` row per (notification,user) → the Center never duplicates even with 3 devices. `notification_preferences.categories` exists but is **not consulted** by `send-notification` — an admin-ops category should be exempt anyway.

---

## 7. Notification Center

Source `notifications` ⋈ `notification_deliveries` via `list_my_notifications` (DISTINCT ON notification_id, baseline `profiles.notification_started_at`). Read = `mark_my_notification_read`; delete/clear are per-user (delivery-scoped), plus a localStorage mirror cache (`irth.notifications.serverCache.v1`, 200 rows) for offline. Sorting by created_at, client-bucketed today/yesterday/earlier; **`p_limit` only, no real cursor pagination** in the UI (fetches 150).

Failed push still yields a Center entry (row is inserted `status='sent'` before FCM) ✅. Actions are re-resolved from the persisted row on each tap, so internal **and** external actions can share the existing row model with no schema change if the external URL lives in `payload`.

---

## 8. Popups / announcements readiness

Existing startup surfaces (`src/routes/__root.tsx`): `CinematicOpening`, `SplashSequence`, `FirstLaunchGate`, `ContentUpdateBanner`, `InAppBanner`, `StoryUnlockCelebration`, `LevelUpWatcher`, `AchievementWatcher`, `GoogleAuthResultDialog`, `IrthAuthDialog`, `RecoveryModeGuard`, `TutorialOverlay`, `Toaster`. There is **no** announcements table, no remote config, no dismissed-ids registry, no version check, and no modal priority arbiter — each overlay mounts independently.

Recommendation: **(C) hybrid** — a small additive `app_announcements` table (id, kind `notice|optional_update|mandatory_update`, title, body, cta_label, action_type `none|internal|external`, action_value, priority int, starts_at, ends_at, audience_segment_id, audience_user_ids, min_app_version/min_version_code, platform `android|web|all`, guest_visible bool, active) + `app_announcement_dismissals(user_id|device_id, announcement_id)` — reusing the **same** segment resolver and the **same** action schema as notifications. Reusing `notifications` alone (A) is wrong: it has no start/expiry, no dismissal, no guest support. Guests: dismissal keyed by a local device id in localStorage; audience limited to `guest_visible` rows.

## 9. Optional + mandatory update

Android version is currently **not read anywhere** — no `@capacitor/app` `App.getInfo()` usage; `device_tokens.app_version` exists but `pushNotifications.ts` never populates it. So versionName/versionCode must be introduced (from `android/app/build.gradle`) before any update gate.

Policy recommendation:
- **Fail-open** on everything except an explicitly cached, previously-fetched mandatory policy: unreachable config, parse error, missing version → never block.
- Mandatory blocking only when `versionCode < min_version_code` from a policy row that was fetched successfully (fresh or cached ≤7 days) **and** `platform='android'`.
- Emergency rollback = flip `active=false`; clients re-check on every cold start and on resume, so the block clears within one launch.
- Staged rollout: gate by `max_version_code` window + a `rollout_percent` bucket on a stable device hash.
- Admin-mistake protection: `min_version_code` must be ≤ the current published versionCode (DB CHECK/validation) and require a second explicit confirm in admin UI.
- Web is exempt (always current). Offline launch must never show the blocker if the policy was never fetched.

## 10. Modal priority

No arbiter exists today. Recommended deterministic order (matches the actual mount list):
`RecoveryModeGuard` > **mandatory update** > auth/error dialogs (`GoogleAuthResultDialog`, `IrthAuthDialog`) > `FirstLaunchGate`/`CinematicOpening`/onboarding `TutorialOverlay` > **critical notice** > **optional update** > **announcement** > `ContentUpdateBanner` > `StoryUnlockCelebration`/`LevelUp`/achievements > toasts/`InAppBanner`.
Implement as a single `useOverlayQueue` gate that renders one blocking layer at a time; non-blocking layers (banner, toasts) stay independent.

## 11. Smart Segment safety

`admin_resolve_segment_v16` / `admin_segment_audience_v16` (admin-gated, strict whitelist filters, explicit errors) + persisted `target_user_ids`/`target_segment_id` + `audience-guard.ts` (`resolveTokenScope`, `assertNoSegmentWidening`) are the only correct audience path. **Safest extension point: keep `send-notification` as the single send door** and have every new producer (contribution trigger, announcement push) call it with `target_type='segment'` + explicit `target_user_ids`. Never add a second FCM caller and never query `device_tokens` outside the guard.

## 12. Scheduling / delivery health

- Scheduler = pg_cron + `net.http_post`, all UTC (`todayISODate()` uses UTC) — evening jobs drift ~3h vs Riyadh local intent (streak reminder 20:00 UTC = 23:00 Riyadh).
- Idempotency: `automatic_notification_runs(job_key,run_date)` + `notifications.dedupe_key` unique index + 23505 race handling ✅.
- Retries: none (one FCM attempt per token, sequential loop — ~667 serial HTTPS calls per broadcast, a latency risk).
- Cancellation: `status='scheduled'` rows exist but **no worker sends them** — the admin "scheduled" checkbox writes a draft/scheduled row that is never dispatched (see risks).
- Audience is resolved at **send time** from the persisted row (compose-time IDs are persisted, then re-validated) ✅.

## 13. Security classification

| Case | Verdict |
|---|---|
| Non-admin calling `send-notification` | **BUG / HIGH RISK** — the function performs *no* role check; it relies solely on platform `verify_jwt`, so **any signed-in user with the publishable key can broadcast to all 667 tokens** |
| Anonymous send | SAFE (JWT required by platform default) |
| Arbitrary `target_user_ids` | RISK — accepted verbatim from the body (only shape-validated); combined with the row above, a user could target anyone. Fix by requiring `is_content_editor()` in the function. |
| Segment widening to broadcast | SAFE — `assertNoSegmentWidening` + fail-closed `resolveTokenScope`, covered by `tests/notifications/segment-send-safety.test.ts` |
| Dangerous external URL | SAFE today (external URLs are dropped); becomes a risk the moment external links ship without the validator |
| Forged internal route | LOW — router-relative paths only; worst case a wrong page |
| Contribution spoofing admin push | N/A today; must stay server-owned in V16 |
| Reading/marking another user's notifications | SAFE — delivery RPCs are `auth.uid()`-scoped; `notification_deliveries` has no user SELECT policy |
| Non-admin modifying mandatory-update policy | N/A (no policy table yet) — new table must be admin-write, public-read-of-active-rows only |

## 14. Recommended V16 architecture (smallest)

**Phase 1 (V16)**
1. **Authorize `send-notification`** — verify caller is `is_content_editor()` (or service-role) before any insert. *Additive, V15-safe* (V15 admins are the same role set).
2. `payload.external_url` + shared validator module used by admin compose, edge pre-insert, and client tap; open via `@capacitor/browser` / `window.open`. *Backward-compatible* (old clients ignore an unknown payload key and fall back to `/notifications`).
3. Contribution → admin push via SECURITY DEFINER trigger + `pg_net` → `send-notification` with resolved admin ids + `dedupe_key`. *Additive.*
4. `app_announcements` + `app_announcement_dismissals` + `get_active_announcements_v16(platform, version_code, is_guest)`; client overlay queue with the priority ladder. *Additive; invisible to V15 (no client reads it).*
5. Optional + mandatory update as `kind` values on the same table, fail-open, driven by `App.getInfo()`; also start writing `device_tokens.app_version`. *Additive.*

**Later**: scheduled-send worker (cron drain of `status='scheduled'`), per-category preference enforcement, batched FCM + retry/backoff, real cursor pagination in the Center, staged rollout percentages, merge of the two inboxes.

**Not recommended**: overloading `deep_link` with absolute URLs; a second FCM sender; client-side admin recipient resolution; storing update policy in client code; blocking UI on any network failure.

**Unsafe until V15 sunset**: changing `notifications` RLS/columns non-additively, changing `send-notification` request/response shape, changing `resolveDeepLink` fallbacks, tightening `device_tokens` policies.

## 15. Files/tables that WOULD change (phase 1)

Code: `supabase/functions/send-notification/index.ts`, `supabase/functions/send-notification/audience-guard.ts` (unchanged contract, new URL validator sibling), `src/lib/notifications/deepLink.ts`, new `src/lib/notifications/externalLink.ts`, `src/lib/pushNotifications.ts`, `src/components/notifications/InAppBanner.tsx`, `src/routes/notifications.tsx`, `src/routes/admin.notifications.tsx`, `src/lib/notifications/admin/deep-links.ts`, new `src/lib/announcements/*`, new `src/components/overlays/OverlayQueue.tsx`, `src/routes/__root.tsx`, `android/app/build.gradle` (version read only).
DB: new `app_announcements`, `app_announcement_dismissals`, new functions `notify_admins_of_contribution_v16()`, `get_active_announcements_v16()`, `dismiss_announcement_v16()`; trigger on `social_comments`. No changes to existing tables except (optionally) populating `device_tokens.app_version`.

## 16. Test plan

Automated (vitest, pure modules): internal action parsing matrix; external URL validator (accept https youtube/t.me/playirth; reject `javascript:`, `data:`, `file:`, `intent:`, `market:`, `//host`, empty, >2KB); segment fail-closed regression (extend `tests/notifications/segment-send-safety.test.ts` for the new producers); contribution dedupe key stability; multi-admin/multi-device fan-out → one delivery row per user; announcement eligibility (starts/expires/audience/guest/once-per-user/dismissed); version comparison (versionCode <, =, >, missing, malformed); mandatory-update fail-open on fetch error/offline/stale cache; overlay priority ordering.
Android manual: foreground / background / killed tap for internal + external; Custom Tab back-return; Notification Center reopen of same link; offline tap; logout→login token ownership (old user must stop receiving); airplane-mode cold start shows no blocker.

## 17. Ranked bugs / risks

1. **HIGH — `send-notification` has no admin check.** Any authenticated user can create + broadcast a notification to all enabled tokens (audience guard prevents *widening*, not *authorship*).
2. **MEDIUM — "Scheduled" notifications are never sent.** The composer can write `status='scheduled'` rows; no cron/worker dispatches them.
3. **MEDIUM — `notification_preferences` is decorative.** Users can toggle categories; the send path ignores them.
4. **MEDIUM — sequential FCM loop.** ~667 serial HTTPS requests per broadcast; edge timeout risk as the base grows; no retry on transient 5xx.
5. **MEDIUM — cron timezone.** All jobs run on UTC while the product day is Riyadh (`src/lib/irth-day.ts`); evening reminders land ~23:00 local.
6. **LOW — two parallel inboxes** (`notifications` vs `personal_notifications`, two `list_my_notifications` overloads, two bells) — confusing surface for new features.
7. **LOW — push tap does a full page load** (`window.location.href`) instead of router navigation.
8. **LOW — 151 disabled + `404 NotRegistered` tokens accumulate**; no periodic pruning of stale rows (`last_seen_at` never refreshed after first save).
9. **LOW — `_feedback_main_admin_id()` hardcodes an email** instead of `user_roles`.
10. **LOW — no `app_version` recorded on tokens**, so no per-version targeting for the future update policy.

## 18. Confirmation

No files were modified, no migration was created, no RPC/Edge Function/Firebase config/content was touched, `main` was not touched, nothing was committed, published or deployed, and **no notification was sent**. All database access was read-only (`select` / catalog inspection).

# IRTH V16 — Consolidated Read-Only Audit

Scope: audit only. No code, schema, config, Android, Supabase, Resend, Firebase, snapshot or production change was made.

---

## A. Production Safety

- V15 production = branch `main` @ `f5c85de6`. Untouched. Backups exist as `origin/lovable-backup-main-*`.
- Recommendation: cut `v16-development` from `f5c85de6`; never commit V16 work to `main` until the regression matrix (G) passes.
- Live production risks discovered during the audit (not fixed):
  - **All auth emails are stuck `pending`** (see C-2) — every new signup and password reset is currently silently undelivered. P0.
  - Google sign-in on Android fails intermittently (C-1). P0.
  - Streak loss for offline/failing activity (C-6) is happening on live data today. P1.
  - Smart segments silently resolve to 0 users → admin pushes sent to nobody (C-8). P1.

---

## B. Architecture Map

| Layer | Source of truth | Key modules |
|---|---|---|
| Auth (web) | Supabase GoTrue | `GoogleSignInButton.tsx`, `auth.callback.tsx` |
| Auth (Android) | Supabase PKCE + custom deep link | `src/lib/native-auth.ts`, `src/lib/nativeAuthStorage.ts`, `src/routes/api/public/native-auth-bounce.ts`, `app.lovable.irth://auth` |
| Email | pgmq (`auth_emails`, `auth_emails_custom`, `transactional_emails`) → `/lovable/email/queue/process` → Resend | `src/lib/auth-emails.ts`, `auth-custom/dispatch.ts`, `email/resend.server.ts`, `email_send_log` |
| Offline | bundled `public/offline-snapshot.json` (9.1 MB) → IndexedDB `irth-offline` → memory maps | `src/lib/offline-storage.ts`, `src/lib/local-first-store.ts` |
| Sync | IndexedDB outbox `irth-offline-outbox` with 13 `OutboxKind` → RPCs | `src/lib/offline/outbox.ts`, `flush.ts`, `dead-letter.ts` |
| Notifications | `notifications` + `notification_deliveries` + `device_tokens` → FCM | `supabase/functions/send-notification/index.ts`, `src/lib/notifications/*` |
| Analytics | 9 admin SQL rollup RPCs `analytics_*` | `src/lib/analytics.ts`, `/admin/analytics`. **No Firebase Analytics, no event pipeline.** |
| Progression | server RPCs (`apply_profile_delta`, `record_campaign_progress_v2`, `complete_investigation_v2`, `record_streak_activity`) mirrored locally | `profile.tsx`, `campaignLedger.ts`, `campaignRewardsGranted.ts` |
| Stories / Campaigns / Atlas | server + bundled packs (`public/story-covers`, `public/campaign-key-art`, `public/emblems`) | per-memory frozen specs |
| Android persistence | localStorage partitioned `<key>::owner=<ownerKey>`, Capacitor Preferences, IndexedDB, Cache Storage | `src/lib/identity/partition.ts` |

---

## C. Issue Findings

### C-1 Google PKCE intermittent failure — STRONG HYPOTHESIS (multiple races), Medium confidence
- `nativeAuthStorage.setItem` writes memory/localStorage synchronously and Preferences fire-and-forget; only `NATIVE_CODE_VERIFIER_KEY` is explicitly awaited via `ensureDurablePersistence` before `Browser.open` (`native-auth.ts:181-192`). Other gotrue-managed PKCE/flow-state keys are **not** durable → process death mid-consent loses them.
- `processedCodes`/`inFlightCodes` dedupe is module-scope memory only (`native-auth.ts:277-330`) → after process restart a redelivered code is re-submitted and Supabase rejects the single-use code.
- `installNativeAuthDeepLinkListener` re-fires `App.getLaunchUrl()` on every `signInWithGoogleNative` (`native-auth.ts:478-490`) → stale launch URL can be re-injected.
- Verifier TTL is 10 min (`nativeAuthStorage.ts:23`); bounce page adds ~200 ms + 2.5 s fallback window (`native-auth-bounce.ts:108-131`).
- Boot listener install is fire-and-forget before `createRoot` (`android-client.tsx:124-132`).
- UNRESOLVED: Supabase redirect-URL allow-list is not in the repo; if `https://irth-develop.lovable.app/api/public/native-auth-bounce` is not allow-listed, that alone explains a large share of failures.
- Risk of fixing: high (session-critical). Safest fix: durable-await all gotrue keys, persist `processedCodes` to Preferences, make launch-url recheck idempotent, telemetry-first via existing `diag-trace` `pkce-audit` channel.

### C-2 Auth emails never sent — CONFIRMED, High confidence
- `public.email_queue_dispatch()` (`supabase/migrations/20260713093434_*.sql:29-39`) `net.http_post`s to the **stale preview host** `https://project--31875359-…lovable.app/lovable/email/queue/process` instead of the live origin `https://irth-develop.lovable.app`. No later migration corrects it.
- `pg_net` is fire-and-forget, so enqueue succeeds, `email_send_log` rows stay `pending` forever, the processor route is never invoked. Resend key and processor code are both fine.
- Safest fix: make the URL configurable (env/config table), re-point it, then drain the pgmq backlog and assert `pending → sent` within one cron tick.

### C-3 Admin push on new contribution — no mechanism exists (CONFIRMED absence)
No trigger on `social_comment_contributions`. Safest design: AFTER INSERT trigger → SECURITY DEFINER outbox row per admin resolved by `has_role(id,'admin')`, unique on `(recipient_id, source_table, source_id)`, delivery by an async worker (never HTTP inside the trigger).

### C-4 External URLs in notifications — CONFIRMED current behaviour + security gap
- `deep_link` is free text, forwarded verbatim into FCM `data.deep_link` (`send-notification/index.ts:112-145`).
- Client `resolveDeepLink()` only honours paths starting with `/`; any `https://`/`tg://` URL silently falls back to `/notifications` → **external links do not work today**.
- UNRESOLVED/highest-priority follow-up: the native FCM tap handler was not read; if it does `Intent(ACTION_VIEW, Uri.parse(deep_link))`, arbitrary `intent://`/`market://` injection is possible from a compromised admin session.
- Safest fix: `link_type` enum + server-side domain allow-list enforced by trigger/`WITH CHECK`, native handler restricted to `https`/own scheme.
- CONFIRMED bug: `resolveDeepLink` builds `/investigations/${id}` but the route is `/investigation/$id` (singular) → investigation deep links miss.

### C-5 Analytics fragmentation — CONFIRMED
Four disconnected "analytics" surfaces: (1) 9 admin SQL rollup RPCs computed live off feature tables, (2) `notification_deliveries` engagement, (3) `applied_profile_deltas` economy ledger, (4) local-only `window.dispatchEvent` achievement/tutorial events that never reach the server. **No generic `analytics_events` table, no Firebase Analytics, no third-party SDK** (`build.gradle` has only `firebase-messaging`).

### C-6 Streak loss — CONFIRMED root cause, High confidence
- `recordStreakActivity` returns `{ok:false, reason:"offline"}` when `navigator.onLine === false` (`streak-activity.ts:64-66`) and **never enqueues to the outbox** — `streak` is not one of the 13 `OutboxKind`s. Server RPC has no backfill parameter, so a missed Riyadh-calendar day is a hard reset to 1.
- `rpc_error` results are equally dropped; all three call sites `void` the promise.
- Secondary: server day boundary is `Asia/Riyadh`, but guest `touchStreak`/`deriveStreak` in `profile.tsx` use device-local midnight → HUD can locally expire a streak that the server still considers alive (and vice versa) for non-Riyadh players.
- Safest fix: `streak_touch` outbox kind mirroring `chapter_progress`; client never decides day boundaries except for display.

### C-7 Reflections moderation — CONFIRMED absence
`user_reflections` has owner-only RLS and **no `status`/`hidden`/`moderated_by` columns**; `reflections_unified_v1` is a view that filters `social_comments.status <> 'removed'` but has no equivalent filter for reflections. So reflections **cannot be hidden at all today**. An `/admin/reflections` page needs: moderation status + audit columns, a view change, `admin_list/moderate_reflection` RPCs gated by `is_content_editor()`/`is_user_manager()`, soft-delete only.

### C-8 Smart segments "level > 5 = 0" — CONFIRMED root cause, High confidence
`admin_resolve_segment` only implements `level_20_plus` and `level_50_plus`; every other id hits `ELSE v_ids := ARRAY[]::uuid[]` and returns **0 users silently**. Data is fine: 14 users are level > 5, and recomputing `levelFor(xp)` over 819 profiles gives 1 mismatch — so `profiles.level` is not stale. Secondary risk: `profiles.level`/`xp` are pushed opportunistically by client `sync_my_public_stats`, so drift is possible for idle sessions. Safest fix: generic `p_min_level`/`p_max_level` params + `RAISE EXCEPTION 'unknown_segment'` instead of a silent empty set.

### C-9 In-app popup announcements — CONFIRMED gaps
`notifications` has `type, category, priority, deep_link, image_url, payload, target_type/user/user_ids/segment_id, scheduled_at, schedule, dedupe_key, archived_at`; deliveries track `read_at/opened_at/dismissed_at`. Missing for update/maintenance/event popups: **version + platform targeting, mandatory/blocking flag, display start/end window, show-once/frequency cap, working segment resolution (`target_segment_id` is inert), CTA labels/secondary action**. Also: player-side RLS SELECT ignores `target_user_ids`/`target_segment_id`.

### C-10 Historical Investigations placement — CONFIRMED
`/investigations` is already a top-level nav section (`navigation/registry.ts`) with `/investigation/$id` detail plus a separate campaign-embedded `/play/investigate`. Home only shows a completed-count stat + a generic link. Lowest-risk integration: a Home "continue investigation" card built from the existing `useCanonicalInvestigationProgress` + `investigations/recommend.ts` (no schema change), reusing the exact unlock gating of the detail route. Fix the deep-link path mismatch first.

### C-11 Campaign ordering hints → Check Answer — UNRESOLVED (not reproducible in current code), High confidence in the trace
Full flow located: `ArrangeEventsRenderer` (`ActivityRenderer.tsx:368-583`) → `useHint()` (464-502) → `purchaseOrderingHelp()` (`ordering-help.ts:65-113`) → **auto-place wrapper `pin()` (`ActivityRenderer.tsx:431-441`)** → `disabled={resolved || pinnedIds.includes(id)}` (535/599) → `submit()` (504-517).
- The Check button (`568-572`) has **no `disabled` attribute at all**; its only gate is `!resolved`, and `resolved` is set only by a correct `submit()` or persisted `alreadyDone`.
- `submit()` evaluates the **full** `order` array including pinned items; `pin()` re-derives absolute indices from `correctIndexOf(id)` so repeat purchases cannot desync.
- `purchaseOrderingHelp` already refuses to pin the last item (`pinnedIds.length >= totalItems - 1`), so full lockout is impossible.
- Remaining plausible explanations: symptom from an older build; the user meant the **hint** button becoming permanently disabled (`551`); or a runtime race where `recoverPendingOrderingHelp` (`409-418`) sets `pinnedIds` post-mount without re-`pin()`ing `order` until the next drag. Needs a live repro before any change.
- Also: `saveHelpStore` swallows localStorage failures (`ordering-help.ts:41-45`) → a debit could occur without a persisted pin (monetary bug).

---

## D. Shared Root Causes

1. **Silent failure by default.** `pg_net` fire-and-forget email dispatch, `ELSE → empty array` in `admin_resolve_segment`, swallowed `catch {}` in ordering-help/storage, `void recordStreakActivity(...)`. Same class, four different user-visible bugs.
2. **Durability asymmetry in the offline architecture.** Nearly every mutation has an outbox kind; streak does not, and PKCE metadata is durable for one key only. Whatever lacks a durable queue loses data on network blips and process death.
3. **Duplicated sources of truth.** Local `hakaya.profile.v2` vs `profiles`; `irth_campaign_progress` + ledger + grants vs server completions; guest local unlocks vs server unlocks; four analytics surfaces; two local streak implementations.
4. **Client-side time and level math vs server-side truth.** Riyadh-vs-device midnight; `levelFor(xp)` client curve pushed into `profiles.level` opportunistically.
5. **Hardcoded environment values in migrations/code** (preview host in `email_queue_dispatch`, `irth-develop` origins in native auth) with no config indirection.
6. **Unversioned/inconsistently versioned client state** (`irth_campaign_progress` has no schema version; `.v1/.v2/_v1` conventions mixed) — the main V16 upgrade hazard.
7. **Asset invalidation exists only for audio** (`AUDIO_ASSET_VERSION`); images have no equivalent bump/purge.

---

## E. Priority

**P0 — auth / data / progression / release risk**
- C-2 auth emails stuck pending (all signups/resets broken).
- C-1 Google PKCE intermittent failure + verify Supabase redirect allow-list.
- V16 upgrade invalidation risks H1–H6 (section F of data-safety, below).
- C-4 native FCM `deep_link` → Intent injection review.
- Android: pause-time flush gap (`campaignLedger.flushPending` only on resume).

**P1 — important V16**
- C-6 streak outbox kind + timezone alignment.
- C-8 generic level segments + fail-loud.
- C-9 popup announcement schema (version/mandatory/window/show-once) — prerequisite for force-update.
- C-4 deep-link `link_type` + allow-list, `/investigation/$id` path fix.
- Bitmap/memory work: atlas 3.9 MB webp + 1.2–1.4 MB premium emblem PNGs; ~22 `<img>` without `loading`/`decoding`.

**P2 — UX / admin**
- C-7 reflections moderation page + status column + view filter.
- C-3 admin push on new contribution.
- C-10 Home investigations card.
- C-5 analytics unification (single event table).

**P3 — future**
- R8/`shrinkResources` enablement with proper keep rules.
- Firebase Analytics introduction (H).
- Image cache eviction/versioning policy.
- C-11 revisit if a live repro appears.

---

## F. Safe V16 Implementation Order

1. Freeze `main`; branch `v16-development` from `f5c85de6`.
2. **Email dispatch URL fix** (config-driven) + backlog drain + `pending→sent` assertion. Isolated, no client change.
3. **Verify Supabase redirect allow-list**, then PKCE durability hardening behind trace telemetry; ship with a device test matrix.
4. **Client persistence contract**: add explicit schema versions + forward migrations for `irth_campaign_progress`, grants, snapshot `normalize()`, and freeze `OutboxKind`↔RPC signatures (new kind for any RPC change). Do this **before** any other V16 feature touches storage.
5. `streak_touch` outbox kind + server-authoritative day boundary in the HUD.
6. Segment resolution generalisation (fail loud) + notification `link_type`/allow-list + deep-link path fix.
7. Popup announcement schema + admin UI (version/mandatory/window/show-once).
8. Reflections moderation, admin contribution push, Home investigations card.
9. Memory/bitmap optimisation pass; then R8 dry run on a branch with a full FCM round-trip test.
10. Optional: Firebase Analytics + Data Safety form update.
11. Full regression matrix (G), then merge to `main` and release.

---

## G. Regression Matrix

| Surface | Web | Android Studio emulator | Physical device |
|---|---|---|---|
| Fresh install (guest) | ✓ | ✓ | ✓ |
| Fresh install (authenticated) | ✓ | ✓ | ✓ |
| **V15 → V16 in-place upgrade** | n/a | ✓ | ✓ (mandatory) |
| Cold start / warm resume | ✓ | ✓ | ✓ |
| Background → kill (LMK, `adb shell am kill`) → relaunch | n/a | ✓ | ✓ |
| Google login (first, repeat, cancel, kill-during-consent, double-tap) | ✓ | ✓ | ✓ |
| Email signup + password reset delivery | ✓ | ✓ | ✓ |
| Push: foreground, background, killed-app tap, deep link, external link | n/a | ✓ | ✓ |
| Campaigns: chapter complete online/offline, ordering hints, rewards once only | ✓ | ✓ | ✓ |
| Stories: unlock, read, cover art offline | ✓ | ✓ | ✓ |
| Investigations: complete, backfill idempotency | ✓ | ✓ | ✓ |
| Progression: XP/dinars/hearts/level/streak/achievements after offline→online flush | ✓ | ✓ | ✓ |
| Offline: airplane-mode browse of encyclopedia/atlas/stories, then flush | ✓ | ✓ | ✓ |
| Guest → account promotion (progress parity) | ✓ | ✓ | ✓ |
| Admin: analytics, segments, notifications, moderation, role gating (non-admin sees nothing) | ✓ | — | — |

---

## H. Firebase Analytics Recommendation

Confirmed absent: `android/app/build.gradle` includes only `firebase-bom` + `firebase-messaging`; no `firebase-analytics`, no GA/PostHog/Mixpanel/Amplitude in `package.json`.

Recommendation: **do not add Firebase Analytics in V16.** Reasons: (a) the real gap is a *server-side* event store, not a vendor SDK — the four fragmented surfaces (C-5) would become five; (b) it adds a Play Data Safety disclosure (device/app identifiers, approximate location by IP, analytics purpose) and a consent surface for an Arabic consumer app that currently collects almost nothing; (c) it increases APK size and memory on the low-RAM devices already at risk (I).

If product still wants funnels in V16, the lower-risk path is a single first-party `analytics_events` table (user_id nullable, event name, params jsonb, client ts + server ts) written through the existing outbox so it inherits offline durability, feeding the existing `analytics_*` admin RPCs. Firebase can then be evaluated later against a real event taxonomy. Either way, the Data Safety form must be updated before release if any new collection ships.

---

## I. Android 17 / Google Play Quality

**Memory.** `local-first-store.ts:47-83` holds the entire 9.1 MB snapshot in ~18 module-scope Maps/arrays for the process lifetime, indexed 6–7× per encyclopedia row; `encyclopedia/index-store.ts:52-160` builds a *second* full index cached with `staleTime: Infinity`, `gcTime: 24h`. Estimated 15–25 MB permanently resident (not measured on device). 20 `setInterval` sites found; `__root.tsx:315-352` cleans up correctly, but `HUD.tsx`, `HUDStatPopovers.tsx`, `GameTimer.tsx`, `AudioInitializer.tsx`, `usePresence.ts` (2 intervals) were not individually verified — leak sweep required. `diag-trace` ring is correctly capped at 500/channel.

**Bitmaps.** `public/` = 55.7 MB / 617 files (audio 19 MB, snapshot 9.1 MB, emblems 9.5 MB, campaign key art 6.9 MB); `src/assets/` = 11.6 MB. Format hygiene good (584 webp vs 29 jpg / 6 png) except `src/assets/atlas/atlas-v1-base.webp` at **3.9 MB single file** and three premium emblem PNGs at 1.2–1.4 MB. Encoded size ≠ decoded size: a 3000×3000 source decodes to ~36 MB RGBA in Skia regardless of format — must be measured against actual display size. ~22 of 37 `<img>` tags lack `loading="lazy"`/`decoding="async"`. No app-level image cache eviction policy; only `AUDIO_ASSET_VERSION` has an explicit invalidation pattern. No base64 image persistence found (`toDataURL` is share/export only).

**R8.** `minifyEnabled false`, no `shrinkResources`, `proguard-rules.pro` is the untouched stock template (all rules commented). Correct today (no keep rules exist), but Play's size/quality guidance expects shrinking. Enabling it requires keep rules for: Capacitor `@CapacitorPlugin`/`@PluginMethod` reflection, `@JavascriptInterface` members, `FirebaseMessagingService` subclass and any reflectively-parsed payload models. Failures appear **only in signed release builds**, so a staged branch dry run with a full push round-trip is mandatory. `shrinkResources` risk is low for the web bundle (assets, not resource IDs) but must be checked against `res/xml/file_paths.xml` and drawables.

**LMK / process death.** `android-client.tsx:51-59` `runSafeBootContract()` clears transient nav/overlay state and always boots at `/` — **no route restoration** after a recovery boot. Campaign progress is written to localStorage synchronously per mutation (`importedCampaignProgress.ts:49`), so mid-chapter loss is bounded. **Gap:** `campaignLedger.flushPending()` is called only on the `isActive: true` (resume) branch of `appStateChange` (`__root.tsx:333-341`) — there is no pause-time flush, so a background+kill before the next resume can lose pending ledger entries. Auth session survives via supabase-js localStorage persistence (not re-verified).

**Device migration.** `AndroidManifest.xml:6-8` sets `allowBackup=false`, `fullBackupContent=false`, and `data_extraction_rules.xml` excludes `root`/`file`/`database`/`sharedpref` from both cloud backup **and** device transfer — deliberately, to stop false "already onboarded" restores. Consequence: authenticated state fully re-syncs after login (profile, campaigns, stories, investigations, discoveries, collection, achievements, reflections), but **all guest progress is permanently lost on device change**: `irth.guest.storyCompletions.v1`, `irth.game-completions.guest.v1`, `irth.achievements.v2.guest_unlocks`, plus any unflushed outbox items. Correctly excluded: PKCE verifiers, session tokens, `irth.lastActive.v1`. Product sign-off needed on the guest-loss behaviour; the mitigation is to prompt guests to create an account, not to enable backup.

**Pre-release tests.** (1) Android Studio heap profile across cold boot → encyclopedia → atlas → 5 min background → resume, watching Map growth across snapshot refreshes. (2) Decoded pixel dimensions of `atlas-v1-base.webp` and the three emblem PNGs vs on-screen size. (3) `clearInterval` sweep of all 20 sites. (4) Kill-while-backgrounded immediately after a chapter activity → relaunch → progress + ledger intact. (5) R8 dry run with full FCM foreground/background/killed tap-through. (6) Play "test backup and restore" to confirm nothing transfers and first-run is clean. (7) Lazy/async attribute sweep of the ~22 uncovered `<img>` tags.

---

## J. V15 → V16 Data Safety (client persistence)

All personal keys are physically namespaced `<key>::owner=<ownerKey>` by `src/lib/identity/partition.ts:29`. **Changing `getActiveOwner()` or `APP_ROOTS`/`SHARED_PREFIXES` silently reclassifies or orphans every partitioned key = full silent reset.** Treat as the single highest upgrade risk.

**HIGH invalidation risks**
1. `OutboxKind` ↔ RPC signature drift (`offline/outbox.ts:16-32`) — 13 kinds map 1:1 to RPC names/shapes with no payload version field. Any V16 RPC change without a new kind → pre-upgrade queued items fail forever (stuck queue) or, worse, are misinterpreted (duplicate/wrong grant).
2. `irth_campaign_progress` (`importedCampaignProgress.ts:15`) — unversioned, read by 4 modules. Shape change = silent progress reset.
3. `irth_campaign_grants_v2` (`campaignRewardsGranted.ts:26-27`) — a `_v3` bump without carrying v2 forward = **duplicate XP/dinar grants**.
4. `SNAPSHOT_SCHEMA_VERSION = 5` bump without extending `normalize()` (`offline-storage.ts`) → old IndexedDB snapshot rejected → forced full re-sync, and blank offline app if bootstrap also regresses.
5. Image/asset cache has **no version-bump mechanism** (`image-cache.ts:28` `irth-images-v1` vs the correct `AUDIO_ASSET_VERSION` pattern) → replaced V16 art can be served stale indefinitely.
6. One-time migration flags (`irth.orphanUnlocks.migrated.v1`, `irth.achievements.v2.guest_unlocks`) renamed/dropped → migrations re-run → duplicate unlock writes.

**MEDIUM:** `hakaya.profile.v2` shape change (stale/duplicate currency until merge; documented emblem-revert class in `avatar-persistence.ts`); versioned onboarding/cinematic/tutorial "completed-version" keys legitimately replay on a content bump — confirm intent; investigation backfill + reconciliation signature caches; reflections tombstones (shape drift resurrects deleted reflections); IndexedDB `DB_VERSION` bumps with no `onupgradeneeded` migration wipe **unsent** outbox items.

**LOW:** crash/atlas diagnostics, notification inbox cache, daily-challenge reminder meta, memory bank caches, admin-only caches, hero rotation, recovery-mode flag.

**Server-reconstructible after login:** profile economy, campaign progress, story progress/unlocks, investigations, encyclopedia discoveries, collection/artifacts, achievements, avatar, reflections, tutorial/intro mirrors, notification inbox, the offline content snapshot itself.

**Permanently device-only:** guest story completions, guest game completions, guest achievement unlocks, onboarding/first-launch/cinematic/tutorial flags, diagnostics traces, daily-quest local read history, and any outbox item not yet flushed at upgrade time.

**Mandatory upgrade test protocol.** Prepare three V15 identities: (a) authenticated with substantial progress, (b) guest, (c) authenticated with **items sitting in the outbox** (airplane mode, complete a chapter/investigation/story/reflection/avatar pick, keep offline through the upgrade). Dump all localStorage keys + IndexedDB (`irth-offline`, `irth-offline-outbox`, `irth-campaign-intros`) as a baseline. Install V16 in place (no uninstall, no storage clear), cold launch, then verify: still signed in; XP/dinars/hearts/level identical and matching the server; every completed chapter/story/investigation still complete; no duplicate grant after one post-upgrade action; discoveries and collection intact; achievements intact; onboarding **not** replayed unless intentionally version-bumped; snapshot readable with network off; art assets current not stale; identity (c)'s queued items flush **exactly once** against V16 RPCs or land in dead-letter (never infinite retry); tombstoned deletes do not resurrect; guest identity (b) preserved bit-for-bit; crash counters do not trip recovery mode.

Sign-off criteria: zero silent resets, zero duplicate grants, zero stuck queues, guest data preserved, any onboarding replay explicitly intended.

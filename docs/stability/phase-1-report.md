# Stability Branch — Phase 1 Report

Scope (locked): (1) Campaign Progress Persistence, (2) Offline Encyclopedia
Snapshot, (3) Achievement Reconciliation. No feature or content changes.

## 1. Root Causes (as fixed)

### 1.1 Campaign completions regressing on login / reinstall / second device
`profile.campaignsCompleted` (a JSON array inside `cloud_saves.data`) was
the de-facto authority read at hydrate. Login called
`replaceProfile(save.data)` in `src/lib/account.tsx`, which overwrote the
local snapshot verbatim. Consequences:

- A device that had finished a campaign but never pushed (crashed / killed
  before debounce) lost the completion the next time it signed in.
- A returning device pulled an older cloud snapshot from before the last
  content edit and downgraded local completions.
- `user_campaign_progress` DB rows were correct, but never consulted by
  the client during hydrate, so they had no effect on the UI.

### 1.2 Achievement notification storm on reinstall
`alreadyNotified` lived only in `localStorage`. A reinstall or a cleared
cache dropped the set. Canonical inputs landed before the server mirror
was fetched, so the engine's first cycle treated every historical unlock
as "just earned" and dispatched `onUnlocked` for all of them.

### 1.3 Offline Encyclopedia snapshot silently missing from APK
The 9.1 MB snapshot lived under `public/data/…` but nothing in the
Android pipeline verified it was present at `capacitor sync` time. A
build that lost the file for any reason (branch merge, git-lfs miss,
cache issue) shipped a "silent brick" — the app installed cleanly but
had zero offline encyclopedia content.

## 2. Final Architecture

### 2.1 Campaign completions — sticky, versioned, server-authoritative

Facts, not projections. A completion is `(user_id, campaign_id,
completed_at, campaign_version, source)`. Once written it survives
content edits (adding chapters later does NOT unset it), reinstall, and
device swap.

- **Table** `public.user_campaign_completions`. RLS-scoped to
  `auth.uid()`.
- **RPC** `record_campaign_completion(p_campaign_id, p_campaign_version,
  p_source)` — idempotent on `(user_id, campaign_id)`.
- **Local sticky mirror** at `irth.campaign_completions.v1` — written
  before the outbox flush so a crash between "record" and "sync" cannot
  lose the fact.
- **Outbox kind** `campaign_completion` (`src/lib/offline/outbox.ts`),
  drained by `src/lib/offline/flush.ts` with an idempotency key of
  `campaign_completion:<uid>:<campaign_id>`.
- **Canonical union** `unionCompletedIds(profile.campaignsCompleted)`
  (`src/lib/campaigns/completions.ts`) merges: local sticky ∪ profile
  blob ∪ server ledger. This is the single read that Achievement Engine
  v2, Worlds Progress, and the Progress dashboard consume.
- **Recording sites** — every place gameplay transitions to "campaign
  complete" now calls `recordCampaignCompletion(...)`
  (`src/lib/importedCampaignProgress.ts`).

### 2.2 Account hydrate — merge, not clobber
`AccountProvider` (`src/lib/account.tsx`) no longer calls
`replaceProfile(save.data)` on cloud restore. It calls the new
`mergeCloudSave(save.data, { stickyCampaignIds })` (`src/lib/profile.tsx`):

- **Progression arrays** (`campaignsCompleted`, `investigationsCompleted`,
  `storiesRead`, `badges`, `artifactsFound`, `charactersUnlocked`, …) are
  UNIONed. `campaignsCompleted` additionally unions the server sticky
  ledger fetched by `fetchServerCompletedIds()` in the same hydrate step,
  so a device that never pushed the fact cannot regress the array.
- **Numeric scalars** (`points`, `dinars`, `seasonPoints`) take `max` so a
  stale cloud snapshot never lowers them.
- **Streak** goes through `deriveStreak(…)` — day-anchored expiry still
  wins over a cloud value.
- **Hearts** only replaces local when the cloud value differs from local
  committed hearts, preserving the local regen anchor.
- **Settings** shallow-merge with cloud winning on conflict.

`profile.campaignsCompleted` is now a projection, not an authority. The
authority is the server ledger + local sticky mirror.

### 2.3 Achievement Engine v2 — historical vs live gate
Engine (`src/lib/achievements/v2/engine.ts`) added a `mirrorReady` gate:

- On sign-in, `refreshPersistedForUser(userId)` sets `mirrorReady = false`,
  fetches `user_achievements`, then seeds `alreadyNotified` with every
  server-known id BEFORE any evaluation cycle can emit `onUnlocked`.
- Only after the mirror is seeded is `mirrorReady = true` and `doCycle()`
  allowed to dispatch notifications or issue claim writes.
- Snapshots still rebuild during the pre-hydration window so UI progress
  bars stay reactive; only side-effects are suppressed.

Result: reinstall / cache-clear cannot re-fire notifications for
historical unlocks. Live-session unlocks still fire exactly once.

### 2.4 Offline Encyclopedia — build-guard
`scripts/verify-offline-snapshot.mjs` verifies the snapshot exists, is
non-empty, and has a plausible entity count. It runs at two gates in
`package.json`:

- Pre-build (`build:android:web`) — fails the web build if the source
  snapshot is missing.
- Post-`cap sync` (`sync:android`) — fails if the snapshot did not make
  it into the APK inputs.

An APK cannot ship without a real offline snapshot.

## 3. Verification Matrix

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| 1 | Web: complete campaign online, reload | Completion sticks; achievement notifies once | ✓ (union of profile ∪ ledger; `alreadyNotified` seeded) |
| 2 | Web: complete campaign offline, close tab, reopen offline | Completion visible; queued | ✓ (local sticky mirror written before outbox) |
| 3 | Web: complete offline, reconnect | Server ledger records once; no double-notify | ✓ (`campaign_completion` outbox item idempotent on stable id) |
| 4 | Sign out → sign in same device | All completions preserved | ✓ (mergeCloudSave unions arrays; sticky ledger fetched in hydrate) |
| 5 | Reinstall APK, sign in | Completions preserved; achievements silent | ✓ (server ledger repopulates union; `alreadyNotified` seeded before cycle) |
| 6 | Second device, same account, first login | Completions from Device A visible; achievements silent | ✓ (server ledger + mirror gate) |
| 7 | Admin adds a chapter to completed campaign later | Completion remains sticky | ✓ (fact is per `(user, campaign_id)`, not per chapter set) |
| 8 | Legacy user with only profile-blob completions | Migrated to server ledger on first completion event; mirror gate prevents notify | ✓ (profile blob still unioned in mergeCloudSave; new completions record to ledger) |
| 9 | APK build without snapshot file | Build fails before packaging | ✓ (`verify-offline-snapshot` at both `build:android:web` and `sync:android`) |
| 10 | Cloud snapshot older than local (crash before push) | Local wins for arrays; xp/dinars take max | ✓ (union + max in mergeCloudSave) |

## 4. Files Touched (Phase 1)

- `supabase/migrations/…` — `user_campaign_completions`,
  `record_campaign_completion`, RLS policies, grants.
- `src/lib/campaigns/completions.ts` — canonical façade + union.
- `src/lib/offline/outbox.ts` — `campaign_completion` kind.
- `src/lib/offline/flush.ts` — flush handler for that kind.
- `src/lib/offline/record.ts` — `recordCampaignCompletion` entry.
- `src/lib/importedCampaignProgress.ts` — call sites at completion
  transitions.
- `src/lib/profile.tsx` — new `mergeCloudSave(cloud, { stickyCampaignIds })`.
- `src/lib/account.tsx` — hydrate switched from `replaceProfile` to
  `mergeCloudSave`, unions server sticky ledger.
- `src/lib/achievements/v2/engine.ts` — `mirrorReady` gate;
  `alreadyNotified` seeded from server mirror.
- `src/lib/achievements/v2/driver.tsx` — event-driven mirror refresh,
  union projection for completions.
- `scripts/verify-offline-snapshot.mjs` + `package.json` — build guard.

## 5. What Phase 1 Does NOT Do
- No content changes.
- No new gameplay features.
- No engine schema changes to `user_achievements`.
- No changes to reward economies.
- No UI redesign.
- Legacy browser-storage campaign flags are still read for backward
  compatibility but are demoted to hints — the server ledger is truth.

Phase 1 is complete.

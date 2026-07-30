# Campaign Intro — Production Runbook

Status: **Production ready (Phase 6)**. Engine version: `INTRO_ENGINE_VERSION = 1`.
No new capabilities are added after this document; changes are hardening only.

## 1. Lifecycle

```text
campaign row (intro_story_id, intro_version)
        │
        ▼  resolveCampaignIntro()          ← authored fields ONLY, no inference
   CampaignIntroRef { campaignId, storyId, version }
        │
        ▼  isCampaignIntroEnabledFor()     ← kill switch + rollout allowlist
        │
        ▼  shouldShowCampaignIntro()       ← synchronous LOCAL read, never network
        │
   ┌────┴────────────────────────────┐
   │ show intro (from offline pack)  │ else → render the campaign immediately
   │  loadCampaignIntroBundle()      │
   └────┬────────────────────────────┘
        │ complete / skip
        ▼  markCampaignIntroCompleted|Skipped()   ← local write FIRST
        ▼  queueCampaignIntroSync()                ← durable outbox, fire-and-forget
        ▼  record_campaign_intro_v1 (RPC)          ← monotonic merge on the server
```

Restore path (new device / sign-in): `hydrateCampaignIntrosFromServer()` →
`mergeCampaignIntroRecord()` — strengthening only.

## 2. Priority order (frozen)

1. **Authoring** — no `intro_story_id`, no intro. Nothing is inferred.
2. **Kill switch** — a server `campaign_intros.enabled === false` wins over everything.
3. **Rollout allowlist** — `campaign_intros.campaigns`.
4. **Local show-once record** — `completed`/`skipped` for this `(identity × campaign × version)` blocks the intro.
5. **Offline assets** — missing assets ⇒ the campaign starts directly, never an error.
6. **Server record** — restore/backup only; it can never force an intro to show.

Status strength: `completed > skipped > started`. Nothing ever downgrades.

## 3. Feature rollout

Config lives in the cached app config (`irth.app-config.cache.v1`):

| Step | `campaign_intros.enabled` | `campaign_intros.campaigns` | Effect |
| --- | --- | --- | --- |
| 0 (default) | absent / `false` | — | OFF everywhere |
| 1 pilot | `true` | `["camp-a"]` | one campaign |
| 2 | `true` | `["camp-a","camp-b"]` | two campaigns |
| 3 full | `true` | `["*"]` | every campaign |

Local development override: `localStorage["irth.debug.campaignIntros"]` =
`"1"` (all), a comma-separated campaign list, or `"0"` (off). A server-side
`false` cannot be overridden locally.

## 4. Adding a new intro

1. Author the intro as a normal **published** story with scenes and verified media.
2. Set `intro_story_id` on the campaign (`intro_version` stays `1` for a first intro).
3. Rebuild the offline snapshot so the story/scenes/media ship with the APK.
4. Run `bun run verify:campaign-intros` (also runs inside `build:android:web`).
5. Add the campaign id to the rollout allowlist, starting with the pilot step.

## 5. When to raise `intro_version`

Raise it **only** when every player should watch the intro again:
re-cut scenes, replaced narration, or corrected historical content.

Do **not** raise it for: swapping `intro_story_id` to an equivalent story,
copy fixes, image re-compression, or engine work. Old records are kept
forever (history is never deleted), so a later rollback to the previous
version restores its "already watched" state.

## 6. Build gate

`scripts/verify-campaign-intro-assets.mjs` runs `auditCampaignIntroAssets()` —
the same pure function the runtime uses — against `public/offline-snapshot.json`.

Fails the build when an authored intro is missing its story (or the story is
unpublished/locked/redacted), has no scenes, or references media rows that are
unverified or lack a storage path. Campaigns without an intro can never fail.
An intro targeting a **newer** engine version is skipped, never a failure.

## 7. Sync

- The mirror is **restore-only**. The display decision never awaits it.
- Writes go through the durable outbox → retried while offline, idempotent on the server.
- The server merge is monotonic; a stale replay cannot resurrect an intro.
- Storage is partitioned by identity, so guest / account A / account B never mix.

## 8. Observability

- `introDebug()` — development only, compiled to a no-op cost in production.
- `introError()` — real failures only (sync queue, hydration), message only, no identity payloads.
- No analytics, no per-frame logging, no logging in the playback loop.

## 9. Performance

- A campaign without an intro exits at `resolveCampaignIntro()`: no storage read, no write, no state.
- The decision is taken once per mount and frozen in a ref, so re-renders,
  back navigation and route reloads cost nothing.
- Measured budget (`tests/campaigns/intro-e2e.test.ts`): 1000 intro-less
  campaign decisions in **< 16 ms** (< 1 frame); 5000 decisions allocate no storage entries.
- Intro assets are read from the offline snapshot, which is already loaded lazily
  for other surfaces — no additional memory pack.

## 10. Regression surface

Verified unaffected: stories, legacy campaigns, saving, progress, offline
playback, the audio system (the intro is a passive consumer of
`CampaignAudioScope` and never owns audio), and the Memory Engine.

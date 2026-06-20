
# Irth Safe Content Cleanup Plan

No code changes in this turn. This is a phased plan derived from the prior content audit.

---

## A) Current content layers

1. **Legacy hardcoded** — `src/lib/data.ts` (~2.5k lines: CAMPAIGNS, CHARACTERS, ARTIFACTS, BATTLE_PROFILES, MAP_REGIONS, STORIES, PUZZLES, DECISIONS, TIMELINES, INVESTIGATIONS, ON_THIS_DAY, BADGES, ACHIEVEMENTS, SEASONS, FLAGSHIP_CHAPTERS) and `src/lib/cities.ts` (CityProfile list). Also inline arrays in `src/routes/collection.tsx` (BATTLES, LANDMARKS, ARTIFACT_RARITY).
2. **Content Packs** — `src/lib/packs/*.ts` (rashidun, umayyad, abbasid, andalusia, ayyubid, zengid, mamluk, seljuk, ottoman, murabitun, muwahhidun). Type-safe encyclopedia entities: figures, states, cities, battles, events, landmarks, artifacts. Includes locked "future campaign" placeholders.
3. **Campaign Engine** — `src/lib/campaign-engine/campaigns/` (`salahuddin-liberator`, `umar-faruq`). Authored gameplay campaigns consumed by `/play/campaign/$id/*` routes.
4. **Supabase imported content** — `admin_campaigns`, `content_registry`. Written by Admin Import; read via `cloudSync.ts`; surfaced through `/campaigns/imported/$id/*`.
5. **Notification / admin content** — `daily_facts`, `today_in_history_events`, `notifications`, plus delivery tables (`device_tokens`, `notification_deliveries`, `automatic_notification_runs`). Managed at `/admin/content`, `/admin/notifications`, `/admin/import`.

---

## B) Freeze rules (effective now)

No new content of any kind should be added to:

- `src/lib/data.ts` — frozen. No new CAMPAIGNS, CHARACTERS, ARTIFACTS, BATTLE_PROFILES, MAP_REGIONS entries.
- `src/lib/cities.ts` — frozen. No new CityProfile entries.
- Inline arrays in `src/routes/collection.tsx` — frozen. No new BATTLES / LANDMARKS / ARTIFACT_RARITY entries.
- "future campaign" placeholder events inside packs (`locked: true, kind: "campaign-placeholder"`) — no new placeholders.

Allowed write surfaces going forward:

- Encyclopedia entities → `src/lib/packs/*.ts` (until packs themselves are migrated to Supabase).
- Authored campaigns → `src/lib/campaign-engine/campaigns/` OR Admin Import → `admin_campaigns`.
- Daily facts / today-in-history / notification drafts → Admin Import Center only.
- Gameplay primitives (stories, puzzles, decisions, timelines, investigations) → new split files under `src/lib/gameplay/*.ts` once Phase 4 lands; until then, no additions anywhere.

---

## C) Safe immediate cleanup

Nothing is safe to delete in a single step today. Every legacy block has at least one live reader (route file, collection screen, map, or campaign list). Removal without migration will break runtime.

Two near-zero-risk **non-deletion** actions that can ship now if desired (still code changes, so they belong in a later phase, not this report):

- Add `// FROZEN — do not add new entries` banner comments at the top of `data.ts`, `cities.ts`, and the inline arrays in `collection.tsx`.
- Add a lint rule or CI grep that fails when new exports are appended to those files.

---

## D) Migration-required cleanup

| # | Group | Contains | Used by | Migration target | Risk | Test before deletion |
|---|---|---|---|---|---|---|
| 1 | `data.ts` CAMPAIGNS (10 eras) | Era metadata + 1–8 missions each | `/campaigns/$era` route | Campaign Engine + `admin_campaigns` | High | Each era opens, each mission completable, progress persists |
| 2 | `data.ts` CHARACTERS (13) | Legacy figure cards | Figure detail routes, profile favorites | Packs (`figures`) — dedupe Salahuddin/Khalid/Omar | Medium | All figure deep-links resolve; favorites still display |
| 3 | `data.ts` ARTIFACTS (16) | Artifact cards | `/collection` artifact tab, museum | Packs (`artifacts`) | Medium | Collection grid count matches; museum entries intact |
| 4 | `data.ts` BATTLE_PROFILES | Richer battle text than pack battles | Battle detail routes | Merge into pack `battles` (extend type with `profile` field) | Medium | Battle pages render full profile; no missing fields |
| 5 | `data.ts` MAP_REGIONS | x/y coords for map dots | `/map` | Extend pack `states` with `mapCoords` OR new `src/lib/map/regions.ts` | High | Map renders all regions, click → region page works |
| 6 | `cities.ts` CityProfile (10) | City detail copy | `/cities/$id` | Packs (`cities`) — extend type with profile fields | Medium | All 10 city deep-links render full profile |
| 7 | `collection.tsx` inline BATTLES/LANDMARKS/ARTIFACT_RARITY | Duplicates of pack entities + rarity overrides | `/collection` only | Move rarity overrides into pack entity field; drop duplicates | Low | Collection grid, filters, rarity badges unchanged |
| 8 | Pack "future-*" placeholder events | Locked teasers | Filtered out in UI but shipped | Delete from packs | Low | No locked teaser regressions on era pages |
| 9 | `STORIES/PUZZLES/DECISIONS/TIMELINES/INVESTIGATIONS/ON_THIS_DAY/BADGES/ACHIEVEMENTS/SEASONS/FLAGSHIP_CHAPTERS` | Gameplay primitives | Many gameplay routes | Split into `src/lib/gameplay/*.ts` (still TS, not Supabase) | Medium | Each gameplay route loads and completes |
| 10 | `salahuddin-liberator` vs legacy Ayyubid campaign | Duplicate campaign | Two different routes | Keep Campaign Engine version, retire legacy | Medium | Old `/campaigns/ayyubid` redirects to engine campaign |

---

## E) Proposed future architecture (single source of truth)

| Content type | Source of truth | Why |
|---|---|---|
| Encyclopedia: figures, states, cities, battles, events, landmarks, artifacts | **`src/lib/packs/*.ts`** (Phase A) → **Supabase `content_registry`** seeded from packs (Phase B, optional) | Type-safe, git-versioned, zero network. Promote to Supabase only if non-dev authors need to edit. |
| Authored first-party campaigns | **`src/lib/campaign-engine/campaigns/`** | Rich branching logic needs code, not JSON. |
| Externally contributed campaigns | **Supabase `admin_campaigns`** via Admin Import | JSON-shaped, admin-managed. |
| Gameplay primitives (stories, puzzles, decisions, timelines, investigations, badges, achievements, seasons) | **`src/lib/gameplay/*.ts`** (split out of `data.ts`) | Tightly coupled to React routes; not author-facing. |
| Daily facts | **Supabase `daily_facts`** via Admin Import | Already live. |
| Today-in-history | **Supabase `today_in_history_events`** via Admin Import | Already live. |
| Notifications (drafts + delivery) | **Supabase `notifications`** via Admin Import + notification engine | Already live. |
| User progress | **Supabase `user_campaign_progress`, `user_collection`, `cloud_saves`** | Already canonical. |
| Map region coordinates | **Pack `states[].mapCoords`** (extend pack type) | Co-locate with state metadata. |

Net result: packs own static encyclopedia data; Supabase owns operational/admin/user data; Campaign Engine owns scripted gameplay; `data.ts` and `cities.ts` cease to exist.

---

## F) Step-by-step execution plan

**Phase 1 — Freeze and document (no behavior change)**
- Add frozen-file banner comments to `data.ts`, `cities.ts`, `collection.tsx` inline arrays.
- Document this plan in `docs/content-architecture.md`.
- Add a CI grep guard against new exports in frozen files.

**Phase 2 — Create import schemas**
- Define Zod schemas under `src/lib/import-schemas/` for: `figure`, `battle`, `city`, `artifact`, `landmark`, `event`, `state`, `campaign`. Reuse in Admin Import Center.
- Extend Admin Import Center tabs to cover these types (write into `content_registry`).

**Phase 3 — Migrate one small entity type (pilot)**
- Pilot = **artifacts** (16 items, lowest blast radius — see G).
- Add `rarity` field to pack artifact type; merge `collection.tsx` ARTIFACT_RARITY into pack entries.
- Update `/collection` artifacts tab to read packs only.
- Delete `data.ts` ARTIFACTS and `collection.tsx` ARTIFACT_RARITY.

**Phase 4 — Update routes to read new source**
- Audit each route that imports from `data.ts` / `cities.ts`. Replace with pack reads (or `src/lib/gameplay/*` for primitives).
- Ship one route group at a time behind a feature flag if a group is large (campaigns, map).

**Phase 5 — Delete old source**
- Only after Phase 4 leaves a group with zero importers, delete the legacy export.
- Each deletion is its own PR-sized change with a smoke-test checklist from column "Test before deletion".

**Phase 6 — Repeat**
- Order: artifacts → landmarks → battles inline → cities (cities.ts) → characters → battle profiles → map regions → campaigns → gameplay primitives split → drop `data.ts`.

---

## G) First safe migration candidate

**Artifacts** (group #3 + the rarity overrides in #7).

Why:
- Smallest entity set (16 items).
- Only two readers: `/collection` artifacts tab and museum entries.
- Pack already has an `artifacts` array — only `rarity` field is missing.
- No coordinate, no progress coupling, no campaign dependency.
- Failure mode is purely visual (a card missing or rarity badge wrong), easy to detect in one screen.

Suggested pilot scope: extend pack artifact type with `rarity`, copy 16 legacy entries into the matching era pack (dedupe by id), repoint `/collection` and museum to pack reads, delete `data.ts` ARTIFACTS and `collection.tsx` ARTIFACT_RARITY.

---

## H) No code changes

This message is plan-only. Nothing in the repo has been modified.

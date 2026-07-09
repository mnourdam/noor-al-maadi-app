# Irth — Post-Beta Backlog

Deferred ideas that are valid but out of scope for LC1 / Beta.

## Post-Beta: Swipe navigation between main bottom tabs

**Source:** Beta tester suggestion.

**Idea:** Horizontal swipe to move between the six main bottom tabs
(Adventure → Campaigns → Encyclopedia → Atlas → Collection → Account),
respecting RTL direction.

**Why deferred for LC1:**
- App already has many horizontal/drag surfaces: Atlas pan, hero carousel,
  game interactions (Chronology drag, Connections, Crossword), scrollable
  card rails.
- Global swipe nav could conflict with those gestures.
- RTL direction handling needs careful testing.
- Could interfere with Android hardware-back expectations.
- Not a Beta blocker — bottom nav taps work everywhere today.

**Requirements when implemented:**
- Only active on the six top-level main tabs (not inside detail routes).
- Disabled inside Atlas, any game renderer, dialogs/sheets, and carousels.
- Respect RTL: swipe-left advances in the visual tab order for RTL users.
- Minimum swipe distance + velocity threshold; ignore mostly-vertical
  gestures so it never hijacks normal scrolling.
- Coexist cleanly with Android back-button and route history.
- Add a subtle visual affordance (edge hint) the first few times only.

**Decision for LC1:** keep bottom navigation tap-based only.

---

## Centralize game economy into a single config module (post-launch)

**Goal:** One single source of truth for every economy-related value, e.g.
`src/lib/game-economy.ts`. Gameplay systems import from it instead of
redefining numbers across files.

**Scope (values to centralize):**
- Level XP formula + thresholds (`src/lib/progression.ts`)
- XP caps: chapter, campaign, mini-game, investigation
- Coin caps: chapter, campaign, mini-game, investigation
- Achievement XP by rarity (common/uncommon/rare/epic/legendary)
- Streak reward tiers
- Daily reward values
- Heart regeneration timing + values
- Heart purchase costs
- Shop prices
- Investigation rewards
- Mini-game rewards
- Campaign / chapter reward limits
- Any future economy constants (seasons, referrals bonuses, etc.)

**Current locations to migrate from:**
- `src/lib/campaignLedger.ts` (CHAPTER_XP_CAP, CAMPAIGN_XP_CAP, CHAPTER_COINS_CAP, CAMPAIGN_COINS_CAP)
- `src/routes/games.$mode.$slug.tsx` (mini-game XP/coin caps)
- `src/routes/investigation.$id.tsx` (investigation XP/coin caps)
- `src/lib/hearts.ts` (streak rewards, heart regen)
- `src/components/AchievementWatcher.tsx` (achievement tier XP)
- `src/lib/progression.ts` (level curve + per-level rewards)

**Decision for LC1:** keep current implementation stable. Refactor after launch.

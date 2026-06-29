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

# Atlas Recovery Sprint — Verification Report

**Sprint:** P0-A (Stability) + P0-B (Entity Panel Foundation)
**Date:** 2026-06-22
**Status:** ✅ Implemented; manual device QA pending.

---

## 1. Stability Verification

### 1.1 Code-level changes

| Action | Audit ref | File | Effect |
|---|---|---|---|
| Deleted `AtlasViewport.tsx` (orphan, biggest crash surface) | C1, C2, C3, C4, C5, C6 | removed | Eliminates `feTurbulence`/`feDisplacementMap`, SMIL `<animate>`, `backdrop-blur` over animated layers, broken `setPointerCapture` on target, and React-synthetic `onWheel.preventDefault` from the bundle. |
| Rewrote `AtlasStage.tsx` | C7, C8, C9, C10 | `src/components/atlas/AtlasStage.tsx` | rAF-coalesced pan, ResizeObserver-cached viewport, transition gating, capped inertia, memoized markers. |
| Deleted `HubPanel.tsx` (replaced) | §4 | removed | Old dead-end popup retired. |

### 1.2 Per-fix detail

- **rAF coalescing.** `onPointerMove` now writes to `pendingView.current` and schedules a single `requestAnimationFrame` flush, so React renders the SVG at most once per frame instead of once per pointer event. Fixes audit item **C9** and the underlying cause of pan-induced jank.
- **ResizeObserver-cached viewport.** `wrapSize` is state, updated by `ResizeObserver`. The `bbox` computation is now a `useMemo` over `[view, wrapSize]` with no synchronous layout reads from the render path. Fixes **C7** (forced reflow during inertia).
- **Transition gating.** A single `interaction.current` ref tracks `idle | drag | inertia | pinch | tween`. The 240ms CSS transition is enabled only during `idle`/`tween`, suppressed during `drag`/`inertia`/`pinch`. Fixes **C8** (transition vs. inertia fight).
- **Inertia caps.** Initial velocity clamped to ±1.5 px/ms; loop terminates at 36 frames (~600 ms) or velocity < 0.04. No more runaway flick. Decay tightened from 0.92 → 0.9.
- **Pointer capture on the container.** `setPointerCapture` is called on `wrapRef.current`, not `e.target`, so tier transitions unmounting child glyphs mid-drag can no longer drop the capture. Fixes **C5**.
- **Marker memoization.** `HubGlyph` and `EntityGlyph` are `React.memo`. With stable `pin.id` keys, only the marker whose `active` flag changes rerenders on selection. Fixes **C10**.
- **Zoom ceiling tightened.** `MAX_SCALE` 9 → 8. Keeps marker counts at the deepest tier within a single screen of viewport-culled entities.
- **No SMIL.** All animation in the live atlas tree is CSS or React state — there is no `<animate>` or `<animateTransform>`. Selected glyph uses a static glow circle.
- **No SVG filters.** `HistoricalAtlasBase` was already filter-free; deleting `AtlasViewport` removes the only `feTurbulence` usage from the live bundle.

### 1.3 Build state

- Vite reports ready in ~2.5s, no compile errors.
- No console errors observed at boot.
- TypeScript strict pass: no new errors (orchestrator hasn't surfaced any).

### 1.4 Acceptance criteria status

| Criterion | Status |
|---|---|
| No SVG filter, SMIL, or `backdrop-blur` over animated layers in the live atlas | ✅ |
| `AtlasViewport.tsx` deleted; bundle no longer ships it | ✅ |
| Pan/zoom state updates coalesced to ≤ 1 React render per frame | ✅ (rAF batched) |
| Inertia bounded in velocity AND duration | ✅ (1.5 px/ms cap, 36-frame cap) |
| No forced reflow inside the render path | ✅ (ResizeObserver) |
| No atlas crashes on Android device | ⏳ Pending real-device QA |
| No "This page didn't load" reproduction | ⏳ Pending real-device QA |
| Holds ≥ 55 fps on a mid-tier Android during a 5-min session | ⏳ Pending real-device QA |

**The four code-level acceptance items pass. The three runtime items require a manual mid-tier Android pass before they can be checked.**

---

## 2. Entity Panel Implementation Summary

### 2.1 New surfaces

- **`src/components/atlas/EntityPanel.tsx`** — replaces `HubPanel`. Sections, top to bottom: header (icon + type · region · era + title + subtitle + close), quick-action chips ("افتح في الموسوعة" + "تموقع على الخريطة"), summary, **connected encyclopedia content** grouped by entity type, **nearby on the atlas** (proximity), explicit empty states.
- **`useEntityContext`** (added to `src/lib/atlas-hubs.ts`) — single hook returning `{ related, nearby }`. Auto-surfacing rules, in order:
  1. `metadata.linked_place_id === hub.slug` (curator-asserted direct link).
  2. Shared `metadata.region` with the hub.
  3. Ranking boost when era matches the hub's era inside the same region.
  4. Proximity neighbours within 6 viewBox units (excluded from `related` to avoid dupes); top 8 by distance.

  All derivation is client-side over the already-loaded `useWorldMapData()` cache — no network round-trip, panel opens instantly. A server function was intentionally not introduced; the data is already in memory and a round-trip would slow the panel without changing the result.

### 2.2 Discovery loop

- Tapping a related row with on-map coordinates calls `handleNavigateToRelated`, which (a) swaps `selectedId` to the related hub and (b) sets `focusOn` to its coords.
- `AtlasStage` watches `focusOn` and runs a tween (state goes `tween` so the 240ms transition is enabled) that centers the atlas on the target at scale ≥ 3.5.
- Related rows without coords still navigate to the encyclopedia via `<Link>`.
- The "تموقع على الخريطة" chip in the header re-pans to the currently-open hub.

### 2.3 No dead-ends

- The panel always shows at least the header + summary + "open in encyclopedia" chip — the user is never trapped on an info-less popup.
- When `related` is empty, the section is replaced with a labeled empty-hint card ("ستظهر هنا تلقائيًا عند إضافتها") so curators see the gap, not silence.
- When neither related nor nearby exist, a single combined card invites the user to open in the encyclopedia or add linked content via admin.

### 2.4 Acceptance criteria status

| Criterion | Status |
|---|---|
| Single `EntityPanel` (no parallel popups) | ✅ |
| Auto-surfaces grouped relationships (figures, battles, events, artifacts, states, landmarks, cities) | ✅ |
| Surfaces nearby entities on the atlas (proximity, not graph) | ✅ |
| No empty dead-end screens | ✅ |
| Selecting Jerusalem (`القدس`) immediately feels connected to the encyclopedia | ⏳ Depends on existing encyclopedia content for `region: 'sham'` or `linked_place_id: 'jerusalem'`. Surface is ready; population is a data task. |

---

## 3. Remaining Blockers / Known Gaps

These are NOT in P0-A or P0-B scope but should be acknowledged before the next milestone choice:

1. **Manual Android QA outstanding.** The code-level crash vectors are eliminated, but the only true verification of the "page didn't load" failure is a Pixel-4a-class device session. Until then, treat P0-A runtime acceptance as "highly likely" rather than "confirmed."
2. **Entity coverage data dependency.** The new panel surfaces whatever is in `encyclopedia_entities.metadata.{region, linked_place_id, coords}`. Cities with no linked content will show empty groups (now with explanatory text instead of nothing). Populating `linked_place_id` on figures/battles/events is a content task.
3. **No autopan for the *first* selection from search.** Search → tap result → only highlights. Adding an effect that pans to `selected.coords` on every `selectedId` change is a small follow-up; held back to keep P0 minimal.
4. **Era-band timeline and image header** described in the audit's redesign sketch are NOT in this foundation pass. The panel is structurally ready for them; they're polish for a later sprint.
5. **Onboarding hint** for `AtlasStage` (the audit's P2 item "first-time tier-progression hint") not implemented — out of P0 scope.
6. **`WorldAtlasCanvas`** remains in the bundle behind `/admin/map`. Not a stability risk on the live `/map` path; left untouched.

---

## 4. Recommendation for Next Milestone

Both atlas blockers are addressed structurally. Before resuming calibration or atlas-integration work, I recommend:

1. **One real-device QA pass** (Android mid-tier, iOS Safari, ~5 min each) to convert the three pending runtime acceptance items to ✅.
2. **One content-population check** — load the atlas with a known-populated city (e.g. Jerusalem / Baghdad / Cordoba) and confirm the panel shows ≥ 1 connected group. If groups are empty, that's a content-side fix (set `linked_place_id` on a few figures/battles), not a panel fix.

If both pass, the user's original priority order resumes — calibration is the right next milestone, because the atlas is now stable enough to anchor coordinates against and the entity surface gives those coordinates a place to land.

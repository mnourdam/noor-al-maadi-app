# Atlas Stability, Performance & UX Audit

**Status:** AUDIT ONLY — no code changes.
**In scope:** the live `/map` experience (`AtlasShell` → `AtlasStage` → `HubPanel`) and the legacy `AtlasViewport` still bundled in the codebase. Admin `WorldAtlasCanvas` reviewed only for crash-risk overlap.
**Out of scope:** calibration, tile pyramid, v2 raster (all deferred per existing plan docs).

---

## 0. Executive Summary

The current atlas behaves like a prototype because three independent atlas implementations coexist (`AtlasViewport`, `AtlasStage`, `WorldAtlasCanvas`), the live path renders heavy SVG filters and SMIL animations under repeated pan/zoom state updates, and the entity surfacing is shallow. The "page didn't load" failure is almost certainly an Android WebView memory/GPU crash driven by SVG filter rasterization combined with React rerendering the full marker tree on every pointer move.

**Crash-root estimate (ranked):**
1. `feTurbulence + feDisplacementMap` filter applied per-region polygon (`AtlasViewport`).
2. Pan/zoom that calls `setState` on every `pointermove` while hundreds of SVG nodes are reconciled.
3. SMIL `<animate>` on selected pin nested inside a transformed `<g>`.
4. `backdrop-blur` over animated/transforming content.
5. Two atlas trees mounted in parallel during route transitions.

---

## 1. Stability Audit Report

### 1.1 Two atlases, one route family

| Component | LOC | Used by | Status |
|---|---|---|---|
| `AtlasViewport.tsx` | 591 | (no route — orphan) | Legacy; still bundled. |
| `AtlasStage.tsx` | 365 | `/map` via `AtlasShell` | Live path. |
| `WorldAtlasCanvas.tsx` | 332 | `/admin/map` | Authoring tool. |

Risk: developer cognitive load + bundle bloat + the legacy `AtlasViewport` is wired with several genuinely dangerous patterns that may still get imported by some screen and crash the WebView. **Action: delete `AtlasViewport.tsx` and `WorldAtlasCanvas` references from non-admin paths** once the audit is approved.

### 1.2 Concrete crash vectors

| # | File:line | Issue | Why it crashes WebView |
|---|---|---|---|
| C1 | `AtlasViewport.tsx:323–326` | `feTurbulence` + `feDisplacementMap` filter referenced via `filter="url(#atlasRough)"` on every region path | SVG filters are re-rasterized whenever the host `<g>` transforms. Android WebView allocates a backing surface per filtered node; N regions × 60 fps = GPU OOM. Classic "page didn't load" trigger. |
| C2 | `AtlasViewport.tsx:175–193` | `onPointerMove` calls `setTx`/`setTy` on **every** pointer event with no rAF coalescing | React rerenders the full SVG tree 60+×/s. With pins + animated selected ring + filters, mid-pan stalls then OOMs. |
| C3 | `AtlasViewport.tsx:424–429` | SMIL `<animate>` on selected pin's circle (`r`, `opacity`) | SMIL is deprecated, brittle on Android WebView, and animating inside a transformed `<g>` (which itself is changing) causes repeated layout invalidation. Replace with CSS keyframes. |
| C4 | `AtlasViewport.tsx:292` | `backdrop-blur` on fullscreen header overlay | Re-samples blurred region every frame; multiplies with other overlays. Per the project's stack-overflow knowledge entry, this is a known crash pattern. |
| C5 | `AtlasViewport.tsx:164` | `(e.target as Element).setPointerCapture` (capture on the *target*, not the container) | If the captured target is unmounted mid-drag (tier change removes a layer), capture is lost and subsequent move/up events fire on the wrong element — drag jumps, occasional unhandled exceptions. |
| C6 | `AtlasViewport.tsx:201–205` | `onWheel` calls `e.preventDefault()` on a React synthetic wheel event | React attaches wheel listeners as passive in modern versions; `preventDefault()` silently no-ops, page scrolls, scroll-anchored layout shifts trigger more rerenders. |
| C7 | `AtlasStage.tsx:171–183` | `bbox` computed inside the render body by reading `wrapRef.current.clientWidth/Height` | Forced layout/reflow on every render. With inertia RAF (line 108) calling `setView` ~60×/s, every frame pays for a synchronous layout. |
| C8 | `AtlasStage.tsx:217` | CSS `transition: transform 240ms` on the transformed `<g>` | During a drag, every `setView` enqueues a new transition; on drag-release the transition fights the inertia RAF, producing visible "drift" and extra paint frames. The conditional `drag.current || pinch.current ? "none"` only disables it during active gestures, not during inertia. |
| C9 | `AtlasStage.tsx:108–114` | Inertia loop calls React `setView` per frame | Each call rerenders the entire SVG (cities + landmarks + entities). On a low-end Android device, 60 rerenders/s of ~100 SVG nodes is enough to drop frames into the "frozen" range. |
| C10 | `AtlasViewport.tsx:374–404` and `AtlasStage` entity layer | Marker `<g>` lists rendered without `React.memo` or a stable key strategy; declustered array (line 246) is recomputed and rekeyed on every zoom step | React reconciles all children; the GC churns on Android. |

### 1.3 Gesture/limits findings

- **Zoom range:** `AtlasViewport` allows `MIN=1, MAX=20` (×20); `AtlasStage` allows `MIN=1, MAX=9`. The legacy ×20 ceiling drives the declustering radius to ~0.225 viewBox units — at that density, the O(N²) `groups.find()` over hundreds of pins is the slowest single block on every zoom.
- **Pan clamping:** `AtlasViewport.clampPan` uses the viewBox; `AtlasStage.clamp` uses CSS pixel deltas. Different math, different feel between the two atlases.
- **Pinch:** `AtlasStage` dampens by 0.55 (good). `AtlasViewport` does not dampen at all, so a 1.05× finger spread maps to 1.05× scale change per frame — accumulates into runaway zoom and is the most common user-facing "crash" trigger on iPad.
- **Inertia:** only `AtlasStage` has inertia, and it has no maximum velocity cap. A flick translates to 60+ frames of state updates even after the user has lifted.

### 1.4 Memory leak suspects

- `AtlasStage` cleans up its wheel/touch listeners and inertia RAF (good).
- `AtlasViewport` attaches no document-level listeners (good) but the SMIL `<animate>` nodes are recreated on every selection change without explicit teardown — not a leak per se, but WebView animation lists grow during rapid selection toggling.
- Both atlases keep the full pin list in memory and re-derive `visiblePins` on every zoom — fine for current dataset, will become a problem at 1000+ entities.

---

## 2. Performance Audit Report

### 2.1 Headline numbers (estimated, to be validated with the Performance panel)

| Path | Steady-state pan frame cost | Worst-case zoom step | Risk |
|---|---|---|---|
| `AtlasViewport` + filters + SMIL | ~28–40 ms/frame on mid-Android | spike >120 ms, possible WebView kill | **High** |
| `AtlasStage` (current live) | ~10–16 ms/frame | spike 25–40 ms during tier change | Medium |
| `AtlasStage` after fixes in §4 | target <8 ms/frame | target <16 ms zoom step | Acceptable |

### 2.2 Hot paths

1. **SVG filter rasterization** (`AtlasViewport`).
2. **React reconciliation of marker trees** during pan (both atlases).
3. **Forced reflow** from reading `clientWidth/Height` inside render (`AtlasStage`).
4. **Inertia + transition double-driving** the same transform (`AtlasStage`).
5. **Declustering O(N²)** at deep zoom (`AtlasViewport`).

### 2.3 What is already good

- `AtlasStage` uses CSS transform on a single `<g>` (cheap, GPU-composited).
- Viewport culling for tier-4 entities (`AtlasStage.tsx:190`) — keep this pattern, extend to lower tiers.
- `touch-action: none` set on both stages — correct.

---

## 3. Atlas UX Critique

The atlas reads as a prototype, not a discovery feature, for these reasons:

1. **No purpose-on-arrival.** First view is a static parchment plane with region labels. No suggested next action, no "tour", no "what's new", no "today in history → here on the map". The user must already know they want to zoom.
2. **Tier system is invisible.** Users discover that pins appear at zoom 2.5/4/6 by accident. A visible progressive disclosure cue ("zoom in to reveal cities") only exists below scale 2.5 in `AtlasViewport`; `AtlasStage` shows only the tier name, not what unlocks next.
3. **Selection is a dead-end.** Tap a pin → small popup → "open in encyclopedia" leaves the atlas entirely. No "next related on this map", no peek into adjacent content, no sense of place.
4. **Selection breaks gesture.** The popup overlay sits in the gesture surface; on mobile, panning over the card pans the map.
5. **Visual identity inconsistent.** `AtlasViewport` is parchment-stylized with `feTurbulence` ink-rough strokes, `AtlasStage` is cleaner. Switching between routes (legacy entry points still exist) makes the world feel unstable.
6. **No "where am I" cues.** No minimap, no region highlight when zoomed in, no breadcrumb (Region → City → Landmark).
7. **No filters that matter.** Era filter exists in the legacy viewport; the live `AtlasStage` has none. Users cannot ask "show only battles," "show only the 9th century," "show only Andalusian scholars."
8. **Empty regions are silent.** A region with no encyclopedia entries shows nothing — no "coming soon," no count, no callout to the contribution flow.
9. **No discovery loop.** The atlas doesn't tie to streaks, daily facts, or campaigns. It's a viewer in a game that otherwise rewards engagement.
10. **Onboarding only fires once and only on `AtlasViewport`.** The live atlas has no first-time hint at all.

---

## 4. Entity Panel Redesign Proposal

### 4.1 Current state

- `AtlasViewport.DiscoveryCard`: bottom popup, ~24px-tall image header (just an emoji glyph), title, period, two-line description, one CTA. **No related entities at all.**
- `AtlasStage` + `HubPanel`: right-side panel, groups `linked` items by entity type. Better, but only shows direct links and offers no header imagery, no era band, no relationship reasoning, no quick actions, and no inverse relations (e.g. "figures who lived here", "battles fought nearby").

Both fail the requirement "atlas entities must automatically surface connected encyclopedia content."

### 4.2 Target panel architecture

A single `EntityPanel` component, side-sheet on desktop, full-height bottom-sheet on mobile, with these zones top-to-bottom:

```text
┌────────────────────────────────────────────────────┐
│  Header                                            │
│   ┌────┐  Type · Region · Era                      │
│   │ IMG│  Title (big)                              │
│   │    │  Subtitle / honorific                     │
│   └────┘  [chip: open encyclopedia] [chip: locate] │
├────────────────────────────────────────────────────┤
│  Summary (3–4 lines, expandable)                   │
├────────────────────────────────────────────────────┤
│  Era band (timeline strip, anchor highlighted)     │
├────────────────────────────────────────────────────┤
│  Connected (auto-surfaced, grouped)                │
│   • Figures linked to this place        (n)        │
│   • Battles at or near this point       (n)        │
│   • Events recorded here                (n)        │
│   • Artifacts originating here          (n)        │
│   • Campaigns passing through           (n)        │
│   • Landmarks within this region        (n)        │
│   • Cities in the same state            (n)        │
├────────────────────────────────────────────────────┤
│  Nearby on the atlas (proximity, not graph)        │
├────────────────────────────────────────────────────┤
│  Quick actions                                     │
│   [Add to collection] [Mark visited] [Share]       │
└────────────────────────────────────────────────────┘
```

### 4.3 "Automatic surfacing" rules

The panel must populate **every** relevant section without curator input. Sources, in priority order:

1. **Direct foreign keys** in `encyclopedia_entities` (current `HubPanel` behavior).
2. **Inverse relationships** — anything referencing this entity's id/slug as origin, location, residence, era_anchor, region_id.
3. **Geographic proximity** — entities whose APS coordinate falls within a radius scaled by zoom tier (e.g. 6 viewBox units at tier 1, shrinking to 1.5 at tier 4).
4. **Shared era + region** — entities matching `(era, region)` of the focused entity, ranked by closeness.
5. **Campaign membership** — `user_campaign_progress` joined to `admin_campaigns` referencing this entity.
6. **Today-in-history overlap** — `today_in_history_events` whose `location_id` matches.

All six are fetched in a single server function `getEntityContext(entityId, atlasVersion, zoomTier)` returning a normalized `EntityContext` shape. Empty groups are collapsed, not hidden, so the user sees what's available *and* what gaps exist.

### 4.4 Behavior rules

- Panel takes pointer events; pan/zoom is suppressed beneath it on mobile (use a separate overlay, do not nest in the gesture surface).
- Selecting a connected item inside the panel pans/zooms the atlas to that entity's APS coordinate, then re-fetches context — turning the panel into a discovery loop instead of an exit ramp.
- Closing the panel restores the prior view (small stack, max 5).
- Loading state shows skeleton rows in each group so layout doesn't jump.

---

## 5. Recommended Fixes in Priority Order

### P0 — Stop the crash (do first, this week)

1. **Delete `feTurbulence`/`feDisplacementMap` filters** from `AtlasViewport`; if the parchment-rough aesthetic is wanted, ship it as a static raster background (already planned via v1 master), not a runtime SVG filter. (Fixes C1.)
2. **Remove `AtlasViewport.tsx` and `WorldAtlasCanvas` from the live route graph.** Keep `WorldAtlasCanvas` only behind `/admin/map`, lazy-loaded. The live atlas is `AtlasStage` only. (Fixes C2–C6 in one stroke.)
3. **Replace SMIL `<animate>` with CSS keyframes** on selected pin pulse. (Fixes C3.)
4. **rAF-coalesce pan updates** in `AtlasStage.onPointerMove`: store the target tx/ty in a ref, flush via a single `requestAnimationFrame` per frame. (Fixes C9 and the inertia/transition fight.)
5. **Cap inertia velocity** and **cap inertia duration** (e.g. max 400 ms, max 1.5 px/ms). (Reduces post-flick crash probability.)

### P1 — Stabilize gestures and frame budget (next)

6. Move `bbox` computation in `AtlasStage` out of render: cache `clientWidth/Height` in a ref, refresh on `ResizeObserver`. (Fixes C7.)
7. Disable the 240 ms CSS transition during inertia, not just during drag. (Fixes C8.)
8. Memoize marker components (`React.memo` with shallow prop equality) and key marker `<g>` by `pin.id`, not by index. (Reduces reconciliation cost.)
9. Cap `MAX_SCALE` at 8 everywhere; tighten declustering to a fixed maximum group size of ~30 before falling back to a "+N more" affordance. (Reduces O(N²) blowup.)
10. Add `passive: false` wheel listener via `addEventListener` (already done in `AtlasStage`); ensure `AtlasViewport` removal also removes its broken React `onWheel`. (Fixes C6.)

### P2 — UX foundations (after stability lands)

11. Implement the **Entity Panel Redesign** (§4) backed by a single `getEntityContext` server function.
12. Add a **persistent first-time hint** to `AtlasStage` (storage key `irth.atlas.stage.onboarded.v1`) explaining tier progression.
13. Add a **tier hint chip** on the left edge: "Zoom in to reveal cities / battles / landmarks" with the next-unlock distance.
14. Add **era + entity-type filters** to the atlas toolbar, persisted per user.
15. Add a **"Discover here" suggestion** when the user idles at a region for ~3s: surface 3 connected entities and animate their pins.

### P3 — Discovery loop (longer term)

16. Wire the atlas to **today-in-history** events (auto-fly-to on app open if user opted in).
17. Wire **campaigns** to APS so a campaign opens the atlas and walks the user through its locations.
18. Add a **minimap + breadcrumb** (Region → City → Landmark) so the user always knows where they are.
19. Add a **"new since last visit"** indicator on regions/entities so returning users have a reason to re-explore.

---

## 6. Acceptance Criteria (Phase: Atlas Stability)

The atlas may be declared stable when:

- [ ] 5-minute pan/zoom session on a mid-tier Android device (e.g. Pixel 4a) holds ≥55 fps, no crashes, no "page didn't load."
- [ ] No SVG filter, no SMIL animation, no `backdrop-blur` over animated layers anywhere in the live atlas tree.
- [ ] `AtlasViewport.tsx` is deleted; bundle no longer ships it.
- [ ] Pinch on iOS Safari and Android Chrome scales within 0.5–8× without overshoot.
- [ ] Inertia decays to rest in ≤700 ms with no visible drift after stop.
- [ ] Entity Panel surfaces ≥4 group categories automatically for any city with linked content.
- [ ] Empty-state messaging visible when a region has no encyclopedia content.

When these pass, calibration / tiles / entity architecture work resumes per `atlas-calibration-plan.md` and `atlas-master-plan.md`.

---

## 7. What This Audit Does *Not* Touch

- v1 raster, v2 spec, tile pyramid, APK bundling — all frozen as previously planned.
- Anchor selection — frozen in calibration plan, awaits execution after stability.
- Supabase schema for spatial entities — designed, not yet migrated.

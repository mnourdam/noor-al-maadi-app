# Phase 3 — Cinematic World Atlas

Transform `/map` from a filter screen into a full-screen, zoom-driven exploration experience anchored on `encyclopedia_entities`. No new tables, no fake data, no enlargement of the current canvas.

## Experience model

Full-screen parchment atlas. The user pans and pinch/scroll-zooms a single continuous SVG world. Content reveals progressively across four zoom tiers:

```text
zoom 1.0 – 1.8x  Level 1  Regions          (الأندلس، الشام، العراق، ...)
zoom 1.8 – 3.5x  Level 2  Cities (hubs)    (دمشق، بغداد، مكة، القاهرة، قرطبة، ...)
zoom 3.5 – 6.0x  Level 3  Landmarks        (المسجد الحرام، بيت الحكمة، قبة الصخرة، ...)
zoom 6.0x +      Level 4  Historical items (figures / battles / events / artifacts)
```

Selecting a hub (city/landmark) opens a right-side **Hub Panel** listing every encyclopedia entity tied to that place — figures who lived there, battles fought there, events, artifacts — each linking to its encyclopedia page. This makes Jerusalem a hub for (فتح القدس، المسجد الأقصى، صلاح الدين، الأيوبية) and Baghdad for (بيت الحكمة، العباسيون، الرشيد، المأمون) purely from existing data.

A top control bar holds: era timeline scrubber, type filters (figure / battle / event / place / artifact), search, and "fit world" / "my last location".

A bottom-left compass shows current zoom tier label ("المستوى: المدن").

## Atlas architecture

```text
src/routes/map.tsx
  └── <AtlasShell/>                full-screen, hides AppShell chrome
        ├── <AtlasControls/>       era + type + search + zoom tier readout
        ├── <AtlasStage/>          pan/zoom controller (single source of transform)
        │     └── <WorldAtlasCanvas/>   parchment, regions, references (existing, reused)
        │           ├── RegionsLayer        (visible tier 1+, labels fade by tier)
        │           ├── CitiesLayer         (tier 2+, clustered when dense)
        │           ├── LandmarksLayer      (tier 3+)
        │           └── EntitiesLayer       (tier 4, virtualized within viewport bbox)
        └── <HubPanel/>            slide-in detail, lists linked encyclopedia entities
```

Pan/zoom: a thin controller built on pointer events + wheel + touch pinch, writing a single `{x,y,scale}` transform to the SVG `<g>`. No external map lib — we keep the existing `WorldAtlasCanvas` SVG and just wrap it.

## Data model (no schema change)

Hubs are derived, not stored:
- A hub = an `encyclopedia_entities` row of type `place` (city or landmark) that has `metadata.coords`.
- Linked entities = other enabled entities whose `metadata.region` matches the hub's region OR whose `metadata.linked_place_id` equals the hub id (already-supported optional field; populated later via admin, no migration needed).
- Tier classification uses `metadata.place_tier ∈ {'city','landmark'}`; rows without it default to `city` for places inside a region, `landmark` otherwise. This is additive metadata — no SQL.

A new `src/lib/atlas-hubs.ts` exposes:
- `useAtlasLayers(filters)` → memoized `{ regions, cities, landmarks, entities }` derived from `world-map-source`.
- `useHubEntities(hubId)` → linked encyclopedia entities for the side panel.

## Performance

- Single SVG, one transform — no re-render per pan frame (use `requestAnimationFrame` + ref-applied `transform`).
- Tier-gated rendering: layers only mount when zoom enters their range.
- Marker clustering for cities/landmarks when more than N fall inside a 40px screen radius (simple grid hash, not d3).
- Viewport culling for tier 4 entities (bbox test before render).
- Labels use CSS `content-visibility: auto` and fade via opacity on tier change.
- Mobile: passive touch listeners, `touch-action: none` only on stage, momentum pan, no shadows on markers below tier 3.

## Files

Created
- `src/components/atlas/AtlasShell.tsx`
- `src/components/atlas/AtlasStage.tsx` (pan/zoom controller)
- `src/components/atlas/AtlasControls.tsx`
- `src/components/atlas/HubPanel.tsx`
- `src/components/atlas/useAtlasZoom.ts`
- `src/lib/atlas-hubs.ts`

Modified
- `src/routes/map.tsx` — replace current list+canvas layout with `<AtlasShell/>`.
- `src/components/WorldAtlasCanvas.tsx` — accept `zoomTier`, expose layer slots, keep `editMode` for `/admin/map`.

Untouched
- `src/lib/world-map-source.ts`, `src/lib/atlas-regions.ts`, `/admin/map`, all encyclopedia routes, DB schema.

## Out of scope (later phases)

- Animated timeline playback, campaign routes, fog-of-discovery, conquest layers — atlas structure leaves layer slots open for them.

## Verification

`tsc --noEmit` + app build after implementation; Playwright smoke on `/map` to confirm pan, zoom-tier transitions, and hub panel open from a known city (e.g. بغداد).

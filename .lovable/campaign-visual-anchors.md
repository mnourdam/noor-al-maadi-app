# Irth — Campaign Visual Anchor Ledger

**Status:** scaffold. To be filled during Phase 2 (Full Campaign Audit).
**Rule:** No Key Art may be generated for a campaign until its anchor row here is filled and approved. The artwork must be built around this anchor — never around the title alone.

Each anchor row is the source of truth for that campaign's visual identity. A campaign becomes instantly recognizable when its Key Art faithfully renders its Signature Landmark under its Dominant Atmosphere with its Symbolic Object present.

## Anchor schema (one row per campaign)

| Field | Meaning |
|---|---|
| `id` | Canonical campaign id (matches `admin_campaigns.id`). |
| `title_ar` | Arabic title as shown to players. |
| `era` / `world` | Era key and world slug. |
| `years` | Hijri and Gregorian range. |
| `signature_landmark` | The one place / structure / vista that visually IS this campaign (e.g. Cave of Hira ridge at dawn; the wells of Badr; the walls of Constantinople). |
| `dominant_atmosphere` | Time of day, weather, air quality. One line. |
| `symbolic_object(s)` | 1–3 anchoring props that must appear or be strongly implied (banner, scroll, oil lamp, sword hilt, water skin). |
| `emotional_tone` | The single feeling the frame must transmit (contemplation, awe, resolve, sorrow, triumph, vigilance). |
| `composition_intent` | Wide vista / intimate close / architectural / caravan silhouette / interior scholarship, etc. |
| `figure_policy` | Face rule per Style Guide v1: `none` (Prophet/Companions — silhouettes / back-turned / environmental only), `silhouette-only`, `crowd-distance`, `named-later-figures-ok`. |
| `forbidden` | Explicit exclusions (anachronistic elements, invented architecture, specific iconography). |
| `reference_notes` | Cited historical / architectural / textile references used to ground the render. |

## Priority queue

Pilot must be filled first, then in chronological order.

- [ ] `prophetic-mission` — **PILOT** (Iqra / Cave of Hira anchor)
- [ ] `secret-dawah`
- [ ] `public-call-and-boycott`
- [ ] `migration-to-abyssinia`
- [ ] `year-of-sorrow-and-taif`
- [ ] `building-the-prophetic-state`
- [ ] `migration-to-madinah`
- [ ] `battle-of-badr-campaign`
- [ ] `battle-of-uhud-campaign`
- [ ] `battle-of-khandaq-campaign`
- [ ] `treaty-of-hudaybiyyah-campaign`
- [ ] `hunayn-and-taif-campaign`
- [ ] `conquest-of-makkah-campaign`
- [ ] `tabuk-campaign`
- [ ] `farewell-pilgrimage-and-prophet-death`
- [ ] `abu-bakr-caliphate`
- [ ] `ridda-wars-campaign`
- [ ] `futuh-iraq`
- [ ] `futuh-al-sham`
- [ ] `great-conquests-yarmouk-qadisiyyah`
- [ ] `madain-and-nihawand`
- [ ] `conquest-of-egypt`
- [ ] `uthman-and-quran-standardization`
- [ ] `martyrdom-of-umar-and-caliphate-of-uthman`
- [ ] `ali-and-the-great-fitnah`
- [ ] `rise-of-the-umayyad-state`
- [ ] `muawiya-and-state-building`
- [ ] `umayyad-siege-of-constantinople`
- [ ] `arabization-and-reforms-of-abd-almalik`
- [ ] `conquest-of-sindh-and-transoxiana`
- [ ] `umayyad-golden-age`
- [ ] `conquest-of-al-andalus`
- [ ] `peak-of-umayyad-power`
- [ ] `battle-of-tours`
- [ ] `fall-of-umayyads`
- [ ] `founding-of-abbasid-state`
- [ ] `abd-al-rahman-al-dakhil`
- [ ] `baghdad-capital-of-the-world`
- [ ] `harun-alrashid`
- [ ] `house-of-wisdom`
- [ ] _…continues; full ledger populated during Phase 2 audit._

---

## Pilot draft — `prophetic-mission` (Iqra / Cave of Hira)

_This row is a draft to be reviewed alongside 2–3 Key Art directions. It sets the pattern every other row will follow._

| Field | Value |
|---|---|
| `id` | `prophetic-mission` |
| `title_ar` | حملة البعثة النبوية |
| `era` / `world` | Prophetic era / Meccan world |
| `years` | 610م – 613م (before Hijrah) |
| `signature_landmark` | Ridge of **Jabal an-Nur** with the mouth of the **Cave of Hira** visible in profile at pre-dawn; Makkah's basin faintly readable far below. |
| `dominant_atmosphere` | Cold pre-dawn blue giving way to first warm gold along the ridge; utterly still air; no wind, no dust; a single point of warmth (implied from within the cave). |
| `symbolic_object(s)` | (1) faint interior glow from the cave mouth (the moment of revelation, never depicted literally); (2) worn footpath up the ridge; (3) distant silhouette of the Kaaba enclosure below, small and quiet. |
| `emotional_tone` | Contemplation on the edge of transformation. Stillness, not drama. |
| `composition_intent` | Wide vista, low horizon (bottom third), ridge as diagonal from lower-right to upper-left, generous negative sky for UI overlay. |
| `figure_policy` | `none` — no figures. The place carries the story. |
| `forbidden` | No depiction of the Prophet ﷺ or Jibrīl عليه السلام; no calligraphy inside the frame; no anachronistic Makkah skyline (modern towers, expansion works); no fantasy light rays radiating from the cave mouth. |
| `reference_notes` | Geological profile of Jabal an-Nur (granite, weathered); pre-Islamic Makkah basin scale references; historical distance ≈ 3.2 km NE of the Kaaba. |

---

## Style compliance checklist (applied per campaign before render)

- [ ] Signature landmark is present and unmistakable at 128px thumbnail.
- [ ] Palette holds warm gold + deep navy discipline (no purple/teal blockbuster grade).
- [ ] One dominant warm light source; volumetric only where physically motivated.
- [ ] No text, no logos, no watermarks baked into the frame.
- [ ] Figure policy respected; face rules obeyed.
- [ ] Negative space available top-left / top-right for UI overlay.
- [ ] Historically cited references — no invented architecture, garments, weapons.
- [ ] Reads as the same studio hand as the previously approved batches.

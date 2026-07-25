# Irth — Campaign Visual DNA Ledger

**Status:** scaffold. To be filled during Phase 2 (Full Campaign Audit).

**Rule (permanent, frozen):** Every campaign must receive a **Visual DNA** record — not just a Visual Anchor. The Visual Anchor (Signature Landmark + Signature Object + Emotional Tone + figure policy + forbidden list) is a **subset** of the Visual DNA. No artwork of any kind — Hero Key Art, Story cover, promotional artwork, future expansions — may be generated for a campaign until its Visual DNA row is filled and approved. Once approved, the Visual DNA is **frozen** and reused consistently across the entire Irth ecosystem so the campaign carries one permanent visual identity everywhere it appears.

Each Visual DNA row is the single source of truth for that campaign's visual identity. A campaign becomes instantly recognizable when every artwork made for it faithfully renders its Signature Landmark under its Lighting Style and Weather/Atmosphere, with its Signature Object present, framed in its Camera Language, expressing its Emotional Tone — while its Primary Color Palette holds the frame together and its Forbidden Elements are strictly excluded.

## Visual DNA schema (one row per campaign)

The Visual DNA has **two layers**: the eight frozen identity fields (Layer 1) and the supporting production guardrails (Layer 2). Both must be filled before approval.

### Layer 1 — Visual DNA (frozen identity, 8 fields)

| Field | Meaning |
|---|---|
| `primary_color_palette` | 3–5 disciplined hues that define the campaign's frame (e.g. warm gold, deep navy, granite grey, ember orange). Named + descriptive; hex not required at authoring time. |
| `lighting_style` | The single dominant lighting condition (dawn, sunrise, high noon, golden hour, sunset, dusk, moonlight, lamp/torch light, storm, overcast). |
| `weather_atmosphere` | Air, sky, particulate, temperature feel (still cold air, dust-hazed heat, humid coastal wind, rain squall, dry desert clarity). |
| `signature_landmark` | The one place / structure / vista that visually IS this campaign (e.g. Cave of Hira ridge; the wells of Badr; the walls of Constantinople). |
| `signature_object` | 1–3 anchoring props that must appear or be strongly implied (banner, scroll, oil lamp, sword hilt, water skin, astrolabe). |
| `emotional_tone` | The single feeling the frame must transmit (contemplation, awe, resolve, sorrow, triumph, vigilance). |
| `camera_language` | Framing intent: wide landscape, intimate close scene, architectural interior, aerial / bird's-eye, caravan silhouette, low-angle heroic, over-the-shoulder witness. |
| `forbidden_elements` | Explicit exclusions (anachronistic elements, invented architecture, specific iconography, faces of Prophets/Companions, fantasy light rays, modern skylines). |

### Layer 2 — Anchor context (production guardrails)

| Field | Meaning |
|---|---|
| `id` | Canonical campaign id (matches `admin_campaigns.id`). |
| `title_ar` | Arabic title as shown to players. |
| `era` / `world` | Era key and world slug. |
| `years` | Hijri and Gregorian range. |
| `figure_policy` | Face rule per Style Guide v1: `none` (Prophet/Companions — silhouettes / back-turned / environmental only), `silhouette-only`, `crowd-distance`, `named-later-figures-ok`. |
| `reference_notes` | Cited historical / architectural / textile references used to ground the render. |

**Freeze rule:** once a Visual DNA row is approved, none of the eight Layer 1 fields may be silently changed. Any revision requires an explicit re-approval turn and must be reflected everywhere the campaign appears.

**Phase 2 rule:** during the full campaign audit, every published campaign must receive **both** a Visual Anchor **and** a complete Visual DNA row before any artwork is generated. Artwork generation begins only after the full audit is finished and approved.

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

_This row is a draft to be reviewed alongside 2–3 Key Art directions. It sets the pattern every other Visual DNA row will follow._

**Layer 1 — Visual DNA**

| Field | Value |
|---|---|
| `primary_color_palette` | Cold pre-dawn indigo, deep navy, granite grey-brown of Jabal an-Nur, first warm gold along the ridge crest, single warm ember tone from the cave mouth. |
| `lighting_style` | Pre-dawn — cold ambient sky light with the very first warm rim of sunrise catching the ridge; a single motivated warm point-source implied from within the cave. |
| `weather_atmosphere` | Utterly still, cold, clear desert air; no wind, no dust, no cloud; high altitude clarity; hushed silence made visible. |
| `signature_landmark` | Ridge of **Jabal an-Nur** with the mouth of the **Cave of Hira** visible in profile; Makkah's basin faintly readable far below. |
| `signature_object` | (1) faint interior glow from the cave mouth (moment of revelation, never depicted literally); (2) worn footpath up the ridge; (3) distant silhouette of the Kaaba enclosure below, small and quiet. |
| `emotional_tone` | Contemplation on the edge of transformation. Stillness, not drama. |
| `camera_language` | Wide landscape vista; low horizon (bottom third); ridge as diagonal from lower-right to upper-left; generous negative sky for UI overlay. |
| `forbidden_elements` | No depiction of the Prophet ﷺ or Jibrīl عليه السلام; no calligraphy inside the frame; no anachronistic Makkah skyline (modern towers, expansion works); no fantasy light rays radiating from the cave mouth; no crowds; no visible text. |

**Layer 2 — Anchor context**

| Field | Value |
|---|---|
| `id` | `prophetic-mission` |
| `title_ar` | حملة البعثة النبوية |
| `era` / `world` | Prophetic era / Meccan world |
| `years` | 610م – 613م (before Hijrah) |
| `figure_policy` | `none` — no figures. The place carries the story. |
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

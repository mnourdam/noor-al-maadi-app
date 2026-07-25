// ============================================================
// Offline Campaign Key Art Pack — local-first source of truth
// ------------------------------------------------------------
// Campaign Key Art is an APPLICATION ASSET, not remote content.
// Exactly like the Premium Historical Emblems pack, all approved
// artwork ships inside the build under:
//
//   /campaign-key-art/<campaign_id>/hero.webp     (16:9, 1280w)
//   /campaign-key-art/<campaign_id>/square.webp   (1:1, 640px)
//
// Resolution order enforced by `src/lib/campaign-key-art.ts`:
//
//   1. Local bundled asset      ← always first, zero network
//   2. Signed storage URL       ← only for artwork newer than APK
//   3. Legacy fallback          ← gradient / coverImage
//
// Never the opposite. Airplane mode on first launch must render
// Home Hero, Continue Journey, Campaign Details, Worlds and every
// campaign card with no request, no wait, no placeholder.
//
// Regenerate with: `node scripts/build-campaign-art-pack.mjs`
// (integrity manifest lives at /campaign-key-art/manifest.json).
// ============================================================

export type CampaignArtAspect = "hero" | "square";

/** Every campaign_id bundled in this build. Frozen, O(1) lookup. */
export const OFFLINE_CAMPAIGN_ART_IDS: ReadonlySet<string> = new Set([
  "abbasid-between-power-and-weakness",
  "abd-al-rahman-al-dakhil",
  "abu-bakr-caliphate",
  "al-zahir-baybars-and-the-revival-of-islamic-power",
  "ali-and-the-great-fitnah",
  "almamun-translation-movement",
  "arabization-and-reforms-of-abd-almalik",
  "ayyubid-dynasty",
  "baghdad-capital-of-the-world",
  "battle-of-ain-jalut",
  "battle-of-ankara",
  "battle-of-badr-campaign",
  "battle-of-khandaq-campaign",
  "battle-of-kosovo",
  "battle-of-tours",
  "battle-of-uhud-campaign",
  "battle-of-zallaqa",
  "beginning-of-ottoman-decline",
  "building-the-prophetic-state",
  "conquest-of-al-andalus",
  "conquest-of-constantinople",
  "conquest-of-egypt",
  "conquest-of-makkah-campaign",
  "conquest-of-sindh-and-transoxiana",
  "cordoba-golden-age",
  "crusades-beginning-danger",
  "fall-of-al-andalus",
  "fall-of-toledo",
  "fall-of-umayyads",
  "farewell-pilgrimage-and-prophet-death",
  "founding-of-abbasid-state",
  "futuh-al-sham",
  "futuh-iraq",
  "great-conquests-yarmouk-qadisiyyah",
  "harun-alrashid",
  "house-of-wisdom",
  "hunayn-and-taif-campaign",
  "imad-aldin-zengi",
  "madain-and-nihawand",
  "mamluk-sultanate",
  "martyrdom-of-umar-and-caliphate-of-uthman",
  "migration-to-abyssinia",
  "migration-to-madinah",
  "mongol-invasion-mashriq",
  "mongols-and-fall-of-baghdad",
  "muawiya-and-state-building",
  "nur-aldin-mahmud",
  "ottoman-decline-and-reforms",
  "ottoman-expansion-anatolia-balkans",
  "ottoman-golden-age",
  "ottoman-reunification",
  "peak-of-umayyad-power",
  "prophetic-mission",
  "public-call-and-boycott",
  "ridda-wars-campaign",
  "rise-of-the-ottoman-state",
  "rise-of-the-umayyad-state",
  "salah-al-din-and-liberation-of-jerusalem",
  "samarra-and-turkish-guard",
  "secret-dawah",
  "selim-i-annexation-of-the-mashriq",
  "tabuk-campaign",
  "taifa-kings",
  "treaty-of-hudaybiyyah-campaign",
  "umayyad-caliphate-in-al-andalus",
  "umayyad-golden-age",
  "umayyad-siege-of-constantinople",
  "uthman-and-quran-standardization",
  "world-war-one-and-fall-of-caliphate",
  "year-of-sorrow-and-taif",]);

/** Local, same-origin path for a bundled campaign artwork. */
export function localCampaignArtPath(
  campaignId: string | null | undefined,
  aspect: CampaignArtAspect,
): string | null {
  if (!campaignId || !OFFLINE_CAMPAIGN_ART_IDS.has(campaignId)) return null;
  return `/campaign-key-art/${campaignId}/${aspect === "square" ? "square" : "hero"}.webp`;
}

/** True when the artwork ships with the app — no CDN needed. */
export function hasOfflineCampaignArt(campaignId: string | null | undefined): boolean {
  return !!campaignId && OFFLINE_CAMPAIGN_ART_IDS.has(campaignId);
}

/**
 * Storage paths are always `<campaign_id>/<file>` (frozen pipeline),
 * so a stored path alone is enough to find its bundled twin. The
 * aspect is inferred from the filename (`*square*` → 1:1).
 */
export function localCampaignArtPathForStoragePath(
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const [id, ...rest] = storagePath.split("/");
  if (!id || rest.length === 0) return null;
  const aspect: CampaignArtAspect = /square/i.test(rest.join("/")) ? "square" : "hero";
  return localCampaignArtPath(id, aspect);
}

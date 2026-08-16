// ============================================================
// Library vs Campaign Intro — the single client-side predicate
// ------------------------------------------------------------
// Server truth lives in `public.story_is_campaign_intro(...)`, which
// already removes campaign intros from `list_stories_v3` /
// `list_stories_guest_v3` and refuses to serve them from
// `get_story_bundle_v2`.
//
// This module is the OFFLINE / defence-in-depth mirror of that rule.
// The offline snapshot intentionally still ships intro rows (the
// campaign intro player reads them), so every library surface that
// reads the snapshot must filter with exactly this predicate.
//
// Classification NEVER uses title, slug, id prefix or ordering:
//   1. metadata.kind === 'campaign_intro'   (official field)
//   2. tags contains 'campaign-intro'       (import/export mirror)
//   3. a campaign's data.intro_story_id points at the story
// ============================================================
export const CAMPAIGN_INTRO_KIND = "campaign_intro";
export const CAMPAIGN_INTRO_TAG = "campaign-intro";
function tagList(tags) {
    return Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];
}
function metadataOf(row) {
    const m = row.metadata;
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
}
/**
 * True when the story is a campaign intro.
 * `introStoryIds` is the optional set of `admin_campaigns.data.intro_story_id`
 * values (offline snapshot), which catches intros authored before the
 * metadata/tag conventions existed.
 */
export function isCampaignIntroRow(row, introStoryIds) {
    if (!row)
        return false;
    if (metadataOf(row).kind === CAMPAIGN_INTRO_KIND)
        return true;
    if (tagList(row.tags).includes(CAMPAIGN_INTRO_TAG))
        return true;
    const id = typeof row.id === "string" ? row.id : null;
    return !!(id && introStoryIds?.has(id));
}
/** Library content = everything that is not a campaign intro. */
export function keepLibraryStories(rows, introStoryIds) {
    return rows.filter((r) => !isCampaignIntroRow(r, introStoryIds));
}
/** Collects `data.intro_story_id` from campaign rows (snapshot shape). */
export function introStoryIdsFromCampaigns(rows) {
    const out = new Set();
    if (!Array.isArray(rows))
        return out;
    for (const raw of rows) {
        if (!raw || typeof raw !== "object")
            continue;
        const data = raw.data;
        const id = data && typeof data === "object"
            ? data.intro_story_id
            : undefined;
        if (typeof id === "string" && id.trim())
            out.add(id.trim());
    }
    return out;
}

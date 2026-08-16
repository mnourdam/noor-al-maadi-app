// ============================================================
// Stories P2 — Processing presets (FROZEN)
// ------------------------------------------------------------
// A preset is a stable identifier for the (dimension cap, size
// target, encoder settings) used to produce a `story_media` row.
// The identifier is written to `story_media.preset` and never
// re-interpreted — treat it as opaque outside this file.
//
// IMMUTABILITY RULE (do not violate):
//   Changing dimensions, quality, or the processing algorithm
//   MUST create a new preset id (bumped suffix, e.g. `.v2`) and
//   MUST bump `processingVersion`. Never edit an existing preset
//   in place — old rows already carry the old id/version and the
//   player will render them for years.
//
// Ownership (see `story_media.owner_scope`) is orthogonal to
// preset selection: the same preset can produce story or collection bytes.
// ============================================================
export const STORY_MEDIA_PRESETS = {
    cover: {
        id: "story.cover.v1",
        processingVersion: 1,
        kind: "cover",
        maxLongestSide: 1600,
        targetBytes: 220 * 1024,
        minQuality: 0.6,
        minLongestSide: 900,
        bucket: "story-media",
        contentType: "image/webp",
    },
    scene: {
        id: "story.scene.v1",
        processingVersion: 1,
        kind: "scene",
        maxLongestSide: 1400,
        targetBytes: 180 * 1024,
        minQuality: 0.58,
        minLongestSide: 800,
        bucket: "story-media",
        contentType: "image/webp",
    },
    document: {
        id: "story.document.v1",
        processingVersion: 1,
        kind: "document",
        maxLongestSide: 1600,
        targetBytes: 240 * 1024,
        minQuality: 0.62,
        minLongestSide: 900,
        bucket: "story-media",
        contentType: "image/webp",
    },
    thumbnail: {
        id: "story.thumbnail.v1",
        processingVersion: 1,
        kind: "thumbnail",
        maxLongestSide: 480,
        targetBytes: 40 * 1024,
        minQuality: 0.55,
        minLongestSide: 240,
        bucket: "story-media",
        contentType: "image/webp",
    },
};
export function getPreset(kind) {
    return STORY_MEDIA_PRESETS[kind];
}
/** Every registered preset id — used by tests to detect accidental renames. */
export function allPresetIds() {
    return Object.values(STORY_MEDIA_PRESETS).map((p) => p.id).sort();
}
/** Map a preset into the shape `processImage()` expects. */
export function presetToProcessingOptions(p) {
    return {
        maxLongestSide: p.maxLongestSide,
        targetBytes: p.targetBytes,
        minQuality: p.minQuality,
        minLongestSide: p.minLongestSide,
    };
}
// ------------------------------------------------------------
// Card cover derivative (offline pack)
// ------------------------------------------------------------
// NOT part of the frozen `STORY_MEDIA_PRESETS` record: this preset
// never produces a `story_media` row. It produces the tiny 3:4 card
// image that ships in the offline Story Cover pack and is delta-synced
// for stories newer than the installed build. Budget: 10–20KB.
// Immutability rule applies: bump the id, never edit in place.
export const STORY_CARD_COVER_PRESET = {
    id: "story.cover.card.v1",
    processingVersion: 1,
    kind: "cover",
    maxLongestSide: 480,
    targetBytes: 18 * 1024,
    minQuality: 0.42,
    minLongestSide: 360,
    bucket: "story-media",
    contentType: "image/webp",
};
/** Storage prefix for card derivatives — kept out of preset-id space. */
export const STORY_CARD_COVER_PREFIX = "story.cover.card/v1";

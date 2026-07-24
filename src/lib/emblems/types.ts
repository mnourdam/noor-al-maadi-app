// ============================================================
// Premium Historical Emblems — Frozen Contract (Phase 9 / Phase 0)
// ------------------------------------------------------------
// Canonical type contract for the new Emblem registry.
//
// Notes:
//  - `id` mirrors the legacy `avatar_id` so no player is ever
//    forced to re-pick their emblem.
//  - Every asset URL field is nullable: real Premium AVIF/WebP
//    files are produced offline and uploaded later. Until then,
//    consumers render the Legacy SVG (`AvatarArt`) fallback.
//  - Rarity here is the NORMALIZED set (no `uncommon`). The
//    resolver maps the legacy `uncommon` value to `rare`.
// ============================================================

export type EmblemCategory =
  | "banner"
  | "symbol"
  | "weapon"
  | "knowledge"
  | "role"
  | "place"
  | "tool";

export type EmblemRarity = "common" | "rare" | "epic" | "legendary";

export type EmblemStatus = "draft" | "published" | "retired";

export type EmblemUnlockKind =
  | "always"
  | "level"
  | "achievement"
  | "campaign_complete"
  | "investigation_complete"
  | "story_complete"
  | "museum_item_owned"
  | "streak_milestone"
  | "admin_grant"
  | "event";

/**
 * Versioned unlock specification. Persisted verbatim inside the
 * emblem row so we can evolve the DSL without a migration.
 * Phase 9 ships v1 with `always` only wired; other kinds are
 * accepted at the type level so authoring can proceed but the
 * evaluator will treat them as "not yet enforced" (see notes in
 * `unlock-spec.ts`).
 */
export interface EmblemUnlockSpecV1 {
  version: 1;
  expr:
    | { type: "always" }
    | { type: "level"; min: number }
    | { type: "achievement"; achievement_id: string }
    | { type: "campaign_complete"; campaign_id: string }
    | { type: "investigation_complete"; investigation_id: string }
    | { type: "story_complete"; story_id: string }
    | { type: "museum_item_owned"; entity_id: string }
    | { type: "streak_milestone"; days: number }
    | { type: "admin_grant" }
    | { type: "event"; event_id: string };
}

export type EmblemUnlockSpec = EmblemUnlockSpecV1;

export interface EmblemAssetSet {
  asset_128_url: string | null;
  asset_256_url: string | null;
  asset_512_url: string | null;
  asset_1024_url: string | null;
  asset_webp_url: string | null; // convenience alias for the "best webp"
  asset_avif_url: string | null; // convenience alias for the "best avif"
  transparent_background: boolean;
  dominant_color: string | null; // hex, e.g. "#c9a24a"
  fallback_glyph: string;        // single unicode rune for canvas fallback
  fallback_svg_key: string;      // key into legacy <AvatarArt />
}

export interface EmblemRecord extends EmblemAssetSet {
  id: string;                 // stable, immutable, == legacy avatar_id
  slug: string;               // stable url-safe slug
  name_ar: string;
  name_en: string;
  category: EmblemCategory;
  rarity: EmblemRarity;
  status: EmblemStatus;
  display_order: number;
  unlock_method: EmblemUnlockKind;
  unlock_spec: EmblemUnlockSpec;
  asset_version: number;      // bump when re-rendering the source
  visual_version: number;     // bump when frame/overlay design changes
  legacy_avatar_id: string;   // == id for now; kept for the audit
  metadata: {
    art_direction?: string;   // Arabic art-direction note for the 3D pass
    intended_shot?: "portrait" | "artifact" | "banner" | "landmark";
  };
  created_at: string;
  updated_at: string;
}

export interface ResolvedEmblem {
  record: EmblemRecord;
  /** True when a Premium raster asset is available for at least one size. */
  hasPremiumAsset: boolean;
  /** The legacy `AvatarArt` key to render when no premium asset exists. */
  legacyKey: string;
}

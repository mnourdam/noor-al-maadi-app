// ============================================================
// Emblem asset manifest helpers
// ------------------------------------------------------------
// Contract for future CDN-hosted premium assets. Every asset URL
// today is `null` — real files are rendered offline (Blender /
// hand-painted) and uploaded later. The `<EmblemArt />` component
// gracefully falls back to the legacy SVG until then.
//
// Convention (documented, NOT auto-generated):
//   /emblems/<id>/<size>.<ext>
//     sizes: 128, 256, 512, 1024
//     ext:   webp | avif
//
// Cache key = `${id}@v${asset_version}-${visual_version}` — used
// by the resolver when we later switch on CDN URLs.
// ============================================================

import type { EmblemAssetSet, EmblemRecord } from "./types";

export type EmblemSize = 128 | 256 | 512 | 1024;
export type EmblemFormat = "webp" | "avif";

export function pickAssetUrl(
  record: EmblemRecord,
  size: EmblemSize,
  format: EmblemFormat,
): string | null {
  // Prefer size+format exact match; then convenience aliases; then null.
  const bySize: Record<EmblemSize, keyof EmblemAssetSet> = {
    128: "asset_128_url",
    256: "asset_256_url",
    512: "asset_512_url",
    1024: "asset_1024_url",
  };
  const exact = record[bySize[size]];
  if (typeof exact === "string" && exact.length > 0) return exact;
  const alias = format === "avif" ? record.asset_avif_url : record.asset_webp_url;
  return typeof alias === "string" && alias.length > 0 ? alias : null;
}

export function cacheKey(record: EmblemRecord): string {
  return `${record.id}@v${record.asset_version}-${record.visual_version}`;
}

export function hasAnyAsset(record: EmblemRecord): boolean {
  return Boolean(
    record.asset_128_url ||
      record.asset_256_url ||
      record.asset_512_url ||
      record.asset_1024_url ||
      record.asset_webp_url ||
      record.asset_avif_url,
  );
}

/** Empty asset set used by every seed record until real files are uploaded. */
export const EMPTY_ASSETS: EmblemAssetSet = {
  asset_128_url: null,
  asset_256_url: null,
  asset_512_url: null,
  asset_1024_url: null,
  asset_webp_url: null,
  asset_avif_url: null,
  transparent_background: true,
  dominant_color: null,
  fallback_glyph: "★",
  fallback_svg_key: "star",
};

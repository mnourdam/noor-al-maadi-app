// ============================================================
// resolveProfileEmblem — single entry point for every surface
// ------------------------------------------------------------
// Rules (frozen):
//  1. Look up the id in the new EMBLEM_REGISTRY.
//  2. If not found, apply the legacy id remap (delegated to
//     `getAvatar` so we never diverge from the historical map).
//  3. If still not found, return the DEFAULT_AVATAR_ID record.
//  4. If a Premium asset exists → prefer it in `<EmblemArt />`.
//  5. Otherwise `<EmblemArt />` renders the Legacy SVG fallback.
// No caller is ever forced to re-pick a saved avatar_id.
// ============================================================

import { DEFAULT_AVATAR_ID, getAvatar } from "@/lib/avatars";
import { EMBLEM_REGISTRY, getEmblemRecord } from "./registry";
import { hasAnyAsset } from "./asset-manifest";
import type { ResolvedEmblem } from "./types";

export function resolveProfileEmblem(avatarId?: string | null): ResolvedEmblem {
  // 1) direct hit
  if (avatarId) {
    const direct = getEmblemRecord(avatarId);
    if (direct) {
      return {
        record: direct,
        hasPremiumAsset: hasAnyAsset(direct),
        legacyKey: direct.fallback_svg_key,
      };
    }
    // 2) legacy id remap — reuse the historical map in getAvatar()
    const legacy = getAvatar(avatarId);
    const remapped = getEmblemRecord(legacy.id);
    if (remapped) {
      return {
        record: remapped,
        hasPremiumAsset: hasAnyAsset(remapped),
        legacyKey: remapped.fallback_svg_key,
      };
    }
  }
  // 3) safe default
  const fallback = getEmblemRecord(DEFAULT_AVATAR_ID) ?? EMBLEM_REGISTRY[0];
  return {
    record: fallback,
    hasPremiumAsset: hasAnyAsset(fallback),
    legacyKey: fallback.fallback_svg_key,
  };
}

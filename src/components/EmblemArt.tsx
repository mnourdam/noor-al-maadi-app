// ============================================================
// <EmblemArt /> — unified renderer for Premium Historical Emblems
// ------------------------------------------------------------
// - Uses the resolver so every surface (HUD, profile, picker,
//   community, inbox, share card) shares one code path.
// - Picks a raster size based on the requested display size.
// - Falls back to the legacy <AvatarArt /> SVG when no Premium
//   asset is authored yet, or when the raster fails to load.
// - Does NOT paint the rarity frame — that lives in
//   <EmblemRarityFrame /> so we can compose freely.
// ============================================================

import { useEffect, useState } from "react";
import { AvatarArt } from "./AvatarArt";
import { resolveProfileEmblem } from "@/lib/emblems/resolver";
import { pickAssetUrl, type EmblemSize } from "@/lib/emblems/asset-manifest";

export type EmblemVisualSize = "xs" | "sm" | "md" | "lg" | "xl" | "share";

const SIZE_TO_ASSET: Record<EmblemVisualSize, EmblemSize> = {
  xs: 128,
  sm: 128,
  md: 256,
  lg: 512,
  xl: 512,
  share: 1024,
};

export interface EmblemArtProps {
  avatarId?: string | null;
  size?: EmblemVisualSize;
  className?: string;
  /** Skip lazy loading for the player's own emblem in HUD/Profile. */
  eager?: boolean;
}

export function EmblemArt({
  avatarId,
  size = "md",
  className = "",
  eager = false,
}: EmblemArtProps) {
  const resolved = resolveProfileEmblem(avatarId);
  const target = SIZE_TO_ASSET[size];
  const avif = pickAssetUrl(resolved.record, target, "avif");
  const webp = pickAssetUrl(resolved.record, target, "webp");
  const [failed, setFailed] = useState(false);

  // Reset failure state if the avatar changes.
  useEffect(() => {
    setFailed(false);
  }, [resolved.record.id]);

  if (!resolved.hasPremiumAsset || failed || (!avif && !webp)) {
    return <AvatarArt id={resolved.legacyKey} className={className} />;
  }

  return (
    <picture>
      {avif && <source srcSet={avif} type="image/avif" />}
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={webp ?? avif ?? ""}
        alt={resolved.record.name_ar}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
        className={className}
        style={{ objectFit: "contain" }}
      />
    </picture>
  );
}

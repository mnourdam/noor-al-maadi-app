// ============================================================
// <EmblemArt /> — unified renderer for Premium Historical Emblems
// ------------------------------------------------------------
// - Uses the resolver so every surface (HUD, profile, picker,
//   community, inbox, share card) shares one code path.
// - Picks a raster size based on the requested display size.
// - Falls back to the frozen Premium default when a specific raster
//   fails to load. The legacy SVG renderer is not used here.
// - Does NOT paint the rarity frame — that lives in
//   <EmblemRarityFrame /> so we can compose freely.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { getEmblemRecord } from "@/lib/emblems/registry";
import { DEFAULT_PREMIUM_EMBLEM_ID, resolveProfileEmblem } from "@/lib/emblems/resolver";
import { emblemSourceCandidates, type EmblemSize } from "@/lib/emblems/asset-manifest";

export type EmblemVisualSize = "xs" | "sm" | "md" | "lg" | "xl" | "share";

// 512 is the largest bundled raster (see `offline-pack.ts`). Even the share
// surface draws well under 512 CSS px, so nothing requests 1024 anymore —
// that variant is CDN-only and would 404 offline.
const SIZE_TO_ASSET: Record<EmblemVisualSize, EmblemSize> = {
  xs: 128,
  sm: 128,
  md: 256,
  lg: 512,
  xl: 512,
  share: 512,
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
  const fallbackRecord = getEmblemRecord(DEFAULT_PREMIUM_EMBLEM_ID) ?? resolved.record;

  // One ordered, local-first candidate list: bundled WebP → CDN → legacy, and
  // finally the frozen Premium default. A single <img> walks the list on error,
  // so a missing CDN file can never blank out an emblem that ships offline.
  const sources = useMemo(() => {
    const primary = emblemSourceCandidates(resolved.record, target);
    const backup =
      fallbackRecord.id === resolved.record.id
        ? []
        : emblemSourceCandidates(fallbackRecord, target);
    return [...primary, ...backup.filter((u) => !primary.includes(u))];
  }, [resolved.record, fallbackRecord, target]);

  const [index, setIndex] = useState(0);

  // Reset the walk when the emblem (or size) changes.
  useEffect(() => {
    setIndex(0);
  }, [resolved.record.id, target]);

  const src = sources[Math.min(index, sources.length - 1)];
  if (!src) return null;

  return (
    <img
      src={src}
      alt={resolved.record.name_ar}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setIndex((i) => (i + 1 < sources.length ? i + 1 : i))}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}


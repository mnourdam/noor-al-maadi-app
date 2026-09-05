import { EmblemArt, type EmblemVisualSize } from "./EmblemArt";
import { resolveProfileEmblem, type EmblemRarity } from "@/lib/emblems";
import { Lock } from "lucide-react";

interface AvatarProps {
  avatarId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fallbackChar?: string;
  ring?: boolean;
  locked?: boolean;
  className?: string;
  /**
   * Override only the raster asset tier used for the emblem art, without
   * changing the rendered box size. Used by dense grids (avatar picker) to
   * avoid decoding 512px bitmaps into ~80-100px cells on Android.
   */
  artSize?: EmblemVisualSize;
}

const SIZE_MAP = {
  xs: { box: "size-7",  art: "size-5",  emblem: "xs" as const },
  sm: { box: "size-9",  art: "size-7",  emblem: "sm" as const },
  md: { box: "size-12", art: "size-9",  emblem: "md" as const },
  lg: { box: "size-16", art: "size-12", emblem: "lg" as const },
  xl: { box: "size-24", art: "size-20", emblem: "xl" as const },
} as const;

/**
 * Rarity → outer ring colour. Used as the collectible "tier" marker.
 * Tints chosen to read against the Irth dark-navy surface.
 */
const RARITY_RING: Record<EmblemRarity, string> = {
  common:    "ring-1 ring-gold/30",
  uncommon:  "ring-1 ring-gold/30",
  rare:      "ring-2 ring-sky-400/60",
  epic:      "ring-2 ring-violet-400/70",
  legendary: "ring-2 ring-gold/90 shadow-[0_0_18px_rgba(212,175,55,0.45)]",
};

/**
 * Irth Identity Emblem badge. Renders the chosen Premium Historical Emblem
 * on a deep navy disc with a rarity ring, via the unified <EmblemArt />
 * pipeline (offline pack → CDN → Premium default fallback). Emblems are part
 * of the brand identity — never emoji, never user-uploaded.
 */
export function Avatar({
  avatarId,
  size = "md",
  fallbackChar: _fallback,
  ring = true,
  locked = false,
  className = "",
  artSize,
}: AvatarProps) {
  const resolved = resolveProfileEmblem(avatarId);
  const sz = SIZE_MAP[size];
  const rarityRing = ring ? RARITY_RING[resolved.record.rarity] : "";
  return (
    <div
      aria-label={resolved.record.name_ar}
      title={resolved.record.name_ar}
      className={`relative grid place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#1b2a48_0%,#0a1426_70%)] overflow-hidden ${rarityRing} ${sz.box} ${className}`}
    >
      <EmblemArt avatarId={avatarId ?? resolved.record.id} size={artSize ?? sz.emblem} className={`${sz.art} text-gold`} />
      {locked && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-gold">
          <Lock className="size-1/3" />
        </span>
      )}
    </div>
  );
}

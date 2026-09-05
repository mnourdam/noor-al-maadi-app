// ============================================================
// <EmblemRarityFrame /> — decoupled rarity overlay
// ------------------------------------------------------------
// Presentation-only. Wraps its children (typically <EmblemArt />)
// with an aura/frame appropriate to the emblem rarity. Kept
// separate from the artwork so we can compose freely, respect
// `prefers-reduced-motion`, and disable animation in dense grids.
//
// Style intent (see Phase 9 vision):
//   common     — simple bronze/neutral ring
//   rare       — silver ring + soft cyan halo
//   epic       — gold ornate ring + violet-gold aura
//   legendary  — museum gold frame + slow shimmer halo
// ============================================================

import type { ReactNode } from "react";
import type { EmblemRarity } from "@/lib/emblems/types";

interface FrameStyle {
  ring: string;
  aura: string;
}

const STYLE: Record<EmblemRarity, FrameStyle> = {
  common: {
    ring: "ring-1 ring-white/20",
    aura: "",
  },
  // V17-08: `uncommon` is a real tier now; it reuses the `common` frame so
  // the frozen Emblems Style v1 art contract is untouched.
  uncommon: {
    ring: "ring-1 ring-white/20",
    aura: "",
  },
  rare: {
    ring: "ring-2 ring-sky-300/50",
    aura: "shadow-[0_0_24px_-8px_rgba(125,211,252,0.45)]",
  },
  epic: {
    ring: "ring-2 ring-fuchsia-300/60",
    aura: "shadow-[0_0_32px_-6px_rgba(232,121,249,0.55)]",
  },
  legendary: {
    ring: "ring-2 ring-[#d4af37]/80",
    aura: "shadow-[0_0_36px_-6px_rgba(212,175,55,0.6)]",
  },
};

export interface EmblemRarityFrameProps {
  rarity: EmblemRarity;
  children: ReactNode;
  /**
   * When true (default) subtle motion may be applied for epic /
   * legendary tiers. Always suppressed if the OS is set to
   * reduce motion, or when the caller passes false (long grids).
   */
  animated?: boolean;
  className?: string;
}

export function EmblemRarityFrame({
  rarity,
  children,
  animated = true,
  className = "",
}: EmblemRarityFrameProps) {
  const s = STYLE[rarity];
  const motion =
    animated && (rarity === "epic" || rarity === "legendary")
      ? "motion-safe:transition-shadow motion-safe:duration-700"
      : "";
  return (
    <div
      className={`relative grid place-items-center rounded-full ${s.ring} ${s.aura} ${motion} ${className}`}
    >
      {children}
    </div>
  );
}

// عوالم إرث — official world identity.
//
// Worlds are represented by the official Premium Emblem of each world.
// No hand-drawn glyphs, no emoji: the emblem library is the only source.

import { EmblemArt } from "@/components/EmblemArt";
import { worldEmblemId } from "@/lib/emblems/identity-map";

export function WorldEmblem({
  slug,
  className = "",
  size = "md",
}: {
  slug: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  return (
    <EmblemArt
      avatarId={worldEmblemId(slug)}
      size={size}
      className={`size-full object-contain ${className}`}
    />
  );
}

export default WorldEmblem;

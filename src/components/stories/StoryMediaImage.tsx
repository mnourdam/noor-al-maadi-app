// Shared image component for story media. Resolves a StoryMediaRow to a
// public URL and renders with intrinsic dimensions to prevent layout
// shift. Reused by admin preview and the player runtime so both stay
// pixel-identical.

import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { useStoryMediaUrl } from "@/lib/stories/media/url";

export function StoryMediaImage({
  media,
  alt,
  className,
  priority,
}: {
  media: StoryMediaRow | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const src = useStoryMediaUrl(media ?? null);
  if (!media) return null;
  return (
    <img
      src={src ?? undefined}
      alt={alt}
      width={media.width}
      height={media.height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      style={{ aspectRatio: `${media.width} / ${media.height}` }}
    />
  );
}

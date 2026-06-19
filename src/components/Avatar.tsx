import { getAvatar } from "@/lib/avatars";

interface AvatarProps {
  avatarId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fallbackChar?: string;
  ring?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: "size-7  text-sm",
  sm: "size-9  text-base",
  md: "size-12 text-xl",
  lg: "size-16 text-3xl",
  xl: "size-24 text-5xl",
} as const;

/**
 * Historical Avatar badge. Renders the selected glyph atop a gold gradient
 * disc. Used in profile, friends, public profile, ID card, compare & share.
 */
export function Avatar({ avatarId, size = "md", fallbackChar, ring = true, className = "" }: AvatarProps) {
  const a = avatarId ? getAvatar(avatarId) : null;
  const glyph = a?.glyph ?? fallbackChar ?? "★";
  return (
    <div
      aria-label={a?.name ?? "صورة شخصية"}
      className={`grid place-items-center rounded-full bg-gradient-gold text-primary-foreground select-none ${ring ? "shadow-gold ring-1 ring-gold/40" : ""} ${SIZE_MAP[size]} ${className}`}
    >
      <span className="leading-none">{glyph}</span>
    </div>
  );
}
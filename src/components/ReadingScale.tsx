import React from "react";
import { useProfile } from "@/lib/profile";

export type ReadingTextSize = "sm" | "md" | "lg";

/**
 * Wrap reading-heavy page content so typography scales independently
 * per the player's Reading Comfort preference. Navigation, hero, chips,
 * and other fixed UI should live OUTSIDE this wrapper (or use the
 * `.no-reading-scale` opt-out for islands inside reading content).
 */
export function ReadingScale({
  children,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  const { profile } = useProfile();
  const size = (profile?.settings?.textSize ?? "sm") as ReadingTextSize;
  const Comp = Tag as any;
  return (
    <Comp className={`irth-reading ${className}`} data-reading-size={size}>
      {children}
    </Comp>
  );
}

export default ReadingScale;

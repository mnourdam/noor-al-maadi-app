// ============================================================
// Campaign Artwork — Single Source of Truth (Irth Campaign Key
// Art System v1).
// ------------------------------------------------------------
// Every player-facing surface that displays a campaign image MUST
// route through this module. No surface reads `coverImage`,
// `key_art_path`, or hero backdrop assets directly. The resolver
// decides — for a given surface — whether to render:
//
//   1. Frozen Key Art (when a `key_art_path` / `key_art_square_path`
//      exists on the campaign row), OR
//   2. The caller's fallback (existing gradient / hero backdrop /
//      coverImage). Fallback behaviour is unchanged from before
//      this system existed, so campaigns without Key Art render
//      identically to today.
//
// Surface list (must stay exhaustive):
//
//   - home-hero        → Home Hero rotator background
//   - continue-journey → Home "واصل رحلتك" premium CTA
//   - world-card       → Worlds → recommended campaign thumbnail
//   - campaign-list    → /campaigns list card
//   - campaign-detail  → /campaigns/imported/:id header
//   - share-card       → Historical Identity share render
//
// Surfaces that do NOT currently display campaign artwork:
//
//   - Campaign List cards (`ImportedCampaignCard`) — gradient-only
//     tile. Documented; no wiring needed until visual redesign.
//   - Campaign Detail / Chapter routes — no header image today.
//   - Notifications — text/icon only, no per-campaign image.
//   - Share Card — renders emblem + stats, no campaign artwork.
//   - Android APK — shares the same route tree; wiring here is
//     APK-safe (uses signed URLs cached in-memory + offline
//     snapshot).
// ============================================================

import { useEffect, useState } from "react";
import type { Campaign } from "@/types/campaign";
import {
  pickCampaignKeyArtPath,
  resolveCampaignKeyArtUrl,
  type KeyArtAspect,
} from "@/lib/campaign-key-art";
import { CampaignKeyArt } from "@/components/CampaignKeyArt";
import type { ReactNode } from "react";

export type CampaignArtworkSurface =
  | "home-hero"
  | "continue-journey"
  | "world-card"
  | "campaign-list"
  | "campaign-detail"
  | "share-card";

const SURFACE_ASPECT: Record<CampaignArtworkSurface, KeyArtAspect> = {
  "home-hero":        "hero",
  "continue-journey": "hero",
  "world-card":       "square",
  "campaign-list":    "hero",
  "campaign-detail":  "hero",
  "share-card":       "square",
};

/** Minimal shape the resolver reads. Accepts both full `Campaign`
 *  objects and lighter admin rows. */
export interface CampaignArtworkInput {
  key_art_path?: string | null;
  key_art_square_path?: string | null;
  key_art_credit?: string | null;
  coverImage?: string;
}

/** True when a campaign has any Key Art path attached. */
export function hasCampaignKeyArt(c: CampaignArtworkInput | null | undefined): boolean {
  return !!(c && (c.key_art_path || c.key_art_square_path));
}

export function surfaceAspect(surface: CampaignArtworkSurface): KeyArtAspect {
  return SURFACE_ASPECT[surface];
}

/**
 * Legacy `coverImage` sanitizer — kept centralized so no surface
 * hand-rolls URL validation. Returns the URL only when it is an
 * http(s), data:, or absolute-path reference (matches the guard
 * that was previously copy-pasted across routes).
 */
export function sanitizedCoverImage(c: CampaignArtworkInput | null | undefined): string | null {
  const s = c?.coverImage;
  if (!s || typeof s !== "string") return null;
  return /^(https?:|data:|\/)/i.test(s) ? s : null;
}

// ------------------------------------------------------------
// URL hook — for surfaces that need a plain string URL (Home Hero
// backdrop, Continue Journey CachedImage src). Returns:
//   - `url`: best available URL (Key Art signed URL when ready,
//     otherwise `fallbackUrl`).
//   - `hasKeyArt`: static flag — surfaces can decorate accordingly.
// ------------------------------------------------------------
export function useCampaignArtworkUrl(
  campaign: CampaignArtworkInput | null | undefined,
  surface: CampaignArtworkSurface,
  fallbackUrl: string,
): { url: string; hasKeyArt: boolean } {
  const aspect = surfaceAspect(surface);
  const path = pickCampaignKeyArtPath(campaign ?? null, aspect);
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSigned(null);
    if (!path) return;
    (async () => {
      try {
        const url = await resolveCampaignKeyArtUrl(path);
        if (alive) setSigned(url);
      } catch {
        if (alive) setSigned(null);
      }
    })();
    return () => { alive = false; };
  }, [path]);

  return { url: signed ?? fallbackUrl, hasKeyArt: !!path };
}

// ------------------------------------------------------------
// JSX component — for surfaces that render an <img> or thumbnail.
// Delegates to the frozen <CampaignKeyArt /> primitive.
// ------------------------------------------------------------
export interface CampaignArtworkProps {
  campaign: CampaignArtworkInput | null | undefined;
  surface: CampaignArtworkSurface;
  /** Rendered when no Key Art exists (or resolution fails). */
  fallback: ReactNode;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
  sizes?: string;
}

export function CampaignArtwork({
  campaign,
  surface,
  fallback,
  alt,
  className,
  imgClassName,
  loading,
  sizes,
}: CampaignArtworkProps) {
  return (
    <CampaignKeyArt
      campaign={campaign ?? null}
      aspect={surfaceAspect(surface)}
      fallback={fallback}
      alt={alt}
      className={className}
      imgClassName={imgClassName}
      loading={loading}
      sizes={sizes}
    />
  );
}

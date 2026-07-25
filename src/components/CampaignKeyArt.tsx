// ============================================================
// <CampaignKeyArt /> — canonical surface component.
// ------------------------------------------------------------
// Single reuse point for every surface that displays a campaign's
// Key Art. Handles the three states uniformly:
//
//   1. Path present → resolve signed URL at runtime, render <img>.
//   2. Path absent   → render the caller's `fallback` (existing
//                      gradient / emblem / current visual). NEVER
//                      renders a broken image or placeholder icon.
//   3. Resolution failed → render `fallback` (paths are only
//                      cleared by the admin flow, so a transient
//                      sign failure must never blank the UI).
//
// Signed URLs are never persisted; they come from
// `resolveCampaignKeyArtUrl()` and are cached in-memory only.
// ============================================================

import { useEffect, useState } from "react";
import {
  pickCampaignKeyArtPath,
  resolveCampaignKeyArtUrl,
  resolveCampaignKeyArtUrlSync,
  type KeyArtAspect,
} from "@/lib/campaign-key-art";

export interface CampaignKeyArtRow {
  key_art_path?: string | null;
  key_art_square_path?: string | null;
  key_art_credit?: string | null;
}

interface Props {
  campaign: CampaignKeyArtRow | null | undefined;
  aspect: KeyArtAspect;
  /** Rendered when no Key Art exists or resolution fails. */
  fallback: React.ReactNode;
  /** Descriptive alt text (e.g. the campaign title). */
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
  sizes?: string;
}

export function CampaignKeyArt({
  campaign,
  aspect,
  fallback,
  alt,
  className = "",
  imgClassName = "h-full w-full object-cover",
  loading = "lazy",
  sizes,
}: Props) {
  const path = pickCampaignKeyArtPath(campaign, aspect);
  // Local-first: bundled artwork resolves synchronously on the very
  // first render — no request, no await, no loading flash, offline-safe.
  const [url, setUrl] = useState<string | null>(() => resolveCampaignKeyArtUrlSync(path));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    const immediate = resolveCampaignKeyArtUrlSync(path);
    setUrl(immediate);
    if (!path || immediate) return;
    (async () => {
      try {
        const resolved = await resolveCampaignKeyArtUrl(path);
        if (alive) setUrl(resolved);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [path]);

  if (!path || failed) {
    return <div className={className}>{fallback}</div>;
  }
  if (!url) {
    // Resolving — hold the fallback in place so layout does not shift.
    return <div className={className}>{fallback}</div>;
  }
  return (
    <div className={className}>
      <img
        src={url}
        alt={alt}
        loading={loading}
        sizes={sizes}
        className={imgClassName}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

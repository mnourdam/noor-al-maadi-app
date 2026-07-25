// ============================================================
// Campaign Key Art — storage helpers (paths-only persistence)
// ------------------------------------------------------------
// Mirrors src/lib/encyclopedia-images.ts but with two important
// rules baked in per Phase 1 acceptance:
//
//   1. We ONLY persist storage paths in admin_campaigns
//      (`key_art_path`, `key_art_square_path`). Signed URLs are
//      NEVER stored — they are minted at runtime by
//      `resolveCampaignKeyArtUrl()` and cached in-memory.
//
//   2. There is exactly ONE upload per campaign. Replace = new
//      upload + best-effort delete of the previous file (only
//      when the previous path lives under this campaign's own
//      prefix, so a manually shared file is never removed).
//
// All image processing happens in the browser via `image-processor.ts`.
// We produce a 16:9 hero master and a 1:1 square derivative from
// the same source so every surface in the app can pick the aspect
// it needs without a second upload flow.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { processImage, type ProcessedImage } from "./image-processor";

const BUCKET = "campaign-key-art";

/** Persistent fields — mirrors the migration columns. Paths only. */
export interface CampaignKeyArtFields {
  key_art_path: string | null;
  key_art_square_path: string | null;
  key_art_credit: string | null;
  key_art_source: string | null;
}

export type KeyArtAspect = "hero" | "square";

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

function stamp(): string {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${d}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPaths(campaignId: string): { hero: string; square: string } {
  const prefix = safeSegment(campaignId);
  const s = stamp();
  return {
    hero: `${prefix}/${s}.webp`,
    square: `${prefix}/${s}-sq.webp`,
  };
}

/** Crop the processed hero blob to a 1:1 square centered on the frame. */
async function makeSquareDerivative(hero: ProcessedImage, side = 1024): Promise<Blob> {
  const url = URL.createObjectURL(hero.blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("hero decode failed"));
      el.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.max(0, Math.floor((img.naturalWidth - s) / 2));
    const sy = Math.max(0, Math.floor((img.naturalHeight - s) / 2));
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(img, sx, sy, s, s, 0, 0, side, side);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("square encode failed"))),
        "image/webp",
        0.86,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface UploadCampaignKeyArtArgs {
  campaignId: string;
  file: File;
  credit?: string | null;
  source?: string | null;
  previousPath?: string | null;
  previousSquarePath?: string | null;
}

export interface UploadCampaignKeyArtResult {
  fields: CampaignKeyArtFields;
  processed: ProcessedImage;
}

/**
 * Process → upload hero + square → persist path columns → best-effort
 * cleanup of previous files. A failed row update deletes the freshly
 * uploaded objects so we never leave orphans. A failed cleanup does not
 * fail the operation (the fresh row is already correct).
 */
export async function uploadCampaignKeyArt(
  args: UploadCampaignKeyArtArgs,
): Promise<UploadCampaignKeyArtResult> {
  // Hero: cap longest side to 2048 so we get a real 16:9 master.
  const hero = await processImage(args.file, {
    maxLongestSide: 2048,
    minLongestSide: 1280,
    targetBytes: 220 * 1024,
  });
  const squareBlob = await makeSquareDerivative(hero, 1024);
  const paths = buildPaths(args.campaignId);

  const upHero = await supabase.storage.from(BUCKET).upload(paths.hero, hero.blob, {
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
    upsert: false,
  });
  if (upHero.error) {
    throw new Error(`تعذر رفع صورة الحملة. (${upHero.error.message})`);
  }
  const upSq = await supabase.storage.from(BUCKET).upload(paths.square, squareBlob, {
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
    upsert: false,
  });
  if (upSq.error) {
    try { await supabase.storage.from(BUCKET).remove([paths.hero]); } catch { /* ignore */ }
    throw new Error(`تعذر رفع النسخة المربّعة. (${upSq.error.message})`);
  }

  const fields: CampaignKeyArtFields = {
    key_art_path: paths.hero,
    key_art_square_path: paths.square,
    key_art_credit: args.credit?.trim() || null,
    key_art_source: args.source?.trim() || null,
  };
  // `admin_campaigns` has NO table grants for `authenticated` — every
  // admin read/write goes through the security-definer RPC pair.
  const upd = await writeKeyArtRow(args.campaignId, fields);
  if (upd) {
    try { await supabase.storage.from(BUCKET).remove([paths.hero, paths.square]); } catch { /* ignore */ }
    throw new Error(`تعذر حفظ بيانات صورة الحملة. (${upd})`);
  }

  const expectedPrefix = `${safeSegment(args.campaignId)}/`;
  const toRemove: string[] = [];
  for (const p of [args.previousPath, args.previousSquarePath]) {
    if (p && p !== paths.hero && p !== paths.square && p.startsWith(expectedPrefix)) {
      toRemove.push(p);
    }
  }
  if (toRemove.length) {
    try { await supabase.storage.from(BUCKET).remove(toRemove); } catch { /* ignore */ }
    for (const p of toRemove) urlCache.delete(p);
  }
  invalidateCampaignKeyArtOverlay();

  return { fields, processed: hero };
}

/** Admin-only row read (no direct table grants exist). */
export async function fetchCampaignKeyArt(
  campaignId: string,
): Promise<CampaignKeyArtFields> {
  const { data, error } = await supabase.rpc("admin_get_campaign_key_art" as any, {
    p_id: campaignId,
  });
  if (error) throw new Error(error.message);
  const row = ((data as any[]) ?? [])[0] ?? null;
  return {
    key_art_path: row?.key_art_path ?? null,
    key_art_square_path: row?.key_art_square_path ?? null,
    key_art_credit: row?.key_art_credit ?? null,
    key_art_source: row?.key_art_source ?? null,
  };
}

/** Returns an error message, or null on success. */
async function writeKeyArtRow(
  campaignId: string,
  fields: CampaignKeyArtFields,
): Promise<string | null> {
  const { error } = await supabase.rpc("admin_set_campaign_key_art" as any, {
    p_id: campaignId,
    p_path: fields.key_art_path,
    p_square_path: fields.key_art_square_path,
    p_credit: fields.key_art_credit,
    p_source: fields.key_art_source,
  });
  return error ? error.message : null;
}

/** Clear the four columns and remove the underlying objects. */
export async function deleteCampaignKeyArt(
  campaignId: string,
  currentPath: string | null,
  currentSquarePath: string | null,
): Promise<void> {
  const err = await writeKeyArtRow(campaignId, {
    key_art_path: null,
    key_art_square_path: null,
    key_art_credit: null,
    key_art_source: null,
  });
  if (err) throw new Error(`تعذر حذف صورة الحملة. (${err})`);
  const paths = [currentPath, currentSquarePath].filter(Boolean) as string[];
  if (paths.length) {
    try { await supabase.storage.from(BUCKET).remove(paths); } catch { /* ignore */ }
    for (const p of paths) urlCache.delete(p);
  }
  invalidateCampaignKeyArtOverlay();
}

/** Update credit / source without re-uploading. */
export async function updateCampaignKeyArtMeta(
  campaignId: string,
  credit: string | null,
  source: string | null,
): Promise<void> {
  const current = await fetchCampaignKeyArt(campaignId);
  const err = await writeKeyArtRow(campaignId, {
    ...current,
    key_art_credit: credit?.trim() || null,
    key_art_source: source?.trim() || null,
  });
  if (err) throw new Error(`تعذر حفظ بيانات صورة الحملة. (${err})`);
  invalidateCampaignKeyArtOverlay();
}


// ------------------------------------------------------------
// Runtime URL resolver (paths → signed URLs). NEVER persist the
// returned URL — it is short-lived by design.
// ------------------------------------------------------------

interface CacheEntry {
  url: string;
  /** Epoch ms when this signed URL should be considered stale. */
  expiresAt: number;
  inflight?: Promise<string>;
}

const urlCache = new Map<string, CacheEntry>();

/** Signed URL TTL — 30 days. Cache TTL is deliberately shorter. */
const SIGN_TTL_SECONDS = 60 * 60 * 24 * 30;
/** In-memory cache TTL — refresh well before the signed URL expires. */
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 20;

export async function resolveCampaignKeyArtUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > now) return hit.url;
  if (hit?.inflight) return hit.inflight;

  const p = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      urlCache.delete(path);
      throw new Error(`sign_failed: ${error?.message ?? "unknown"}`);
    }
    urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return data.signedUrl;
  })();
  urlCache.set(path, { url: hit?.url ?? "", expiresAt: 0, inflight: p });
  return p;
}

/**
 * Pick the best available path for a surface aspect. Falls back
 * to the other aspect when the requested one isn't uploaded (e.g.
 * legacy campaigns that only have the hero).
 */
export function pickCampaignKeyArtPath(
  row: { key_art_path?: string | null; key_art_square_path?: string | null } | null | undefined,
  aspect: KeyArtAspect,
): string | null {
  if (!row) return null;
  if (aspect === "square") return row.key_art_square_path ?? row.key_art_path ?? null;
  return row.key_art_path ?? row.key_art_square_path ?? null;
}

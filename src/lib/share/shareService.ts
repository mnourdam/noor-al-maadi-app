// Centralized share / export service.
//
// Every referral and Historical Identity Card surface routes through this
// module so we have one place that:
//   - resolves the public origin (never localhost / internal WebView)
//   - selects the correct native / Web Share / clipboard / download path
//   - reports a consistent Arabic feedback string via sonner
//   - normalizes errors (never exposes internal messages to players)
//   - guards against double-taps on the same job
//
// The service is UI-framework agnostic beyond `sonner` — callers just
// invoke `shareText`, `shareUrl`, `shareImage`, or `downloadImage` and
// react to the returned status.

import { toast } from "sonner";
import { isLocalOrigin } from "./publicOrigin";
import { isCapacitorNative } from "@/lib/native-auth";
import {
  canUseNativeShare,
  shareTextNative,
  shareImageNative,
  saveImageNative,
} from "./nativeShare";

export type ShareStatus =
  | "shared"     // native / web share sheet accepted
  | "copied"     // clipboard fallback succeeded
  | "downloaded" // file downloaded
  | "cancelled"  // user dismissed the share sheet
  | "failed";    // nothing worked — Arabic toast already shown

export interface ShareResult {
  status: ShareStatus;
}

// ─── Double-tap guard ───────────────────────────────────────────────────
// A single global set of "busy" job IDs. Callers pass a stable job key
// (e.g. `referral-share-<code>` or `identity-card-download`). While a job
// is in-flight further invocations return `cancelled` without side-effects.
const inflight = new Set<string>();

async function withGuard<T>(jobId: string, run: () => Promise<T>, cancelled: T): Promise<T> {
  if (inflight.has(jobId)) return cancelled;
  inflight.add(jobId);
  try {
    return await run();
  } finally {
    inflight.delete(jobId);
  }
}

// ─── Feedback helpers ───────────────────────────────────────────────────
// All player-facing feedback is Arabic. Internal error strings are logged
// to console for diagnostics but never surfaced.
const MSG = {
  copied: "تم نسخ الرابط",
  copiedFallback: "تعذّرت المشاركة — نُسخ الرابط بدلاً من ذلك",
  downloaded: "تم حفظ البطاقة",
  readyToShare: "البطاقة جاهزة للحفظ أو المشاركة",
  shareUnavailable: "المشاركة غير متاحة على هذا الجهاز — انسخ الرابط أو نزّل البطاقة",
  failed: "تعذّرت المشاركة — حاول مجددًا",
  invalidUrl: "الرابط غير متاح حاليًا",
  notReady: "البطاقة لم تكتمل بعد — حاول بعد لحظة",
};

function successToast(msg: string) { toast.success(msg); }
function errorToast(msg: string) { toast.error(msg); }

// ─── URL / text sharing ─────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface ShareTextInput {
  jobId: string;
  /** Short invitation (Arabic). */
  text: string;
  /** The public URL to share. Must not be a local/internal origin. */
  url: string;
  /** Optional title for the share sheet. */
  title?: string;
}

/**
 * Share a text + URL. Never fails silently — always resolves with a
 * status and a matching toast. Refuses to share a local/invalid URL.
 */
export async function shareTextAndUrl(input: ShareTextInput): Promise<ShareResult> {
  return withGuard<ShareResult>(input.jobId, async () => {
    if (!input.url || isLocalOrigin(input.url)) {
      errorToast(MSG.invalidUrl);
      return { status: "failed" as const };
    }
    const message = `${input.text}\n${input.url}`;

    // 1) Native APK: use the real Capacitor Share plugin. The WebView's
    //    navigator.share does NOT reliably reach every Android receiver;
    //    the Capacitor bridge does.
    if (canUseNativeShare()) {
      try {
        const s = await shareTextNative({ text: input.text, url: input.url, title: input.title });
        if (s === "cancelled") return { status: "cancelled" as const };
        return { status: "shared" as const };
      } catch (err) {
        console.warn("[share] native text share failed", err);
        // fall through to Web Share / clipboard
      }
    }

    // 2) Web Share API (browsers that support it).
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: input.title,
          text: input.text,
          url: input.url,
        });
        return { status: "shared" as const };
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") {
          return { status: "cancelled" as const };
        }
        // fall through to clipboard
      }
    }

    // 3) Clipboard fallback.
    const copied = await copyToClipboard(message);
    if (copied) {
      successToast(MSG.copiedFallback);
      return { status: "copied" as const };
    }
    errorToast(MSG.shareUnavailable);
    return { status: "failed" as const };
  }, { status: "cancelled" as const });
}

// ─── File / image sharing ──────────────────────────────────────────────

export interface ShareImageInput {
  jobId: string;
  /** PNG blob ready to share. Must be fully rendered before calling. */
  blob: Blob;
  /** Suggested filename WITHOUT dangerous chars. */
  filename: string;
  /** Short invitation text (Arabic). */
  text: string;
  /** Public fallback URL if file share is unavailable (e.g. profile link). */
  fallbackUrl?: string | null;
  title?: string;
}

/**
 * Share an image file. Uses Web Share (files) when supported — this works
 * in modern Android WebView. Falls back to downloading the image and, if
 * a fallback URL is provided, copying it to the clipboard.
 */
export async function shareImage(input: ShareImageInput): Promise<ShareResult> {
  return withGuard<ShareResult>(input.jobId, async () => {
    if (!input.blob || input.blob.size < 512) {
      errorToast(MSG.notReady);
      return { status: "failed" as const };
    }
    const filename = sanitizeFilename(input.filename);

    // 1) Native APK: write to CACHE and share the real file URI via
    //    Capacitor Share. The share sheet gets a file:// URI, NOT a blob.
    if (canUseNativeShare()) {
      try {
        const s = await shareImageNative({
          blob: input.blob,
          filename,
          text: input.text,
          title: input.title,
        });
        if (s === "cancelled") return { status: "cancelled" as const };
        return { status: "shared" as const };
      } catch (err) {
        console.warn("[share] native image share failed", err);
        // fall through to native save (still better than a browser blob)
        try {
          await saveImageNative({ blob: input.blob, filename });
          successToast(MSG.downloaded);
          return { status: "downloaded" as const };
        } catch (err2) {
          console.warn("[share] native image save failed", err2);
          // fall through to web fallbacks
        }
      }
    }

    // 2) Web Share API with files (browsers that support it).
    const file = new File([input.blob], filename, { type: input.blob.type || "image/png" });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      typeof navigator.share === "function"
    ) {
      try {
        if (navigator.canShare({ files: [file] })) {
          // Race the share promise against a watchdog. Some WebViews /
          // sandboxed iframes never resolve `navigator.share`, which
          // would leave the UI stuck on "Preparing…" forever.
          const WATCHDOG_MS = 12_000;
          const shareP = navigator.share({
            files: [file],
            title: input.title,
            text: input.text,
          }).then(() => "shared" as const);
          const timeoutP = new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), WATCHDOG_MS),
          );
          const outcome = await Promise.race([shareP, timeoutP]);
          if (outcome === "shared") return { status: "shared" as const };
          console.warn("[share] navigator.share timed out; falling back to download");
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") {
          return { status: "cancelled" as const };
        }
        // fall through
      }
    }

    // 3) Browser download fallback.
    const downloaded = await triggerDownload(input.blob, filename);
    if (downloaded) {
      if (input.fallbackUrl && !isLocalOrigin(input.fallbackUrl)) {
        await copyToClipboard(input.fallbackUrl);
      }
      successToast(MSG.downloaded);
      return { status: "downloaded" as const };
    }

    if (input.fallbackUrl && !isLocalOrigin(input.fallbackUrl)) {
      const copied = await copyToClipboard(input.fallbackUrl);
      if (copied) {
        successToast(MSG.copiedFallback);
        return { status: "copied" as const };
      }
    }

    errorToast(MSG.failed);
    return { status: "failed" as const };
  }, { status: "cancelled" as const });
}

/**
 * Download an image blob directly. Wraps the same guard + toast as
 * `shareImage` so callers can wire the Download button to a single call.
 */
export async function downloadImage(input: {
  jobId: string;
  blob: Blob;
  filename: string;
}): Promise<ShareResult> {
  return withGuard<ShareResult>(input.jobId, async () => {
    if (!input.blob || input.blob.size < 512) {
      errorToast(MSG.notReady);
      return { status: "failed" };
    }
    const filename = sanitizeFilename(input.filename);
    // Native: use Share Sheet via cache to ensure user-visible persistence on Android.
    if (canUseNativeShare()) {
      try {
        const res = await saveImageNative({ blob: input.blob, filename });
        if (res.status === "shared") {
          successToast(MSG.readyToShare);
          return { status: "shared" };
        }
        // If native save somehow directly succeeded (e.g. MediaStore)
        successToast(MSG.downloaded);
        return { status: "downloaded" };
      } catch (err) {
        console.warn("[share] native save failed", err);
        // fall through to browser download (rarely reachable in APK)
      }
    }
    const ok = await triggerDownload(input.blob, filename);
    if (ok) {
      successToast(MSG.downloaded);
      return { status: "downloaded" };
    }
    errorToast(MSG.failed);
    return { status: "failed" };
  }, { status: "cancelled" });
}

// ─── Internals ─────────────────────────────────────────────────────────

async function triggerDownload(blob: Blob, filename: string): Promise<boolean> {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after a short delay so the download initiates.
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 4_000);
    return true;
  } catch {
    return false;
  }
}

/** Strip path separators, control chars and reserved characters. Ensures
 *  the filename is safe to hand to the OS share sheet and browsers. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  let s = (name ?? "").replace(/[\x00-\x1f<>:"/\\|?*\u0000]/g, "");
  s = s.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length < 3) s = "irth-card.png";
  if (!/\.[a-z0-9]{2,4}$/i.test(s)) s += ".png";
  return s.slice(0, 96);
}

/** Convenience: whether the current environment has any share capability
 *  beyond clipboard. Callers use this to hide/show optional affordances. */
export function hasShareCapability(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function" || isCapacitorNative();
}

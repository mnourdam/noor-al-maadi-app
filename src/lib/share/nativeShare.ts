// Native (Capacitor) share adapter.
//
// On Android APK we prefer the real Capacitor Share + Filesystem plugins
// over `navigator.share` / `<a download>`. The share sheet must receive an
// actual file:// / content:// URI, not an in-memory Blob URL — the Android
// share intent cannot forward blob:/data: URLs to receiver apps.
//
// Contract:
//   - shareTextNative(text, url, title): opens Android share sheet with text+url
//   - shareImageNative(blob, filename, text): writes the PNG to CACHE and
//       shares its file URI, then schedules cleanup
//   - saveImageNative(blob, filename): writes the PNG to Documents so it
//       survives after the share intent returns
//
// All functions throw on failure; the centralized share service catches and
// falls back to Web Share / <a download> for browser environments.

import { isCapacitorNative } from "@/lib/native-auth";
import { recordTrace } from "@/lib/diag-trace";

type ShareStatus = "shared" | "cancelled";

async function loadShare() {
  const mod = await import("@capacitor/share");
  return mod.Share;
}

async function loadFs() {
  const mod = await import("@capacitor/filesystem");
  return mod;
}

export function canUseNativeShare(): boolean {
  return isCapacitorNative();
}

/** Convert a Blob to a base64 string (no data-url prefix). */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Native text/URL share via Capacitor Share plugin. */
export async function shareTextNative(input: {
  text: string;
  url: string;
  title?: string;
}): Promise<ShareStatus> {
  const Share = await loadShare();
  try {
    await Share.share({
      title: input.title,
      text: input.text,
      url: input.url,
      dialogTitle: input.title,
    });
    return "shared";
  } catch (err) {
    const msg = (err as { message?: string } | null)?.message ?? "";
    if (/cancel|dismiss/i.test(msg)) return "cancelled";
    throw err;
  }
}

/** Track cache files created by shareImageNative so we can clean up. */
const cacheFilesToCleanup: { directory: unknown; path: string }[] = [];

/** Native image share: write PNG to CACHE, share via file URI, schedule cleanup. */
export async function shareImageNative(input: {
  blob: Blob;
  filename: string;
  text: string;
  title?: string;
}): Promise<ShareStatus> {
  const { Filesystem, Directory } = await loadFs();
  const Share = await loadShare();

  const data = await blobToBase64(input.blob);
  const path = input.filename;

  // Write to app cache dir — safely wiped by the OS after use.
  const written = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  });

  cacheFilesToCleanup.push({ directory: Directory.Cache, path });

  try {
    await Share.share({
      title: input.title,
      text: input.text,
      files: [written.uri],
      dialogTitle: input.title,
    });
    return "shared";
  } catch (err) {
    const msg = (err as { message?: string } | null)?.message ?? "";
    if (/cancel|dismiss/i.test(msg)) return "cancelled";
    throw err;
  } finally {
    // Schedule cleanup — but keep the file long enough that the receiving
    // app can read it. 30s is well past the intent handoff window.
    setTimeout(() => {
      cleanupCacheFiles().catch(() => { /* ignore */ });
    }, 30_000);
  }
}

/** Persist the PNG to Documents so it survives after the share sheet closes. */
export async function saveImageNative(input: {
  blob: Blob;
  filename: string;
}): Promise<{ status: "downloaded" | "shared"; uri: string }> {
  recordTrace("export-audit", "EXPORT_5_CACHE_WRITE_START");
  const { Filesystem, Directory } = await loadFs();
  const Share = await loadShare();

  const data = await blobToBase64(input.blob);
  recordTrace("export-audit", "EXPORT_4_BASE64_READY", `len=${data.length}`);
  
  const stamp = Date.now();
  const path = `irth-${stamp}-${input.filename}`;

  try {
    const written = await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    recordTrace("export-audit", "EXPORT_6_CACHE_WRITE_DONE", `uri=${written.uri.slice(0, 50)}...`);
    recordTrace("export-audit", "EXPORT_7_URI_READY", written.uri);

    recordTrace("export-audit", "EXPORT_8_SHARE_START", JSON.stringify({
      uri: written.uri,
      scheme: written.uri.split(":")[0],
      filename: path,
      platform: "android",
      shareAvailable: !!Share,
      fsAvailable: !!Filesystem
    }));

    await Share.share({
      files: [written.uri],
    });
    
    recordTrace("export-audit", "EXPORT_9_SHARE_RESOLVED");

    // Best effort cleanup after a delay.
    setTimeout(() => {
      Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }, 40_000);

    return { status: "shared", uri: written.uri };
  } catch (err) {
    const error = err as Error;
    recordTrace("export-audit", "EXPORT_ERROR", JSON.stringify({
      stage: "native-save-flow",
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 200)
    }));
    const msg = error.message ?? "";
    if (/cancel|dismiss/i.test(msg)) {
      throw new Error("Share sheet dismissed");
    }
    throw err;
  }
}

async function cleanupCacheFiles(): Promise<void> {
  if (cacheFilesToCleanup.length === 0) return;
  const { Filesystem } = await loadFs();
  const pending = cacheFilesToCleanup.splice(0, cacheFilesToCleanup.length);
  for (const f of pending) {
    try {
      await Filesystem.deleteFile({
        path: f.path,
        directory: f.directory as never,
      });
    } catch {
      // best-effort cleanup
    }
  }
}

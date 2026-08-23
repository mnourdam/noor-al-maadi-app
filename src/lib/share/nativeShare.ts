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

/** 
 * Convert a Blob to a base64 string (no data-url prefix).
 * Uses an asynchronous FileReader to avoid stalling the main thread 
 * with large binary string builds on Android.
 */
function blobToBase64(blob: Blob): Promise<string> {
  recordTrace("export-audit", "fileReader:start");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error("Empty result from FileReader"));
        return;
      }
      // Strip "data:image/png;base64," prefix
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to extract base64 from DataURL"));
        return;
      }
      recordTrace("export-audit", "fileReader:end", `len=${base64.length}`);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
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

/** Persist the PNG to Cache and share it. */
export async function saveImageNative(input: {
  blob: Blob;
  filename: string;
}): Promise<{ status: "downloaded" | "shared"; uri: string }> {
  recordTrace("export-audit", "filesystem:write:start");
  const { Filesystem, Directory } = await loadFs();
  const Share = await loadShare();

  const data = await blobToBase64(input.blob);
  recordTrace("export-audit", "base64:ready", `len=${data.length}`);
  
  const stamp = Date.now();
  const path = `irth-${stamp}-${input.filename}`;

  try {
    const written = await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    recordTrace("export-audit", "filesystem:write:end", `uri=${written.uri.slice(0, 50)}...`);
    recordTrace("export-audit", "filesystem:getUri:end", written.uri);

    recordTrace("export-audit", "share:start", JSON.stringify({
      uri: written.uri,
      platform: "android"
    }));

    // V13 Safety: Wrap the native share call in a race to prevent infinite hanging
    // if the native bridge fails to resolve or reject the promise.
    const sharePromise = Share.share({
      files: [written.uri],
    });

    const watchdog = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("NATIVE_SHARE_TIMEOUT")), 25000);
    });

    await Promise.race([sharePromise, watchdog]);
    
    recordTrace("export-audit", "share:end");

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
      message: error.message
    }));
    
    const msg = error.message ?? "";
    if (/cancel|dismiss/i.test(msg)) {
      throw new Error("Share sheet dismissed");
    }
    
    if (msg === "NATIVE_SHARE_TIMEOUT") {
      throw new Error("استغرقت العملية وقتاً طويلاً. يرجى المحاولة مرة أخرى.");
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

/**
 * Announcement policy fetch + platform detection.
 *
 * The mandatory-update path must NEVER hang startup: every request is
 * bounded by a short deadline and any failure resolves to a non-blocking
 * outcome (`ok: false`), which the pure policy layer treats as FAIL OPEN.
 */

import { supabase } from "@/integrations/supabase/client";
import { BUILD_TARGET, BUILD_TYPE } from "@/lib/build-info";
import { readAppVersion, type AppVersionInfo } from "@/lib/app-version";
import { parseAnnouncementRow, type AnnouncementFetch } from "./types";
import { IRTH_PLAY_STORE_URL } from "./policy";

/** Hard bound for the startup policy fetch. */
export const ANNOUNCEMENT_FETCH_TIMEOUT_MS = 4000;

export function isNativeAndroid(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    return (cap.getPlatform?.() ?? "android") === "android";
  } catch {
    return false;
  }
}

/**
 * Debug bypass (spec §17).
 *
 * Enforcement requires a build produced by the Android RELEASE pipeline:
 * `__BUILD_TARGET__ === "android"` and `__BUILD_TYPE__ === "release"`, both
 * baked at build time by `vite.android.config.ts` from `ANDROID_BUILD_TYPE`
 * (set only by `npm run build:android:web:release`). Debug APKs default to
 * `"debug"` and are therefore never trapped. Nothing is inferred from
 * versionName.
 */
export function isReleaseBuild(): boolean {
  return BUILD_TARGET === "android" && BUILD_TYPE === "release";
}

export function currentPlatform(): "android" | "web" {
  return isNativeAndroid() ? "android" : "web";
}

export async function readInstalledVersion(): Promise<AppVersionInfo> {
  try {
    return await readAppVersion();
  } catch {
    return { platform: "web", versionName: null, versionCode: null, valid: false, source: "unavailable" };
  }
}

function offlineNow(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

/** Bounded, fail-open policy read. Never throws. */
export async function fetchAnnouncements(
  timeoutMs = ANNOUNCEMENT_FETCH_TIMEOUT_MS,
): Promise<AnnouncementFetch> {
  if (offlineNow()) return { ok: false, reason: "offline" };

  const platform = currentPlatform();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<AnnouncementFetch>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), Math.max(0, timeoutMs));
  });

  const work = (async (): Promise<AnnouncementFetch> => {
    try {
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };
      const { data, error } = await client.rpc("get_active_announcements_v16", {
        p_platform: platform,
      });
      if (error) return { ok: false, reason: "error" };
      if (!Array.isArray(data)) return { ok: false, reason: "malformed" };
      const rows = data.map(parseAnnouncementRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const serverTime = rows.find((r) => r.server_time)?.server_time ?? null;
      // Web must NEVER receive Android update enforcement — client-side
      // defence in depth on top of the server rule.
      const safe = platform === "android" ? rows : rows.filter((r) => r.kind === "generic");
      return { ok: true, rows: safe, serverTime };
    } catch {
      return { ok: false, reason: "error" };
    }
  })();

  const res = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  return res;
}

/** Opens the fixed Irth Play Store page. Never throws; returns success. */
export async function openPlayStore(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform?.()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: IRTH_PLAY_STORE_URL });
      return true;
    }
  } catch {
    /* fall through to web open */
  }
  try {
    if (typeof window === "undefined") return false;
    const win = window.open(IRTH_PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    if (win) return true;
    window.location.href = IRTH_PLAY_STORE_URL;
    return true;
  } catch {
    return false;
  }
}

/** Server acknowledgement for signed-in players. Never throws. */
export async function ackAnnouncementServer(id: string): Promise<boolean> {
  try {
    const client = supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const { error } = await client.rpc("ack_announcement_v16", {
      p_announcement_id: id,
      p_action: "dismissed",
    });
    return !error;
  } catch {
    return false;
  }
}

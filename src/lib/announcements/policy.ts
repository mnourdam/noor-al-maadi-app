/**
 * V16 Phase B — PURE announcement / update policy decisions.
 *
 * No I/O, no React, no Capacitor. Every rule that can block a player lives
 * here so it is fully unit-testable and provably FAIL-OPEN.
 *
 * MANDATORY UPDATE is the only blocking surface in Irth. It applies ONLY
 * when every one of the ten gates below succeeds; anything else — offline,
 * timeout, RPC failure, malformed row, invalid installed version, web,
 * debug build, insane version jump — lets the player continue.
 */

import type { AnnouncementFetch, AnnouncementRow } from "./types";
import { validateExternalUrl } from "@/lib/notifications/externalUrl";

/** Fixed, non-configurable store destination for the Irth Android app. */
export const IRTH_ANDROID_PACKAGE = "app.lovable.irth";
export const IRTH_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${IRTH_ANDROID_PACKAGE}`;

/**
 * Sane-jump guard.
 *
 * A mandatory policy may require at most this many version codes above the
 * installed build. Irth ships roughly one version code per release, so a
 * legitimate "you are too far behind" policy is a handful of codes ahead;
 * 50 leaves a very wide safety margin while a typo (160, 1000, 10000)
 * against installed code 16 can never brick the install base.
 */
export const SANE_JUMP_MAX_AHEAD = 50;

export type MandatoryReason =
  | "blocked"
  | "not_native_android"
  | "debug_build"
  | "invalid_installed_version"
  | "fetch_failed"
  | "no_policy"
  | "not_effective"
  | "up_to_date"
  | "malformed_policy"
  | "insane_jump";

export interface UpdateContext {
  isNativeAndroid: boolean;
  isReleaseBuild: boolean;
  installedVersionCode: number | null;
  installedVersionValid: boolean;
  fetch: AnnouncementFetch;
  /** ISO string; defaults to now. */
  now?: string | number | Date;
}

function toMs(v: string | number | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function activeRows(fetch: AnnouncementFetch): AnnouncementRow[] {
  return fetch.ok ? fetch.rows : [];
}

/**
 * Gate order mirrors the V16 specification 1..10.
 * Returns `blocked: true` only when ALL gates pass.
 */
export function evaluateMandatory(ctx: UpdateContext): {
  blocked: boolean;
  reason: MandatoryReason;
  row: AnnouncementRow | null;
} {
  const no = (reason: MandatoryReason) => ({ blocked: false, reason, row: null });

  // 1 native android  2/3 valid installed version
  if (!ctx.isNativeAndroid) return no("not_native_android");
  // 17 — debug/non-release builds are never trapped by production policy
  if (!ctx.isReleaseBuild) return no("debug_build");
  const installed = ctx.installedVersionCode;
  if (!ctx.installedVersionValid || typeof installed !== "number"
      || !Number.isSafeInteger(installed) || installed <= 0) {
    return no("invalid_installed_version");
  }

  // 4/5 fresh successful, schema-valid server response — cached data NEVER blocks
  if (!ctx.fetch.ok) return no("fetch_failed");

  const row = activeRows(ctx.fetch).find((r) => r.kind === "mandatory_update") ?? null;
  if (!row) return no("no_policy");

  // 6/7 policy active + currently effective (server already filters, re-checked here)
  const nowMs = toMs(ctx.now ?? new Date()) ?? Date.now();
  const effective = toMs(row.effective_at);
  if (effective === null || effective > nowMs) return no("not_effective");

  // 9/10 sane version guards
  const min = row.min_version_code;
  if (min === null || !Number.isSafeInteger(min) || min <= 0) {
    return { blocked: false, reason: "malformed_policy", row: null };
  }
  const rec = row.recommended_version_code;
  if (rec !== null && (!Number.isSafeInteger(rec) || rec <= 0 || min > rec)) {
    return { blocked: false, reason: "malformed_policy", row: null };
  }
  if (min > installed + SANE_JUMP_MAX_AHEAD) {
    return { blocked: false, reason: "insane_jump", row: null };
  }

  // 8 installed < min
  if (installed >= min) return no("up_to_date");

  return { blocked: true, reason: "blocked", row };
}

export type OptionalReason =
  | "show"
  | "not_native_android"
  | "invalid_installed_version"
  | "fetch_failed"
  | "no_policy"
  | "up_to_date"
  | "snoozed";

export interface OptionalContext extends Omit<UpdateContext, "isReleaseBuild"> {
  isReleaseBuild?: boolean;
  /** Returns true when this (announcement, recommended version) pair is snoozed. */
  isSnoozed?: (announcementId: string, recommendedVersionCode: number) => boolean;
}

/** Optional update: never blocks, Android only, snoozeable per device. */
export function evaluateOptional(ctx: OptionalContext): {
  show: boolean;
  reason: OptionalReason;
  row: AnnouncementRow | null;
} {
  const no = (reason: OptionalReason) => ({ show: false, reason, row: null });
  if (!ctx.isNativeAndroid) return no("not_native_android");
  const installed = ctx.installedVersionCode;
  if (!ctx.installedVersionValid || typeof installed !== "number" || installed <= 0) {
    return no("invalid_installed_version");
  }
  if (!ctx.fetch.ok) return no("fetch_failed");

  const row = activeRows(ctx.fetch)
    .filter((r) => r.kind === "optional_update" && r.recommended_version_code !== null)
    .sort((a, b) => (b.recommended_version_code ?? 0) - (a.recommended_version_code ?? 0))[0] ?? null;
  if (!row || row.recommended_version_code === null) return no("no_policy");
  if (installed >= row.recommended_version_code) return no("up_to_date");
  if (ctx.isSnoozed?.(row.id, row.recommended_version_code)) return no("snoozed");

  return { show: true, reason: "show", row };
}

export type GenericAction =
  | { kind: "internal"; path: string; label: string | null }
  | { kind: "external"; url: string; label: string | null }
  | { kind: "none" };

/** Internal paths must be a single-slash absolute app path. */
export function isSafeInternalPath(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return false;
  return true;
}

/** Runtime action resolution — unsafe or ambiguous input yields no CTA. */
export function resolveAnnouncementAction(row: AnnouncementRow): GenericAction {
  if (row.kind !== "generic") return { kind: "none" };
  const hasInternal = typeof row.internal_path === "string" && row.internal_path !== "";
  const hasExternal = typeof row.external_url === "string" && row.external_url !== "";
  if (hasInternal && hasExternal) return { kind: "none" };
  if (hasExternal) {
    const res = validateExternalUrl(row.external_url);
    return res.ok ? { kind: "external", url: res.url, label: row.cta_label } : { kind: "none" };
  }
  if (hasInternal) {
    return isSafeInternalPath(row.internal_path)
      ? { kind: "internal", path: (row.internal_path as string).trim(), label: row.cta_label }
      : { kind: "none" };
  }
  return { kind: "none" };
}

/** Highest-priority generic announcement the player has not acknowledged. */
export function pickGeneric(
  fetch: AnnouncementFetch,
  opts: { ackedIds?: ReadonlySet<string> | string[] } = {},
): AnnouncementRow | null {
  if (!fetch.ok) return null;
  const acked = opts.ackedIds instanceof Set
    ? opts.ackedIds
    : new Set(opts.ackedIds ?? []);
  const rows = fetch.rows
    .filter((r) => r.kind === "generic")
    .filter((r) => !(r.once_per_user && acked.has(r.id)))
    .sort((a, b) => b.priority - a.priority);
  return rows[0] ?? null;
}

/** Priority >= 100 generic announcements outrank the optional update prompt. */
export const CRITICAL_GENERIC_PRIORITY = 100;
export function isCriticalGeneric(row: AnnouncementRow | null): boolean {
  return Boolean(row && row.kind === "generic" && row.priority >= CRITICAL_GENERIC_PRIORITY);
}

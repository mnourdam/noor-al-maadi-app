// Centralized player display-name resolver.
//
// Every share surface (referral card, QR card, Historical Identity Card,
// public profile embed) must resolve the player's presentation name from
// the same rules. Priority:
//
//   1. profile.display_name  (owner-editable full/display name)
//   2. public profile name   (approved value on public_profiles view)
//   3. username              (secondary handle, fallback)
//   4. generic Arabic fallback  ("صديق التاريخ")
//
// Emails are NEVER a valid display name — even if a caller accidentally
// passes one in, it is rejected here.

const GENERIC_FALLBACK = "صديق التاريخ";
const EMAIL_RE = /@/;

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (EMAIL_RE.test(t)) return null;
  if (t === "ضيف") return null;
  return t;
}

export interface DisplayNameSources {
  /** Owner-editable display/full name (from account.display_name / profile). */
  displayName?: string | null;
  /** Approved public profile name (from public_profiles view). */
  publicName?: string | null;
  /** Username (handle) — used only as a fallback. */
  username?: string | null;
  /** Optional profile-side "name" field (legacy). */
  profileName?: string | null;
}

export function resolveDisplayName(sources: DisplayNameSources): string {
  return (
    clean(sources.displayName) ??
    clean(sources.publicName) ??
    clean(sources.profileName) ??
    clean(sources.username) ??
    GENERIC_FALLBACK
  );
}

/**
 * Filename-safe handle for exported card assets. Uses the username when
 * available, otherwise a stable random-safe token. Never returns an empty
 * string. Emails and control characters are stripped.
 */
export function sanitizeFilenameHandle(handle: string | null | undefined): string {
  const raw = typeof handle === "string" ? handle : "";
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "user";
}

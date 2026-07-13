// Shared helpers for the Irth-native reauthentication OTP pipeline.
// Uses Web Crypto (available in both the Cloudflare Worker SSR runtime and in
// Node ≥ 18), so this file is safe to import from server route modules.

export const REAUTH_PURPOSE = 'reauthentication'
export const REAUTH_TTL_MINUTES = 10
export const REAUTH_MAX_ATTEMPTS = 5
export const REAUTH_RATE_LIMIT_PER_HOUR = 5

export function generateSixDigitCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % 1_000_000).toString().padStart(6, '0')
}

export async function hashReauthCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time hex string comparison. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

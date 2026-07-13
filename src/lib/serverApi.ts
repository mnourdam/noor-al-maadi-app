// Centralized server API URL resolver.
//
// In the Capacitor APK the WebView origin is `https://localhost` (or a
// similar capacitor:// origin), so a relative fetch like
// `/lovable/email/auth-custom/dispatch` never reaches the deployed
// backend. This module resolves every client → server call to the
// correct absolute origin when running natively, while preserving
// same-origin relative behavior on web / preview.
//
// Only the single trusted backend origin below is allowed for the
// native override; any attempt to configure another origin is ignored.

import { isCapacitorNative } from '@/lib/native-auth'

const TRUSTED_ORIGIN = 'https://irth-develop.lovable.app'

let loggedOnce = false

function resolveNativeOrigin(): string {
  // VITE_PUBLIC_APP_ORIGIN is optional; if set it MUST equal the trusted
  // origin, otherwise we fall back to the trusted origin.
  const raw = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined) ?? ''
  try {
    const u = new URL(raw)
    const normalized = `${u.protocol}//${u.host}`
    if (normalized === TRUSTED_ORIGIN) return normalized
  } catch {
    /* ignore */
  }
  return TRUSTED_ORIGIN
}

/**
 * Resolve a server route path to the correct URL.
 *
 *  - Web / preview: returns the same-origin relative path unchanged.
 *  - Capacitor native: prefixes the trusted backend origin.
 *
 * The input MUST be an absolute-from-root path (starts with "/"). Absolute
 * URLs are returned unchanged. Slashes are normalized so callers can pass
 * either "/foo" or "foo".
 */
export function getServerApiUrl(path: string): string {
  const p = path.startsWith('http') ? path : path.startsWith('/') ? path : `/${path}`
  if (p.startsWith('http')) return p

  const native = isCapacitorNative()
  if (!loggedOnce && typeof window !== 'undefined') {
    loggedOnce = true
    const origin = native ? resolveNativeOrigin() : window.location.origin
    try {
      // eslint-disable-next-line no-console
      console.log('[api-base-resolved]', {
        platform: native ? 'native' : 'web',
        native,
        origin,
      })
    } catch { /* ignore */ }
  }

  if (native) {
    return `${resolveNativeOrigin()}${p}`
  }
  return p
}

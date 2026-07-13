// Client dispatcher for the custom auth email pipeline.
//
// Routes each auth email flow through either the custom pipeline
// (server route → auth_emails_custom queue → Resend) or the legacy
// pipeline (Supabase Auth Send Email Hook → auth_emails queue → Resend),
// depending on VITE_AUTH_EMAIL_MODE.
//
//   VITE_AUTH_EMAIL_MODE=custom   → new pipeline (default)
//   VITE_AUTH_EMAIL_MODE=legacy   → old pipeline (rollback)
//
// Legacy code is kept intact behind the flag; nothing is deleted.

import { supabase } from '@/integrations/supabase/client'

export type AuthEmailMode = 'custom' | 'legacy'

export function getAuthEmailMode(): AuthEmailMode {
  const raw = (import.meta.env.VITE_AUTH_EMAIL_MODE as string | undefined) ?? 'custom'
  return raw.toLowerCase() === 'legacy' ? 'legacy' : 'custom'
}

interface DispatchArgs {
  action: 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'reauthentication'
  email?: string
  password?: string
  newEmail?: string
  redirectTo?: string
  username?: string
  displayName?: string
  referralCode?: string
  idempotencyKey?: string
  requiresAuth?: boolean
}

async function dispatch(args: DispatchArgs): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (args.requiresAuth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('No active session')
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch('/lovable/email/auth-custom/dispatch', {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    // Parse structured server error so callers can show clean Arabic copy
    // instead of the raw JSON body.
    let code = `http_${res.status}`
    let message = ''
    try {
      const payload = (await res.clone().json()) as { error?: string; message?: string }
      if (payload?.error) code = payload.error
      if (payload?.message) message = payload.message
    } catch {
      try { message = await res.text() } catch { /* ignore */ }
    }
    console.warn('[auth-emails] dispatch failed', { action: args.action, status: res.status, code, message })
    const err = new Error(translateDispatchError(code, message)) as Error & { code?: string }
    err.code = code
    throw err
  }
}

/** Map server error codes + provider messages to friendly Arabic copy. */
function translateDispatchError(code: string, message: string): string {
  const m = (message || '').toLowerCase()
  if (code === 'generate_link_failed') {
    if (m.includes('weak') || m.includes('pwned') || m.includes('easy to guess') || (m.includes('password') && (m.includes('short') || m.includes('length')))) {
      return 'كلمة المرور ضعيفة أو شائعة. اختر كلمة مرور أقوى (٨ أحرف على الأقل مع أرقام ورموز).'
    }
    if (m.includes('already registered') || m.includes('user already') || m.includes('already exists')) {
      return 'هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول أو استعادة كلمة المرور.'
    }
    if (m.includes('invalid') && m.includes('email')) {
      return 'البريد الإلكتروني غير صالح.'
    }
    return message ? `تعذّر إنشاء الحساب: ${message}` : 'تعذّر إنشاء الحساب. حاول مرة أخرى.'
  }
  if (code === 'rate_limited' || code === 'http_429') {
    return 'تم إرسال عدد كبير من الطلبات. انتظر قليلاً ثم حاول مجدداً.'
  }
  if (code === 'unauthorized' || code === 'http_401') {
    return 'الجلسة منتهية. سجّل الدخول مرة أخرى.'
  }
  if (code === 'no_action_link') {
    return 'تعذّر توليد رابط التأكيد. حاول مرة أخرى.'
  }
  return message || 'تعذّر إتمام العملية. حاول مرة أخرى.'
}

// ============================================================
// Public API — one function per flow. Callers do NOT need to
// know which mode is active; this module handles the routing.
// ============================================================

export interface CustomSignUpArgs {
  email: string
  password: string
  username?: string
  displayName?: string
  referralCode?: string
}

/**
 * Custom-mode signup: creates the user (unconfirmed) via the Admin API and
 * enqueues the branded Arabic verification email.
 * In legacy mode, callers should use `supabase.auth.signUp` directly.
 */
export async function requestSignupEmail(args: CustomSignUpArgs): Promise<void> {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined
  await dispatch({
    action: 'signup',
    email: args.email,
    password: args.password,
    username: args.username,
    displayName: args.displayName,
    referralCode: args.referralCode,
    redirectTo,
  })
}

export async function requestPasswordResetEmail(email: string): Promise<void> {
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?type=recovery`
      : undefined
  await dispatch({ action: 'recovery', email, redirectTo })
}

export async function requestMagicLinkEmail(email: string): Promise<void> {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined
  await dispatch({ action: 'magiclink', email, redirectTo })
}

export async function requestEmailChangeEmail(newEmail: string): Promise<void> {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined
  await dispatch({
    action: 'email_change',
    newEmail,
    redirectTo,
    requiresAuth: true,
  })
}

export async function requestReauthenticationEmail(): Promise<void> {
  await dispatch({ action: 'reauthentication', requiresAuth: true })
}

/**
 * Verify a 6-digit reauthentication OTP the user received by email.
 * Returns `true` on success. Throws with a machine-readable error code on
 * failure so callers can distinguish invalid_code, expired, locked, etc.
 */
export async function verifyReauthenticationCode(code: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('No active session')

  const res = await fetch('/lovable/email/auth-custom/verify-reauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  })

  if (res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { verified?: boolean }
    return payload.verified === true
  }

  let errorCode = `http_${res.status}`
  try {
    const payload = (await res.json()) as { error?: string }
    if (payload?.error) errorCode = payload.error
  } catch {
    // ignore
  }
  throw new Error(errorCode)
}


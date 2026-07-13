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
    const text = await res.text().catch(() => '')
    throw new Error(`auth_email_dispatch_failed (${res.status}): ${text}`)
  }
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

import { supabase } from '@/integrations/supabase/client'
import { serverRequest } from '@/lib/serverRequest'

export interface SendTransactionalEmailInput {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, unknown>
}

/**
 * Client helper to enqueue a transactional email via the internal route.
 * Requires an authenticated Supabase session (bearer token attached).
 * Uses the native-safe HTTP transport so the APK bypasses the WebView's
 * cross-origin gate.
 */
export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No active session for transactional email')

  const res = await serverRequest('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: input,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Email send failed (${res.status}): ${text}`)
  }
}

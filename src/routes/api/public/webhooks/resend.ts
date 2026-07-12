import { createFileRoute } from '@tanstack/react-router'
import { createHmac, timingSafeEqual } from 'crypto'

// Resend webhook adapter.
//
// Resend uses Svix for webhook signing (`whsec_<base64>` secret).
// Verify with HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`,
// then translate bounce / complaint events into the existing
// `suppressed_emails` schema. All other event types are acknowledged and ignored.
//
// Set up: in the Resend dashboard, create a webhook pointing at
//   https://<published-host>/api/public/webhooks/resend
// with these events enabled: email.bounced, email.complained,
// email.delivery_delayed (optional, ignored). Copy the signing secret
// (starts with `whsec_`) into the project secret RESEND_WEBHOOK_SECRET.

const SVIX_TOLERANCE_SECONDS = 5 * 60

interface ResendEvent {
  type: string
  created_at: string
  data: {
    email_id?: string
    to?: string[] | string
    from?: string
    subject?: string
    bounce?: {
      type?: 'hard' | 'soft' | string
      subType?: string
      message?: string
    }
    complaint?: {
      feedbackType?: string
      complainedRecipients?: Array<{ emailAddress: string }>
    }
  }
}

function verifySvixSignature(opts: {
  secret: string
  msgId: string
  timestamp: string
  signatureHeader: string
  body: string
}): boolean {
  const { secret, msgId, timestamp, signatureHeader, body } = opts
  const secretBase = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  let keyBytes: Buffer
  try {
    keyBytes = Buffer.from(secretBase, 'base64')
  } catch {
    return false
  }

  const signedContent = `${msgId}.${timestamp}.${body}`
  const expected = createHmac('sha256', keyBytes).update(signedContent).digest('base64')

  const versions = signatureHeader.split(' ').map((s) => s.trim()).filter(Boolean)
  for (const v of versions) {
    const [ver, sig] = v.split(',')
    if (ver !== 'v1' || !sig) continue
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

function extractRecipient(event: ResendEvent): string | null {
  const complained = event.data.complaint?.complainedRecipients?.[0]?.emailAddress
  if (complained) return complained
  const to = event.data.to
  if (Array.isArray(to)) return to[0] ?? null
  if (typeof to === 'string') return to
  return null
}

export const Route = createFileRoute('/api/public/webhooks/resend')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET
        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!secret || !supabaseUrl || !supabaseServiceKey) {
          console.error('resend-webhook: missing configuration', {
            hasSecret: !!secret,
            hasUrl: !!supabaseUrl,
            hasServiceKey: !!supabaseServiceKey,
          })
          return new Response('Server configuration error', { status: 500 })
        }

        const svixId = request.headers.get('svix-id')
        const svixTimestamp = request.headers.get('svix-timestamp')
        const svixSignature = request.headers.get('svix-signature')

        if (!svixId || !svixTimestamp || !svixSignature) {
          return new Response('Missing signature headers', { status: 401 })
        }

        const ts = Number.parseInt(svixTimestamp, 10)
        if (!Number.isFinite(ts)) {
          return new Response('Invalid timestamp', { status: 401 })
        }
        const now = Math.floor(Date.now() / 1000)
        if (Math.abs(now - ts) > SVIX_TOLERANCE_SECONDS) {
          return new Response('Stale timestamp', { status: 401 })
        }

        const body = await request.text()
        const valid = verifySvixSignature({
          secret,
          msgId: svixId,
          timestamp: svixTimestamp,
          signatureHeader: svixSignature,
          body,
        })
        if (!valid) {
          return new Response('Invalid signature', { status: 401 })
        }

        let event: ResendEvent
        try {
          event = JSON.parse(body) as ResendEvent
        } catch {
          return new Response('Invalid JSON', { status: 400 })
        }

        // Only bounce / complaint events feed the suppression list.
        // Everything else (delivered, sent, opened, clicked, delivery_delayed)
        // is acknowledged with 200 and ignored.
        let reason: 'bounce' | 'complaint' | null = null
        if (event.type === 'email.bounced') {
          // Only permanent (hard) bounces feed suppression. Soft bounces retry
          // via the queue's normal retry path.
          const bounceType = event.data.bounce?.type
          if (bounceType && bounceType.toLowerCase() !== 'hard') {
            return Response.json({ acknowledged: true, ignored: 'soft_bounce' })
          }
          reason = 'bounce'
        } else if (event.type === 'email.complained') {
          reason = 'complaint'
        } else {
          return Response.json({ acknowledged: true, ignored: event.type })
        }

        const recipient = extractRecipient(event)
        if (!recipient) {
          console.warn('resend-webhook: event missing recipient', { type: event.type })
          return Response.json({ acknowledged: true, ignored: 'missing_recipient' })
        }

        const normalizedEmail = recipient.toLowerCase()
        const metadata = {
          provider: 'resend',
          event_type: event.type,
          provider_message_id: event.data.email_id ?? null,
          created_at: event.created_at,
          bounce: event.data.bounce ?? null,
          complaint: event.data.complaint ?? null,
        }

        // Load supabase admin inside handler (server-only).
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { error: suppressError } = await supabase
          .from('suppressed_emails')
          .upsert(
            { email: normalizedEmail, reason, metadata },
            { onConflict: 'email' },
          )
        if (suppressError) {
          console.error('resend-webhook: failed to upsert suppressed_emails', {
            error: suppressError,
          })
          return new Response('Failed to write suppression', { status: 500 })
        }

        const logStatus = reason === 'complaint' ? 'complained' : 'bounced'
        const logMessage =
          reason === 'complaint'
            ? 'Spam complaint — recipient marked email as spam (Resend)'
            : 'Permanent bounce — recipient rejected (Resend)'

        const { error: insertError } = await supabase.from('email_send_log').insert({
          message_id: event.data.email_id ?? null,
          template_name: 'system',
          recipient_email: normalizedEmail,
          status: logStatus,
          error_message: logMessage,
          metadata,
        })
        if (insertError) {
          console.warn('resend-webhook: failed to insert email_send_log', { error: insertError })
        }

        console.log('resend-webhook: suppression processed', {
          type: event.type,
          email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
          provider_message_id: event.data.email_id,
        })

        return Response.json({ success: true })
      },
    },
  },
})

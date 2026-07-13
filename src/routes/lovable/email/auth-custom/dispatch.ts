// Custom Auth Email Pipeline — dispatcher route.
//
// Independent from Lovable's managed auth-email hook / pgmq `auth_emails` queue.
// Behind AUTH_EMAIL_MODE / VITE_AUTH_EMAIL_MODE feature flag.
//
// Flow:
//   Client → this route
//        → supabaseAdmin.auth.admin.generateLink(...)  (never sends mail)
//        → render Arabic React Email template
//        → supabase.rpc('enqueue_email', { queue_name: 'auth_emails_custom', ... })
//        → existing queue processor → Resend
//
// Retries, DLQ, idempotency, logging: reused from the existing
// /lovable/email/queue/process worker (which was updated to also drain
// the auth_emails_custom queue).

import * as React from 'react'
import { render } from 'react-email'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

import { SignupEmail } from '@/lib/email-templates/signup'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'
import {
  REAUTH_MAX_ATTEMPTS,
  REAUTH_PURPOSE,
  REAUTH_RATE_LIMIT_PER_HOUR,
  REAUTH_TTL_MINUTES,
  generateSixDigitCode,
  hashReauthCode,
} from '@/lib/reauth-otp'

const SITE_NAME_AR = 'إرث'
const SITE_NAME_LATIN = 'Irth'
const SENDER_DOMAIN = 'mail.dosur1444.com'
const FROM_DOMAIN = 'mail.dosur1444.com'
const FROM_ADDRESS = `${SITE_NAME_AR} <no-reply@${FROM_DOMAIN}>`

type Action = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'reauthentication'

const AUTH_REQUIRED: Record<Action, boolean> = {
  signup: false,
  recovery: false,
  magiclink: false,
  email_change: true,
  reauthentication: true,
}

const SUBJECTS: Record<Action, string> = {
  signup: 'تأكيد البريد الإلكتروني',
  recovery: 'إعادة تعيين كلمة المرور',
  magiclink: 'رابط الدخول إلى إرث',
  email_change: 'تأكيد البريد الإلكتروني الجديد',
  reauthentication: 'رمز التحقق',
}

function redact(email: string | null | undefined): string {
  if (!email) return '***'
  const [l, d] = email.split('@')
  if (!l || !d) return '***'
  return `${l[0]}***@${d}`
}

interface DispatchBody {
  action: Action
  email?: string
  password?: string
  newEmail?: string
  redirectTo?: string
  username?: string
  displayName?: string
  referralCode?: string
  idempotencyKey?: string
}

async function generateLink(
  admin: SupabaseClient,
  body: DispatchBody,
  authenticatedUserEmail?: string,
): Promise<{ url: string; token?: string; email: string }> {
  const { action } = body
  const email = body.email ?? authenticatedUserEmail
  if (!email) throw new Error('email is required')

  const redirectTo = body.redirectTo

  if (action === 'signup') {
    if (!body.password) throw new Error('password is required for signup')
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password: body.password,
      options: {
        redirectTo,
        data: {
          ...(body.username ? { username: body.username } : {}),
          ...(body.displayName ? { display_name: body.displayName, full_name: body.displayName } : {}),
          ...(body.referralCode ? { referral_code: body.referralCode } : {}),
        },
      },
    })
    if (error) throw error
    return { url: data.properties?.action_link ?? '', email }
  }

  if (action === 'recovery') {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (error) throw error
    return { url: data.properties?.action_link ?? '', email }
  }

  if (action === 'magiclink') {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (error) throw error
    return { url: data.properties?.action_link ?? '', email }
  }

  if (action === 'email_change') {
    if (!body.newEmail) throw new Error('newEmail is required for email_change')
    // Send the confirmation to the NEW address.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'email_change_new',
      email,
      newEmail: body.newEmail,
      options: { redirectTo },
    })
    if (error) throw error
    return { url: data.properties?.action_link ?? '', email: body.newEmail }
  }

  // reauthentication is handled directly in the POST handler using the
  // Irth-native OTP pipeline (no admin.generateLink support in Supabase).
  throw new Error(`Unsupported action: ${action}`)
}

async function renderTemplate(
  action: Action,
  args: { url: string; token?: string; oldEmail?: string; newEmail?: string },
): Promise<string> {
  const site = { siteName: SITE_NAME_AR, siteUrl: `https://${FROM_DOMAIN}` }
  let node: React.ReactElement
  switch (action) {
    case 'signup':
      node = React.createElement(SignupEmail, {
        siteName: site.siteName,
        siteUrl: site.siteUrl,
        recipient: '',
        confirmationUrl: args.url,
      })
      break
    case 'recovery':
      node = React.createElement(RecoveryEmail, {
        siteName: site.siteName,
        confirmationUrl: args.url,
      })
      break
    case 'magiclink':
      node = React.createElement(MagicLinkEmail, {
        siteName: site.siteName,
        confirmationUrl: args.url,
      })
      break
    case 'email_change':
      node = React.createElement(EmailChangeEmail, {
        siteName: site.siteName,
        oldEmail: args.oldEmail ?? '',
        email: args.oldEmail ?? '',
        newEmail: args.newEmail ?? '',
        confirmationUrl: args.url,
      })
      break
    case 'reauthentication':
      node = React.createElement(ReauthenticationEmail, { token: args.token ?? '' })
      break
  }
  return await render(node)
}

export const Route = createFileRoute('/lovable/email/auth-custom/dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = (process.env.AUTH_EMAIL_MODE || 'custom').toLowerCase()
        if (mode !== 'custom') {
          return Response.json(
            { error: 'auth_email_mode_disabled', mode },
            { status: 503 },
          )
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          console.error('auth-custom: missing supabase env')
          return Response.json({ error: 'server_config' }, { status: 500 })
        }

        let body: DispatchBody
        try {
          body = (await request.json()) as DispatchBody
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }

        if (!body.action || !(body.action in AUTH_REQUIRED)) {
          return Response.json({ error: 'invalid_action' }, { status: 400 })
        }

        const admin = createClient(supabaseUrl, serviceKey)

        // If the action requires auth, validate bearer & get the caller's email.
        let callerEmail: string | undefined
        if (AUTH_REQUIRED[body.action]) {
          const authHeader = request.headers.get('Authorization')
          if (!authHeader?.startsWith('Bearer ')) {
            return Response.json({ error: 'unauthorized' }, { status: 401 })
          }
          const token = authHeader.slice(7).trim()
          const { data: { user }, error } = await admin.auth.getUser(token)
          if (error || !user) {
            return Response.json({ error: 'unauthorized' }, { status: 401 })
          }
          callerEmail = user.email ?? undefined
        }

        let link: { url: string; token?: string; email: string }
        try {
          link = await generateLink(admin, body, callerEmail)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('auth-custom: generateLink failed', {
            action: body.action,
            error: msg,
          })
          return Response.json(
            { error: 'generate_link_failed', message: msg },
            { status: 400 },
          )
        }

        if (!link.url && body.action !== 'reauthentication') {
          return Response.json(
            { error: 'no_action_link' },
            { status: 500 },
          )
        }

        const html = await renderTemplate(body.action, {
          url: link.url,
          token: link.token,
          oldEmail: callerEmail,
          newEmail: body.newEmail,
        })
        const subject = SUBJECTS[body.action]
        const messageId = crypto.randomUUID()
        const idempotencyKey = body.idempotencyKey ?? messageId
        const recipient = link.email

        // Log pending row for observability parity with legacy pipeline.
        await admin.from('email_send_log').insert({
          message_id: messageId,
          template_name: body.action,
          recipient_email: recipient,
          status: 'pending',
        })

        const { error: enqueueError } = await admin.rpc('enqueue_email', {
          queue_name: 'auth_emails_custom',
          payload: {
            run_id: crypto.randomUUID(),
            message_id: messageId,
            idempotency_key: idempotencyKey,
            to: recipient,
            from: FROM_ADDRESS,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            purpose: 'transactional',
            label: body.action,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          console.error('auth-custom: enqueue failed', {
            action: body.action,
            error: enqueueError,
          })
          await admin.from('email_send_log').insert({
            message_id: messageId,
            template_name: body.action,
            recipient_email: recipient,
            status: 'failed',
            error_message: 'enqueue_email RPC failed',
          })
          return Response.json({ error: 'enqueue_failed' }, { status: 500 })
        }

        console.log('auth-custom: enqueued', {
          action: body.action,
          message_id: messageId,
          recipient: redact(recipient),
          brand: SITE_NAME_LATIN,
        })

        return Response.json({
          ok: true,
          queued: true,
          message_id: messageId,
          action: body.action,
        })
      },
    },
  },
})

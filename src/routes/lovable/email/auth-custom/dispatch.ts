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
import { corsPreflight, withCors } from '@/lib/serverCors'

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
const REPLY_TO_ADDRESS = 'info@dosur1444.com'

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

/**
 * Arabic plain-text alternative for each auth email. Improves deliverability
 * (Gmail flags HTML-only mail) and gives a readable fallback for text clients.
 * Kept intentionally minimal — do not modify the HTML templates.
 */
function renderTextTemplate(
  action: Action,
  args: { url: string; token?: string; oldEmail?: string; newEmail?: string },
): string {
  const brand = SITE_NAME_AR
  const site = `https://${FROM_DOMAIN}`
  const url = args.url
  const nl = '\r\n'
  const footer =
    `${nl}${nl}` +
    `إذا لم تطلب هذه الرسالة، يمكنك تجاهلها بأمان.${nl}` +
    `للتواصل: ${REPLY_TO_ADDRESS}${nl}` +
    `${brand} — ${site}${nl}`

  switch (action) {
    case 'signup':
      return (
        `مرحبًا بك في ${brand}.${nl}${nl}` +
        `لتأكيد بريدك الإلكتروني، افتح الرابط التالي:${nl}${url}${nl}${nl}` +
        `الرابط صالح لمدة محدودة ولا يمكن استخدامه إلا مرة واحدة.` +
        footer
      )
    case 'recovery':
      return (
        `طلبتَ إعادة تعيين كلمة المرور لحسابك في ${brand}.${nl}${nl}` +
        `لإكمال العملية، افتح الرابط التالي:${nl}${url}${nl}${nl}` +
        `إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.` +
        footer
      )
    case 'magiclink':
      return (
        `رابط الدخول إلى ${brand}:${nl}${url}${nl}${nl}` +
        `الرابط صالح لفترة قصيرة ويُستخدم مرة واحدة فقط.` +
        footer
      )
    case 'email_change':
      return (
        `طلب تغيير البريد الإلكتروني لحسابك في ${brand}.${nl}` +
        (args.oldEmail ? `البريد الحالي: ${args.oldEmail}${nl}` : '') +
        (args.newEmail ? `البريد الجديد: ${args.newEmail}${nl}` : '') +
        `${nl}لتأكيد التغيير، افتح الرابط التالي:${nl}${url}${nl}${nl}` +
        `إذا لم تطلب هذا التغيير، تجاهل هذه الرسالة.` +
        footer
      )
    case 'reauthentication':
      return (
        `رمز التحقق الخاص بك في ${brand}:${nl}${nl}` +
        `${args.token ?? ''}${nl}${nl}` +
        `الرمز صالح لعشر دقائق ولا يمكن استخدامه إلا مرة واحدة.` +
        footer
      )
  }
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

        const admin: SupabaseClient<any, any> = createClient(supabaseUrl, serviceKey)

        // If the action requires auth, validate bearer & get the caller's email/id.
        let callerEmail: string | undefined
        let callerUserId: string | undefined
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
          callerUserId = user.id
        }

        // Build the delivery payload. For reauthentication we generate a native
        // Irth OTP; other actions call Supabase generateLink.
        let link: { url: string; token?: string; email: string }
        if (body.action === 'reauthentication') {
          if (!callerUserId || !callerEmail) {
            return Response.json({ error: 'unauthorized' }, { status: 401 })
          }
          // Rate limit: max REAUTH_RATE_LIMIT_PER_HOUR challenges per user per hour.
          const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          const { count: recentCount, error: countErr } = await admin
            .from('reauth_challenges')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', callerUserId)
            .eq('purpose', REAUTH_PURPOSE)
            .gte('created_at', sinceIso)
          if (countErr) {
            console.error('auth-custom: reauth rate check failed', countErr)
            return Response.json({ error: 'rate_check_failed' }, { status: 500 })
          }
          if ((recentCount ?? 0) >= REAUTH_RATE_LIMIT_PER_HOUR) {
            return Response.json(
              { error: 'rate_limited', retry_after_seconds: 3600 },
              { status: 429 },
            )
          }

          const code = generateSixDigitCode()
          const codeHash = await hashReauthCode(callerUserId, code)
          const expiresAt = new Date(
            Date.now() + REAUTH_TTL_MINUTES * 60 * 1000,
          ).toISOString()
          const requesterIp =
            request.headers.get('cf-connecting-ip') ??
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            null

          const { error: insertErr } = await admin
            .from('reauth_challenges')
            .insert({
              user_id: callerUserId,
              purpose: REAUTH_PURPOSE,
              code_hash: codeHash,
              expires_at: expiresAt,
              max_attempts: REAUTH_MAX_ATTEMPTS,
              requester_ip: requesterIp,
            })
          if (insertErr) {
            console.error('auth-custom: reauth insert failed', insertErr)
            return Response.json({ error: 'issue_challenge_failed' }, { status: 500 })
          }

          console.log('auth-custom: reauth challenge issued', {
            user_id: callerUserId,
            recipient: redact(callerEmail),
            expires_at: expiresAt,
          })

          link = { url: '', token: code, email: callerEmail }
        } else {
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

          if (!link.url) {
            return Response.json({ error: 'no_action_link' }, { status: 500 })
          }
        }


        const html = await renderTemplate(body.action, {
          url: link.url,
          token: link.token,
          oldEmail: callerEmail,
          newEmail: body.newEmail,
        })
        const text = renderTextTemplate(body.action, {
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
            reply_to: REPLY_TO_ADDRESS,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
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

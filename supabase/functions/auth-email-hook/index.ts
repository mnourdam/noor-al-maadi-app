// Supabase Edge Function: auth-email-hook
//
// Invoked by the Supabase Auth Send Email Hook (via the Lovable platform
// proxy). Renders Arabic Irth-branded HTML and enqueues into the pgmq
// `auth_emails` queue. The existing queue processor
// (src/routes/lovable/email/queue/process.ts) delivers via Resend.
//
// The platform-managed hook URL is unchanged; we simply provide the
// edge function it forwards to.
//
// Optional signature verification:
//   SEND_EMAIL_HOOK_SECRET (standard-webhooks format `v1,whsec_...` OR raw `whsec_...`)
//   If unset, requests are accepted and a warning is logged (so we can
//   diagnose the exact caller signature the first time it fires).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SITE_NAME_AR = 'إرث'
const SITE_NAME_LATIN = 'Irth'
const FROM_DOMAIN = 'mail.dosur1444.com'
const SENDER_DOMAIN = FROM_DOMAIN
const FROM_ADDRESS = `${SITE_NAME_AR} <no-reply@${FROM_DOMAIN}>`

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'تأكيد البريد الإلكتروني',
  invite: 'دعوة للانضمام إلى إرث',
  magiclink: 'رابط الدخول إلى إرث',
  recovery: 'إعادة تعيين كلمة المرور',
  email_change: 'تأكيد البريد الإلكتروني الجديد',
  reauthentication: 'رمز التحقق',
}

// --- Inline Arabic templates (kept in sync with src/lib/email-templates/*) ---

const BRAND = {
  navy: '#0b1424',
  navyDeep: '#070e1c',
  navyLine: '#1a2740',
  gold: '#d4af37',
  goldSoft: '#e8c66a',
  textOnNavy: '#f6efe1',
  textMuted: '#a8b3c7',
  logoUrl: 'https://irth-develop.lovable.app/irth-icon.png',
  brand: SITE_NAME_AR,
  brandLatin: SITE_NAME_LATIN,
}

function shell({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="background:#fff;margin:0;padding:24px 12px;font-family:'IBM Plex Sans Arabic','Cairo','Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="background:${BRAND.navy};border:1px solid ${BRAND.navyLine};border-radius:16px;padding:36px 28px;max-width:560px;margin:0 auto;direction:rtl;text-align:right;color:${BRAND.textOnNavy};">
    <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid ${BRAND.navyLine};margin-bottom:24px;">
      <img src="${BRAND.logoUrl}" alt="إرث" style="width:64px;height:64px;display:block;margin:0 auto 12px;" />
      <div style="color:${BRAND.gold};font-size:22px;font-weight:700;letter-spacing:2px;">${BRAND.brand}</div>
      <div style="color:${BRAND.textMuted};font-size:12px;margin-top:4px;letter-spacing:1px;">رحلة عبر التاريخ الإسلامي</div>
    </div>
    ${body}
    <div style="color:${BRAND.textMuted};font-size:11px;line-height:1.8;margin-top:24px;padding-top:20px;border-top:1px solid ${BRAND.navyLine};text-align:center;">
      © ${new Date().getFullYear()} ${BRAND.brand} — ${BRAND.brandLatin}
    </div>
  </div>
</body>
</html>`
}

function btn(url: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${escapeAttr(url)}" style="background:${BRAND.gold};color:${BRAND.navyDeep};font-size:15px;font-weight:700;border-radius:10px;padding:14px 28px;text-decoration:none;display:inline-block;">${label}</a>
  </div>
  <div style="color:${BRAND.textMuted};font-size:12px;margin:0 0 6px;text-align:right;">أو انسخ الرابط التالي والصقه في متصفحك:</div>
  <div style="color:${BRAND.goldSoft};font-size:12px;word-break:break-all;background:${BRAND.navyDeep};border:1px solid ${BRAND.navyLine};border-radius:8px;padding:10px 12px;display:block;text-align:left;direction:ltr;margin:0 0 24px;">${escapeHtml(url)}</div>`
}

function codeBlock(token: string): string {
  return `<div style="font-family:'Courier New',monospace;font-size:28px;font-weight:700;color:${BRAND.gold};letter-spacing:8px;text-align:center;background:${BRAND.navyDeep};border:1px solid ${BRAND.navyLine};border-radius:10px;padding:18px;margin:0 0 24px;direction:ltr;">${escapeHtml(token)}</div>`
}

function h1(text: string): string {
  return `<h1 style="color:${BRAND.goldSoft};font-size:22px;font-weight:700;margin:0 0 16px;text-align:right;">${text}</h1>`
}
function p(text: string): string {
  return `<p style="color:${BRAND.textOnNavy};font-size:15px;line-height:1.9;margin:0 0 18px;text-align:right;">${text}</p>`
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
}
function escapeAttr(s: string): string { return escapeHtml(s) }

function renderTemplate(emailType: string, data: { url?: string; token?: string; email?: string; newEmail?: string; oldEmail?: string }): { subject: string; html: string; text: string } {
  const subject = EMAIL_SUBJECTS[emailType] || 'إشعار من إرث'
  const url = data.url || ''
  const token = data.token || ''
  let body = ''
  let textBody = ''

  switch (emailType) {
    case 'signup':
      body = h1('أهلًا بك في إرث') +
        p('شكرًا لانضمامك إلينا. لتفعيل حسابك، يرجى تأكيد بريدك الإلكتروني بالضغط على الزر أدناه.') +
        btn(url, 'تأكيد البريد الإلكتروني')
      textBody = `أهلًا بك في إرث\n\nأكّد بريدك الإلكتروني: ${url}`
      break
    case 'invite':
      body = h1('لقد تمت دعوتك إلى إرث') +
        p('تمّت دعوتك للانضمام إلى إرث. اضغط الزر أدناه لقبول الدعوة.') +
        btn(url, 'قبول الدعوة')
      textBody = `تمت دعوتك للانضمام إلى إرث: ${url}`
      break
    case 'magiclink':
      body = h1('رابط الدخول الخاص بك') +
        p('اضغط الزر أدناه لتسجيل الدخول إلى حسابك في إرث. الرابط صالح لفترة قصيرة.') +
        btn(url, 'تسجيل الدخول')
      textBody = `رابط تسجيل الدخول إلى إرث: ${url}`
      break
    case 'recovery':
      body = h1('إعادة تعيين كلمة المرور') +
        p('تلقّينا طلبًا لإعادة تعيين كلمة مرور حسابك. اضغط الزر أدناه لتعيين كلمة مرور جديدة.') +
        btn(url, 'إعادة تعيين كلمة المرور') +
        p('<span style="color:' + BRAND.textMuted + ';font-size:12px;">إن لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.</span>')
      textBody = `أعد تعيين كلمة المرور: ${url}`
      break
    case 'email_change':
      body = h1('تأكيد تغيير البريد الإلكتروني') +
        p('لقد طلبت تغيير البريد الإلكتروني لحسابك في إرث. اضغط الزر أدناه لتأكيد البريد الجديد.') +
        btn(url, 'تأكيد البريد الجديد')
      textBody = `أكّد تغيير البريد الإلكتروني: ${url}`
      break
    case 'reauthentication':
      body = h1('تأكيد الهوية') +
        p('استخدم الرمز التالي لتأكيد هويتك:') +
        codeBlock(token)
      textBody = `رمز التحقق: ${token}`
      break
    default:
      body = h1('إشعار من إرث') + p('لقد استلمنا طلبًا يتعلق بحسابك.')
      textBody = 'إشعار من إرث'
  }

  return { subject, html: shell({ title: subject, body }), text: textBody }
}

// --- standard-webhooks signature verification (optional) ---

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function verifyStandardWebhook(req: Request, rawBody: string, secretRaw: string): Promise<boolean> {
  // Accept both `v1,whsec_...` and raw `whsec_...` / plain base64 secrets.
  let secretB64 = secretRaw
  if (secretRaw.startsWith('v1,')) secretB64 = secretRaw.slice(3)
  if (secretB64.startsWith('whsec_')) secretB64 = secretB64.slice('whsec_'.length)

  const id = req.headers.get('webhook-id')
  const ts = req.headers.get('webhook-timestamp')
  const sig = req.headers.get('webhook-signature')
  if (!id || !ts || !sig) return false

  const toSign = `${id}.${ts}.${rawBody}`
  let keyBytes: Uint8Array
  try {
    keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0))
  } catch {
    keyBytes = new TextEncoder().encode(secretB64)
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const macBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign)))
  const macB64 = btoa(String.fromCharCode(...macBytes))
  const expected = `v1,${macB64}`
  const expectedBytes = new TextEncoder().encode(expected)

  for (const part of sig.split(' ')) {
    const partBytes = new TextEncoder().encode(part)
    if (timingSafeEqual(partBytes, expectedBytes)) return true
  }
  return false
}

// --- handler ---

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, function: 'auth-email-hook' }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')

  if (!supabaseUrl || !serviceKey) {
    console.error('auth-email-hook: missing SUPABASE_URL/SERVICE_ROLE_KEY')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 })
  }

  const rawBody = await req.text()

  // Log caller signature metadata so we can align signing on first fire.
  const sigHeaders = {
    'webhook-id': req.headers.get('webhook-id'),
    'webhook-timestamp': req.headers.get('webhook-timestamp'),
    'webhook-signature-present': Boolean(req.headers.get('webhook-signature')),
    'x-supabase-signature-present': Boolean(req.headers.get('x-supabase-signature')),
    'user-agent': req.headers.get('user-agent'),
  }

  if (hookSecret) {
    const ok = await verifyStandardWebhook(req, rawBody, hookSecret)
    if (!ok) {
      console.error('auth-email-hook: signature verification failed', sigHeaders)
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }
  } else {
    console.warn('auth-email-hook: SEND_EMAIL_HOOK_SECRET not set; accepting unsigned request', sigHeaders)
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Supabase Auth Send Email Hook payload shape:
  //   { user: { email, ... }, email_data: { token, token_hash, redirect_to, email_action_type, site_url, ... } }
  const emailData = body.email_data || body.data || {}
  const user = body.user || {}
  const emailType: string = emailData.email_action_type || emailData.action_type || ''
  const recipient: string = user.email || emailData.email || ''
  const url: string = emailData.redirect_to || emailData.url || ''
  const token: string = emailData.token || ''
  const newEmail: string | undefined = emailData.new_email || user.new_email
  const oldEmail: string | undefined = emailData.old_email || user.email

  if (!emailType || !recipient) {
    console.error('auth-email-hook: missing emailType/recipient', { emailType, hasRecipient: Boolean(recipient) })
    return new Response(JSON.stringify({ error: 'Invalid payload shape' }), { status: 400 })
  }

  const { subject, html, text } = renderTemplate(emailType, {
    url,
    token,
    email: recipient,
    newEmail,
    oldEmail,
  })

  const supabase = createClient(supabaseUrl, serviceKey)
  const messageId = crypto.randomUUID()

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      run_id: crypto.randomUUID(),
      message_id: messageId,
      to: recipient,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: emailType,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('auth-email-hook: enqueue failed', { error: enqueueError, emailType })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipient,
      status: 'failed',
      error_message: 'enqueue_email RPC failed',
    })
    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), { status: 500 })
  }

  console.log('auth-email-hook: enqueued', { emailType, message_id: messageId })
  return new Response(JSON.stringify({ success: true, queued: true, message_id: messageId }), {
    headers: { 'content-type': 'application/json' },
  })
})

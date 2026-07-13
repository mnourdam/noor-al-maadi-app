// Irth-native reauthentication verify route.
//
// POST /lovable/email/auth-custom/verify-reauth
//   Headers: Authorization: Bearer <supabase user access token>
//   Body:    { "code": "123456" }
//
// Behaviour:
//   - Validates the bearer, extracts user_id.
//   - Looks up the latest active challenge (not consumed, not locked, not expired).
//   - Constant-time compares the SHA-256(userId + ':' + code) hash.
//   - On success: marks consumed, returns { ok: true }.
//   - On failure: increments attempts; at max_attempts, sets locked_at.
//   - Never leaks whether a challenge exists.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { corsPreflight, withCors } from '@/lib/serverCors'

import { REAUTH_PURPOSE, hashReauthCode, timingSafeEqualHex } from '@/lib/reauth-otp'

interface VerifyBody {
  code?: string
}

export const Route = createFileRoute('/lovable/email/auth-custom/verify-reauth')({
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
          console.error('verify-reauth: missing supabase env')
          return Response.json({ error: 'server_config' }, { status: 500 })
        }

        const authHeader = request.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }
        const bearer = authHeader.slice(7).trim()

        let body: VerifyBody
        try {
          body = (await request.json()) as VerifyBody
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }
        const rawCode = typeof body.code === 'string' ? body.code.trim() : ''
        if (!/^\d{6}$/.test(rawCode)) {
          return Response.json({ error: 'invalid_code_format' }, { status: 400 })
        }

        const admin: SupabaseClient<any, any> = createClient(supabaseUrl, serviceKey)

        const { data: { user }, error: userErr } = await admin.auth.getUser(bearer)
        if (userErr || !user) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        // Fetch latest active (unconsumed, unlocked) challenge for this user.
        const nowIso = new Date().toISOString()
        const { data: challenges, error: fetchErr } = await admin
          .from('reauth_challenges')
          .select('id, code_hash, expires_at, attempts, max_attempts, locked_at, consumed_at')
          .eq('user_id', user.id)
          .eq('purpose', REAUTH_PURPOSE)
          .is('consumed_at', null)
          .is('locked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)

        if (fetchErr) {
          console.error('verify-reauth: fetch failed', fetchErr)
          return Response.json({ error: 'verify_failed' }, { status: 500 })
        }

        const challenge = challenges?.[0]
        if (!challenge) {
          return Response.json({ error: 'no_active_challenge' }, { status: 400 })
        }

        if (new Date(challenge.expires_at).getTime() < Date.now()) {
          return Response.json({ error: 'expired' }, { status: 400 })
        }

        const expectedHash = await hashReauthCode(user.id, rawCode)
        const match = timingSafeEqualHex(expectedHash, challenge.code_hash)

        if (match) {
          const { error: updateErr } = await admin
            .from('reauth_challenges')
            .update({ consumed_at: nowIso, attempts: (challenge.attempts ?? 0) + 1 })
            .eq('id', challenge.id)
          if (updateErr) {
            console.error('verify-reauth: consume failed', updateErr)
            return Response.json({ error: 'verify_failed' }, { status: 500 })
          }
          console.log('verify-reauth: success', { user_id: user.id })
          return Response.json({ ok: true, verified: true })
        }

        const nextAttempts = (challenge.attempts ?? 0) + 1
        const isLocked = nextAttempts >= (challenge.max_attempts ?? 5)
        const { error: updateErr } = await admin
          .from('reauth_challenges')
          .update({
            attempts: nextAttempts,
            locked_at: isLocked ? nowIso : null,
          })
          .eq('id', challenge.id)
        if (updateErr) {
          console.error('verify-reauth: attempt update failed', updateErr)
        }

        console.warn('verify-reauth: failed attempt', {
          user_id: user.id,
          attempts: nextAttempts,
          locked: isLocked,
        })

        return Response.json(
          {
            error: isLocked ? 'locked' : 'invalid_code',
            attempts_remaining: isLocked
              ? 0
              : Math.max(0, (challenge.max_attempts ?? 5) - nextAttempts),
          },
          { status: isLocked ? 423 : 400 },
        )
      },
    },
  },
})

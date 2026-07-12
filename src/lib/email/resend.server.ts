// Server-only Resend transport, called through the Lovable connector gateway.
// The queue processor uses this instead of `sendLovableEmail`.
//
// - Never expose RESEND_API_KEY to the client.
// - Errors carry `.status` so the existing 429 rate-limit and permanent-failure
//   handling in process-email-queue keeps working unchanged.
// - Resend supports RFC-9457-style idempotency via the `Idempotency-Key` header.

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'

export interface ResendSendInput {
  to: string | string[]
  from: string
  subject: string
  html: string
  text?: string
  replyTo?: string | string[]
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  /** Idempotency key — Resend deduplicates identical sends within 24h. */
  idempotencyKey?: string
}

export interface ResendSendResult {
  /** Provider message id (Resend `id`). */
  provider_message_id: string
  status: number
  /** Raw provider response body for structured logging. */
  provider_response: Record<string, unknown>
}

export class ResendSendError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null
  readonly providerCode: string | undefined
  readonly providerBody: string

  constructor(
    message: string,
    opts: {
      status: number
      retryAfterSeconds?: number | null
      providerCode?: string
      providerBody?: string
    },
  ) {
    super(message)
    this.name = 'ResendSendError'
    this.status = opts.status
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null
    this.providerCode = opts.providerCode
    this.providerBody = opts.providerBody ?? ''
  }

  /** Retryable = transient (429 rate-limit, 5xx upstream). Everything else terminal. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const asInt = Number.parseInt(header, 10)
  if (Number.isFinite(asInt)) return asInt
  const asDate = Date.parse(header)
  if (Number.isNaN(asDate)) return null
  return Math.max(0, Math.round((asDate - Date.now()) / 1000))
}

/**
 * Send an email through Resend. Throws {@link ResendSendError} on non-2xx.
 * Callers already own retry/backoff/DLQ semantics.
 */
export async function sendViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  const lovableKey = process.env.LOVABLE_API_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured')
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')

  const body: Record<string, unknown> = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
  }
  if (input.text) body.text = input.text
  if (input.replyTo) body.reply_to = input.replyTo
  if (input.headers && Object.keys(input.headers).length > 0) body.headers = input.headers
  if (input.tags && input.tags.length > 0) body.tags = input.tags

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': resendKey,
  }
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  let parsed: Record<string, unknown> | undefined
  try {
    parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : undefined
  } catch {
    parsed = undefined
  }

  if (!response.ok) {
    const message =
      (parsed && typeof parsed.message === 'string' && parsed.message) ||
      (parsed && typeof parsed.error === 'string' && (parsed.error as string)) ||
      `Resend send failed (${response.status})`
    const providerCode =
      parsed && typeof parsed.name === 'string' ? (parsed.name as string) : undefined

    throw new ResendSendError(message, {
      status: response.status,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
      providerCode,
      providerBody: rawText.slice(0, 2000),
    })
  }

  const providerMessageId =
    parsed && typeof parsed.id === 'string' ? (parsed.id as string) : ''

  return {
    provider_message_id: providerMessageId,
    status: response.status,
    provider_response: parsed ?? {},
  }
}

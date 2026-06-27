import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/unsubscribe')({
  head: () => ({ meta: [{ title: 'إلغاء الاشتراك — إرث' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  component: UnsubscribePage,
})

type State =
  | { kind: 'loading' }
  | { kind: 'valid' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null

  useEffect(() => {
    if (!token) { setState({ kind: 'invalid' }); return }
    ;(async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
        const json = await res.json()
        if (!res.ok) setState({ kind: 'invalid' })
        else if (json.valid === false && json.reason === 'already_unsubscribed') setState({ kind: 'already' })
        else if (json.valid) setState({ kind: 'valid' })
        else setState({ kind: 'invalid' })
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'حدث خطأ' })
      }
    })()
  }, [token])

  const confirm = async () => {
    if (!token) return
    setState({ kind: 'submitting' })
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) setState({ kind: 'error', message: json.error ?? 'تعذر إكمال العملية' })
      else if (json.success) setState({ kind: 'success' })
      else if (json.reason === 'already_unsubscribed') setState({ kind: 'already' })
      else setState({ kind: 'error', message: 'تعذر إكمال العملية' })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'حدث خطأ' })
    }
  }

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-gold/25 bg-surface p-8 text-center shadow-elegant">
        <h1 className="font-display text-2xl font-bold text-gold">إلغاء الاشتراك</h1>
        <div className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {state.kind === 'loading' && 'جارٍ التحقق من الرابط…'}
          {state.kind === 'invalid' && 'الرابط غير صالح أو منتهي الصلاحية.'}
          {state.kind === 'already' && 'تم إلغاء اشتراكك مسبقًا — لن تصلك رسائل جديدة.'}
          {state.kind === 'valid' && 'هل تريد إيقاف استقبال رسائل إرث على هذا البريد؟'}
          {state.kind === 'submitting' && 'جارٍ إلغاء الاشتراك…'}
          {state.kind === 'success' && 'تم إلغاء اشتراكك بنجاح. لن تصلك رسائل جديدة.'}
          {state.kind === 'error' && state.message}
        </div>
        {state.kind === 'valid' && (
          <button
            onClick={confirm}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-gold px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
          >
            تأكيد إلغاء الاشتراك
          </button>
        )}
      </div>
    </div>
  )
}

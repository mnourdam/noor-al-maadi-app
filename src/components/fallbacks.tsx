import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, WifiOff, Loader2 } from "lucide-react";

/**
 * Reusable, polished-Arabic fallback components used across the app to
 * guarantee that the player never sees raw errors, stack traces, or
 * infinite spinners. These are intentionally framework-agnostic.
 */

type Tone = "muted" | "warning" | "offline";

function toneClasses(tone: Tone) {
  switch (tone) {
    case "warning":
      return "border-amber-500/30 bg-amber-500/5 text-amber-100";
    case "offline":
      return "border-slate-500/30 bg-slate-500/5 text-slate-200";
    default:
      return "border-slate-700/60 bg-slate-900/40 text-slate-200";
  }
}

/** Friendly "no data" state. Use whenever a list/collection comes back empty. */
export function EmptyState({
  title = "لا توجد بيانات لعرضها",
  hint,
  icon,
  action,
}: {
  title?: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className={`mx-auto flex max-w-md flex-col items-center rounded-2xl border p-6 text-center ${toneClasses("muted")}`}
    >
      <div className="mb-3 rounded-full border border-slate-700/60 bg-slate-900/60 p-3">
        {icon ?? <Inbox className="h-5 w-5 opacity-80" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {hint ? <p className="mt-1 text-xs opacity-80">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Polished Arabic "could not load" state with a Retry action. */
export function DataUnavailable({
  title = "تعذر تحميل المحتوى",
  hint = "يرجى المحاولة مرة أخرى.",
  onRetry,
  tone = "warning",
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  tone?: Tone;
}) {
  return (
    <div
      dir="rtl"
      className={`mx-auto flex max-w-md flex-col items-center rounded-2xl border p-6 text-center ${toneClasses(tone)}`}
    >
      <div className="mb-3 rounded-full border border-amber-500/30 bg-amber-500/10 p-3">
        <AlertTriangle className="h-5 w-5 text-amber-300" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}

/** "This item is no longer available" friendly state for missing entities. */
export function MissingEntity({
  title = "هذا المحتوى غير متاح حالياً",
  hint = "ربما تم نقله أو إزالته.",
  backHref,
  backLabel = "العودة",
}: {
  title?: string;
  hint?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div dir="rtl" className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 p-3">
        <Inbox className="h-5 w-5 text-amber-300" />
      </div>
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
      {backHref ? (
        <a
          href={backHref}
          className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 hover:border-amber-400"
        >
          {backLabel}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Loading state that never spins forever — after `timeoutMs` it shows a
 * Retry action so the player can recover from stuck requests.
 */
export function LoadingWithRetry({
  label = "جارٍ التحميل…",
  timeoutMs = 12000,
  onRetry,
}: {
  label?: string;
  timeoutMs?: number;
  onRetry?: () => void;
}) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), Math.max(2000, timeoutMs));
    return () => clearTimeout(t);
  }, [timeoutMs]);

  if (timedOut) {
    return (
      <DataUnavailable
        title="يستغرق التحميل وقتاً أطول من المعتاد"
        hint="تحقق من اتصالك ثم أعد المحاولة."
        onRetry={
          onRetry ??
          (() => {
            try {
              window.location.reload();
            } catch {
              /* noop */
            }
          })
        }
      />
    );
  }

  return (
    <div dir="rtl" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Inline "you're offline / showing cached data" banner. */
export function OfflineNotice({
  message = "أنت غير متصل بالإنترنت — يتم عرض المحتوى المحفوظ.",
}: {
  message?: string;
}) {
  return (
    <div
      dir="rtl"
      className={`mx-auto mb-3 flex max-w-3xl items-center gap-2 rounded-xl border px-3 py-2 text-xs ${toneClasses("offline")}`}
    >
      <WifiOff className="h-4 w-4 opacity-80" />
      <span>{message}</span>
    </div>
  );
}

/** Live hook: tracks navigator.onLine, debounced. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  useEffect(() => {
    const onChange = () => setOffline(!navigator.onLine);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);
  return offline;
}

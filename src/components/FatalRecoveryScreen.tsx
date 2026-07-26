import { useEffect, useRef, useState } from "react";
import { releaseAllUiLocks } from "@/lib/ui/ui-locks";
import {
  captureCrash,
  formatCrashReport,
  type CrashReport,
} from "@/lib/diagnostics/crash-report";
import { hardEscapeToHome, resetNavigationState } from "@/lib/diagnostics/safe-boot";

/**
 * The single fatal-recovery surface for the whole app.
 *
 * Invariants (P0 Android crash-loop fix):
 *  - Captures the ORIGINAL exception + full environment BEFORE showing UI.
 *  - Arms the one-launch crash marker so the next launch boots at `/`.
 *  - Every button is a HARD escape: none of them reuse the (possibly wedged)
 *    router or the broken history entry.
 *  - "إعادة المحاولة" retries at most ONCE, then falls back to a clean boot.
 */
export function FatalRecoveryScreen({
  error,
  reset,
  boundary,
}: {
  error: Error;
  reset: () => void;
  boundary: string;
}) {
  const [report, setReport] = useState<CrashReport | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearedKeys, setClearedKeys] = useState<string[] | null>(null);
  const retriedRef = useRef(false);

  useEffect(() => {
    setReport(captureCrash(error, boundary));
    // A crash can leave a full-screen overlay / body lock behind, which makes
    // this screen visible but unclickable. Release twice — the second pass
    // catches a layer that mounted on the same tick.
    releaseAllUiLocks();
    const t = window.setTimeout(releaseAllUiLocks, 120);
    return () => window.clearTimeout(t);
  }, [error, boundary]);

  const onRetry = () => {
    releaseAllUiLocks();
    if (retriedRef.current) {
      // Second attempt is not allowed to loop — go to a clean root boot.
      hardEscapeToHome({ resetNavigation: true });
      return;
    }
    retriedRef.current = true;
    try {
      reset();
    } catch {
      hardEscapeToHome({ resetNavigation: true });
      return;
    }
    // If the boundary is still on screen shortly after, the retry failed.
    window.setTimeout(() => {
      try {
        if (document.querySelector("[data-irth-recovery-layer]")) {
          hardEscapeToHome({ resetNavigation: true });
        }
      } catch { /* ignore */ }
    }, 600);
  };

  const onHome = () => {
    releaseAllUiLocks();
    hardEscapeToHome();
  };

  const onResetNavigation = () => {
    releaseAllUiLocks();
    const cleared = resetNavigationState();
    setClearedKeys(cleared);
    window.setTimeout(() => hardEscapeToHome({ resetNavigation: true }), 400);
  };

  const onCopy = () => {
    if (!report) return;
    const text = formatCrashReport(report);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); };
    try {
      void navigator.clipboard?.writeText(text).then(done).catch(() => {
        legacyCopy(text);
        done();
      });
    } catch {
      legacyCopy(text);
      done();
    }
  };

  return (
    <div
      dir="rtl"
      data-irth-error-boundary
      data-irth-recovery-layer
      className="fixed inset-0 z-[2147483000] flex items-start justify-center overflow-auto bg-background px-4 py-10"
      style={{ pointerEvents: "auto" }}
    >
      <div className="mx-auto w-full max-w-md text-center">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          تعذر تحميل هذا القسم
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ غير متوقع. بياناتك وتقدّمك محفوظة. اختر أحد الخيارات التالية.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={onHome}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            العودة للرئيسية
          </button>
          <button
            type="button"
            onClick={onResetNavigation}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground"
          >
            إعادة ضبط حالة التنقل
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          «إعادة ضبط حالة التنقل» تمسح حالة التنقل والأخطاء المؤقتة فقط — ولا تمس
          الحساب أو التقدّم أو الحملات أو المتحف أو القصص أو الإعدادات أو المحتوى
          المحفوظ للعمل دون اتصال.
        </p>

        {clearedKeys && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            تم مسح {clearedKeys.length} مفتاحًا مؤقتًا.
          </p>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-muted-foreground underline"
          >
            {showDetails ? "إخفاء التفاصيل التقنية" : "عرض التفاصيل التقنية"}
          </button>
        </div>

        {showDetails && report && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={onCopy}
              className="mb-2 inline-flex min-h-9 items-center rounded-lg border border-input px-3 py-1 text-xs text-foreground"
            >
              {copied ? "تم النسخ" : "نسخ التقرير"}
            </button>
            <pre
              dir="ltr"
              className="max-h-72 overflow-auto rounded-lg border border-input bg-muted/30 p-3 text-left text-[10px] leading-relaxed text-muted-foreground"
            >
              {formatCrashReport(report)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function legacyCopy(text: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch { /* ignore */ }
}

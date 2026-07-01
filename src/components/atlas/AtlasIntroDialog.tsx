// One-time informational dialog explaining the Atlas approximations.
// Preference is persisted to the user's profile settings when available,
// with a localStorage fallback for guests / offline use.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Compass, X } from "lucide-react";
import { useProfile } from "@/lib/profile";

const STORAGE_KEY = "irth.atlas.introDismissed.v1";

export function hasDismissedAtlasIntro(settingsFlag?: boolean): boolean {
  if (settingsFlag === true) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AtlasIntroDialog({
  open,
  onClose,
  forceInteractive,
}: {
  open: boolean;
  onClose: () => void;
  /** When true, checkbox defaults hidden — used when reopened from ⓘ. */
  forceInteractive?: boolean;
}) {
  const { updateSettings } = useProfile();
  const [dontShowAgain, setDontShowAgain] = useState(true);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const persistDismissal = () => {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    try {
      if (typeof updateSettings === "function") {
        updateSettings({ atlasIntroDismissed: true });
      }
    } catch { /* ignore */ }
  };

  const handleClose = () => {
    if (dontShowAgain) persistDismissal();
    onClose();
  };

  const handlePrimary = () => {
    if (dontShowAgain) persistDismissal();
    onClose();
  };

  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-intro-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_20px_80px_-20px_rgba(251,191,36,0.35)]">
        <button
          type="button"
          onClick={handleClose}
          className="absolute left-3 top-3 grid size-8 place-items-center rounded-full text-amber-100/70 hover:bg-white/5 hover:text-amber-100"
          aria-label="إغلاق"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-8 pb-2 text-center">
          <div className="mb-3 grid size-14 place-items-center rounded-full border border-amber-400/40 bg-amber-400/10 shadow-[0_0_40px_-8px_rgba(251,191,36,0.5)]">
            <Compass className="size-7 text-amber-300" />
          </div>
          <h2
            id="atlas-intro-title"
            className="font-display text-xl font-bold text-amber-100"
          >
            حول أطلس إرث
          </h2>
        </div>

        <div className="space-y-3 px-6 py-4 text-[13.5px] leading-8 text-slate-200/95">
          <p>
            صُمم أطلس إرث ليمنحك تصورًا بصريًا لمسار الأحداث وانتشار
            الحضارة الإسلامية.
          </p>
          <p>
            مواقع المعالم والأحداث في الأطلس تقريبية، وتهدف إلى تسهيل
            الاستكشاف التاريخي، ولا تُعد مرجعًا للإحداثيات الجغرافية
            الدقيقة أو الحدود السياسية والتاريخية.
          </p>
          <p>
            تم اختيار المواقع اعتمادًا على أفضل المصادر التاريخية
            المتاحة، مع مراعاة أن بعض المواقع والحدود تغيّرت عبر العصور
            أو لا يُعرف موضعها بدقة.
          </p>
        </div>

        {!forceInteractive && (
          <label className="mx-6 mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[12px] text-slate-300">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="size-4 accent-amber-400"
            />
            عدم إظهار هذه الرسالة مرة أخرى
          </label>
        )}

        <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-10 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-slate-200 hover:bg-white/[0.06]"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            className="min-h-10 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-[0_10px_30px_-10px_rgba(251,191,36,0.6)] hover:bg-amber-300"
          >
            ابدأ الاستكشاف
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

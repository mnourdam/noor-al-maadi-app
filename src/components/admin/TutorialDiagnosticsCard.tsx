// ============================================================
// Admin — Guided Tutorial Diagnostics Card (Phase 2C)
// ------------------------------------------------------------
// Admin-only surface exposed through /admin/offline-diagnostics.
// Uses ONLY the public @/lib/tutorial API surface. Never imports
// engine internals; never mutates persistence for anything other
// than the tutorial completion key.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { GraduationCap, Play, RefreshCw } from "lucide-react";

import {
  IRTH_FIRST_TIME_TUTORIAL,
  currentEligibilityOverride,
  readLastStartDiagnostic,
  readTutorialCompletionRecord,
  resetTutorialCompletion,
  tutorialDebug,
  type LastStartDiagnostic,
  type TutorialDiagnostics,
} from "@/lib/tutorial";

const POLL_MS = 400;

function fmtBool(b: boolean): string {
  return b ? "true" : "false";
}

function fmtRect(r: DOMRectReadOnly | null): string {
  if (!r) return "—";
  const round = (n: number) => Math.round(n);
  return `x:${round(r.x)} y:${round(r.y)} w:${round(r.width)} h:${round(r.height)}`;
}

function fmtCompletion(): string {
  const rec = readTutorialCompletionRecord();
  if (!rec) return "— (لم تكتمل)";
  const when =
    rec.completedAt > 0
      ? new Date(rec.completedAt * 1000).toLocaleString("ar-EG")
      : "غير محفوظ";
  return `v${rec.version} — ${when}`;
}

export function TutorialDiagnosticsCard() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [diag, setDiag] = useState<TutorialDiagnostics | null>(() =>
    tutorialDebug.diagnostics(),
  );
  const [override, setOverride] = useState<string | null>(() => {
    const o = currentEligibilityOverride();
    return o == null ? null : o;
  });
  const [completion, setCompletion] = useState<string>(() => fmtCompletion());
  const [lastStart, setLastStart] = useState<LastStartDiagnostic | null>(() =>
    readLastStartDiagnostic(),
  );
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setDiag(tutorialDebug.diagnostics());
    const o = currentEligibilityOverride();
    setOverride(o == null ? null : o);
    setCompletion(fmtCompletion());
    setLastStart(readLastStartDiagnostic());
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = window.setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refresh]);

  const steps = IRTH_FIRST_TIME_TUTORIAL.steps;
  const enabledCount = useMemo(
    () => steps.filter((s) => s.enabled === true).length,
    [steps],
  );

  const goHomeIfNeeded = useCallback(async (): Promise<void> => {
    if (pathname !== "/") {
      await navigate({ to: "/" });
      // Give the router + Home render a beat to settle.
      await new Promise((r) => window.setTimeout(r, 350));
    }
  }, [navigate, pathname]);

  const onStart = useCallback(async () => {
    try {
      await goHomeIfNeeded();
      tutorialDebug.forceEligibility();
      tutorialDebug.start();
      toast.success("تم بدء الجولة التعليمية.");
      refresh();
    } catch {
      toast.error("تعذّر بدء الجولة.");
    }
  }, [goHomeIfNeeded, refresh]);

  const onFinish = useCallback(() => {
    tutorialDebug.finish();
    toast.success("تم إنهاء الجولة.");
    refresh();
  }, [refresh]);

  const onReset = useCallback(() => {
    // Public API resets ONLY the completion key + closes engine.
    tutorialDebug.reset();
    // Defensive: also clear via public persistence API in case the
    // engine binding was not registered.
    resetTutorialCompletion();
    toast.success("تم إعادة تعيين الجولة.");
    refresh();
  }, [refresh]);

  const onForce = useCallback(() => {
    tutorialDebug.forceEligibility();
    toast("تم فرض الأهلية.");
    refresh();
  }, [refresh]);

  const onDisable = useCallback(() => {
    tutorialDebug.disableEligibility();
    toast("تم تعطيل الأهلية.");
    refresh();
  }, [refresh]);

  const onClearOverride = useCallback(() => {
    tutorialDebug.clearEligibilityOverride();
    toast("تم إلغاء تجاوز الأهلية.");
    refresh();
  }, [refresh]);

  const onJump = useCallback(
    async (rawIndex: number) => {
      try {
        await goHomeIfNeeded();
        tutorialDebug.forceEligibility();
        // Ensure the engine is running before jumping.
        const snap = tutorialDebug.diagnostics();
        if (!snap || snap.currentState === "idle" || snap.completed) {
          tutorialDebug.start();
          // Let the engine transition out of idle.
          await new Promise((r) => window.setTimeout(r, 200));
        }
        tutorialDebug.jumpToStep(rawIndex);
        // Give target resolution a moment before we inspect.
        window.setTimeout(() => {
          const d = tutorialDebug.diagnostics();
          if (d && !d.currentTargetResolved) {
            toast.error(
              `تعذّر إيجاد هدف الخطوة (${steps[rawIndex]?.title ?? rawIndex}).`,
            );
          }
          refresh();
        }, 900);
      } catch (err) {
        // Never crash the player UI — surface as toast.
        toast.error(
          `فشل الانتقال إلى الخطوة: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [goHomeIfNeeded, refresh, steps],
  );

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-amber-200">
        <GraduationCap className="h-4 w-4" />
        <h2 className="text-sm font-semibold">الجولة التعليمية</h2>
      </div>

      {/* Global actions */}
      <div className="mb-3 flex flex-wrap gap-2">
        <ActionButton onClick={onStart} tone="emerald" icon={<Play className="h-3.5 w-3.5" />}>
          تشغيل الجولة
        </ActionButton>
        <ActionButton onClick={onFinish} tone="slate">
          إنهاء الجولة
        </ActionButton>
        <ActionButton onClick={onReset} tone="rose" icon={<RefreshCw className="h-3.5 w-3.5" />}>
          إعادة تعيين الجولة
        </ActionButton>
        <ActionButton onClick={onForce} tone="amber">
          فرض الأهلية
        </ActionButton>
        <ActionButton onClick={onDisable} tone="amber">
          تعطيل الأهلية
        </ActionButton>
        <ActionButton onClick={onClearOverride} tone="slate">
          إلغاء تجاوز الأهلية
        </ActionButton>
      </div>

      {/* Step jumps */}
      <div className="mb-4 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => void onJump(i)}
            disabled={s.enabled !== true}
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/20 disabled:opacity-40"
            title={`analyticsId: ${s.analyticsId} · targetId: ${s.targetId}`}
          >
            الخطوة {i + 1} — {s.title}
          </button>
        ))}
      </div>

      {/* Live diagnostics */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs md:grid-cols-2">
        <DiagRow label="الحالة الحالية (currentState)" value={diag?.currentState ?? "—"} />
        <DiagRow
          label="فهرس الخطوة (currentStepIndex)"
          value={diag?.currentStepIndex == null ? "—" : String(diag.currentStepIndex)}
        />
        <DiagRow label="معرّف الخطوة (currentStepId)" value={diag?.currentStepId ?? "—"} />
        <DiagRow
          label="معرّف التحليلات (currentAnalyticsId)"
          value={diag?.currentAnalyticsId ?? "—"}
        />
        <DiagRow label="هدف الخطوة (currentTargetId)" value={diag?.currentTargetId ?? "—"} />
        <DiagRow
          label="تم إيجاد الهدف (currentTargetResolved)"
          value={diag ? fmtBool(diag.currentTargetResolved) : "—"}
        />
        <DiagRow
          label="مستطيل الهدف (currentTargetRect)"
          value={fmtRect(diag?.currentTargetRect ?? null)}
        />
        <DiagRow label="مؤهّل (eligible)" value={diag ? fmtBool(diag.eligible) : "—"} />
        <DiagRow label="متوقف (paused)" value={diag ? fmtBool(diag.paused) : "—"} />
        <DiagRow label="مكتمل (completed)" value={diag ? fmtBool(diag.completed) : "—"} />
        <DiagRow
          label="متوقف بسبب overlay (overlayPaused)"
          value={diag ? fmtBool(diag.overlayPaused) : "—"}
        />
        <DiagRow label="سبب الانتظار (waitingReason)" value={diag?.waitingReason ?? "—"} />
        <DiagRow label="تجاوز الأهلية (override)" value={override ?? "—"} />
      </div>

      {/* Registry summary */}
      <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs md:grid-cols-2">
        <DiagRow label="نسخة الجولة (tutorial version)" value={`v${IRTH_FIRST_TIME_TUTORIAL.version}`} />
        <DiagRow
          label="عدد الخطوات المفعّلة"
          value={`${enabledCount} / ${steps.length}`}
        />
        <DiagRow label="سجل الإكمال المحفوظ" value={completion} />
      </div>

      {/* Per-step registry table */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">id</th>
              <th className="p-2">enabled</th>
              <th className="p-2">analyticsId</th>
              <th className="p-2">targetId</th>
              <th className="p-2">debugColor</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-900/70">
                <td className="p-2 tabular-nums text-slate-400">{i}</td>
                <td className="p-2 font-mono text-slate-200">{s.id}</td>
                <td className="p-2">
                  {s.enabled === true ? (
                    <span className="text-emerald-300">true</span>
                  ) : (
                    <span className="text-rose-300">false</span>
                  )}
                </td>
                <td className="p-2 font-mono text-slate-300">{s.analyticsId}</td>
                <td className="p-2 font-mono text-slate-300">{s.targetId}</td>
                <td className="p-2 font-mono text-slate-300">{s.debugColor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Last auto-start diagnostic (persisted) */}
      <div className="mt-3 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
        <div className="mb-2 text-xs font-semibold text-amber-200">
          آخر لقطة تشخيصية (irth.tutorial.last-start-diagnostic.v1)
        </div>
        {lastStart ? (
          <pre
            dir="ltr"
            className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950/70 p-2 text-[11px] leading-relaxed text-emerald-100"
          >
            {JSON.stringify(lastStart, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-slate-400">لا توجد لقطة محفوظة بعد.</p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        يمسح <span className="font-mono">irth.tutorial.irth-first-time.completed-version.v1</span>{" "}
        فقط — لا يؤثر على المقدمة السينمائية أو الحساب أو تقدّم اللاعب.
      </p>
    </section>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span dir="ltr" className="font-mono text-slate-100">
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  onClick,
  children,
  tone = "slate",
  icon,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "emerald" | "rose" | "amber" | "slate";
  icon?: React.ReactNode;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
      : tone === "rose"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
        : tone === "amber"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
          : "border-slate-600/60 bg-slate-800/60 text-slate-100 hover:bg-slate-700/60";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${cls}`}
    >
      {icon}
      {children}
    </button>
  );
}

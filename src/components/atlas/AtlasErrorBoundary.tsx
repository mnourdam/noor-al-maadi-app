// Atlas-scoped fatal error boundary.
//
// Contract (see `src/lib/atlas/atlas-recovery.ts`):
//  • The failure never escapes the Atlas route — the generic router boundary
//    (which rendered above the app shell and left the full-screen Atlas layer's
//    locks behind) must never see an Atlas render error again.
//  • Every escape path works without the map: "العودة للرئيسية" is a plain
//    anchor navigation, so it works even if the router itself is wedged.
//  • Exactly ONE retry. A second failure drops to safe mode instead of
//    remounting a renderer that is known to be broken on this device.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AtlasSafeMode } from "./AtlasSafeMode";
import {
  captureAtlasDiagnostics,
  clearAtlasCrashMarker,
  enrichAtlasDiagnostics,
  logAtlasFailure,
  markAtlasCrash,
  releaseUiLocks,
  resetAtlasData,
} from "@/lib/atlas/atlas-recovery";
import type { QueryClient } from "@tanstack/react-query";

type Props = { children: ReactNode; queryClient?: QueryClient };
type State = { failed: boolean; retried: boolean; nonce: number };

export class AtlasErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, retried: false, nonce: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 1. Release anything that could block the whole app FIRST.
    releaseUiLocks();
    // 2. Capture and emit the real exception before any generic UI hides it.
    const diag = captureAtlasDiagnostics(error, { componentStack: info.componentStack ?? undefined });
    logAtlasFailure(error, diag);
    markAtlasCrash(diag);
    void enrichAtlasDiagnostics(diag).then((full) => {
      try { console.error("[atlas:fatal:diagnostics:full]", JSON.stringify(full)); } catch { /* ignore */ }
    });
  }

  private retry = () => {
    // Drop the failed query entry and remount the stage exactly once.
    try {
      this.props.queryClient?.removeQueries({
        predicate: (q: { queryKey?: readonly unknown[] }) =>
          String(q.queryKey?.[0] ?? "").startsWith("atlas-entities"),
      });
    } catch { /* ignore */ }
    releaseUiLocks();
    clearAtlasCrashMarker();
    this.setState((s) => ({ failed: false, retried: true, nonce: s.nonce + 1 }));
  };

  private resetData = () => {
    void resetAtlasData(this.props.queryClient).then(() => {
      this.setState((s) => ({ failed: false, retried: false, nonce: s.nonce + 1 }));
    });
  };

  render() {
    if (this.state.failed) {
      // Second failure → renderer is not viable here; stay in safe mode.
      if (this.state.retried) {
        return <AtlasSafeMode reason="error" onResetData={this.resetData} />;
      }
      return (
        <AtlasFatalScreen onRetry={this.retry} onResetData={this.resetData} />
      );
    }
    return <div key={this.state.nonce} className="contents">{this.props.children}</div>;
  }
}

function AtlasFatalScreen({
  onRetry,
  onResetData,
}: {
  onRetry: () => void;
  onResetData: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-background px-6 py-16 text-center"
      style={{ pointerEvents: "auto" }}
    >
      <h1 className="font-display text-lg font-bold text-foreground">تعذر فتح الأطلس</h1>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-7 text-muted-foreground">
        حدث خطأ أثناء تجهيز الخريطة على هذا الجهاز. يمكنك المحاولة مرة أخرى، أو العودة للرئيسية،
        أو إعادة ضبط بيانات الأطلس وحدها دون التأثير على تقدّمك.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          إعادة المحاولة
        </button>
        {/* Plain anchor on purpose: works even if the router is wedged. */}
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-gold/30 bg-surface px-5 text-sm font-medium text-foreground"
        >
          العودة للرئيسية
        </a>
      </div>
      <button
        type="button"
        onClick={onResetData}
        className="mt-4 text-[12px] text-muted-foreground underline underline-offset-4"
      >
        إعادة ضبط بيانات الأطلس
      </button>
    </div>
  );
}

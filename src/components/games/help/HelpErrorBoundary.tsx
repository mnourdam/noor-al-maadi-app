import { Component, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}
interface State { error: Error | null }

/**
 * Catches any render error inside the unified Help dialog so a misbehaving
 * help option can never bubble up to the route-level error boundary
 * ("تعذر تحميل هذا القسم"). Instead it shows a friendly local dialog and
 * lets the player return to the current mini-game.
 */
export class HelpErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  errorInfo: { componentStack?: string } | null = null;

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    this.errorInfo = errorInfo;
    // Keep logs but never rethrow.
    // eslint-disable-next-line no-console
    console.warn("[GameHelp] dialog render failed", error);

    // V11 Preview Diagnostics
    if (typeof window !== "undefined" && window.location.hostname.includes("lovable.app")) {
      console.error("[IRTH_HELP_RUNTIME_ERROR]", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }

  componentDidUpdate(prev: Props) {
    if (prev.open !== this.props.open && !this.props.open && this.state.error) {
      this.setState({ error: null });
      this.errorInfo = null;
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Dialog open={this.props.open} onOpenChange={(o) => { if (!o) { this.setState({ error: null }); this.props.onClose(); } }}>
        <DialogContent dir="rtl" className="max-w-sm border-amber-500/30 bg-gradient-to-b from-slate-950 to-slate-900 text-amber-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              تعذّر فتح المساعدة
            </DialogTitle>
            <DialogDescription className="text-amber-100/80 leading-7">
              حدث خلل بسيط أثناء تحضير خيارات المساعدة. يمكنك متابعة اللعبة كالمعتاد والمحاولة لاحقًا.
            </DialogDescription>
            {typeof window !== "undefined" && window.location.hostname.includes("lovable.app") && this.state.error && (
              <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-2 font-mono text-[10px] text-red-200">
                <p className="font-bold border-b border-red-500/20 mb-1 pb-1">PREVIEW DIAGNOSTICS</p>
                <p className="break-words">ERROR: {this.state.error.message}</p>
                <p className="mt-1 opacity-70 italic">SOURCE: {this.state.error.stack?.split("\n")[1]?.trim() || "Unknown"}</p>
              </div>
            )}
          </DialogHeader>
          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => { this.setState({ error: null }); this.props.onClose(); }}
              className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              حسنًا
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}

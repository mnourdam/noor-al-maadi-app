import { useUiLanguage } from "@/lib/ui-language/store";
import { HELP_DIALOG_MESSAGES } from "@/lib/ui-language/help-dialog-messages";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Standard production safety layer for the Game Help system.
 * Prevents a loop or logic error in a specific help-option registration 
 * from crashing the entire mini-game experience.
 */
export class HelpErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[HelpErrorBoundary] caught error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.fallback) return this.fallback;

      return (
        <HelpErrorFallback onRetry={this.handleRetry} />
      );
    }

    return this.props.children;
  }

  private get fallback() {
    return this.props.fallback;
  }
}

function HelpErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { language, direction } = useUiLanguage();
  const copy = HELP_DIALOG_MESSAGES[language];
  return (
        <div dir={direction} className="flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-xl border border-amber-500/20 bg-slate-900/40">
          <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-200">{copy.errorTitle}</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[240px]">
              {copy.errorDescription}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRetry}
            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {copy.retry}
          </Button>
        </div>
  );
}

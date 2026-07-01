import { Sprout } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { feedbackNewUrl } from "@/lib/feedback/context";
import type { FeedbackContext } from "@/lib/feedback/types";

interface Props {
  context?: Partial<FeedbackContext>;
  className?: string;
  label?: string;
}

/**
 * Small, subtle CTA rendered near the bottom of content pages.
 * Frames feedback as community contribution, not complaint.
 * Uses TanStack navigate for reliable client routing; hides itself
 * on admin routes so it stays player-facing only.
 */
export function FeedbackCTA({ context, className, label }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Never show on admin pages.
  if (pathname?.startsWith("/admin")) return null;

  const href = feedbackNewUrl(context ?? {});
  const ctxParam = href.includes("?ctx=") ? decodeURIComponent(href.split("?ctx=")[1]) : "";

  const go = (e: React.MouseEvent) => {
    // Allow modifier-clicks / middle-click to open in new tab via the anchor.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as unknown as { button: number }).button === 1) {
      return;
    }
    e.preventDefault();
    try {
      void navigate({
        to: "/feedback/new",
        search: ctxParam ? { ctx: ctxParam } : {},
      });
    } catch {
      // Ultimate fallback: hard navigation so the user never lands on a blank page.
      if (typeof window !== "undefined") window.location.href = href;
    }
  };

  return (
    <div className={`mt-10 flex justify-center ${className ?? ""}`}>
      <a
        href={href}
        onClick={go}
        className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-background/40 px-4 py-2 text-[12px] text-muted-foreground transition-all hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
      >
        <Sprout className="size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
        <span>{label ?? "وجدت شيئًا يحتاج تحسينًا؟"}</span>
        <span className="text-[10px] text-muted-foreground/60 group-hover:text-gold/70">— ساهم معنا</span>
      </a>
    </div>
  );
}

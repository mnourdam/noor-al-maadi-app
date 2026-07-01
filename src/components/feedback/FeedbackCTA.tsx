import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";
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
 */
export function FeedbackCTA({ context, className, label }: Props) {
  return (
    <div className={`mt-10 flex justify-center ${className ?? ""}`}>
      <Link
        to="/feedback/new"
        search={(() => {
          const url = feedbackNewUrl(context ?? {});
          const q = url.split("?")[1];
          const params = new URLSearchParams(q);
          const out: Record<string, string> = {};
          params.forEach((v, k) => { out[k] = v; });
          return out;
        })()}
        className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-background/40 px-4 py-2 text-[12px] text-muted-foreground transition-all hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
      >
        <Sprout className="size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
        <span>{label ?? "وجدت شيئًا يحتاج تحسينًا؟"}</span>
        <span className="text-[10px] text-muted-foreground/60 group-hover:text-gold/70">— ساهم معنا</span>
      </Link>
    </div>
  );
}

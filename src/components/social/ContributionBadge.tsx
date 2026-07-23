// ============================================================
// <ContributionBadge /> — personal, subtle badge on the user's
// OWN comment when it has been marked/applied as a contribution.
// Never rendered for other users' comments.
// ============================================================

import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabelAr, type MyContributionFlag } from "@/lib/social/contributions";

interface Props {
  flag: MyContributionFlag | null;
  className?: string;
}

export function ContributionBadge({ flag, className }: Props) {
  if (!flag) return null;
  const applied = flag.status === "applied";
  const label = applied
    ? "ساهمت في تحسين إرث"
    : "قيد المراجعة التحريرية";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        applied
          ? "border border-gold/40 bg-gold/10 text-gold"
          : "border border-white/15 bg-white/5 text-muted-foreground",
        className,
      )}
      title={categoryLabelAr(flag.category)}
      aria-label={label}
    >
      <Sprout className="size-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

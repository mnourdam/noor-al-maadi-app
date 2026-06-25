import { Sparkles } from "lucide-react";

interface Props {
  attemptsLeft: number;
  total: number;
}

/**
 * Elegant chip — never arcade-style. Communicates remaining attempts as a
 * subtle museum label rather than as "lives".
 */
export function AttemptsChip({ attemptsLeft, total }: Props) {
  const ratio = total > 0 ? attemptsLeft / total : 1;
  const tone =
    ratio > 0.5
      ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-200"
      : ratio > 0.25
      ? "border-amber-400/50 bg-amber-500/[0.10] text-amber-100"
      : "border-rose-400/50 bg-rose-500/[0.10] text-rose-100";
  const label = attemptsLeft === 1 ? "فرصتك الأخيرة" : "المحاولات المتبقية";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${tone}`}
      aria-label={`${label}: ${attemptsLeft} من ${total}`}
    >
      <Sparkles className="h-3 w-3" />
      {label}
      <span className="font-bold">{attemptsLeft}</span>
      <span className="text-current/70">/ {total}</span>
    </span>
  );
}

import { FolderOpen, Search, Puzzle, Scale, Trophy } from "lucide-react";
import type { InvestigationStep } from "@/lib/investigations-source";

export type CasePhase = "opening" | "evidence" | "deduction" | "verdict" | "closing";

const PHASES: { key: CasePhase; label: string; Icon: typeof FolderOpen }[] = [
  { key: "opening", label: "بداية الملف", Icon: FolderOpen },
  { key: "evidence", label: "الأدلة", Icon: Search },
  { key: "deduction", label: "الاستنتاج", Icon: Puzzle },
  { key: "verdict", label: "القرار", Icon: Scale },
  { key: "closing", label: "إغلاق القضية", Icon: Trophy },
];

/** Which phase of the case a given step belongs to. */
export function phaseForStep(step: InvestigationStep | undefined): CasePhase {
  switch (step?.type) {
    case "evidence": return "evidence";
    case "question": return "deduction";
    case "decision": return "verdict";
    case "conclusion": return "closing";
    default: return "opening";
  }
}

/**
 * The case timeline — a vertical-feeling chain of the five stages every
 * investigation moves through, replacing the generic segmented bar. The
 * player always sees where the file stands: which stages are behind them,
 * which one is live, and that the file ends by being closed.
 *
 * All counters are Western digits by contract.
 */
export function CaseTimeline({
  phase,
  stepIndex,
  totalSteps,
  answered,
  totalQuestions,
}: {
  phase: CasePhase;
  /** 0-based index of the live step. */
  stepIndex: number;
  totalSteps: number;
  answered: number;
  totalQuestions: number;
}) {
  const activeIdx = PHASES.findIndex((p) => p.key === phase);
  const pct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface/60 p-3">
      <div className="mb-2.5 flex items-baseline justify-between text-[10px] tracking-wider">
        <span className="text-gold" dir="ltr">
          {stepIndex + 1} / {totalSteps}
        </span>
        {totalQuestions > 0 && (
          <span className="text-muted-foreground">
            <span dir="ltr">{answered} / {totalQuestions}</span> إجابة
          </span>
        )}
      </div>

      <ol
        className="flex items-center gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="مسار القضية"
      >
        {PHASES.map((p, i) => {
          const passed = i < activeIdx;
          const active = i === activeIdx;
          const { Icon } = p;
          return (
            <li key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-center">
                <span
                  aria-hidden
                  className={`h-px flex-1 ${i === 0 ? "opacity-0" : passed || active ? "bg-gold/45" : "bg-white/10"}`}
                />
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border transition-all duration-500 ${
                    active
                      ? "border-gold bg-gradient-gold text-primary-foreground shadow-[0_0_16px_-4px_oklch(0.82_0.14_82/0.8)]"
                      : passed
                        ? "border-gold/45 bg-gold/12 text-gold"
                        : "border-white/12 bg-background/60 text-muted-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                </span>
                <span
                  aria-hidden
                  className={`h-px flex-1 ${i === PHASES.length - 1 ? "opacity-0" : passed ? "bg-gold/45" : "bg-white/10"}`}
                />
              </div>
              <span
                className={`truncate text-center text-[9px] leading-tight transition-colors ${
                  active ? "text-gold" : passed ? "text-foreground/70" : "text-muted-foreground/70"
                }`}
              >
                {p.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

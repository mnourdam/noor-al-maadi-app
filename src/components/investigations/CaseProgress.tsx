/**
 * Case progress trail — one notch per step, filled as the investigator moves
 * through the file. Question/decision steps are marked so the player can see
 * how much of the case is reading versus deduction.
 */
export function CaseProgress({
  total,
  current,
  answeredCount,
  totalQuestions,
  markers,
}: {
  /** Total number of steps in the case. */
  total: number;
  /** 0-based index of the step being shown. */
  current: number;
  answeredCount: number;
  totalQuestions: number;
  /** True for every step index that asks the player something. */
  markers: boolean[];
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between text-[10px] tracking-wider text-muted-foreground">
        <span className="text-gold">
          مسار القضية · {(current + 1).toLocaleString("ar-EG")}/{total.toLocaleString("ar-EG")}
        </span>
        {totalQuestions > 0 && (
          <span>
            {answeredCount.toLocaleString("ar-EG")}/{totalQuestions.toLocaleString("ar-EG")} استنتاج
          </span>
        )}
      </div>

      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current + 1}
        aria-label="تقدم التحقيق"
      >
        {Array.from({ length: total }, (_, i) => {
          const passed = i < current;
          const active = i === current;
          return (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                active
                  ? "bg-gradient-gold"
                  : passed
                    ? "bg-gold/55"
                    : "bg-white/10"
              } ${markers[i] ? "ring-1 ring-inset ring-amber-300/40" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}

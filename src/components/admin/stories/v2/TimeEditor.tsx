// Stories M5 — Time editor: Hijri (year/month/day, start & end),
// Gregorian (start/end YYYY-MM-DD), and precision selector.
import {
  STORY_TIME_PRECISION, STORY_TIME_PRECISION_LABEL,
  type StoryTimePrecision,
} from "@/lib/stories/v2/enums";

export interface TimeValue {
  hijri_start_year: number | null;
  hijri_start_month: number | null;
  hijri_start_day: number | null;
  hijri_end_year: number | null;
  hijri_end_month: number | null;
  hijri_end_day: number | null;
  gregorian_start: string | null;
  gregorian_end: string | null;
  time_precision: StoryTimePrecision;
}

function IntCell({
  label, value, onChange, min, max,
}: { label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number }) {
  return (
    <label className="block text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min} max={max}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm"
      />
    </label>
  );
}

export function TimeEditor({
  value, onChange,
}: { value: TimeValue; onChange: (next: TimeValue) => void }) {
  const set = (patch: Partial<TimeValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium">التاريخ والدقة</div>

      <label className="block text-xs">
        الدقة (time_precision)
        <select
          value={value.time_precision}
          onChange={(e) => set({ time_precision: e.target.value as StoryTimePrecision })}
          className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {STORY_TIME_PRECISION.map((p) => (
            <option key={p} value={p}>{STORY_TIME_PRECISION_LABEL[p]}</option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 text-[11px] font-medium">هجري — بداية</div>
        <div className="grid grid-cols-3 gap-2">
          <IntCell label="سنة" value={value.hijri_start_year} min={1} max={1600}
            onChange={(v) => set({ hijri_start_year: v })} />
          <IntCell label="شهر" value={value.hijri_start_month} min={1} max={12}
            onChange={(v) => set({ hijri_start_month: v })} />
          <IntCell label="يوم" value={value.hijri_start_day} min={1} max={30}
            onChange={(v) => set({ hijri_start_day: v })} />
        </div>
        <div className="mb-1 mt-2 text-[11px] font-medium">هجري — نهاية</div>
        <div className="grid grid-cols-3 gap-2">
          <IntCell label="سنة" value={value.hijri_end_year} min={1} max={1600}
            onChange={(v) => set({ hijri_end_year: v })} />
          <IntCell label="شهر" value={value.hijri_end_month} min={1} max={12}
            onChange={(v) => set({ hijri_end_month: v })} />
          <IntCell label="يوم" value={value.hijri_end_day} min={1} max={30}
            onChange={(v) => set({ hijri_end_day: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          ميلادي — بداية
          <input type="date" value={value.gregorian_start ?? ""}
            onChange={(e) => set({ gregorian_start: e.target.value || null })}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" dir="ltr" />
        </label>
        <label className="block text-xs">
          ميلادي — نهاية
          <input type="date" value={value.gregorian_end ?? ""}
            onChange={(e) => set({ gregorian_end: e.target.value || null })}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" dir="ltr" />
        </label>
      </div>
      <div className="text-[11px] text-muted-foreground">
        اختر الدقة أوّلاً، ثم املأ الحقول المناسبة فقط. اترك الباقي فارغًا.
      </div>
    </div>
  );
}

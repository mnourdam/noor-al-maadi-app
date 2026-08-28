/**
 * SegmentPicker — audience selector for the admin composer.
 *
 * V16 changes:
 *  - Resolution states are explicit: idle / loading / ok / error. A resolver
 *    failure is NEVER rendered as "0 مستلم"; it renders a red error box and
 *    the parent disables sending.
 *  - Preview separates matching users, reachable users (enabled push token)
 *    and device count.
 *  - Adds a generic numeric rule mode (level / xp / streak / hearts /
 *    account age) backed by the strict V16 predicate contract.
 */

import { useCallback, useEffect, useState } from "react";
import { Users, UserCheck, Sparkles, RefreshCw, SlidersHorizontal, AlertTriangle } from "lucide-react";
import {
  SEGMENTS, SEGMENT_GROUP_LABEL, findSegment, resolveAudience,
  FILTER_FIELDS, FILTER_OPERATORS, FILTER_FIELD_LABEL,
  type SegmentGroup, type NumericFilter, type AudienceResult,
  type FilterField, type FilterOperator,
} from "@/lib/notifications/admin/segments";

export type AudienceMode = "all" | "user" | "segment" | "filter";

export interface AudienceValue {
  mode: AudienceMode;
  userId?: string;
  segmentId?: string;
  filter?: NumericFilter;
  /** Resolution outcome for segment/filter modes (filled by the picker). */
  resolution?: AudienceResult | { status: "loading" };
}

export interface SegmentPickerProps {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
}

const DEFAULT_FILTER: NumericFilter = { field: "level", op: ">", value: 5 };

export function SegmentPicker({ value, onChange }: SegmentPickerProps) {
  const [nonce, setNonce] = useState(0);
  const filterKey = value.filter
    ? `${value.filter.field}|${value.filter.op}|${value.filter.value}`
    : "";

  const setValue = useCallback(onChange, [onChange]);

  useEffect(() => {
    if (value.mode !== "segment" && value.mode !== "filter") return;
    if (value.mode === "segment" && !value.segmentId) return;
    if (value.mode === "filter" && !value.filter) return;
    let alive = true;
    setValue({ ...value, resolution: { status: "loading" } });
    resolveAudience({
      segmentId: value.mode === "segment" ? value.segmentId : null,
      filter: value.mode === "filter" ? value.filter : null,
    }).then((res) => {
      if (!alive) return;
      setValue({ ...value, resolution: res });
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mode, value.segmentId, filterKey, nonce]);

  const resolution = value.resolution;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <ModeButton
          active={value.mode === "all"}
          onClick={() => onChange({ mode: "all" })}
          icon={<Users className="size-4" />}
          label="كل المستخدمين"
        />
        <ModeButton
          active={value.mode === "user"}
          onClick={() => onChange({ mode: "user", userId: value.userId ?? "" })}
          icon={<UserCheck className="size-4" />}
          label="مستخدم محدّد"
        />
        <ModeButton
          active={value.mode === "segment"}
          onClick={() => onChange({ mode: "segment", segmentId: value.segmentId ?? SEGMENTS[0]?.id })}
          icon={<Sparkles className="size-4" />}
          label="شريحة ذكية"
        />
        <ModeButton
          active={value.mode === "filter"}
          onClick={() => onChange({ mode: "filter", filter: value.filter ?? DEFAULT_FILTER })}
          icon={<SlidersHorizontal className="size-4" />}
          label="قاعدة رقمية"
        />
      </div>

      {value.mode === "user" && (
        <input
          dir="ltr"
          value={value.userId ?? ""}
          onChange={(e) => onChange({ mode: "user", userId: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      )}

      {value.mode === "segment" && (
        <select
          value={value.segmentId ?? ""}
          onChange={(e) => onChange({ mode: "segment", segmentId: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {(Object.keys(SEGMENT_GROUP_LABEL) as SegmentGroup[]).map((g) => (
            <optgroup key={g} label={SEGMENT_GROUP_LABEL[g]}>
              {SEGMENTS.filter((s) => s.group === g).map((s) => (
                <option key={s.id} value={s.id} disabled={s.coming_soon}>
                  {s.label}{s.coming_soon ? " — قريبًا" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {value.mode === "filter" && (
        <div className="grid grid-cols-3 gap-2">
          <select
            value={value.filter?.field ?? DEFAULT_FILTER.field}
            onChange={(e) => onChange({
              mode: "filter",
              filter: { ...(value.filter ?? DEFAULT_FILTER), field: e.target.value as FilterField },
            })}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            {FILTER_FIELDS.map((f) => (
              <option key={f} value={f}>{FILTER_FIELD_LABEL[f]}</option>
            ))}
          </select>
          <select
            dir="ltr"
            value={value.filter?.op ?? DEFAULT_FILTER.op}
            onChange={(e) => onChange({
              mode: "filter",
              filter: { ...(value.filter ?? DEFAULT_FILTER), op: e.target.value as FilterOperator },
            })}
            className="rounded-md border border-input bg-background px-2 py-2 text-center text-sm"
          >
            {FILTER_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            dir="ltr"
            type="number"
            value={String(value.filter?.value ?? DEFAULT_FILTER.value)}
            onChange={(e) => onChange({
              mode: "filter",
              filter: { ...(value.filter ?? DEFAULT_FILTER), value: Number(e.target.value) },
            })}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          />
        </div>
      )}

      {(value.mode === "segment" || value.mode === "filter") && (
        <div className="space-y-2">
          {value.mode === "segment" && value.segmentId && (
            <p className="text-xs text-muted-foreground">{findSegment(value.segmentId)?.description}</p>
          )}

          {(!resolution || resolution.status === "loading") && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              <span>جارٍ حساب الجمهور…</span>
            </div>
          )}

          {resolution?.status === "error" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">تعذّر تحديد الجمهور — الإرسال معطّل.</p>
                <p>{resolution.message}</p>
                <button
                  type="button"
                  onClick={() => setNonce((n) => n + 1)}
                  className="underline"
                >
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {resolution?.status === "ok" && (
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/20 p-2 text-center text-xs">
              <Stat label="مستخدم مطابق" value={resolution.matchingUsers} />
              <Stat label="يمكن الوصول إليه" value={resolution.reachableUsers} />
              <Stat label="جهاز" value={resolution.deviceCount} />
              {resolution.matchingUsers === 0 && (
                <p className="col-span-3 text-muted-foreground">
                  الشريحة صالحة لكنها لا تطابق أي مستخدم حاليًا.
                </p>
              )}
              {resolution.matchingUsers > 0 && resolution.reachableUsers === 0 && (
                <p className="col-span-3 text-muted-foreground">
                  لا يوجد جهاز مفعّل لاستلام الإشعار — سيظهر داخل التطبيق فقط.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-sm text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ModeButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

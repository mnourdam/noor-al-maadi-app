/**
 * SegmentPicker — replaces the legacy target_type=all/user dropdown with
 * a richer audience selector: all users, a specific user (UUID), or any
 * smart segment defined in segments.ts. Resolves the segment in real time
 * so the admin sees how many users will be targeted before sending.
 */

import { useEffect, useState } from "react";
import { Users, UserCheck, Sparkles, RefreshCw } from "lucide-react";
import {
  SEGMENTS, SEGMENT_GROUP_LABEL, findSegment, resolveSegmentUserIds,
  type SegmentGroup,
} from "@/lib/notifications/admin/segments";

export type AudienceMode = "all" | "user" | "segment";

export interface AudienceValue {
  mode: AudienceMode;
  userId?: string;
  segmentId?: string;
  /** Resolved user IDs for segment mode (filled by the picker). */
  resolvedIds?: string[];
}

export interface SegmentPickerProps {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
}

export function SegmentPicker({ value, onChange }: SegmentPickerProps) {
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (value.mode !== "segment" || !value.segmentId) return;
    let alive = true;
    setResolving(true);
    resolveSegmentUserIds(value.segmentId).then((ids) => {
      if (!alive) return;
      setResolving(false);
      onChange({ ...value, resolvedIds: ids });
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mode, value.segmentId]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
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
        <div className="space-y-2">
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
          {value.segmentId && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {findSegment(value.segmentId)?.description}
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                {resolving ? (
                  <RefreshCw className="size-3 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="size-3 text-primary" />
                    <span>{value.resolvedIds?.length ?? 0} مستلم</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}
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

// Stories M5 — Relations editor. Uses ONLY the frozen M2 enums.
// The relation validator (server-side trigger) is the source of truth
// for target existence; this editor only guards the shape.
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  STORY_RELATION_TARGET_TYPE, STORY_RELATION_TARGET_TYPE_LABEL,
  STORY_RELATION_ROLE, STORY_RELATION_ROLE_LABEL,
  type StoryRelationTargetType, type StoryRelationRole,
} from "@/lib/stories/v2/enums";

export interface RelationItem {
  id: string;
  target_type: StoryRelationTargetType;
  target_id: string;
  target_extra: Record<string, unknown>;
  role: StoryRelationRole;
  notes: string | null;
  display_order: number;
  metadata: Record<string, unknown>;
}

function uid(): string {
  return `rel_${Math.random().toString(36).slice(2, 10)}`;
}

export function RelationsEditor({
  items, onChange,
}: { items: RelationItem[]; onChange: (next: RelationItem[]) => void }) {
  const set = (i: number, patch: Partial<RelationItem>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([
    ...items,
    {
      id: uid(), target_type: "story", target_id: "", target_extra: {},
      role: "related_reading", notes: null,
      display_order: items.length, metadata: {},
    },
  ]);
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i).map((r, k) => ({ ...r, display_order: k })));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((r, k) => ({ ...r, display_order: k })));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">العلاقات <span className="text-xs text-muted-foreground">({items.length})</span></div>
        <button onClick={add} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
          <Plus className="h-3 w-3" /> إضافة علاقة
        </button>
      </div>
      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">لا علاقات.</div>
      )}
      <ul className="space-y-2">
        {items.map((r, i) => {
          const isChapter = r.target_type === "campaign_chapter";
          const isArtifact = r.target_type === "artifact";
          const chapterId = typeof r.target_extra?.chapter_id === "string" ? (r.target_extra.chapter_id as string) : "";
          return (
            <li key={r.id} className="space-y-2 rounded-md border bg-muted/20 p-2">
              <div className="grid grid-cols-12 gap-2">
                <label className="col-span-3 block text-[11px]">
                  <span className="text-muted-foreground">النوع</span>
                  <select value={r.target_type}
                    onChange={(e) => set(i, { target_type: e.target.value as StoryRelationTargetType })}
                    className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs">
                    {STORY_RELATION_TARGET_TYPE.map((t) => (
                      <option key={t} value={t}>{STORY_RELATION_TARGET_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-4 block text-[11px]">
                  <span className="text-muted-foreground">معرّف الهدف</span>
                  <input value={r.target_id}
                    onChange={(e) => set(i, { target_id: e.target.value })}
                    className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs" />
                </label>
                <label className="col-span-3 block text-[11px]">
                  <span className="text-muted-foreground">الدور</span>
                  <select value={r.role}
                    onChange={(e) => set(i, { role: e.target.value as StoryRelationRole })}
                    className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs">
                    {STORY_RELATION_ROLE.map((t) => (
                      <option key={t} value={t}>{STORY_RELATION_ROLE_LABEL[t]}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-2 flex items-end justify-end gap-1">
                  <button onClick={() => move(i, -1)} className="rounded border p-1 hover:bg-muted" title="أعلى"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(i, 1)} className="rounded border p-1 hover:bg-muted" title="أسفل"><ArrowDown className="h-3 w-3" /></button>
                  <button onClick={() => remove(i)} className="rounded border p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              {isChapter && (
                <label className="block text-[11px]">
                  <span className="text-muted-foreground">chapter_id (داخل الحملة)</span>
                  <input value={chapterId}
                    onChange={(e) => set(i, { target_extra: { ...r.target_extra, chapter_id: e.target.value } })}
                    className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs" />
                </label>
              )}
              {isArtifact && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                  نوع «قطعة أثرية» محظور بواسطة مُحقّق العلاقات الخادم. سيرفض التطبيق.
                </div>
              )}
              <label className="block text-[11px]">
                <span className="text-muted-foreground">ملاحظات (اختياري)</span>
                <input value={r.notes ?? ""}
                  onChange={(e) => set(i, { notes: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

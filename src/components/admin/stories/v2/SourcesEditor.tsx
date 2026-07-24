// Stories M5 — Sources editor. Uses frozen M2 story_sources schema.
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  STORY_SOURCE_KIND, STORY_SOURCE_KIND_LABEL, type StorySourceKind,
} from "@/lib/stories/v2/enums";

export interface SourceItem {
  id: string;
  source_key: string;
  kind: StorySourceKind;
  citation: string;
  title: string | null;
  author: string | null;
  year: string | null;
  page: string | null;
  url: string | null;
  weight: number | null;
  notes: string | null;
  display_order: number;
}

function uid(): string { return `src_${Math.random().toString(36).slice(2, 10)}`; }

export function SourcesEditor({
  items, onChange,
}: { items: SourceItem[]; onChange: (next: SourceItem[]) => void }) {
  const set = (i: number, patch: Partial<SourceItem>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([
    ...items,
    {
      id: uid(), source_key: `k_${items.length + 1}`,
      kind: "book", citation: "", title: null, author: null,
      year: null, page: null, url: null, weight: null, notes: null,
      display_order: items.length,
    },
  ]);
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i).map((s, k) => ({ ...s, display_order: k })));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((s, k) => ({ ...s, display_order: k })));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">المصادر <span className="text-xs text-muted-foreground">({items.length})</span></div>
        <button onClick={add} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
          <Plus className="h-3 w-3" /> إضافة مصدر
        </button>
      </div>
      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">لا مصادر.</div>
      )}
      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={s.id} className="space-y-2 rounded-md border bg-muted/20 p-2">
            <div className="grid grid-cols-12 gap-2">
              <label className="col-span-3 block text-[11px]">
                <span className="text-muted-foreground">source_key</span>
                <input value={s.source_key}
                  onChange={(e) => set(i, { source_key: e.target.value })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs" />
              </label>
              <label className="col-span-2 block text-[11px]">
                <span className="text-muted-foreground">النوع</span>
                <select value={s.kind}
                  onChange={(e) => set(i, { kind: e.target.value as StorySourceKind })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs">
                  {STORY_SOURCE_KIND.map((k) => (
                    <option key={k} value={k}>{STORY_SOURCE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block text-[11px]">
                <span className="text-muted-foreground">الوزن (0-1)</span>
                <input type="number" step="0.1" min={0} max={1}
                  value={s.weight ?? ""}
                  onChange={(e) => set(i, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
              <div className="col-span-5 flex items-end justify-end gap-1">
                <button onClick={() => move(i, -1)} className="rounded border p-1 hover:bg-muted"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => move(i, 1)} className="rounded border p-1 hover:bg-muted"><ArrowDown className="h-3 w-3" /></button>
                <button onClick={() => remove(i)} className="rounded border p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">الاقتباس النصي (citation)</span>
              <textarea rows={2} value={s.citation}
                onChange={(e) => set(i, { citation: e.target.value })}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
            </label>
            <div className="grid grid-cols-12 gap-2">
              <label className="col-span-4 block text-[11px]">
                <span className="text-muted-foreground">العنوان</span>
                <input value={s.title ?? ""} onChange={(e) => set(i, { title: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
              <label className="col-span-3 block text-[11px]">
                <span className="text-muted-foreground">المؤلف</span>
                <input value={s.author ?? ""} onChange={(e) => set(i, { author: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
              <label className="col-span-2 block text-[11px]">
                <span className="text-muted-foreground">السنة</span>
                <input value={s.year ?? ""} onChange={(e) => set(i, { year: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
              <label className="col-span-3 block text-[11px]">
                <span className="text-muted-foreground">الصفحة</span>
                <input value={s.page ?? ""} onChange={(e) => set(i, { page: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
              </label>
            </div>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">الرابط (اختياري)</span>
              <input dir="ltr" value={s.url ?? ""} onChange={(e) => set(i, { url: e.target.value || null })}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">ملاحظات المحرر</span>
              <input value={s.notes ?? ""} onChange={(e) => set(i, { notes: e.target.value || null })}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

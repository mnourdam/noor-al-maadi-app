// Stories M5 — Simple tag chip editor. Emits string[] deduped & trimmed.
import { useState } from "react";
import { X, Plus } from "lucide-react";

export function TagsEditor({
  tags, onChange,
}: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = Array.from(new Set([...tags, ...parts]));
    onChange(next);
    setDraft("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {t}
            <button onClick={() => remove(t)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">لا وسوم بعد.</span>}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } }}
          placeholder="أضف وسمًا ثم Enter…"
          className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
        />
        <button onClick={() => add(draft)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

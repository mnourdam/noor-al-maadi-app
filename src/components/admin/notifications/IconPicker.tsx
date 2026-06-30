/**
 * Searchable Lucide icon picker for the notification composer.
 *
 * Renders a small inline preview button. Clicking opens a popover with a
 * search box + responsive grid. Selecting an icon writes its kebab-case
 * Lucide name back via onChange.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ICON_CATALOG, iconByName, searchIcons } from "@/lib/notifications/admin/icons";

export interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const Selected = iconByName(value);
  const filtered = searchIcons(query);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-right text-sm"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          {Selected ? <Selected className="size-4 text-foreground" /> : <span className="size-4 rounded bg-muted" />}
          <span className="font-mono text-xs">{value || "اختر أيقونة"}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث (bell, heart, تاج…)"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"
                title="إزالة"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="grid max-h-64 grid-cols-4 gap-1 overflow-y-auto p-2 sm:grid-cols-6">
            {filtered.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => { onChange(e.name); setOpen(false); }}
                className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[10px] transition hover:bg-accent ${
                  value === e.name ? "border-primary bg-primary/10" : "border-transparent"
                }`}
                title={`${e.label} — ${e.name}`}
              >
                <e.Icon className="size-5" />
                <span className="truncate font-mono">{e.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                لا توجد نتائج. المتوفر: {ICON_CATALOG.length} أيقونة.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

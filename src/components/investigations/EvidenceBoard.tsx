import { Search } from "lucide-react";

export interface EvidenceItem {
  key: string;
  label: string;
  text: string;
}

/**
 * The evidence board: every clue the player has already walked past in this
 * case, pinned and threaded so they can re-read the record without losing
 * their place in the investigation. Collapsed to nothing before the first
 * clue is revealed — an empty board is noise, not atmosphere.
 */
export function EvidenceBoard({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="case-board mt-6 rounded-3xl border border-white/10 p-4">
      <div className="flex items-center gap-2">
        <Search className="size-3.5 text-gold" />
        <h2 className="font-display text-sm font-bold text-gold">لوحة الأدلة</h2>
        <span className="text-[10px] text-muted-foreground">
          {items.length.toLocaleString("ar-EG")} دليل
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={item.key} className="relative flex gap-3">
            {/* Thread linking one pinned clue to the next */}
            {i < items.length - 1 && (
              <span
                aria-hidden
                className="case-thread absolute bottom-0 start-[11px] top-6 w-px rotate-90 origin-top"
              />
            )}
            <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 text-[10px] font-bold text-gold">
              {(i + 1).toLocaleString("ar-EG")}
            </span>
            <div className="case-sheet min-w-0 flex-1 rounded-xl p-3">
              <p className="font-display text-[12px] font-bold text-amber-200">{item.label}</p>
              <p className="mt-1 whitespace-pre-line text-[12px] leading-6 text-foreground/85">
                {item.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

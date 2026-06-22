// Phase 3 — Atlas Controls: era / type / search.
import { Search } from "lucide-react";
import {
  ENTITY_TYPE_AR,
  type WorldEntityType,
} from "@/lib/world-map-source";

export function AtlasControls({
  eras, types,
  era, type, search,
  onEra, onType, onSearch,
}: {
  eras: { id: string; label: string; count: number }[];
  types: WorldEntityType[];
  era: string | null;
  type: WorldEntityType | null;
  search: string;
  onEra: (e: string | null) => void;
  onType: (t: WorldEntityType | null) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="pointer-events-auto absolute top-0 right-0 left-0 z-20 p-3 sm:p-4" dir="rtl">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 rounded-2xl border border-amber-900/25 bg-amber-50/90 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-amber-900/20 bg-white/70 px-3 py-1.5 text-amber-950">
            <Search className="size-4 opacity-60" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="ابحث عن مدينة، شخصية، معركة..."
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-amber-900/40"
            />
          </div>
        </div>
        {(eras.length > 0 || types.length > 0) && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <Chip active={type === null && era === null} onClick={() => { onEra(null); onType(null); }}>
              الكل
            </Chip>
            {types.map((t) => (
              <Chip key={t} active={type === t} onClick={() => onType(type === t ? null : t)}>
                {ENTITY_TYPE_AR[t]}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-amber-900/20" />
            {eras.map((e) => (
              <Chip key={e.id} active={era === e.id} onClick={() => onEra(era === e.id ? null : e.id)}>
                {e.label}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
        active
          ? "border-amber-900 bg-amber-900 text-amber-50"
          : "border-amber-900/25 bg-white/60 text-amber-950 hover:bg-white"
      }`}
    >{children}</button>
  );
}

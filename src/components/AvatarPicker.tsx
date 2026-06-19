import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { AVATARS, getAvatar, type HistoricalAvatar } from "@/lib/avatars";
import { Avatar } from "./Avatar";

const CAT_LABEL: Record<HistoricalAvatar["category"], string> = {
  holy: "مقدّسات",
  weapon: "أسلحة",
  armor: "دروع",
  knowledge: "علم ومخطوطات",
  symbol: "رموز ورايات",
  tool: "أدوات",
  nature: "طبيعة",
};

/**
 * Modal picker for choosing a historical avatar.
 * Closes after selection (auto-applies through onPick).
 */
export function AvatarPicker({
  currentId,
  onPick,
  onClose,
}: {
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<HistoricalAvatar["category"] | "all">("all");
  const list = useMemo(
    () => (cat === "all" ? AVATARS : AVATARS.filter((a) => a.category === cat)),
    [cat],
  );

  return (
    <div className="fixed inset-0 z-[200] grid place-items-end sm:place-items-center bg-black/70 p-2 sm:p-4">
      <div className="w-full max-w-md rounded-3xl border border-gold/30 bg-surface shadow-elegant">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-bold">اختر صورتك التاريخية</p>
            <p className="text-[10px] text-muted-foreground">{getAvatar(currentId).name}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 p-1.5 text-muted-foreground"><X className="size-4" /></button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2 text-[10px]">
          {(["all", ...Object.keys(CAT_LABEL)] as Array<HistoricalAvatar["category"] | "all">).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-3 py-1 tracking-wider ${
                cat === c ? "border-gold/60 bg-gold/15 text-gold" : "border-white/10 text-muted-foreground"
              }`}
            >
              {c === "all" ? "الكل" : CAT_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {list.map((a) => {
              const active = a.id === currentId;
              return (
                <button
                  key={a.id}
                  onClick={() => { onPick(a.id); onClose(); }}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border p-2 transition ${
                    active ? "border-gold/70 bg-gold/10" : "border-white/10 bg-background/40 hover:border-gold/30"
                  }`}
                >
                  <Avatar avatarId={a.id} size="md" ring={false} />
                  <span className="line-clamp-1 text-[10px] text-muted-foreground">{a.name}</span>
                  {active && (
                    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">{AVATARS.length} صورة متاحة</p>
        </div>
      </div>
    </div>
  );
}
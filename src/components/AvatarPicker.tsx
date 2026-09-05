import { useMemo, useState } from "react";
import { Check, X, Lock, Sparkles } from "lucide-react";
import {
  AVATARS,
  CATEGORY_LABEL,
  RARITY_LABEL,
  type AvatarCategory,
  type AvatarRarity,
} from "@/lib/avatars";
import { Avatar } from "./Avatar";
import { ModalPortal } from "@/components/ModalPortal";
import { OverlayDismissRegistration } from "@/lib/navigation/overlay-registration";
import { resolveProfileEmblem } from "@/lib/emblems";
import { evaluateEmblemUnlock, type EmblemUnlockContext } from "@/lib/emblems/unlock-eval";

const RARITY_BADGE: Record<AvatarRarity, string> = {
  common:    "bg-white/10 text-muted-foreground",
  uncommon:  "bg-emerald-400/15 text-emerald-300",
  rare:      "bg-sky-400/15 text-sky-300",
  epic:      "bg-violet-400/15 text-violet-300",
  legendary: "bg-gold/20 text-gold",
};

/**
 * Identity-emblem picker.
 *
 * V17-08: every locked emblem states its REAL requirement — the same rule
 * `public.emblem_is_equippable_v1` enforces — with live progress where the
 * requirement is a countable threshold. Emblems whose authored requirement
 * references content that does not exist are shown as «قريبًا» and never
 * advertise a condition the game cannot grant.
 */
export function AvatarPicker({
  currentId,
  onPick,
  onClose,
  unlockContext,
}: {
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  unlockContext: EmblemUnlockContext;
}) {
  const [cat, setCat] = useState<AvatarCategory | "all">("all");
  const list = useMemo(
    () => (cat === "all" ? AVATARS : AVATARS.filter((a) => a.category === cat)),
    [cat],
  );
  const resolvedCurrent = resolveProfileEmblem(currentId);

  return (
    <ModalPortal>
      <OverlayDismissRegistration open onClose={onClose} label="avatar-picker" />
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          type="button"
          aria-label="إغلاق"
          onClick={onClose}
          className="absolute inset-0"
          tabIndex={-1}
        />
        <div className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-gold/30 bg-surface shadow-elegant sm:max-h-[85vh] sm:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar avatarId={currentId} size="md" />
            <div className="min-w-0">
              <p className="font-display text-sm font-bold">الشعارات الشخصية</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {resolvedCurrent.record.name_ar} · {RARITY_LABEL[resolvedCurrent.record.rarity]}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-full border border-white/10 p-1.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Category chips */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2 text-[10px]">
          {(["all", ...Object.keys(CATEGORY_LABEL)] as Array<AvatarCategory | "all">).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-3 py-1 tracking-wider transition ${
                cat === c ? "border-gold/60 bg-gold/15 text-gold" : "border-white/10 text-muted-foreground hover:border-gold/30"
              }`}
            >
              {c === "all" ? "الكل" : CATEGORY_LABEL[c as AvatarCategory]}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {list.map((a) => {
              const active = a.id === currentId;
              const state = evaluateEmblemUnlock(a, unlockContext);
              const unlocked = state.unlocked;
              const lockLine = state.comingSoon
                ? state.requirementText
                : state.progress
                  ? `${state.requirementText} — ${state.progress.text}`
                  : state.requirementText;
              return (
                <button
                  key={a.id}
                  onClick={() => { if (!unlocked) return; onPick(a.id); onClose(); }}
                  disabled={!unlocked}
                  className={`group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border p-2.5 transition ${
                    active
                      ? "border-gold/70 bg-gold/10"
                      : unlocked
                        ? "border-white/10 bg-background/40 hover:border-gold/40 hover:bg-gold/5"
                        : "cursor-not-allowed border-white/5 bg-background/20 opacity-60"
                  }`}
                  title={unlocked ? a.name : lockLine}
                  aria-label={unlocked ? a.name : `${a.name} — ${lockLine}`}
                  data-emblem-id={a.id}
                  data-locked={unlocked ? "false" : "true"}
                >
                  <Avatar avatarId={a.id} size="lg" artSize="md" locked={!unlocked} />
                  <span className="line-clamp-1 text-center text-[11px] font-medium text-foreground">{a.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] tracking-wider ${RARITY_BADGE[a.rarity]}`}>
                    {RARITY_LABEL[a.rarity]}
                  </span>
                  {!unlocked && (
                    <span
                      data-testid="emblem-lock-line"
                      className={`line-clamp-2 text-center text-[9px] leading-tight ${
                        state.comingSoon ? "text-muted-foreground" : "text-gold/80"
                      }`}
                    >
                      {lockLine}
                    </span>
                  )}
                  {active && (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  {!unlocked && (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-black/60 text-gold">
                      <Lock className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-[10px] text-gold">
            <Sparkles className="size-3" />
            تُفتح الشعارات بإكمال الحملات وجمع قطع المتحف، وشعارات «قريبًا» قيد الإعداد
          </p>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

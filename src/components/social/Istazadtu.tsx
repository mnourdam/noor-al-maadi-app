// ============================================================
// <Istazadtu /> — the single reaction primitive
// ------------------------------------------------------------
// One tap = "استزدتُ" (I gained more knowledge from this).
// Anchor-agnostic. Online-only. Signed-in only. Idempotent.
//
// A11y contract (§P6.1.5):
//   * <button type="button">, real focus ring.
//   * aria-label describing the action in Arabic.
//   * aria-pressed reflects the active state for screen readers.
//   * Count is exposed as an aria-live polite region so assistive
//     tech announces changes without stealing focus.
//   * Disabled state carries an aria-describedby hint.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { toggleReaction, fetchReactionStates } from "@/lib/social/reactions";
import type { SocialAnchorType } from "@/lib/social/reactions";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import { cn } from "@/lib/utils";

interface Props {
  anchorType: SocialAnchorType;
  anchorId: string;
  /** Initial count (e.g. from a summary row); refined by the batch fetch. */
  initialCount?: number;
  className?: string;
}

/**
 * The bespoke glyph: an open book with an upward gold arc — knowledge
 * lifting off the page. Rendered inline as SVG so it themes cleanly.
 */
function IstazadtuGlyph({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
      <BookOpen
        className={cn(
          "size-4 transition-colors",
          active ? "fill-gold/10 text-gold" : "text-foreground/80",
        )}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <ChevronUp
        className={cn(
          "absolute -top-1.5 size-3 transition-colors",
          active ? "text-gold" : "text-gold/60",
        )}
        strokeWidth={2.5}
      />
    </span>
  );
}

export function Istazadtu({ anchorType, anchorId, initialCount, className }: Props) {
  const { user } = useAccount();
  const online = useOnline();
  const [count, setCount] = useState<number>(initialCount ?? 0);
  const [active, setActive] = useState<boolean>(false);
  const [pending, setPending] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Read authoritative state from source of truth on mount / anchor change.
  useEffect(() => {
    let alive = true;
    if (!user || !online) {
      setHydrated(true);
      return;
    }
    void fetchReactionStates(anchorType, [anchorId]).then((rows) => {
      if (!alive) return;
      const row = rows.find((r) => r.anchorId === anchorId);
      if (row) {
        setCount(row.count);
        setActive(row.active);
      }
      setHydrated(true);
    });
    return () => { alive = false; };
  }, [anchorType, anchorId, user, online]);

  const onToggle = useCallback(async () => {
    if (pending) return;
    if (!user) {
      toast.info("سجّل الدخول لإضافة تفاعلك.");
      return;
    }
    if (!online) return; // control is disabled; belt-and-braces.
    setPending(true);
    const res = await toggleReaction(anchorType, anchorId);
    setPending(false);
    if (!res.ok) {
      toast.error("تعذّر تسجيل تفاعلك، حاول مرة أخرى.");
      return;
    }
    if (typeof res.count === "number") setCount(res.count);
    if (typeof res.active === "boolean") setActive(res.active);
  }, [anchorType, anchorId, user, online, pending]);

  const disabled = !online || pending || !hydrated;
  const label = active
    ? `أنت أضفت "استزدتُ" — انقر للتراجع (${count})`
    : `استزدتُ من هذا (${count})`;
  const hintId = `istazadtu-hint-${anchorId}`;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onToggle()}
        disabled={disabled}
        aria-pressed={active}
        aria-label={label}
        aria-describedby={!online ? hintId : undefined}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          active
            ? "border-gold/60 bg-gold/15 text-gold hover:bg-gold/20"
            : "border-white/10 bg-black/30 text-foreground/85 hover:border-gold/40 hover:text-gold",
          disabled && "cursor-not-allowed opacity-60 hover:border-white/10 hover:text-foreground/85",
          className,
        )}
      >
        <IstazadtuGlyph active={active} />
        <span>استزدتُ</span>
        <span
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] tabular-nums",
            active ? "bg-gold/25 text-gold" : "bg-white/10 text-muted-foreground",
          )}
        >
          {count}
        </span>
      </button>
      {!online && (
        <span id={hintId} className="text-[10px] text-muted-foreground">
          التفاعل يحتاج اتصالًا بالإنترنت.
        </span>
      )}
    </div>
  );
}

// ============================================================
// <Istazadtu /> — heart reaction primitive (P6 Polish)
// ------------------------------------------------------------
// The visible interaction is a familiar heart: 🤍 → ❤️.
// The identity of the reaction, the RPC, and the anchor contract
// are UNCHANGED — only the presentation changed. One reaction
// per (user, story). Online-only. Signed-in only. Idempotent.
//
// A11y (§P6.1.5):
//   * <button type="button">, real focus ring.
//   * aria-label: "إضافة إعجاب" / "إزالة الإعجاب".
//   * aria-pressed reflects the active state.
//   * Count exposed as aria-live polite so SR announces changes.
//   * Disabled state carries an aria-describedby hint (offline).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
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
  /** Visual density. `md` for post-completion, `sm` for inline placements. */
  size?: "sm" | "md";
  className?: string;
}

export function Istazadtu({ anchorType, anchorId, initialCount, size = "md", className }: Props) {
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
      toast.info("سجّل الدخول لإضافة إعجابك.");
      return;
    }
    if (!online) return; // control is disabled; belt-and-braces.
    setPending(true);
    const res = await toggleReaction(anchorType, anchorId);
    setPending(false);
    if (!res.ok) {
      toast.error("تعذّر تسجيل إعجابك، حاول مرة أخرى.");
      return;
    }
    if (typeof res.count === "number") setCount(res.count);
    if (typeof res.active === "boolean") setActive(res.active);
  }, [anchorType, anchorId, user, online, pending]);

  const disabled = !online || pending || !hydrated;
  const label = active ? "إزالة الإعجاب" : "إضافة إعجاب";
  const hintId = `heart-hint-${anchorId}`;

  const dims = size === "sm"
    ? { pad: "px-2.5 py-1", icon: "size-4", text: "text-[11px]" }
    : { pad: "px-3 py-1.5", icon: "size-[18px]", text: "text-[12px]" };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onToggle()}
        disabled={disabled}
        aria-pressed={active}
        aria-label={`${label} (${count})`}
        aria-describedby={!online ? hintId : undefined}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dims.pad,
          dims.text,
          "font-medium tabular-nums",
          active
            ? "border-rose-400/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
            : "border-white/10 bg-black/30 text-foreground/85 hover:border-rose-300/40 hover:text-rose-200",
          disabled && "cursor-not-allowed opacity-60 hover:border-white/10 hover:text-foreground/85",
          className,
        )}
      >
        <Heart
          className={cn(
            dims.icon,
            "transition-[fill,color,transform] duration-300 ease-out",
            active ? "fill-rose-400 text-rose-300" : "fill-transparent text-foreground/80",
          )}
          strokeWidth={active ? 2 : 1.75}
          aria-hidden="true"
        />
        <span
          aria-live="polite"
          aria-atomic="true"
          className="min-w-[1ch] text-center"
        >
          {count}
        </span>
      </button>
      {!online && (
        <span id={hintId} className="text-[10px] text-muted-foreground">
          الإعجاب يحتاج اتصالًا بالإنترنت.
        </span>
      )}
    </div>
  );
}

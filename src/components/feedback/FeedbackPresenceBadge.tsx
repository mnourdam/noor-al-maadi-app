import { Circle, Pencil } from "lucide-react";

interface Props {
  otherOnline: boolean;
  otherTyping: boolean;
  /** Perspective — who is *viewing* this badge. Determines the label for the other side. */
  viewerRole: "player" | "admin";
  className?: string;
}

/**
 * Subtle presence indicator for a feedback conversation.
 * Typing wins over online when both are true.
 */
export function FeedbackPresenceBadge({ otherOnline, otherTyping, viewerRole, className }: Props) {
  const otherLabel = viewerRole === "player" ? "فريق إرث" : "اللاعب";
  if (!otherOnline && !otherTyping) return null;

  if (otherTyping) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-bold text-gold ${className ?? ""}`}
        aria-live="polite"
      >
        <Pencil className="size-3 animate-pulse" />
        <span>{otherLabel} يكتب الآن...</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 ${className ?? ""}`}
      aria-live="polite"
    >
      <Circle className="size-2 fill-emerald-400 text-emerald-400" />
      <span>{otherLabel} متصل الآن</span>
    </div>
  );
}

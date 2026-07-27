import { Link } from "@tanstack/react-router";
import {
  BookOpen, Landmark, Swords, MapPin, ScrollText, User, GraduationCap, Gem,
} from "lucide-react";

/**
 * Every encyclopedia reference carries its own type icon so the player
 * recognises a person, a state, a battle or a city at a glance instead of
 * having to read the label.
 */
const ICON_BY_TYPE: Record<string, typeof BookOpen> = {
  figure: User,
  scholar: GraduationCap,
  state: Landmark,
  battle: Swords,
  city: MapPin,
  event: ScrollText,
  landmark: Landmark,
  artifact: Gem,
};

export function EntityRefChip({
  entityType,
  label,
  linkId,
  resolved,
  onNavigate,
}: {
  entityType: string;
  label: string;
  linkId: string;
  resolved: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICON_BY_TYPE[String(entityType || "").toLowerCase()] ?? BookOpen;

  return (
    <Link
      to="/encyclopedia/entity/$id"
      params={{ id: linkId }}
      onClick={() => onNavigate?.()}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition hover:bg-gold/10 ${
        resolved
          ? "border-gold/30 bg-gold/5 text-gold"
          : "border-white/10 bg-surface text-muted-foreground"
      }`}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </Link>
  );
}

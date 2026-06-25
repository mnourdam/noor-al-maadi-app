import {
  Users,
  Landmark,
  Building2,
  Swords,
  ScrollText,
  Castle,
  Gem,
  BookMarked,
  type LucideIcon,
} from "lucide-react";

export const TYPE_ICON: Record<string, LucideIcon> = {
  figure: Users,
  scholar: BookMarked,
  state: Landmark,
  city: Building2,
  battle: Swords,
  event: ScrollText,
  landmark: Castle,
  artifact: Gem,
};

export function iconForType(type: string): LucideIcon {
  return TYPE_ICON[type] ?? ScrollText;
}

export const TYPE_LABEL_AR: Record<string, string> = {
  figure: "الشخصيات",
  scholar: "العلماء",
  state: "الدول والحضارات",
  city: "المدن",
  battle: "المعارك",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};

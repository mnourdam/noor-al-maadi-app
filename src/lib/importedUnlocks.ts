// ============================================================
// Imported Unlocks Bridge
// ------------------------------------------------------------
// Aggregates `unlockedRegistryIds` across all imported-campaign
// progress entries and joins them with the local content
// registry so the museum/collection UI can surface admin-
// imported items as unlocked.
//
// Read-only; safe on SSR (returns empty arrays in non-browser).
// ============================================================

import { PROGRESS_KEY } from "./importedCampaignProgress";
import { listRegistry } from "./contentRegistryStorage";
import type { ContentRegistryItem, RegistryItemType } from "@/types/contentRegistry";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** All registry IDs unlocked by any imported-campaign progress. */
export function getUnlockedRegistryIds(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, { unlockedRegistryIds?: string[] }>;
    const set = new Set<string>();
    for (const key of Object.keys(map ?? {})) {
      for (const id of map[key]?.unlockedRegistryIds ?? []) set.add(id);
    }
    return [...set];
  } catch {
    return [];
  }
}

/**
 * Map from unlocked registry id → first campaignId that unlocked it.
 * Lets the museum show "من حملة <campaign title>" instead of a generic label.
 */
export function getUnlockSourcesMap(): Map<string, string> {
  const out = new Map<string, string>();
  if (!isBrowser()) return out;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return out;
    const map = JSON.parse(raw) as Record<string, { unlockedRegistryIds?: string[] }>;
    for (const campaignId of Object.keys(map ?? {})) {
      for (const id of map[campaignId]?.unlockedRegistryIds ?? []) {
        if (!out.has(id)) out.set(id, campaignId);
      }
    }
  } catch { /* noop */ }
  return out;
}

export function isRegistryItemUnlocked(id: string): boolean {
  return getUnlockedRegistryIds().includes(id);
}

/** Normalize legacy/Arabic type aliases to a canonical RegistryItemType. */
const TYPE_ALIASES: Record<string, RegistryItemType> = {
  figure: "figure", character: "figure", person: "figure",
  "شخصية": "figure", "شخصيات": "figure",
  artifact: "artifact", relic: "artifact",
  "أثر": "artifact", "آثار": "artifact",
  city: "city", landmark: "city", place: "city",
  "مدينة": "city", "معلم": "city", "معالم": "city",
  battle: "battle", "معركة": "battle", "معارك": "battle",
  scholar: "scholar", "عالم": "scholar", "علماء": "scholar",
  dynasty: "dynasty", era: "dynasty", "دولة": "dynasty", "حقبة": "dynasty",
  badge: "badge", "شارة": "badge", "شارات": "badge",
  achievement: "achievement", "إنجاز": "achievement", "إنجازات": "achievement",
};
function normalizeType(raw: unknown): RegistryItemType | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  return TYPE_ALIASES[k] ?? TYPE_ALIASES[raw.trim()] ?? null;
}
function normalizeId(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Imported registry items, optionally filtered by type, joined with locked/unlocked flag. */
export function getImportedRegistryItemsByType(
  type: RegistryItemType,
): Array<ContentRegistryItem & { unlocked: boolean }> {
  const ids = new Set(getUnlockedRegistryIds().map(normalizeId));
  return listRegistry()
    .filter(i => normalizeType(i.type) === type)
    .map(i => ({ ...i, unlocked: ids.has(normalizeId(i.id)) }));
}

/** Convenience: just the unlocked ones. */
export function getUnlockedRegistryItems(type?: RegistryItemType): ContentRegistryItem[] {
  const ids = new Set(getUnlockedRegistryIds().map(normalizeId));
  return listRegistry().filter(i => {
    if (!ids.has(normalizeId(i.id))) return false;
    if (!type) return true;
    return normalizeType(i.type) === type;
  });
}

/** Unlock IDs that have no matching registry item — useful for diagnostics. */
export function getMissingRegistryUnlockIds(): string[] {
  const all = listRegistry().map(i => normalizeId(i.id));
  const have = new Set(all);
  return getUnlockedRegistryIds().filter(id => !have.has(normalizeId(id)));
}


// Neutral, non-gendered placeholders. `figure` defaults to a silhouette
// so we don't imply gender (the previous 🧕 was inappropriate for male
// historical figures). Pick something more specific via item.image.
const TYPE_ICON: Record<RegistryItemType, string> = {
  figure:      "👤",
  scholar:     "📖",
  artifact:    "🏺",
  city:        "🏛️",
  battle:      "⚔️",
  dynasty:     "🏳️",
  badge:       "🎖️",
  achievement: "🏆",
};

/** Returns either a usable image URL or `null`. Emoji/grapheme `image` values are not URLs. */
export function registryItemImageUrl(item: ContentRegistryItem): string | null {
  const img = item.image?.trim();
  if (!img) return null;
  if (/^(https?:|data:|\/)/i.test(img)) return img;
  return null;
}

/** Emoji fallback for a registry item when no image URL is available. */
export function registryItemIcon(item: ContentRegistryItem): string {
  // If `image` is a single grapheme (emoji), use it as-is.
  if (item.image && [...item.image.trim()].length === 1) return item.image.trim();
  const norm = normalizeType(item.type);
  return (norm && TYPE_ICON[norm]) ?? "✨";
}

export function registryItemRarity(item: ContentRegistryItem): "common" | "rare" | "epic" | "legendary" {
  // Delegated to canonical rarity module so aliases + invalid values map safely.
  // Kept as a thin re-export to preserve the existing call sites.
  const { normalizeRarity } = require("@/lib/rarity") as typeof import("@/lib/rarity");
  return normalizeRarity(item.rarity);
}


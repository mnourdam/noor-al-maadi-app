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

export function isRegistryItemUnlocked(id: string): boolean {
  return getUnlockedRegistryIds().includes(id);
}

/** Imported registry items, optionally filtered by type, joined with locked/unlocked flag. */
export function getImportedRegistryItemsByType(
  type: RegistryItemType,
): Array<ContentRegistryItem & { unlocked: boolean }> {
  const ids = new Set(getUnlockedRegistryIds());
  return listRegistry()
    .filter(i => i.type === type)
    .map(i => ({ ...i, unlocked: ids.has(i.id) }));
}

/** Convenience: just the unlocked ones. */
export function getUnlockedRegistryItems(type?: RegistryItemType): ContentRegistryItem[] {
  const ids = new Set(getUnlockedRegistryIds());
  return listRegistry().filter(i => ids.has(i.id) && (!type || i.type === type));
}

const TYPE_ICON: Record<RegistryItemType, string> = {
  figure: "🧕",
  artifact: "🏺",
  city: "🏙️",
  battle: "⚔️",
  scholar: "📖",
  dynasty: "📜",
  badge: "🎖️",
  achievement: "🏆",
};

/** Emoji icon for a registry item (image URLs are not supported by Card). */
export function registryItemIcon(item: ContentRegistryItem): string {
  // If `image` is a single grapheme (emoji), use it as-is; otherwise fall back to type icon.
  if (item.image && [...item.image].length === 1) return item.image;
  return TYPE_ICON[item.type] ?? "✨";
}

export function registryItemRarity(item: ContentRegistryItem): "common" | "rare" | "epic" | "legendary" {
  return (item.rarity as any) ?? "common";
}

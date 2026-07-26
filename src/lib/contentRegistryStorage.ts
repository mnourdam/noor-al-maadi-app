// ============================================================
// Content Registry Storage (localStorage adapter)
// ------------------------------------------------------------
// Reusable storage for figures/artifacts/cities/battles/…
// referenced by imported campaigns. Public museum/collection
// helpers can read from this store to surface admin-imported
// content alongside the existing hardcoded data.
// ============================================================

import type { ContentRegistryItem, RegistryItemType } from "@/types/contentRegistry";

export const REGISTRY_KEY = "irth_content_registry";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Registry rows live in localStorage and therefore survive force-close. A row
 * with a missing/non-string `id` used to crash every consumer that normalized
 * it (`id.toLowerCase()`), producing an unrecoverable Android crash loop on
 * Home. The list is sanitized at the boundary: malformed rows never leave here.
 */
export function listRegistry(): ContentRegistryItem[] {
  if (!isBrowser()) return [];
  const raw = safeParse<unknown>(window.localStorage.getItem(REGISTRY_KEY), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is ContentRegistryItem =>
      !!i && typeof i === "object" &&
      typeof (i as { id?: unknown }).id === "string" &&
      (i as { id: string }).id.trim().length > 0,
  );
}


export function listRegistryByType(type: RegistryItemType): ContentRegistryItem[] {
  return listRegistry().filter(i => i.type === type);
}

export function getRegistryItem(id: string): ContentRegistryItem | undefined {
  return listRegistry().find(i => i.id === id);
}

export function saveRegistry(items: ContentRegistryItem[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(items));
}

export function upsertRegistryItem(item: ContentRegistryItem): ContentRegistryItem {
  const now = new Date().toISOString();
  const list = listRegistry();
  const idx = list.findIndex(i => i.id === item.id);
  const next = { ...item, updatedAt: now, createdAt: item.createdAt ?? now };
  if (idx >= 0) list[idx] = next; else list.push(next);
  saveRegistry(list);
  // Fire-and-forget cloud push (no-op during a cloud→local pull).
  import("@/lib/cloudSync").then(m => m.pushRegistryItem(next)).catch(() => {});
  return next;
}

export function deleteRegistryItem(id: string): void {
  saveRegistry(listRegistry().filter(i => i.id !== id));
  import("@/lib/cloudSync").then(m => m.deleteRegistryItemFromCloud(id)).catch(() => {});
}

export function knownRegistryIds(): Set<string> {
  return new Set(listRegistry().map(i => i.id));
}

export function exportRegistry(): string {
  return JSON.stringify(listRegistry(), null, 2);
}
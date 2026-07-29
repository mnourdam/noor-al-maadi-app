import type { ReviewItem } from "../types";

export interface MemoryProvider {
  name: string;
  /** Return every ReviewItem currently available for the active owner. */
  listItems(): ReviewItem[];
}

const registry: MemoryProvider[] = [];

export function registerProvider(provider: MemoryProvider): void {
  if (registry.some(p => p.name === provider.name)) return;
  registry.push(provider);
}

export function listAllItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const p of registry) {
    try { out.push(...p.listItems()); }
    catch { /* one bad provider must not break the engine */ }
  }
  return out;
}

export function __resetProvidersForTests(): void {
  registry.length = 0;
}

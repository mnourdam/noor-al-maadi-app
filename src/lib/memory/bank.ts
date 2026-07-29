// ============================================================
// Memory Engine — Bank
// ------------------------------------------------------------
// Aggregates every provider's items and computes stable identifiers
// + content-revision fingerprints.
//
// `revision` deliberately hashes ONLY correctness-critical fields so
// future prose edits (typo fixes, better wording) flow silently into
// an already-scheduled review; a genuine correctness change (option
// added/removed, correct index or boolean flipped) invalidates the
// plan and forces a re-pick on next entry.
// ============================================================

import { hashParts } from "./hash";
import type { MemoryItemKind, MemorySourceType, ReviewItem } from "./types";
import { listAllItems } from "./providers";

export function computeItemId(
  sourceType: MemorySourceType,
  sourceId: string,
  localRef: string,
): string {
  return hashParts(sourceType, sourceId, localRef);
}

export function computeItemRevision(
  kind: MemoryItemKind,
  correctAnswer: number | boolean,
  options?: string[],
): string {
  const normalizedOptions = options
    ? [...options].map(o => o.trim()).sort()
    : [];
  return hashParts(kind, String(correctAnswer), normalizedOptions.join("\u241E"));
}

export function loadBank(): ReviewItem[] {
  return listAllItems();
}

export function findItem(id: string): ReviewItem | null {
  return loadBank().find(i => i.id === id) ?? null;
}

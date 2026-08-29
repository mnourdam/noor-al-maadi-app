/**
 * V16 — CANONICAL PIN SEATING (single source of truth).
 *
 * Ordering activity items use stable ids of the form `evt-<i>` where `i` is
 * the item's CORRECT final index. A pinned (hint-revealed) item must always
 * be physically located at that index.
 *
 * The legacy implementation applied pins with repeated
 * `filter(...)` + `splice(target)` operations, which shifts previously seated
 * pins whenever a later pin is removed from a position before them. That is
 * the confirmed root cause of "green locked rows sitting in the wrong slot"
 * and of Check failing on a board that looks complete.
 *
 * This helper is pure, deterministic, idempotent and order-independent:
 * every pinned id is written directly into its canonical slot, and the
 * remaining ids fill the leftover slots in their existing relative order.
 */

/** `evt-<i>` — i is the item's correct final position. */
export function correctIndexOfOrderingId(id: string): number {
  return Number(id.replace("evt-", ""));
}

/**
 * Seat every pinned id at its canonical index while preserving the relative
 * order of the free items. Always returns a permutation of `order`.
 */
export function seatPinnedItems(
  order: readonly string[],
  pinnedIds: readonly string[],
  correctIndexOf: (id: string) => number = correctIndexOfOrderingId,
): string[] {
  const n = order.length;
  if (n === 0) return [];

  const present = new Set(order);
  const slots: (string | null)[] = new Array(n).fill(null);
  const seated = new Set<string>();

  // 1. Place pins directly into their canonical slots (deterministic order so
  //    that any duplicate/invalid target resolves the same way every time).
  const pins = [...new Set(pinnedIds)]
    .filter((id) => present.has(id))
    .sort((a, b) => correctIndexOf(a) - correctIndexOf(b));

  for (const id of pins) {
    const target = correctIndexOf(id);
    if (!Number.isInteger(target) || target < 0 || target >= n) continue; // malformed → treat as free
    if (slots[target] !== null) continue; // conflicting target → treat as free
    slots[target] = id;
    seated.add(id);
  }

  // 2. Remaining ids keep their existing relative order.
  const rest = order.filter((id) => !seated.has(id));

  // 3. Fill the leftover slots sequentially.
  let r = 0;
  for (let i = 0; i < n; i++) {
    if (slots[i] === null) slots[i] = rest[r++]!;
  }

  return slots as string[];
}

/** True when every pinned id sits exactly at its canonical index. */
export function arePinsSeated(
  order: readonly string[],
  pinnedIds: readonly string[],
  correctIndexOf: (id: string) => number = correctIndexOfOrderingId,
): boolean {
  return pinnedIds.every((id) => order.indexOf(id) === correctIndexOf(id));
}

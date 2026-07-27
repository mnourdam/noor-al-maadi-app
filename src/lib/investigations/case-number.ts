// ============================================================
// Case numbers — one stable, permanent number per investigation
// ------------------------------------------------------------
// The list used to number cases by their position in a *shuffled*
// list, so the same case showed a different number on every load and
// a different number again on its own page. A case file number is an
// identity, not a row index: it is derived from the creation order of
// every investigation the device knows about (offline snapshot ∪ any
// rows a screen has loaded), sorted ascending by `created_at`.
//
// Because new investigations always sort to the END of that order,
// publishing more cases can never renumber an existing one.
//
// Numbers are always rendered in Western digits (1 2 3), never
// Arabic-Indic — see `formatCaseNumber`.
// ============================================================

import { useEffect, useState } from "react";

interface NumberedRow {
  id?: string | null;
  slug?: string | null;
  created_at?: string | null;
}

/** Everything the device knows about, keyed by slug. */
const known = new Map<string, NumberedRow>();
/** slug/id → case number. Rebuilt whenever `known` grows. */
let registry = new Map<string, number>();
let snapshotLoaded = false;
const listeners = new Set<() => void>();

function rebuild(): void {
  const rows = [...known.values()];
  rows.sort((a, b) => {
    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  });
  const next = new Map<string, number>();
  rows.forEach((r, i) => {
    const n = i + 1;
    if (r.slug) next.set(r.slug, n);
    if (r.id) next.set(r.id, n);
  });
  registry = next;
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener owns its errors */ }
  });
}

/**
 * Teach the numbering registry about rows a screen just loaded. Safe to
 * call repeatedly; only a genuinely new slug triggers a rebuild.
 */
export function registerInvestigationsForNumbering(
  rows: readonly NumberedRow[] | null | undefined,
): void {
  if (!Array.isArray(rows) || rows.length === 0) return;
  let added = false;
  for (const r of rows) {
    const slug = r?.slug ?? r?.id;
    if (!slug) continue;
    const prev = known.get(slug);
    if (prev && prev.created_at === r.created_at) continue;
    known.set(slug, { id: r.id ?? null, slug, created_at: r.created_at ?? null });
    added = true;
  }
  if (added) rebuild();
}

let snapshotPromise: Promise<void> | null = null;

/** Load the offline snapshot once so numbers exist with no network. */
export function ensureCaseNumbers(): Promise<void> {
  if (snapshotLoaded) return Promise.resolve();
  if (!snapshotPromise) {
    snapshotPromise = (async () => {
      try {
        const { ensureLocalSnapshotLoaded, localInvestigations } = await import(
          "@/lib/local-first-store"
        );
        await ensureLocalSnapshotLoaded();
        registerInvestigationsForNumbering(
          localInvestigations() as unknown as NumberedRow[],
        );
      } catch { /* offline / snapshot unavailable — hash fallback covers it */ }
      snapshotLoaded = true;
    })();
  }
  return snapshotPromise;
}

/** Deterministic 3-digit fallback for a case the device has never listed. */
function hashedNumber(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 899) + 100;
}

/** Case number for a slug or id — never Arabic-Indic, always padded. */
export function caseNumberFor(slugOrId: string | null | undefined): number {
  const key = String(slugOrId ?? "").trim();
  if (!key) return 0;
  return registry.get(key) ?? hashedNumber(key);
}

/** `21` → `"021"`. Western digits only, by contract. */
export function formatCaseNumber(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(3, "0");
}

/** Convenience: formatted number for a slug/id. */
export function caseNumberLabel(slugOrId: string | null | undefined): string {
  return formatCaseNumber(caseNumberFor(slugOrId));
}

/**
 * Hook returning the formatted case number, re-rendering once the
 * offline snapshot has taught the registry the real creation order.
 */
export function useCaseNumber(slugOrId: string | null | undefined): string {
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const onChange = () => { if (alive) bump((n) => n + 1); };
    listeners.add(onChange);
    void ensureCaseNumbers().then(onChange);
    return () => { alive = false; listeners.delete(onChange); };
  }, []);
  return caseNumberLabel(slugOrId);
}

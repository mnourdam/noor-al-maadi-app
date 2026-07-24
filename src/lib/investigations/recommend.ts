// ============================================================
// Investigation recommendation for the HUD Hearts popover.
// ------------------------------------------------------------
// Deterministic priority order:
//   1. Continue: the last investigation the player opened (tracked in
//      localStorage) if it exists in the current published catalogue
//      and is NOT yet completed.
//   2. New: highest-priority uncompleted investigation, sorted by
//      canonical difficulty (easy → very_hard) then most-recently
//      updated first (same order the catalogue surfaces).
//   3. None: no published rows exist, OR every published investigation
//      is already completed by this player. The UI must render a
//      friendly empty state — never a dead button.
//
// This module is pure client-side routing help; it never grants,
// consumes, or infers rewards. Economy stays server-authoritative
// via `purchase_heart` and `record_investigation_completion`.
// ============================================================

import { useMemo } from "react";
import {
  useSupabaseInvestigations,
  canonicalDifficulty,
  DIFFICULTY_ORDER,
  type InvestigationRow,
} from "@/lib/investigations-source";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";

const LAST_OPEN_KEY = "irth.investigation.lastOpen.v1";

/** Persist the slug of the investigation the player just opened. */
export function markInvestigationOpened(slug: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (!slug) return;
    localStorage.setItem(LAST_OPEN_KEY, slug);
  } catch { /* storage disabled — best-effort */ }
}

/** Clear the "continue" pointer, e.g. once a completion is recorded. */
export function clearInvestigationOpened(slug?: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const cur = localStorage.getItem(LAST_OPEN_KEY);
    if (!slug || cur === slug) localStorage.removeItem(LAST_OPEN_KEY);
  } catch { /* ignore */ }
}

function readLastOpen(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const v = localStorage.getItem(LAST_OPEN_KEY);
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch { return null; }
}

export type RecommendationKind = "continue" | "new" | "none";

export interface InvestigationRecommendation {
  ready: boolean;
  kind: RecommendationKind;
  slug: string | null;
  row: InvestigationRow | null;
}

function difficultyRank(row: InvestigationRow): number {
  const c = canonicalDifficulty(row.difficulty);
  if (!c) return DIFFICULTY_ORDER.length; // unknown → last
  return DIFFICULTY_ORDER.indexOf(c);
}

/**
 * Choose the investigation the HUD "Play an investigation" button should
 * route to. Returns `{ kind: "none" }` when no valid target exists so the
 * caller can render an empty state instead of a broken CTA.
 */
export function useRecommendedInvestigation(): InvestigationRecommendation {
  const { rows } = useSupabaseInvestigations();
  const progress = useCanonicalInvestigationProgress();

  return useMemo(() => {
    const ready = rows !== null && progress.ready;
    if (!ready) return { ready: false, kind: "none", slug: null, row: null };

    const list = (rows ?? []).filter((r) => r.enabled !== false);
    if (list.length === 0) return { ready: true, kind: "none", slug: null, row: null };

    const isCompleted = (row: InvestigationRow): boolean =>
      progress.completedKeys.has(row.slug) || progress.completedKeys.has(row.id);

    // 1. Continue an unfinished investigation.
    const lastSlug = readLastOpen();
    if (lastSlug) {
      const found = list.find((r) => r.slug === lastSlug);
      if (found && !isCompleted(found)) {
        return { ready: true, kind: "continue", slug: found.slug, row: found };
      }
    }

    // 2. Highest-priority uncompleted (easy → hard, then most-recent).
    const remaining = list
      .filter((r) => !isCompleted(r))
      .sort((a, b) => {
        const da = difficultyRank(a);
        const db = difficultyRank(b);
        if (da !== db) return da - db;
        const ta = Date.parse(a.updated_at ?? "") || 0;
        const tb = Date.parse(b.updated_at ?? "") || 0;
        return tb - ta;
      });

    if (remaining.length > 0) {
      const pick = remaining[0];
      return { ready: true, kind: "new", slug: pick.slug, row: pick };
    }

    // 3. Nothing left to play.
    return { ready: true, kind: "none", slug: null, row: null };
  }, [rows, progress]);
}

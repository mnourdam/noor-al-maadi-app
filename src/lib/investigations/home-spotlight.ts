// ============================================================
// Home Investigations Spotlight — pure presentation selector
// ------------------------------------------------------------
// Derives the Home spotlight state from the SAME local-first
// recommendation the HUD already computes
// (`useRecommendedInvestigation`). Pure and synchronous so the
// behaviour is unit-testable without a DOM:
//
//   hidden      → catalogue not resolved yet, or nothing published.
//                 The card renders nothing (never a dead CTA).
//   continue    → the last opened, still-unfinished case.
//                 CTA "متابعة القضية" → /investigation/$id
//   discovery   → everything else, including "all cases completed".
//                 CTA "افتح ملفات التحقيق" → /investigations
//
// No network access, no storage writes.
// ============================================================

import type { InvestigationRecommendation } from "./recommend";
import type { InvestigationRow } from "@/lib/investigations-source";

export type SpotlightState = "hidden" | "continue" | "discovery";

export interface SpotlightView {
  state: SpotlightState;
  /** Eyebrow line. Empty when hidden. */
  eyebrow: string;
  /** Card title. Empty when hidden. */
  title: string;
  /** Call-to-action label. Empty when hidden. */
  cta: string;
  /** Route id to navigate to. Null when hidden. */
  to: "/investigation/$id" | "/investigations" | null;
  /** Route params for `/investigation/$id` (the case SLUG, as the route expects). */
  params: { id: string } | null;
  /** Resolved href, used for origin stashing and tests. */
  href: string | null;
  row: InvestigationRow | null;
  total: number;
  completed: number;
}

const HIDDEN: SpotlightView = {
  state: "hidden",
  eyebrow: "",
  title: "",
  cta: "",
  to: null,
  params: null,
  href: null,
  row: null,
  total: 0,
  completed: 0,
};

export function selectHomeInvestigationSpotlight(
  rec: InvestigationRecommendation,
): SpotlightView {
  if (!rec.ready) return HIDDEN;
  const total = Math.max(0, rec.total ?? 0);
  if (total === 0) return HIDDEN;
  const completed = Math.min(total, Math.max(0, rec.completed ?? 0));

  if (rec.kind === "continue" && rec.row) {
    return {
      state: "continue",
      eyebrow: "واصل التحقيق",
      title: rec.row.title,
      cta: "متابعة القضية",
      to: "/investigation/$id",
      params: { id: rec.row.slug },
      href: `/investigation/${rec.row.slug}`,
      row: rec.row,
      total,
      completed,
    };
  }

  return {
    state: "discovery",
    eyebrow: "طور من أطوار اللعب",
    title: "التحقيقات التاريخية",
    cta: "افتح ملفات التحقيق",
    to: "/investigations",
    params: null,
    href: "/investigations",
    row: rec.row,
    total,
    completed,
  };
}

// ============================================================
// Historical Specialization — derived, deterministic, per-user.
// ------------------------------------------------------------
// Aggregates real player activity across worlds and returns the
// dominant world (Arabic-labeled) as the player's specialization.
//
// SINGLE source of truth for the Historical Identity Card's
// "تخصصك التاريخي" section. Also usable by any future dashboard.
//
// Sources (ALL canonical, no legacy fallbacks):
//   • useAllWorldsProgress() —
//       campaigns.completed, investigations.completed,
//       entities.discovered (encyclopedia), museum.discovered
//
// Weights:
//   campaign     5
//   investigation 4
//   story        3   (reserved — computed only if a per-world map is supplied)
//   museum       2
//   encyclopedia 1
//   atlas        1   (reserved — future signal)
//
// Tie-breakers:
//   1. higher score wins
//   2. PUBLIC_WORLD_ORDER position (earlier world wins)
//
// Reveal rules:
//   - Reveal only when score >= 5 OR activity from >= 2 source
//     types.
//   - Below threshold: `key === null`, label = "تخصصك يتشكل مع رحلتك".
// ============================================================

import { useMemo } from "react";
import { useAllWorldsProgress } from "@/lib/worlds-progress";
import { PUBLIC_WORLD_ORDER } from "@/lib/worlds-constants";

export type SpecializationConfidence = "high" | "medium" | "low";

export interface SpecializationBreakdown {
  campaigns: number;
  stories: number;
  investigations: number;
  encyclopedia: number;
  museum: number;
  atlas: number;
}

export interface HistoricalSpecialization {
  /** World slug of the winner, or `null` when nothing meaningful yet. */
  key: string | null;
  /** Arabic label (never a raw slug). */
  label_ar: string;
  world_slug?: string;
  score: number;
  confidence: SpecializationConfidence;
  breakdown: SpecializationBreakdown;
}

const WEIGHTS = {
  campaign: 5,
  investigation: 4,
  story: 3,
  museum: 2,
  encyclopedia: 1,
  atlas: 1,
} as const;

/** Arabic display label per world slug. Do NOT expose raw slugs. */
export const SPECIALIZATION_LABEL_AR: Record<string, string> = {
  prophetic: "باحث في عصر النبوة",
  rashidun: "مؤرخ الخلافة الراشدة",
  umayyad: "خبير الدولة الأموية",
  andalus: "رحّالة الأندلس",
  abbasid: "باحث في العصر العباسي",
  fatimid: "مؤرخ الدولة الفاطمية",
  seljuk: "باحث في السلاجقة",
  zengid: "مؤرخ الزنكيين",
  "ayyubid-state": "مؤرخ الدولة الأيوبية",
  "mamluk-sultanate": "باحث في دولة المماليك",
  mongols: "باحث في عصر المغول",
  timurid: "باحث في التيموريين",
  ottoman: "مؤرخ الدولة العثمانية",
  safavid: "باحث في الدولة الصفوية",
};

export interface WorldActivity {
  worldSlug: string;
  campaigns: number;
  investigations: number;
  encyclopedia: number;
  museum: number;
  stories?: number;
  atlas?: number;
}

/** Pure scorer — used by tests and the hook. */
export function computeSpecialization(
  activities: WorldActivity[],
): HistoricalSpecialization {
  const emptyBreakdown: SpecializationBreakdown = {
    campaigns: 0, stories: 0, investigations: 0,
    encyclopedia: 0, museum: 0, atlas: 0,
  };
  const empty: HistoricalSpecialization = {
    key: null,
    label_ar: "تخصصك يتشكل مع رحلتك",
    score: 0,
    confidence: "low",
    breakdown: emptyBreakdown,
  };
  if (!activities.length) return empty;

  type Scored = { slug: string; score: number; sources: number; b: SpecializationBreakdown };
  const scored: Scored[] = activities.map((a) => {
    const b: SpecializationBreakdown = {
      campaigns:     a.campaigns * WEIGHTS.campaign,
      investigations: a.investigations * WEIGHTS.investigation,
      stories:       (a.stories ?? 0) * WEIGHTS.story,
      museum:        a.museum * WEIGHTS.museum,
      encyclopedia:  a.encyclopedia * WEIGHTS.encyclopedia,
      atlas:         (a.atlas ?? 0) * WEIGHTS.atlas,
    };
    const score = b.campaigns + b.investigations + b.stories + b.museum + b.encyclopedia + b.atlas;
    const sources =
      (a.campaigns > 0 ? 1 : 0) +
      (a.investigations > 0 ? 1 : 0) +
      ((a.stories ?? 0) > 0 ? 1 : 0) +
      (a.museum > 0 ? 1 : 0) +
      (a.encyclopedia > 0 ? 1 : 0) +
      ((a.atlas ?? 0) > 0 ? 1 : 0);
    return { slug: a.worldSlug, score, sources, b };
  });

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const ix = PUBLIC_WORLD_ORDER.indexOf(x.slug);
    const iy = PUBLIC_WORLD_ORDER.indexOf(y.slug);
    const nx = ix === -1 ? 999 : ix;
    const ny = iy === -1 ? 999 : iy;
    return nx - ny;
  });

  const winner = scored[0];
  if (!winner || (winner.score < 5 && winner.sources < 2)) return empty;

  const label = SPECIALIZATION_LABEL_AR[winner.slug] ?? "باحث تاريخي";
  const confidence: SpecializationConfidence =
    winner.score >= 25 ? "high" : winner.score >= 12 ? "medium" : "low";

  return {
    key: winner.slug,
    label_ar: label,
    world_slug: winner.slug,
    score: winner.score,
    confidence,
    breakdown: winner.b,
  };
}

/** React hook returning the specialization derived from live progression. */
export function useHistoricalSpecialization(): HistoricalSpecialization {
  const all = useAllWorldsProgress();
  return useMemo(() => {
    if (!all.ready) {
      return {
        key: null,
        label_ar: "تخصصك يتشكل مع رحلتك",
        score: 0,
        confidence: "low",
        breakdown: { campaigns: 0, stories: 0, investigations: 0, encyclopedia: 0, museum: 0, atlas: 0 },
      };
    }
    const activities: WorldActivity[] = [];
    for (const [slug, { progress }] of all.byWorld) {
      activities.push({
        worldSlug: slug,
        campaigns: progress.campaigns.completed,
        investigations: progress.investigations.completed,
        encyclopedia: progress.entities.discovered,
        museum: progress.museum.discovered,
      });
    }
    return computeSpecialization(activities);
  }, [all]);
}

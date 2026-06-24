// ============================================================
// Content Integrity & World Assignment (D2)
// ------------------------------------------------------------
// Deterministic helpers used during admin imports.
//
//   - inferWorldFromMetadata(entity) → confident world/era or null
//   - runCampaignIntegrity(campaign) → human-readable report
//
// Important: when confidence is low we NEVER guess. The caller
// is expected to surface a "review" item in the integrity report
// instead of silently assigning a world.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { parseHistoricalPeriodYear } from "./campaignChronology";

// ---------- World inference ----------

export interface WorldAssignment {
  worldSlug: string;
  era: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * Pattern map — order matters; first match wins. Keep it conservative:
 * we only emit a "high" confidence assignment when an unambiguous
 * dynasty/era keyword appears.
 */
const WORLD_PATTERNS: Array<{
  worldSlug: string;
  era: string;
  patterns: RegExp[];
}> = [
  { worldSlug: "prophetic",        era: "prophetic", patterns: [/نبوي/, /السيرة/, /prophetic/i] },
  { worldSlug: "rashidun",         era: "rashidun",  patterns: [/راشد/, /الخلفاء الراشدين/, /rashidun/i] },
  { worldSlug: "umayyad",          era: "umayyad",   patterns: [/أموي|اموي/, /umayyad/i] },
  { worldSlug: "andalus",          era: "andalus",   patterns: [/أندلس|اندلس/, /andalus/i] },
  { worldSlug: "abbasid",          era: "abbasid",   patterns: [/عباس/, /abbasid/i] },
  { worldSlug: "seljuk",           era: "seljuk",    patterns: [/سلجوق/, /seljuk/i] },
  { worldSlug: "zengid",           era: "zengid",    patterns: [/زنكي|نور الدين/, /zengid/i] },
  { worldSlug: "ayyubid-state",    era: "ayyubid",   patterns: [/أيوبي|ايوبي|صلاح الدين/, /ayyubid/i] },
  { worldSlug: "mamluk-sultanate", era: "mamluk",    patterns: [/مملوكي|المماليك/, /mamluk/i] },
  { worldSlug: "ottoman",          era: "ottoman",   patterns: [/عثمان/, /ottoman/i] },
];

export interface InferenceInput {
  title?: string;
  subtitle?: string;
  historicalPeriod?: string;
  tags?: string[];
  category?: string;
  description?: string;
  worldSlug?: string;
  era?: string;
}

export function inferWorldFromMetadata(e: InferenceInput): WorldAssignment | null {
  // Explicit values always win.
  if (e.worldSlug) {
    const known = WORLD_PATTERNS.find((p) => p.worldSlug === e.worldSlug);
    if (known) {
      return { worldSlug: known.worldSlug, era: e.era ?? known.era, confidence: "high", reason: "explicit worldSlug" };
    }
  }

  const haystack = [
    e.title ?? "",
    e.subtitle ?? "",
    e.historicalPeriod ?? "",
    e.category ?? "",
    e.description ?? "",
    ...(e.tags ?? []),
  ].join(" \n ");
  if (!haystack.trim()) return null;

  const matches = WORLD_PATTERNS.filter((p) => p.patterns.some((re) => re.test(haystack)));
  if (matches.length === 1) {
    return { worldSlug: matches[0].worldSlug, era: matches[0].era, confidence: "high", reason: "single keyword match" };
  }
  if (matches.length > 1) {
    // Ambiguous — don't guess. Surface a review warning to the admin.
    return null;
  }

  // Last resort: year-based hint. Medium confidence at best.
  const year = parseHistoricalPeriodYear(e.historicalPeriod);
  if (year != null) {
    if (year < 11)    return { worldSlug: "prophetic",        era: "prophetic", confidence: "medium", reason: "year < 11h" };
    if (year < 41)    return { worldSlug: "rashidun",         era: "rashidun",  confidence: "medium", reason: "year < 41h" };
    if (year < 132)   return { worldSlug: "umayyad",          era: "umayyad",   confidence: "medium", reason: "41h–132h" };
    if (year < 656)   return { worldSlug: "abbasid",          era: "abbasid",   confidence: "medium", reason: "132h–656h" };
    if (year < 923)   return { worldSlug: "mamluk-sultanate", era: "mamluk",    confidence: "medium", reason: "656h–923h" };
    return { worldSlug: "ottoman", era: "ottoman", confidence: "medium", reason: "923h+" };
  }

  return null;
}

// ---------- Integrity report ----------

export type IntegrityStatus = "ok" | "warning" | "error";

export interface IntegrityLine {
  status: IntegrityStatus;
  label: string;
  detail?: string;
}

export interface CampaignIntegrityReport {
  campaignId: string;
  title: string;
  lines: IntegrityLine[];
  needsReview: boolean;
  assignment: WorldAssignment | null;
}

/**
 * Build the per-campaign integrity report used at import time.
 * Pure — no Supabase / network calls.
 */
export function runCampaignIntegrity(c: Campaign): CampaignIntegrityReport {
  const lines: IntegrityLine[] = [];
  let needsReview = false;

  // 1. Chronological position
  if (typeof c.chronological_order === "number") {
    lines.push({ status: "ok", label: "ترتيب زمني", detail: `chronological_order = ${c.chronological_order}` });
  } else if (typeof c.sort_year === "number") {
    lines.push({ status: "ok", label: "ترتيب زمني", detail: `sort_year = ${c.sort_year}` });
  } else if (parseHistoricalPeriodYear(c.historicalPeriod) != null) {
    lines.push({ status: "warning", label: "ترتيب زمني", detail: "مستخرج من historicalPeriod — يفضّل إضافة sort_year." });
  } else {
    lines.push({ status: "error", label: "ترتيب زمني", detail: "لا يوجد chronological_order ولا sort_year ولا فترة زمنية قابلة للقراءة." });
    needsReview = true;
  }

  // 2. World assignment
  const assignment = inferWorldFromMetadata(c);
  if (assignment && assignment.confidence === "high") {
    lines.push({ status: "ok", label: "العالم التاريخي", detail: `${assignment.worldSlug} (${assignment.reason})` });
    lines.push({ status: "ok", label: "الحقبة", detail: assignment.era });
  } else if (assignment) {
    lines.push({ status: "warning", label: "العالم التاريخي", detail: `${assignment.worldSlug} — ثقة ${assignment.confidence} (${assignment.reason})` });
    needsReview = true;
  } else {
    lines.push({ status: "warning", label: "العالم التاريخي", detail: "لم يتم التعيين تلقائياً — يتطلب مراجعة يدوية." });
    needsReview = true;
  }

  // 3. Relationship integrity — derived from chapter activities.
  const figures   = new Set<string>();
  const battles   = new Set<string>();
  const cities    = new Set<string>();
  const artifacts = new Set<string>();
  for (const ch of c.chapters ?? []) {
    for (const a of ch.activities ?? []) {
      if (a.relatedFigure)   figures.add(a.relatedFigure);
      if (a.relatedBattle)   battles.add(a.relatedBattle);
      if (a.relatedCity)     cities.add(a.relatedCity);
      if (a.relatedArtifact) artifacts.add(a.relatedArtifact);
    }
  }
  const linkLine = (label: string, n: number) =>
    lines.push({
      status: n > 0 ? "ok" : "warning",
      label,
      detail: n > 0 ? `${n} مرتبط` : "لا توجد روابط",
    });
  linkLine("الشخصيات",  figures.size);
  linkLine("المعارك",   battles.size);
  linkLine("المدن",     cities.size);
  linkLine("القطع الأثرية", artifacts.size);
  if (!figures.size && !battles.size && !cities.size && !artifacts.size) needsReview = true;

  return { campaignId: c.id, title: c.title, lines, needsReview, assignment };
}

/** Aggregate integrity for a batch — used by the admin importer. */
export function summarizeIntegrity(reports: CampaignIntegrityReport[]): {
  total: number;
  ok: number;
  review: number;
} {
  const review = reports.filter((r) => r.needsReview).length;
  return { total: reports.length, ok: reports.length - review, review };
}

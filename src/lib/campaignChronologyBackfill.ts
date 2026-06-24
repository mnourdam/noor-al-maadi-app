// ============================================================
// Chronology backfill — derive deterministic order from metadata
// ------------------------------------------------------------
// Used at read time so legacy campaigns (no chronological_order /
// no sort_year) sort correctly alongside new ones. Pure / sync.
//
// Strategy:
//   1. If chronological_order is present, leave the campaign alone.
//   2. Otherwise infer an era → base position (10, 20, 30, …).
//   3. Within the era, use sort_year if present, else parse the
//      historicalPeriod string. Sub-position = base + minYear/10000
//      so we never escape the era's [base, base+10) slot.
//
// This produces values like 30.0070 (Umayyad year 70h) so all
// Umayyad campaigns sort together and before any Abbasid, regardless
// of insertion order. Pure derive — does NOT touch the database.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { parseHistoricalPeriodYear } from "./campaignChronology";
import { inferWorldFromMetadata } from "./contentIntegrity";

const ERA_BASE: Record<string, number> = {
  prophetic: 10,
  rashidun: 20,
  umayyad: 30,
  andalus: 35,
  abbasid: 40,
  fatimid: 50,
  seljuk: 60,
  crusades: 65,
  zengid: 70,
  ayyubid: 80,
  mongols: 85,
  mamluk: 90,
  ottoman: 110,
  modern: 130,
};

/**
 * Return a campaign with `chronological_order` and `sort_year` filled
 * in when they were missing. Never overwrites curated values.
 */
export function withBackfilledChronology<T extends Campaign>(c: T): T {
  if (typeof c.chronological_order === "number" && Number.isFinite(c.chronological_order)) {
    return c;
  }
  const parsedYear = typeof c.sort_year === "number" ? c.sort_year : parseHistoricalPeriodYear(c.historicalPeriod);
  const era = c.era ?? inferWorldFromMetadata(c)?.era;
  const base = era && ERA_BASE[era] != null ? ERA_BASE[era] : undefined;

  let derivedChrono: number | undefined;
  if (base != null) {
    const yearOffset = parsedYear != null ? Math.min(0.9999, Math.max(0, parsedYear) / 10000) : 0;
    derivedChrono = base + yearOffset;
  }

  return {
    ...c,
    chronological_order: derivedChrono ?? c.chronological_order,
    sort_year: c.sort_year ?? (parsedYear ?? undefined),
  };
}

export function withBackfilledChronologyAll<T extends Campaign>(list: T[]): T[] {
  return list.map(withBackfilledChronology);
}

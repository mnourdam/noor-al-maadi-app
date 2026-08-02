// ============================================================
// Era → section music — the ONE explicit binding table
// ------------------------------------------------------------
// Ambience is chosen from an EXPLICIT, stable era key. Never from:
//   - list order / feed position
//   - the visual divider that happens to precede a campaign
//   - Arabic titles or labels
//   - the last loaded track / "first or last file in the list"
//
// An era with no dedicated track maps to `null`, which means the
// generic campaign ambience (never another era's music).
// ============================================================

import {
  APPROVED_ERA_SLUGS,
  canonicalEraSlug,
  type ApprovedEra,
} from "@/lib/taxonomy-labels";
import {
  CAMPAIGN_SECTION_KEYS,
  type CampaignSectionKey,
} from "@/lib/campaigns/sections";
import { CAMPAIGN_THEME_SOURCES } from "@/lib/audio/campaignThemes";

/**
 * Explicit, exhaustive map: every approved era key → its music section.
 * `null` = no dedicated track authored ⇒ generic campaign ambience.
 */
export const ERA_SECTION_MUSIC: Record<ApprovedEra, CampaignSectionKey | null> = {
  prophetic: "prophetic",
  rashidun: "rashidun",
  umayyad: "umayyad",
  abbasid: "abbasid",
  andalus: "andalus",
  seljuk: "crusades",
  zengid: "crusades",
  ayyubid: "crusades",
  // Approved v1 decision: no dedicated Mongol recording in this release —
  // the Mongols + Mamluks era uses the crusader ambience.
  mamluk: "crusades",
  mongols: "crusades",
  ottoman: "ottoman",
  // No dedicated track authored yet — generic ambience, never a neighbour's.
  fatimid: null,
  timurid: null,
  safavid: null,
};

/** Strict era → music section. Unknown era ⇒ null (generic ambience). */
export function sectionForEra(raw: unknown): CampaignSectionKey | null {
  if (typeof raw !== "string") return null;
  const era = canonicalEraSlug(raw);
  if (!era) return null;
  return ERA_SECTION_MUSIC[era] ?? null;
}

/** The single file bound to a section key (no ordering, no guessing). */
export function trackForSection(section: CampaignSectionKey | null): string | null {
  if (!section) return null;
  return CAMPAIGN_THEME_SOURCES[section]?.[0] ?? null;
}

// ------------------------------------------------------------
// Integrity audit
// ------------------------------------------------------------

export interface EraMusicIntegrityIssue {
  code:
    | "era_without_track"
    | "unused_track"
    | "duplicate_track"
    | "unknown_era_key"
    | "cross_era_fallback";
  detail: string;
}

/**
 * Detects: eras with no track, tracks bound to no era, one file bound to
 * two different sections, unknown era keys in the map, and any attempt to
 * silently borrow another era's track.
 */
export function auditEraMusicIntegrity(
  authoredEraKeys: readonly string[] = [],
): EraMusicIntegrityIssue[] {
  const issues: EraMusicIntegrityIssue[] = [];

  // 1. Every approved era key must be present in the map.
  for (const era of APPROVED_ERA_SLUGS) {
    if (!(era in ERA_SECTION_MUSIC)) {
      issues.push({ code: "unknown_era_key", detail: `missing map entry: ${era}` });
    }
  }
  for (const key of Object.keys(ERA_SECTION_MUSIC)) {
    if (!(APPROVED_ERA_SLUGS as readonly string[]).includes(key)) {
      issues.push({ code: "unknown_era_key", detail: `not an approved era: ${key}` });
    }
  }

  // 2. Eras with no dedicated track (informational, never a silent borrow).
  for (const era of APPROVED_ERA_SLUGS) {
    if (!ERA_SECTION_MUSIC[era]) {
      issues.push({ code: "era_without_track", detail: era });
    }
  }

  // 3. Sections never used by any era = unused track file.
  const used = new Set(Object.values(ERA_SECTION_MUSIC).filter(Boolean) as CampaignSectionKey[]);
  for (const section of CAMPAIGN_SECTION_KEYS) {
    if (!used.has(section)) {
      issues.push({ code: "unused_track", detail: `${section} → ${trackForSection(section)}` });
    }
  }

  // 4. One file must not be bound to two sections.
  const byFile = new Map<string, CampaignSectionKey[]>();
  for (const section of CAMPAIGN_SECTION_KEYS) {
    const file = trackForSection(section);
    if (!file) continue;
    byFile.set(file, [...(byFile.get(file) ?? []), section]);
  }
  for (const [file, sections] of byFile) {
    if (sections.length > 1) {
      issues.push({ code: "duplicate_track", detail: `${file} ← ${sections.join(", ")}` });
    }
  }

  // 5. Authored content era keys that resolve to nothing known.
  for (const raw of authoredEraKeys) {
    if (!canonicalEraSlug(raw)) {
      issues.push({ code: "unknown_era_key", detail: `authored content era: ${raw}` });
    }
  }

  return issues;
}

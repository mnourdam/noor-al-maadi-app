// ============================================================
// Phase 3 — Reference extraction + batch-level relation checks.
//
// Pulls raw references out of parsed import payloads into a flat
// list of RelationRef objects the resolver can process. Also
// performs batch-internal validations (duplicate chapter/activity
// ids, self-references, batch-only chapter unlock chain cycles).
//
// Reuses:
//   • Campaign types            — src/types/campaign
//   • runCampaignIntegrity      — src/lib/contentIntegrity
//   • parseUnlockId (for hints) — src/lib/campaignUnlocks
// ============================================================
import type { Campaign, CampaignChapter } from "@/types/campaign";
import { runCampaignIntegrity, type CampaignIntegrityReport } from "@/lib/contentIntegrity";
import type { RelationRef } from "./relation-resolver";

// ---------- Campaign ----------

function pushIfString(list: RelationRef[], raw: unknown, path: string, source: RelationRef["source"], expectedType?: string) {
  if (typeof raw === "string" && raw.trim()) {
    list.push({ raw: raw.trim(), path, source, expectedType });
  }
}

export function extractCampaignRefs(c: Campaign): RelationRef[] {
  const out: RelationRef[] = [];
  const rewardUnlocks = (r: any, path: string) => {
    if (!r) return;
    for (const key of ["artifactId", "badgeId", "figureId"] as const) {
      if (r[key]) pushIfString(out, r[key], `${path}.${key}`, "reward",
        key === "artifactId" ? "artifact" : key === "figureId" ? "figure" : undefined);
    }
    if (Array.isArray(r.unlocks)) {
      r.unlocks.forEach((u: unknown, i: number) => pushIfString(out, u, `${path}.unlocks[${i}]`, "unlock"));
    }
  };

  if (Array.isArray(c.unlocks)) c.unlocks.forEach((u, i) => pushIfString(out, u, `unlocks[${i}]`, "unlock"));
  rewardUnlocks(c.finalRewards, "finalRewards");

  c.chapters.forEach((ch, ci) => {
    rewardUnlocks(ch.rewards, `chapters[${ci}].rewards`);
    ch.activities.forEach((a, ai) => {
      const base = `chapters[${ci}].activities[${ai}]`;
      pushIfString(out, a.relatedFigure, `${base}.relatedFigure`, "activity", "figure");
      pushIfString(out, a.relatedCity, `${base}.relatedCity`, "activity", "city");
      pushIfString(out, a.relatedBattle, `${base}.relatedBattle`, "activity", "battle");
      pushIfString(out, a.relatedArtifact, `${base}.relatedArtifact`, "activity", "artifact");
    });
  });
  return out;
}

// ---------- Encyclopedia ----------

/**
 * Encyclopedia rows keep related refs under `metadata`. We pull all
 * well-known shapes conservatively — anything unrecognized is left
 * alone so the payload stays untouched at commit time.
 */
export function extractEncyclopediaRefs(row: {
  entity_type?: string; metadata?: any;
}): RelationRef[] {
  const out: RelationRef[] = [];
  const md = row.metadata ?? {};
  const arrs: Array<[unknown, string]> = [
    [md.related_ids, "metadata.related_ids"],
    [md.related, "metadata.related"],
    [md.related_entities, "metadata.related_entities"],
    [md.related_figures, "metadata.related_figures"],
    [md.related_battles, "metadata.related_battles"],
    [md.related_cities, "metadata.related_cities"],
    [md.related_artifacts, "metadata.related_artifacts"],
  ];
  const typeHint: Record<string, string> = {
    related_figures: "figure",
    related_battles: "battle",
    related_cities: "city",
    related_artifacts: "artifact",
  };
  for (const [arr, path] of arrs) {
    if (!Array.isArray(arr)) continue;
    const leaf = path.split(".").pop() ?? "";
    const t = typeHint[leaf];
    arr.forEach((v, i) => pushIfString(out, v, `${path}[${i}]`, "encyclopedia_related", t));
  }
  if (typeof md.atlas_ref === "string") {
    pushIfString(out, md.atlas_ref, "metadata.atlas_ref", "atlas");
  }
  return out;
}

// ---------- Investigations ----------

export function extractInvestigationRefs(row: { related_entities?: unknown }): RelationRef[] {
  const out: RelationRef[] = [];
  const arr = row.related_entities;
  if (Array.isArray(arr)) {
    arr.forEach((v, i) => pushIfString(out, v, `related_entities[${i}]`, "related_entity"));
  }
  return out;
}

// ---------- Batch-level checks ----------

export interface BatchCheckIssue {
  level: "error" | "warning";
  message: string;
  itemIndex?: number;
  path?: string;
}

export function checkCampaignBatch(c: Campaign): BatchCheckIssue[] {
  const issues: BatchCheckIssue[] = [];
  const chapterIds = new Map<string, number>();
  c.chapters.forEach((ch, i) => {
    if (!ch.id) return;
    if (chapterIds.has(ch.id)) {
      issues.push({ level: "error", message: `مُعرّف فصل مكرّر: ${ch.id}`, path: `chapters[${i}].id` });
    }
    chapterIds.set(ch.id, i);
  });
  // Duplicate activity ids within each chapter.
  c.chapters.forEach((ch, ci) => {
    const seen = new Set<string>();
    ch.activities.forEach((a, ai) => {
      if (!a.id) return;
      if (seen.has(a.id)) issues.push({ level: "error", message: `مُعرّف نشاط مكرّر: ${a.id}`, path: `chapters[${ci}].activities[${ai}].id` });
      seen.add(a.id);
    });
  });
  // Chapter unlock chain — batch-internal cycle / self-ref / missing-target.
  const chain = new Map<string, string>();
  c.chapters.forEach((ch) => {
    if (ch.unlockRequirement) chain.set(ch.id, ch.unlockRequirement);
  });
  for (const [child, parent] of chain) {
    if (child === parent) {
      issues.push({ level: "error", message: `الفصل «${child}» يشترط نفسه للفتح.`, path: `chapters.unlockRequirement` });
      continue;
    }
    if (!chapterIds.has(parent)) {
      issues.push({ level: "warning", message: `الفصل «${child}» يعتمد على فصل غير موجود «${parent}».`, path: `chapters.unlockRequirement` });
      continue;
    }
    // Cycle: walk parents up to a depth cap.
    const seen = new Set<string>([child]);
    let cur: string | undefined = parent;
    let cycled = false;
    for (let i = 0; i < 32 && cur; i++) {
      if (seen.has(cur)) { cycled = true; break; }
      seen.add(cur);
      cur = chain.get(cur);
    }
    if (cycled) issues.push({ level: "error", message: `دورة في سلسلة فتح الفصول عند «${child}».`, path: `chapters.unlockRequirement` });
  }
  // Self-reference in unlocks (unlock a slug matching the campaign's own id/slug).
  const selfId = (c.slug || c.id || "").toString();
  const selfSlug = (c.slug || "").toString();
  const scan = (list: unknown, path: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((v, i) => {
      if (typeof v !== "string") return;
      const s = v.split(":").pop() ?? v;
      if (s === selfId || (selfSlug && s === selfSlug)) {
        issues.push({ level: "warning", message: `مرجع ذاتي في ${path}[${i}] («${v}»).`, path: `${path}[${i}]` });
      }
    });
  };
  scan(c.unlocks, "unlocks");
  c.chapters.forEach((ch, ci) => scan(ch.rewards?.unlocks, `chapters[${ci}].rewards.unlocks`));
  return issues;
}

export function runCampaignIntegrityReport(c: Campaign): CampaignIntegrityReport {
  return runCampaignIntegrity(c);
}

// ---------- Duplicate reference detection ----------

export function findDuplicateRefs(refs: RelationRef[]): Set<string> {
  const seen = new Map<string, number>();
  const dup = new Set<string>();
  for (const r of refs) {
    const key = `${r.source}::${r.raw}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) dup.add(k);
  return dup;
}

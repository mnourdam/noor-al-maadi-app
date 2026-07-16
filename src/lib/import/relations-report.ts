// ============================================================
// Phase 3 — Per-row relation report + payload repair.
//
// Runs the extractor for the row's content type, resolves every
// reference through the shared resolver, and returns a compact
// RelationReport for the wizard UI. Also exposes applyAcceptedRepairs
// that walks the payload and rewrites accepted references in place.
// Never mutates the input payload — always returns a shallow-cloned
// copy so the wizard's original data remains inspectable.
// ============================================================
import type { Campaign } from "@/types/campaign";
import {
  resolveRelation,
  type RelationRef,
  type RelationResolution,
  type RelationStatus,
} from "./relation-resolver";
import {
  extractCampaignRefs,
  extractEncyclopediaRefs,
  extractInvestigationRefs,
  checkCampaignBatch,
  findDuplicateRefs,
  type BatchCheckIssue,
} from "./relation-extractor";

export type RelationRepairAccept = "auto" | "manual";

export interface RelationReport {
  resolutions: RelationResolution[];
  batchIssues: BatchCheckIssue[];
  duplicates: Set<string>;              // "source::raw" keys occurring >1
  /** admin decisions keyed by resolution index → accept/reject. */
  accepted: Record<number, boolean>;    // true = apply rewrite, false = leave
  counts: {
    valid: number;
    remapped: number;
    type_mismatch: number;
    archived: number;
    disabled: number;
    ambiguous: number;
    missing: number;
  };
}

export interface RelationSummary {
  checked: number;
  repaired: number;
  unresolved: number;
  canonicalRemaps: number;
  aliasRemaps: number;
  brokenRefs: number;
  crossTypeWarnings: number;
}

function emptyCounts(): RelationReport["counts"] {
  return { valid: 0, remapped: 0, type_mismatch: 0, archived: 0, disabled: 0, ambiguous: 0, missing: 0 };
}

function tally(res: RelationResolution[]): RelationReport["counts"] {
  const c = emptyCounts();
  for (const r of res) c[r.status]++;
  return c;
}

// ---------- Public API ----------

function initialAccepted(resolutions: RelationResolution[], autoAccept: boolean): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  if (!autoAccept) return out;
  resolutions.forEach((r, i) => {
    if (r.suggestRewrite && r.confidence === "high") out[i] = true;
  });
  return out;
}

export function buildCampaignRelationReport(c: Campaign, autoAccept = true): RelationReport {
  const refs = extractCampaignRefs(c);
  const duplicates = findDuplicateRefs(refs);
  const resolutions = refs.map(resolveRelation);
  const batchIssues = checkCampaignBatch(c);
  return { resolutions, batchIssues, duplicates, accepted: initialAccepted(resolutions, autoAccept), counts: tally(resolutions) };
}

export function buildEncyclopediaRelationReport(row: { entity_type?: string; metadata?: any }, autoAccept = true): RelationReport {
  const refs = extractEncyclopediaRefs(row);
  const duplicates = findDuplicateRefs(refs);
  const resolutions = refs.map(resolveRelation);
  return { resolutions, batchIssues: [], duplicates, accepted: initialAccepted(resolutions, autoAccept), counts: tally(resolutions) };
}

export function buildInvestigationRelationReport(row: { related_entities?: unknown }, autoAccept = true): RelationReport {
  const refs = extractInvestigationRefs(row);
  const duplicates = findDuplicateRefs(refs);
  const resolutions = refs.map(resolveRelation);
  return { resolutions, batchIssues: [], duplicates, accepted: initialAccepted(resolutions, autoAccept), counts: tally(resolutions) };
}

// ---------- Aggregate ----------

export function summarizeRelations(reports: (RelationReport | undefined)[]): RelationSummary {
  let checked = 0, repaired = 0, unresolved = 0, canon = 0, alias = 0, broken = 0, crossType = 0;
  for (const rep of reports) {
    if (!rep) continue;
    for (let i = 0; i < rep.resolutions.length; i++) {
      const r = rep.resolutions[i];
      checked++;
      if (r.status === "missing") { unresolved++; broken++; }
      if (r.status === "ambiguous") { unresolved++; }
      if (r.status === "disabled" || r.status === "archived") broken++;
      if (r.status === "type_mismatch") crossType++;
      if (r.suggestRewrite && rep.accepted[i]) {
        repaired++;
        if (r.method === "canonical_chain") canon++;
        else if (r.method === "alias" || r.method === "normalized_name") alias++;
      }
    }
  }
  return { checked, repaired, unresolved, canonicalRemaps: canon, aliasRemaps: alias, brokenRefs: broken, crossTypeWarnings: crossType };
}

// ---------- Apply accepted repairs to a payload (non-destructive clone) ----------

function setAtPath(root: any, path: string, next: unknown): void {
  // Path grammar: dot + bracketed indices. Small hand parser.
  const tokens: Array<{ key: string; index?: number }> = [];
  const parts = path.split(".");
  for (const part of parts) {
    const m = part.match(/^([^\[]+)(?:\[(\d+)\])*$/);
    if (!m) return;
    const base = m[1];
    tokens.push({ key: base });
    const idxRe = /\[(\d+)\]/g;
    let mm: RegExpExecArray | null;
    while ((mm = idxRe.exec(part)) !== null) {
      tokens.push({ key: "", index: parseInt(mm[1], 10) });
    }
  }
  let cur: any = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    cur = t.index != null ? cur[t.index] : cur[t.key];
    if (cur == null) return;
  }
  const last = tokens[tokens.length - 1];
  if (last.index != null) cur[last.index] = next;
  else cur[last.key] = next;
}

/**
 * Return a deep-cloned copy of `data` with every accepted rewrite applied.
 * If nothing is accepted the input is returned unchanged.
 */
export function applyAcceptedRepairs<T>(data: T, report: RelationReport): T {
  const accepted = report.resolutions
    .map((r, i) => (r.suggestRewrite && r.rewriteTo && report.accepted[i] ? { r, i } : null))
    .filter((x): x is { r: RelationResolution; i: number } => !!x);
  if (accepted.length === 0) return data;
  const cloned: any = JSON.parse(JSON.stringify(data));
  for (const { r } of accepted) setAtPath(cloned, r.ref.path, r.rewriteTo);
  return cloned as T;
}

export type { RelationStatus, RelationResolution, RelationRef };

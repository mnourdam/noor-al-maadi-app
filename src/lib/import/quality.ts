// ============================================================
// Phase 4 — Content quality gates for the /admin/import wizard.
//
// The importer must show the same quality verdict the existing admin
// cleanup tools would show AFTER the row was written. To keep a single
// source of truth we reuse Irth's existing helpers:
//
//   scoreEntity / scoreBucket / scoreColor   ← src/lib/encyclopedia-quality
//   validateCampaign / CampaignIntegrityReport ← campaignStorage + contentIntegrity
//   validateCrosswordStage                    ← src/lib/games/crossword-validate
//
// Nothing here re-implements those rules — we consume them and add:
//   • per-type publish/draft gates (with the artifact 47% threshold),
//   • empty/fake/placeholder detection,
//   • per-entity duplicate paragraphs/facts/sources,
//   • source shape + URL validation,
//   • quality-regression comparison for updates,
//   • Arabic labels that match the encyclopedia cleanup UI.
//
// No DB schema changes. Pure functions — safe for large batches.
// ============================================================

import { scoreEntity, scoreBucket, type QualityBucket } from "@/lib/encyclopedia-quality";
import { validateCrosswordStage } from "@/lib/games/crossword-validate";
import type { CrosswordStage } from "@/lib/games/types";

// ---------- Public types ----------

/** Coarse per-row verdict. Labels mirror the encyclopedia cleanup UI. */
export type QualityLabel =
  | "publish_ready"      // جاهز للنشر
  | "publish_with_notes" // جاهز مع ملاحظات
  | "needs_review"       // يحتاج مراجعة
  | "needs_content"      // يحتاج محتوى
  | "draft_only"         // مسودة فقط
  | "blocked";           // محظور

export const QUALITY_LABEL_AR: Record<QualityLabel, string> = {
  publish_ready:      "جاهز للنشر",
  publish_with_notes: "جاهز مع ملاحظات",
  needs_review:       "يحتاج مراجعة",
  needs_content:      "يحتاج محتوى",
  draft_only:         "مسودة فقط",
  blocked:            "محظور",
};

export type SourceStatus = "verified" | "acceptable" | "weak" | "missing";
export const SOURCE_STATUS_AR: Record<SourceStatus, string> = {
  verified:   "موثق",
  acceptable: "توثيق مقبول",
  weak:       "مصادر ضعيفة",
  missing:    "بلا مصادر",
};

export interface QualityReport {
  /** 0–100 from scoreEntity or a per-type equivalent. */
  score: number;
  bucket: QualityBucket;
  label: QualityLabel;
  /** Required fields that are missing — block publish. */
  missingRequired: string[];
  /** Optional fields that are missing — reduce quality but don't block. */
  missingOptional: string[];
  /** Human-readable notes explaining every deduction. */
  reasons: string[];
  /** Source credibility summary. */
  sourceStatus: SourceStatus;
  /** True when the row may be published (all publish gates pass). */
  publishEligible: boolean;
  /** True when the row is safe as a draft (no structural fatality). */
  draftEligible: boolean;
  /** Regression info when updating an existing row. */
  regression?: QualityRegression;
}

export interface QualityRegression {
  before: number;
  after: number;
  delta: number;
  /** Kinds of destructive changes detected. */
  losses: string[];
}

// ---------- Placeholder / fake content detection ----------

const PLACEHOLDER_TOKENS = [
  "lorem ipsum",
  "lorem",
  "todo",
  "tbd",
  "coming soon",
  "placeholder",
  "قريبا",
  "قريباً",
  "قيد الإعداد",
  "قيد الكتابة",
  "لاحقا",
  "لاحقاً",
  "xxx",
  "yyy",
];

/** Detect obvious placeholder text (case-insensitive, RTL-safe). */
export function isPlaceholderText(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const v = s.trim().toLowerCase();
  if (!v) return false;
  for (const t of PLACEHOLDER_TOKENS) {
    if (v.includes(t)) return true;
  }
  // repeated single-character filler ("aaaaa", "ااااا").
  if (/^(.)\1{4,}$/.test(v)) return true;
  return false;
}

/** Cheap length metric with placeholder pre-filter. Placeholder → 0. */
function usefulLen(s: unknown): number {
  if (typeof s !== "string") return 0;
  if (isPlaceholderText(s)) return 0;
  return s.trim().length;
}

function splitParagraphs(s: unknown): string[] {
  if (typeof s !== "string") return [];
  return s.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
}

/** Duplicate strings inside an array (case-insensitive on normalized text). */
function duplicateCount(items: string[]): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const it of items) {
    const k = it.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dup++;
    else seen.add(k);
  }
  return dup;
}

// ---------- Source validation ----------

interface SourceLike {
  title?: string;
  name?: string;
  author?: string;
  url?: string;
  note?: string;
}

function normalizeSources(body: any, metadata: any): SourceLike[] {
  const out: SourceLike[] = [];
  const push = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) out.push({ title: t });
      return;
    }
    if (typeof v === "object") out.push(v as SourceLike);
  };
  const arrA = Array.isArray(metadata?.sources) ? metadata.sources : [];
  const arrB = Array.isArray(body?.sources) ? body.sources : [];
  for (const s of [...arrA, ...arrB]) push(s);
  return out;
}

function isValidUrl(u: unknown): boolean {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!s) return false;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch { return false; }
}

interface SourceAudit {
  status: SourceStatus;
  reasons: string[];
  duplicates: number;
}

function auditSources(body: any, metadata: any): SourceAudit {
  const list = normalizeSources(body, metadata);
  const reasons: string[] = [];
  if (list.length === 0) return { status: "missing", reasons: ["لا توجد مصادر."], duplicates: 0 };

  // Reject empty source objects and detect duplicates via title+author.
  const keys: string[] = [];
  let strong = 0;
  let weak = 0;
  for (const s of list) {
    const title = (s.title ?? s.name ?? "").toString().trim();
    if (!title) {
      reasons.push("مصدر بدون عنوان.");
      weak++;
      continue;
    }
    if (s.url && !isValidUrl(s.url)) {
      reasons.push(`رابط مصدر غير صالح (${title}).`);
      weak++;
    }
    // "Strong" heuristic: has an author OR a valid URL OR a note.
    if (s.author || (s.url && isValidUrl(s.url)) || s.note) strong++;
    else weak++;
    keys.push(`${title.toLowerCase()}|${(s.author ?? "").toString().trim().toLowerCase()}`);
  }
  const dupCount = duplicateCount(keys);
  if (dupCount > 0) reasons.push(`مصادر مكرّرة: ${dupCount}.`);

  let status: SourceStatus;
  if (strong >= 2) status = "verified";
  else if (strong >= 1) status = "acceptable";
  else status = "weak";
  return { status, reasons, duplicates: dupCount };
}

// ---------- Per-type field probes ----------

function bodyOverviewText(body: any, fallback?: unknown): string {
  if (typeof body === "string") return body.trim();
  if (body && typeof body === "object" && typeof body.overview === "string") return body.overview.trim();
  if (typeof fallback === "string") return fallback.trim();
  return "";
}

function bodySections(body: any): Array<{ heading?: string; body?: string; text?: string }> {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.sections)) return body.sections;
  if (Array.isArray(body.blocks)) return body.blocks;
  return [];
}

function bodyFacts(body: any): Array<{ label?: string; value?: string }> {
  if (!body || typeof body !== "object") return [];
  return Array.isArray(body.facts) ? body.facts : [];
}

function bodyTimeline(body: any): Array<{ year?: unknown; label?: string; text?: string }> {
  if (!body || typeof body !== "object") return [];
  return Array.isArray(body.timeline) ? body.timeline : [];
}

/** Total structural signal — used only for regression comparison. */
function structuralFingerprint(body: any, metadata: any) {
  return {
    overviewLen: bodyOverviewText(body).length,
    sections: bodySections(body).length,
    facts: bodyFacts(body).length,
    timeline: bodyTimeline(body).length,
    sources: normalizeSources(body, metadata).length,
    related: Array.isArray(metadata?.related) || Array.isArray(body?.related_entities)
      ? (metadata?.related?.length ?? 0) + (body?.related_entities?.length ?? 0)
      : 0,
  };
}

// ---------- Encyclopedia: per-type quality ----------

export interface EncyclopediaInput {
  entity_type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: any;
  metadata?: any;
  enabled?: boolean;
}

const ENC_TYPE_REQUIRED: Record<string, string[]> = {
  figure:    ["overview", "sections", "sources"],
  state:     ["overview", "sections", "sources"],
  city:      ["overview", "sources"],
  landmark:  ["overview", "sources"],
  battle:    ["overview", "sections", "sources"],
  event:     ["overview", "sections", "sources"],
  artifact:  ["overview", "sources"],
};

const ENC_TYPE_OPTIONAL: Record<string, string[]> = {
  figure:    ["timeline", "facts", "related"],
  state:     ["timeline", "facts", "related"],
  city:      ["facts", "related", "image"],
  landmark:  ["facts", "related", "image"],
  battle:    ["timeline", "facts", "related"],
  event:     ["timeline", "facts", "related"],
  artifact:  ["facts", "related", "image"],
};

const REQUIRED_LABEL_AR: Record<string, string> = {
  overview: "نظرة عامة",
  sections: "أقسام",
  sources:  "مصادر",
  timeline: "خط زمني",
  facts:    "بطاقات معلومات",
  related:  "علاقات",
  image:    "صورة",
};

/**
 * Encyclopedia quality — reuses scoreEntity() so the number the admin
 * sees in the importer matches what the cleanup dashboard would show
 * after the row is saved.
 */
export function scoreEncyclopedia(input: EncyclopediaInput): QualityReport {
  const type = String(input.entity_type || "").trim();
  const body = input.body ?? {};
  const metadata = input.metadata ?? {};
  const overview = bodyOverviewText(body, input.summary);
  const sections = bodySections(body);
  const facts = bodyFacts(body);
  const timeline = bodyTimeline(body);
  const sourcesAudit = auditSources(body, metadata);

  const reasons: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  // Fake / empty guardrails.
  const titleTrim = (input.title ?? "").trim().toLowerCase();
  if (!overview || overview.length < 20) missingRequired.push(REQUIRED_LABEL_AR.overview);
  else if (overview.trim().toLowerCase() === titleTrim) reasons.push("النظرة العامة مطابقة للعنوان.");
  if (isPlaceholderText(overview)) reasons.push("النظرة العامة تحتوي نصاً مؤقتاً (TODO/lorem/…).");

  // Sections with only a heading and no body.
  const emptySections = sections.filter((s) => usefulLen(s?.body ?? s?.text) < 12).length;
  if (emptySections > 0) reasons.push(`أقسام بلا محتوى فعلي: ${emptySections}.`);

  // Duplicate paragraphs inside overview.
  const paras = splitParagraphs(overview);
  const dupParas = duplicateCount(paras);
  if (dupParas > 0) reasons.push(`فقرات مكرّرة داخل النظرة العامة: ${dupParas}.`);

  // Duplicate facts / timeline entries.
  const dupFacts = duplicateCount(facts.map((f) => `${f?.label ?? ""}|${f?.value ?? ""}`));
  if (dupFacts > 0) reasons.push(`بطاقات معلومات مكرّرة: ${dupFacts}.`);
  const dupTimeline = duplicateCount(timeline.map((t) => `${t?.year ?? ""}|${t?.label ?? t?.text ?? ""}`));
  if (dupTimeline > 0) reasons.push(`أحداث زمنية مكرّرة: ${dupTimeline}.`);

  // Per-type required/optional.
  const required = ENC_TYPE_REQUIRED[type] ?? ["overview"];
  const optional = ENC_TYPE_OPTIONAL[type] ?? [];
  for (const key of required) {
    if (key === "overview" && (!overview || overview.length < 20)) continue; // handled above
    if (key === "sections" && sections.length === 0) missingRequired.push(REQUIRED_LABEL_AR.sections);
    if (key === "sources" && sourcesAudit.status === "missing") missingRequired.push(REQUIRED_LABEL_AR.sources);
  }
  for (const key of optional) {
    if (key === "timeline" && timeline.length === 0) missingOptional.push(REQUIRED_LABEL_AR.timeline);
    if (key === "facts" && facts.length === 0) missingOptional.push(REQUIRED_LABEL_AR.facts);
    if (key === "related") {
      const rel = (Array.isArray(metadata?.related) ? metadata.related.length : 0)
                + (Array.isArray(body?.related_entities) ? body.related_entities.length : 0);
      if (rel === 0) missingOptional.push(REQUIRED_LABEL_AR.related);
    }
    if (key === "image") {
      const img = metadata?.image || metadata?.image_url || metadata?.hero_image || metadata?.thumbnail;
      if (!img) missingOptional.push(REQUIRED_LABEL_AR.image);
    }
  }

  reasons.push(...sourcesAudit.reasons);

  // Reuse the canonical scorer.
  const rawScore = scoreEntity({
    summary: overview,
    body,
    metadata,
    atlasLinks: 0,       // resolved later — unknown at import time
    campaignRefs: 0,
  });
  // Adjust for placeholder overview / duplicate paragraphs (cap at -15).
  let score = rawScore;
  if (isPlaceholderText(overview)) score = Math.min(score, 20);
  score -= Math.min(15, dupParas * 5 + dupFacts * 3 + dupTimeline * 3 + emptySections * 3);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Publish threshold — artifacts 47, everything else follows scoreBucket (>=50 acceptable, >=80 ready).
  const artifactThreshold = 47;
  const nonArtifactThreshold = 50;
  const threshold = type === "artifact" ? artifactThreshold : nonArtifactThreshold;

  // Publish gate: no missing required, real sources, score above threshold.
  const publishEligible =
    missingRequired.length === 0 &&
    sourcesAudit.status !== "missing" &&
    !isPlaceholderText(overview) &&
    score >= threshold;

  const draftEligible = overview.length > 0 || sections.length > 0;

  let label: QualityLabel;
  if (!draftEligible) label = "needs_content";
  else if (!publishEligible) label = missingRequired.length > 0 ? "needs_content" : "needs_review";
  else if (score >= 80 && sourcesAudit.status === "verified" && missingOptional.length === 0) label = "publish_ready";
  else if (score >= 80) label = "publish_with_notes";
  else label = "publish_with_notes";

  return {
    score,
    bucket: scoreBucket(score),
    label,
    missingRequired,
    missingOptional,
    reasons,
    sourceStatus: sourcesAudit.status,
    publishEligible,
    draftEligible,
  };
}

// ---------- Campaigns ----------

interface CampaignLike {
  id?: string; title?: string; chapters?: any[]; rewards?: any;
}

export function scoreCampaign(c: CampaignLike): QualityReport {
  const reasons: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  const chapters = Array.isArray(c.chapters) ? c.chapters : [];
  if (chapters.length === 0) missingRequired.push("فصول");

  let emptyChapters = 0;
  let emptyActivities = 0;
  for (const ch of chapters) {
    const acts = Array.isArray(ch?.activities) ? ch.activities : [];
    if (acts.length === 0) emptyChapters++;
    for (const a of acts) {
      const prompt = a?.prompt;
      if (typeof prompt !== "string" || usefulLen(prompt) < 4) emptyActivities++;
    }
  }
  if (emptyChapters > 0) reasons.push(`فصول فارغة: ${emptyChapters}.`);
  if (emptyActivities > 0) reasons.push(`أنشطة بلا نص فعّال: ${emptyActivities}.`);

  const rewards = c.rewards ?? {};
  const hasReward = typeof rewards.xp === "number" || typeof rewards.coins === "number";
  if (!hasReward) missingOptional.push("مكافآت");

  // Score: 100 baseline, minus penalties.
  let score = 100;
  score -= emptyChapters * 12;
  score -= Math.min(30, emptyActivities * 3);
  if (chapters.length === 0) score = 0;
  if (!hasReward) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const publishEligible = missingRequired.length === 0 && emptyChapters === 0 && score >= 60;
  const draftEligible = chapters.length > 0;
  const label: QualityLabel =
    !draftEligible ? "needs_content"
    : !publishEligible ? "needs_review"
    : score >= 85 ? "publish_ready"
    : "publish_with_notes";

  return {
    score,
    bucket: scoreBucket(score),
    label,
    missingRequired,
    missingOptional,
    reasons,
    sourceStatus: "acceptable", // campaigns don't require sources
    publishEligible,
    draftEligible,
  };
}

// ---------- Investigations ----------

interface InvestigationLike {
  slug?: string; title?: string; description?: string;
  reward?: any; steps?: any[]; related_entities?: unknown[];
}

export function scoreInvestigation(inv: InvestigationLike): QualityReport {
  const reasons: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  const steps = Array.isArray(inv.steps) ? inv.steps : [];
  const hasBriefing = steps.some((s: any) => s?.type === "briefing" && usefulLen(s?.text) >= 20);
  const hasConclusion = steps.some((s: any) => s?.type === "conclusion" && usefulLen(s?.text) >= 20);
  const questions = steps.filter((s: any) => s?.type === "question" || s?.type === "decision");

  if (!hasBriefing) missingRequired.push("تمهيد");
  if (questions.length === 0) missingRequired.push("أسئلة");
  if (!hasConclusion) missingRequired.push("خلاصة");

  let invalidQ = 0;
  for (const q of questions) {
    const opts = Array.isArray(q?.options) ? q.options : [];
    const ok = opts.length >= 2 && typeof q?.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < opts.length;
    if (!ok) invalidQ++;
    // Leaking the answer in the prompt/title is a common mistake.
    const answer = ok ? String(opts[q.correctAnswer]).trim().toLowerCase() : "";
    const prompt = typeof q?.prompt === "string" ? q.prompt.trim().toLowerCase() : "";
    if (answer && prompt && answer.length > 3 && prompt.includes(answer)) {
      reasons.push("سؤال يكشف الإجابة داخل النص.");
    }
  }
  if (invalidQ > 0) reasons.push(`أسئلة غير صالحة: ${invalidQ}.`);

  const rel = Array.isArray(inv.related_entities) ? inv.related_entities.length : 0;
  if (rel === 0) missingOptional.push("علاقات");

  const rewards = inv.reward ?? {};
  const hasReward = typeof rewards.xp === "number" || typeof rewards.coins === "number" || typeof rewards.hearts === "number";
  if (!hasReward) missingOptional.push("مكافآت");

  let score = 100;
  score -= missingRequired.length * 18;
  score -= invalidQ * 8;
  if (questions.length < 3) score -= (3 - questions.length) * 4;
  if (!hasReward) score -= 4;
  if (rel === 0) score -= 4;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const publishEligible = missingRequired.length === 0 && invalidQ === 0 && score >= 60;
  const draftEligible = steps.length > 0;
  const label: QualityLabel =
    !draftEligible ? "needs_content"
    : !publishEligible ? "needs_review"
    : score >= 85 ? "publish_ready"
    : "publish_with_notes";

  return {
    score, bucket: scoreBucket(score), label,
    missingRequired, missingOptional, reasons,
    sourceStatus: "acceptable",
    publishEligible, draftEligible,
  };
}

// ---------- Today in History / Daily Facts / Notifications ----------

export function scoreShortEditorial(row: {
  title?: string; body?: string; deep_link?: string | null;
  month?: number; day?: number; hijri_year?: string | null; gregorian_year?: string | null;
}): QualityReport {
  const reasons: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const title = row.title ?? "";
  const body = row.body ?? "";

  if (usefulLen(title) < 3) missingRequired.push("عنوان");
  if (usefulLen(body) < 15) missingRequired.push("محتوى");
  if (isPlaceholderText(body)) reasons.push("المحتوى يبدو نصاً مؤقتاً.");
  if (title.trim() && body.trim() && title.trim() === body.trim()) reasons.push("العنوان مطابق للمحتوى.");

  if (row.deep_link && !/^\/[a-z0-9/_\-.:]+$/i.test(row.deep_link)) {
    reasons.push("رابط داخلي مشبوه.");
  }

  // Today-in-history specifics.
  if (typeof row.month === "number" && (row.month < 1 || row.month > 12)) missingRequired.push("شهر صالح");
  if (typeof row.day === "number" && (row.day < 1 || row.day > 31)) missingRequired.push("يوم صالح");
  if (row.month !== undefined && !row.gregorian_year && !row.hijri_year) missingOptional.push("سنة");

  let score = 100 - missingRequired.length * 25 - reasons.length * 6 - missingOptional.length * 4;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const publishEligible = missingRequired.length === 0 && !isPlaceholderText(body);
  const draftEligible = usefulLen(title) > 0;
  const label: QualityLabel =
    !draftEligible ? "needs_content"
    : !publishEligible ? "needs_review"
    : score >= 80 ? "publish_ready" : "publish_with_notes";

  return {
    score, bucket: scoreBucket(score), label,
    missingRequired, missingOptional, reasons,
    sourceStatus: "acceptable",
    publishEligible, draftEligible,
  };
}

// ---------- Crossword (delegate to existing validator) ----------

export function scoreCrossword(stage: CrosswordStage): QualityReport {
  const issues = validateCrosswordStage(stage);
  const reasons = issues.map((i) => i.message);
  const publishEligible = issues.length === 0;
  const score = publishEligible ? 100 : Math.max(0, 60 - issues.length * 10);
  return {
    score,
    bucket: scoreBucket(score),
    label: publishEligible ? "publish_ready" : "needs_review",
    missingRequired: publishEligible ? [] : ["تصحيح تقاطعات الشبكة"],
    missingOptional: [],
    reasons,
    sourceStatus: "acceptable",
    publishEligible,
    draftEligible: (stage as any)?.clues?.length > 0,
  };
}

// ---------- Regression detection ----------

/**
 * Detect a destructive update — the incoming row would remove content
 * that already exists in the DB row. Called for encyclopedia updates.
 */
export function detectRegression(existing: { body?: any; metadata?: any } | null | undefined, incoming: { body?: any; metadata?: any }): QualityRegression | undefined {
  if (!existing) return undefined;
  const before = structuralFingerprint(existing.body, existing.metadata);
  const after = structuralFingerprint(incoming.body, incoming.metadata);
  const losses: string[] = [];
  if (after.overviewLen < before.overviewLen * 0.7 && before.overviewLen > 40) losses.push("النظرة العامة أقصر");
  if (after.sections < before.sections) losses.push(`أقسام أقل (${before.sections}→${after.sections})`);
  if (after.facts < before.facts) losses.push(`بطاقات معلومات أقل (${before.facts}→${after.facts})`);
  if (after.timeline < before.timeline) losses.push(`أحداث زمنية أقل (${before.timeline}→${after.timeline})`);
  if (after.sources < before.sources) losses.push(`مصادر أقل (${before.sources}→${after.sources})`);
  if (after.related < before.related) losses.push(`علاقات أقل (${before.related}→${after.related})`);
  if (losses.length === 0) return undefined;

  // Rough score delta on structural volume — used to warn, not to gate.
  const wBefore =
    before.overviewLen / 20 + before.sections * 5 + before.facts * 2 +
    before.timeline * 2 + before.sources * 4 + before.related * 2;
  const wAfter =
    after.overviewLen / 20 + after.sections * 5 + after.facts * 2 +
    after.timeline * 2 + after.sources * 4 + after.related * 2;
  const beforeScore = Math.max(0, Math.min(100, Math.round(wBefore)));
  const afterScore = Math.max(0, Math.min(100, Math.round(wAfter)));
  return { before: beforeScore, after: afterScore, delta: afterScore - beforeScore, losses };
}

// ---------- Batch summary ----------

export interface QualityBatchSummary {
  avgScore: number;
  publishReady: number;
  publishWithNotes: number;
  needsReview: number;
  needsContent: number;
  draftOnly: number;
  blocked: number;
  regressions: number;
  missingSources: number;
}

export function summarizeQuality(reports: Array<QualityReport | undefined>): QualityBatchSummary {
  const s: QualityBatchSummary = {
    avgScore: 0,
    publishReady: 0,
    publishWithNotes: 0,
    needsReview: 0,
    needsContent: 0,
    draftOnly: 0,
    blocked: 0,
    regressions: 0,
    missingSources: 0,
  };
  let n = 0;
  let sum = 0;
  for (const r of reports) {
    if (!r) continue;
    n++;
    sum += r.score;
    if (r.label === "publish_ready") s.publishReady++;
    else if (r.label === "publish_with_notes") s.publishWithNotes++;
    else if (r.label === "needs_review") s.needsReview++;
    else if (r.label === "needs_content") s.needsContent++;
    else if (r.label === "draft_only") s.draftOnly++;
    else if (r.label === "blocked") s.blocked++;
    if (r.regression) s.regressions++;
    if (r.sourceStatus === "missing") s.missingSources++;
  }
  s.avgScore = n === 0 ? 0 : Math.round(sum / n);
  return s;
}

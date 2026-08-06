// ============================================================
// Investigation Export System
// ------------------------------------------------------------
// Read-only export pipeline for /admin/investigations.
//
//  * Server truth only: rows come from `admin_export_investigations`
//    (SECURITY DEFINER, content-admin gated) in deterministic
//    batches ordered by slug — never from local snapshots.
//  * Three artifacts:
//      1. Full JSON bundle (re-import ready envelope, version 1)
//      2. CSV summary (UTF-8 BOM, Excel/Arabic safe)
//      3. Validation report (JSON) — errors / warnings / readiness
//  * Nothing here mutates data. No RPC used below writes.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export const INVESTIGATION_EXPORT_VERSION = 1;

/** Raw investigation record exactly as the export RPC returns it. */
export interface ExportedInvestigation {
  id: string;
  slug: string;
  world_slug: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  difficulty: string | null;
  enabled: boolean;
  status: "enabled" | "disabled";
  reward: Record<string, unknown> | null;
  steps: unknown[];
  related_entities: unknown[];
  draft_data: Record<string, unknown> | null;
  content_version: number | null;
  published_at: string | null;
  has_unpublished_changes: boolean | null;
  last_editor_email: string | null;
  last_draft_saved_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  /** Arabic, admin-facing explanation. */
  message: string;
  path?: string;
}

export interface InvestigationValidation {
  id: string;
  slug: string;
  title: string | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** true when there are zero errors — safe to re-import. */
  importSafe: boolean;
  /** 0..100 editorial completeness score. */
  completeness: number;
  counts: {
    steps: number;
    questions: number;
    evidence: number;
    related: number;
  };
}

export interface ExportBundle {
  version: number;
  kind: "irth.investigations.export";
  exported_at: string;
  scope: "all" | "selection";
  count: number;
  /** Present when the whole library was requested. */
  library_total?: number;
  investigations: ExportedInvestigation[];
}

export interface ExportReport {
  version: number;
  kind: "irth.investigations.validation-report";
  generated_at: string;
  totals: {
    investigations: number;
    importSafe: number;
    withErrors: number;
    withWarnings: number;
    averageCompleteness: number;
  };
  items: InvestigationValidation[];
}

// ------------------------------------------------------------
// Fetching (batched, progress-reporting)
// ------------------------------------------------------------

const BATCH_SIZE = 50;

export interface FetchProgress {
  loaded: number;
  total: number;
}

/**
 * Pull complete investigation records from the server.
 * `ids === null` exports the whole library.
 */
export async function fetchInvestigationsForExport(
  ids: string[] | null,
  onProgress?: (p: FetchProgress) => void,
): Promise<{ rows: ExportedInvestigation[]; total: number }> {
  const out: ExportedInvestigation[] = [];
  let total = 0;
  let offset = 0;

  // Guard: an empty selection must not silently export everything.
  if (ids && ids.length === 0) return { rows: [], total: 0 };

  for (;;) {
    const { data, error } = await supabase.rpc("admin_export_investigations" as any, {
      p_ids: ids,
      p_limit: BATCH_SIZE,
      p_offset: offset,
    });
    if (error) throw error;
    const payload = (data ?? {}) as {
      total?: number;
      rows?: ExportedInvestigation[];
    };
    total = payload.total ?? out.length;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    out.push(...rows);
    onProgress?.({ loaded: out.length, total });
    if (rows.length < BATCH_SIZE || out.length >= total) break;
    offset += BATCH_SIZE;
  }

  return { rows: out, total };
}

// ------------------------------------------------------------
// Canonical validator
// ------------------------------------------------------------
// Mirrors `admin_validate_investigation_payload` (the server writer
// gate) so an exported file that reports `importSafe: true` will not
// be rejected on re-import. Legacy-shape findings are warnings.

const VALID_STEP_TYPES = new Set(["briefing", "evidence", "question", "decision", "conclusion"]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function validateInvestigation(row: ExportedInvestigation): InvestigationValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string, path?: string) =>
    errors.push({ severity: "error", code, message, path });
  const warn = (code: string, message: string, path?: string) =>
    warnings.push({ severity: "warning", code, message, path });

  // --- Identity
  const title = str(row.title);
  if (!title || title.trim().length < 2) err("TITLE_MISSING", "العنوان مفقود أو أقصر من حرفين.", "title");
  if (!row.slug || !SLUG_RE.test(row.slug)) err("SLUG_INVALID", "المعرّف النصي (slug) غير صالح.", "slug");
  if (!str(row.subtitle)) warn("SUBTITLE_MISSING", "لا يوجد عنوان فرعي.", "subtitle");
  if (!str(row.description)) warn("DESCRIPTION_MISSING", "لا يوجد وصف تعريفي.", "description");

  // --- Difficulty
  if (!row.difficulty) warn("DIFFICULTY_MISSING", "الصعوبة غير محدّدة.", "difficulty");
  else if (!VALID_DIFFICULTY.has(row.difficulty))
    err("DIFFICULTY_INVALID", `الصعوبة غير معروفة: ${row.difficulty}`, "difficulty");

  // --- Reward
  const reward = (row.reward ?? {}) as Record<string, unknown>;
  for (const key of ["xp", "dinars", "hearts", "coins"]) {
    if (!(key in reward)) continue;
    const n = Number(reward[key]);
    if (!Number.isFinite(n)) err("REWARD_NOT_NUMERIC", `قيمة المكافأة ${key} ليست رقمًا.`, `reward.${key}`);
    else if (n < 0 || n > 100000) err("REWARD_OUT_OF_RANGE", `قيمة المكافأة ${key} خارج النطاق.`, `reward.${key}`);
  }
  if ("coins" in reward && !("dinars" in reward))
    warn("REWARD_LEGACY_COINS", "المكافأة تستخدم الحقل القديم coins بدل dinars.", "reward.coins");
  if ("coins" in reward && "dinars" in reward && Number(reward.coins) !== Number(reward.dinars))
    err("REWARD_CONFLICT", "تعارض بين dinars و coins في المكافأة.", "reward");
  if (!("xp" in reward)) warn("REWARD_XP_MISSING", "لا توجد مكافأة خبرة (XP).", "reward.xp");

  // --- Steps
  const steps = Array.isArray(row.steps) ? row.steps : [];
  let questions = 0;
  let evidence = 0;
  let hasBriefing = false;
  let hasConclusion = false;
  const seenIds = new Set<string>();

  if (steps.length === 0) err("STEPS_EMPTY", "لا توجد خطوات في التحقيق.", "steps");

  steps.forEach((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const path = `steps[${i}]`;
    const type = str(s.type);
    if (!type || !VALID_STEP_TYPES.has(type)) {
      err("STEP_TYPE_INVALID", `نوع الخطوة ${i} غير صالح: ${type ?? "null"}`, path);
      return;
    }
    const id = str(s.id);
    if (id) {
      if (seenIds.has(id)) err("STEP_ID_DUPLICATE", `معرّف الخطوة مكرّر: ${id}`, path);
      seenIds.add(id);
    }

    if (type === "briefing") hasBriefing = true;
    if (type === "conclusion") hasConclusion = true;
    if (type === "evidence") evidence++;

    if (type === "question" || type === "decision") {
      questions++;
      const prompt = str(s.prompt) ?? str(s.question);
      if (!prompt || !prompt.trim()) err("STEP_PROMPT_MISSING", `نص السؤال مفقود في الخطوة ${i}.`, path);
      if (str(s.prompt) === null && str(s.question) !== null)
        warn("STEP_LEGACY_QUESTION", `الخطوة ${i} تستخدم الحقل القديم question بدل prompt.`, path);

      const options = Array.isArray(s.options) ? s.options : null;
      if (!options || options.length < 2) {
        err("STEP_OPTIONS_INVALID", `الخطوة ${i} تحتاج خيارين على الأقل.`, path);
      } else {
        const texts = options.map((o) => (typeof o === "string" ? o : String(o ?? "")));
        if (texts.some((t) => !t.trim())) err("STEP_OPTION_EMPTY", `الخطوة ${i} تحتوي خيارًا فارغًا.`, path);
        if (new Set(texts).size !== texts.length) err("STEP_OPTION_DUPLICATE", `الخطوة ${i} تحتوي خيارات مكرّرة.`, path);
      }

      const hasCanonical = s.correctAnswer !== undefined && s.correctAnswer !== null;
      const hasLegacy = s.correct !== undefined && s.correct !== null;
      if (!hasCanonical && hasLegacy)
        warn("STEP_LEGACY_CORRECT", `الخطوة ${i} تستخدم الحقل القديم correct بدل correctAnswer.`, path);
      if (!hasCanonical && !hasLegacy && type === "question")
        err("STEP_CORRECT_MISSING", `لا توجد إجابة صحيحة محدّدة في الخطوة ${i}.`, path);
      const correctRaw = hasCanonical ? s.correctAnswer : s.correct;
      if (correctRaw !== undefined && correctRaw !== null) {
        const idx = Number(correctRaw);
        if (!Number.isInteger(idx)) err("STEP_CORRECT_NOT_INT", `الإجابة الصحيحة في الخطوة ${i} ليست رقمًا صحيحًا.`, path);
        else if (!options || idx < 0 || idx >= options.length)
          err("STEP_CORRECT_OUT_OF_RANGE", `الإجابة الصحيحة في الخطوة ${i} خارج نطاق الخيارات.`, path);
      }
      if (!str(s.explanation)) warn("STEP_EXPLANATION_MISSING", `لا يوجد تفسير للإجابة في الخطوة ${i}.`, path);
    } else {
      const text = str(s.text);
      if (!text || !text.trim()) err("STEP_TEXT_MISSING", `نص الخطوة ${i} مفقود (${type}).`, path);
    }
  });

  if (steps.length > 0 && !hasBriefing) warn("BRIEFING_MISSING", "لا توجد خطوة تمهيدية (briefing).", "steps");
  if (steps.length > 0 && !hasConclusion) warn("CONCLUSION_MISSING", "لا توجد خطوة خاتمة (conclusion).", "steps");
  if (steps.length > 0 && questions === 0) warn("QUESTIONS_MISSING", "لا توجد أسئلة أو قرارات.", "steps");
  if (steps.length > 0 && evidence === 0) warn("EVIDENCE_MISSING", "لا توجد أدلة (evidence).", "steps");

  // --- Relations
  const related = Array.isArray(row.related_entities) ? row.related_entities : [];
  if (!Array.isArray(row.related_entities))
    err("RELATED_MALFORMED", "حقل المراجع المرتبطة ليس مصفوفة.", "related_entities");
  const relIds: string[] = [];
  related.forEach((r, i) => {
    if (typeof r === "string") {
      if (!r.trim()) err("RELATED_EMPTY", `مرجع فارغ في الموضع ${i}.`, `related_entities[${i}]`);
      else relIds.push(r);
      return;
    }
    const obj = (r ?? {}) as Record<string, unknown>;
    const id = str(obj.id) ?? str(obj.slug) ?? str(obj.entity_id);
    if (!id) err("RELATED_MALFORMED", `مرجع غير صالح في الموضع ${i}.`, `related_entities[${i}]`);
    else {
      relIds.push(id);
      warn("RELATED_LEGACY_OBJECT", `المرجع ${id} مخزّن بصيغة كائن قديمة.`, `related_entities[${i}]`);
    }
  });
  if (relIds.length !== new Set(relIds).size)
    warn("RELATED_DUPLICATE", "توجد مراجع مرتبطة مكرّرة.", "related_entities");
  if (relIds.length === 0) warn("RELATED_EMPTY_LIST", "لا توجد مراجع مرتبطة بالموسوعة.", "related_entities");

  // --- Editorial state
  if (row.has_unpublished_changes)
    warn("UNPUBLISHED_CHANGES", "توجد تغييرات غير منشورة في المسودة.", "draft_data");
  if (!row.enabled) warn("DISABLED", "التحقيق معطّل للاعبين.", "enabled");

  // --- Completeness: editorial readiness, independent of hard errors.
  const checks = [
    !!title && title.trim().length >= 2,
    !!row.slug && SLUG_RE.test(row.slug),
    !!str(row.subtitle) || !!str(row.description),
    !!row.difficulty && VALID_DIFFICULTY.has(row.difficulty),
    "xp" in reward || "dinars" in reward || "coins" in reward,
    steps.length >= 3,
    questions >= 3,
    evidence >= 1,
    hasBriefing && hasConclusion,
    relIds.length > 0,
  ];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return {
    id: row.id,
    slug: row.slug,
    title,
    errors,
    warnings,
    importSafe: errors.length === 0,
    completeness,
    counts: { steps: steps.length, questions, evidence, related: relIds.length },
  };
}

export function buildReport(rows: ExportedInvestigation[]): ExportReport {
  const items = rows.map(validateInvestigation);
  const importSafe = items.filter((i) => i.importSafe).length;
  const withWarnings = items.filter((i) => i.warnings.length > 0).length;
  const avg = items.length
    ? Math.round(items.reduce((s, i) => s + i.completeness, 0) / items.length)
    : 0;
  return {
    version: INVESTIGATION_EXPORT_VERSION,
    kind: "irth.investigations.validation-report",
    generated_at: new Date().toISOString(),
    totals: {
      investigations: items.length,
      importSafe,
      withErrors: items.length - importSafe,
      withWarnings,
      averageCompleteness: avg,
    },
    items,
  };
}

export function buildBundle(
  rows: ExportedInvestigation[],
  scope: "all" | "selection",
  libraryTotal?: number,
): ExportBundle {
  return {
    version: INVESTIGATION_EXPORT_VERSION,
    kind: "irth.investigations.export",
    exported_at: new Date().toISOString(),
    scope,
    count: rows.length,
    ...(scope === "all" && typeof libraryTotal === "number" ? { library_total: libraryTotal } : {}),
    investigations: rows,
  };
}

// ------------------------------------------------------------
// CSV (UTF-8 BOM so Excel renders Arabic correctly)
// ------------------------------------------------------------

const CSV_HEADERS = [
  "slug",
  "id",
  "title",
  "subtitle",
  "world_slug",
  "difficulty",
  "status",
  "steps",
  "questions",
  "evidence",
  "related",
  "xp",
  "dinars",
  "hearts",
  "content_version",
  "has_unpublished_changes",
  "completeness",
  "errors",
  "warnings",
  "import_safe",
  "updated_at",
] as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: ExportedInvestigation[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    const v = validateInvestigation(row);
    const reward = (row.reward ?? {}) as Record<string, unknown>;
    const dinars = reward.dinars ?? reward.coins ?? "";
    lines.push(
      [
        row.slug,
        row.id,
        row.title ?? "",
        row.subtitle ?? "",
        row.difficulty ?? "",
        row.status,
        v.counts.steps,
        v.counts.questions,
        v.counts.evidence,
        v.counts.related,
        reward.xp ?? "",
        dinars,
        reward.hearts ?? "",
        row.content_version ?? "",
        row.has_unpublished_changes ? "yes" : "no",
        v.completeness,
        v.errors.length,
        v.warnings.length,
        v.importSafe ? "yes" : "no",
        row.updated_at,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM + CRLF: Excel-safe Arabic.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

// ------------------------------------------------------------
// Download helpers
// ------------------------------------------------------------

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function downloadFile(name: string, content: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportFileName(kind: "bundle" | "summary" | "report", scope: string): string {
  const ext = kind === "summary" ? "csv" : "json";
  return `irth-investigations-${scope}-${kind}-${stamp()}.${ext}`;
}

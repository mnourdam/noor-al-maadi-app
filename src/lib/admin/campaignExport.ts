/**
 * Campaigns — Full-Fidelity Export (read-only).
 *
 * Source of truth is `public.admin_campaigns`, where the entire campaign
 * document (chapters → activities → options/answers/rewards/unlocks and
 * `metadata.core_entities` / `metadata.supporting_entities` relations)
 * lives inside the `data` jsonb column. Because of that, the ONLY way to
 * guarantee zero field loss is to emit `data` (and `draft_data`) verbatim
 * — no re-keying, no coercion, no truncation.
 *
 * Everything under `derived` is an additive, read-only projection used for
 * the CSV audit sheet and the validation report. Re-import must read
 * `data` / `draft_data`, never `derived`.
 *
 * This module performs NO writes of any kind.
 */

import { supabase } from "@/integrations/supabase/client";

export const CAMPAIGN_EXPORT_ENVELOPE_VERSION = 1;
export const CAMPAIGN_EXPORT_GENERATOR = "irth-campaigns-export";

/** Activity types actually implemented by the campaign runtime. */
export const KNOWN_ACTIVITY_TYPES = [
  "reading_then_question",
  "multiple_choice",
  "true_false",
  "decision_choice",
  "arrange_events",
  "reflection_prompt",
  "matching",
  "ordering",
] as const;

/** Types whose payload must contain a resolvable answer. */
const ANSWER_TYPES = new Set(["multiple_choice", "true_false", "decision_choice"]);
/**
 * Types whose answer must be one of `options`.
 * `true_false` is deliberately EXCLUDED: its canonical answer is a boolean
 * (`true`/`false`), while `options` (e.g. ["صحيح","خطأ"]) are display labels
 * only. Treating it like multiple_choice produced 629 false positives.
 */
const OPTION_ANSWER_TYPES = new Set(["multiple_choice", "decision_choice"]);
/** Types whose payload must contain options. */
const OPTION_TYPES = new Set(["multiple_choice", "decision_choice", "arrange_events"]);
/** Accepted textual spellings of a boolean answer. */
const TRUE_WORDS = new Set(["true", "1", "صحيح", "صح", "نعم"]);
const FALSE_WORDS = new Set(["false", "0", "خطأ", "خطا", "لا"]);
/** Types that are narrative-only (no answer expected). */
const NARRATIVE_TYPES = new Set(["reading_then_question", "reflection_prompt"]);

type Json = unknown;
type Dict = Record<string, Json>;

export interface RawCampaignExportRow {
  id: string;
  slug: string | null;
  title: string;
  status: string;
  content_version: number | null;
  published_at: string | null;
  has_unpublished_changes: boolean | null;
  updated_by: string | null;
  last_editor_email: string | null;
  created_at: string;
  updated_at: string;
  key_art: { path: string | null; square_path: string | null; credit: string | null; source: string | null };
  data: Dict | null;
  draft_data: Dict | null;
  versions_count: number;
  inbound_story_relations: Dict[];
}

export interface CampaignDerived {
  chapter_count: number;
  activity_count: number;
  activity_types: Record<string, number>;
  chapter_ids: string[];
  activity_ids: string[];
  unlocks: string[];
  related_entities: string[];
  world_slug: string | null;
  era: string | null;
  chronological_order: number | null;
}

export interface CampaignExportEntry extends RawCampaignExportRow {
  export_order: number;
  derived: CampaignDerived;
}

export interface CampaignExportEnvelope {
  envelope_version: number;
  generator: string;
  exported_at: string;
  source: {
    schema: "public";
    table: "admin_campaigns";
    document_column: "data";
    draft_column: "draft_data";
    related_tables: string[];
    note: string;
  };
  scope: "selection" | "all";
  campaign_ids: string[];
  counts: { campaigns: number; chapters: number; activities: number };
  audit?: CampaignAuditReport;
  campaigns: CampaignExportEntry[];
}

// ---------------------------------------------------------------- fetching

/** Read-only fetch through the manager-gated RPC. */
export async function fetchCampaignExportRows(ids: string[] | null): Promise<RawCampaignExportRow[]> {
  const { data, error } = await supabase.rpc("admin_export_campaigns" as never, {
    p_ids: ids && ids.length ? ids : null,
  } as never);
  if (error) throw new Error(error.message);
  const payload = data as unknown as { rows?: RawCampaignExportRow[] } | null;
  return payload?.rows ?? [];
}

// ---------------------------------------------------------------- shaping

function asArray(v: Json): Dict[] {
  return Array.isArray(v) ? (v as Dict[]) : [];
}
function str(v: Json): string | null {
  return typeof v === "string" && v.length ? v : null;
}
function num(v: Json): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Chapters, in the order stored in the document (never re-sorted). */
export function chaptersOf(campaign: RawCampaignExportRow): Dict[] {
  return asArray(campaign.data?.chapters);
}

/** Activities of a chapter, in stored order. Supports the `questions` alias. */
export function activitiesOf(chapter: Dict): Dict[] {
  const acts = asArray(chapter.activities);
  return acts.length ? acts : asArray(chapter.questions);
}

function collectUnlocks(campaign: RawCampaignExportRow): string[] {
  const out = new Set<string>();
  const push = (v: Json) => {
    if (typeof v === "string" && v) out.add(v);
    else if (Array.isArray(v)) v.forEach(push);
  };
  const data = campaign.data ?? {};
  push((data.finalRewards as Dict | undefined)?.unlocks);
  push((data.rewards as Dict | undefined)?.unlocks);
  push(data.unlocks);
  for (const ch of chaptersOf(campaign)) {
    push((ch.rewards as Dict | undefined)?.unlocks);
    push(ch.unlocks);
    for (const a of activitiesOf(ch)) {
      push((a.rewards as Dict | undefined)?.unlocks);
      push(a.unlocks);
    }
  }
  return [...out];
}

function collectRelatedEntities(campaign: RawCampaignExportRow): string[] {
  const meta = (campaign.data?.metadata ?? {}) as Dict;
  const out = new Set<string>();
  for (const key of ["core_entities", "supporting_entities", "related_entities"]) {
    for (const v of asArray(meta[key]) as unknown as Json[]) {
      if (typeof v === "string" && v) out.add(v);
    }
  }
  for (const v of asArray(campaign.data?.related_entities) as unknown as Json[]) {
    if (typeof v === "string" && v) out.add(v);
  }
  return [...out];
}

export function deriveCampaign(campaign: RawCampaignExportRow): CampaignDerived {
  const chapters = chaptersOf(campaign);
  const activity_types: Record<string, number> = {};
  const chapter_ids: string[] = [];
  const activity_ids: string[] = [];
  let activity_count = 0;

  for (const ch of chapters) {
    chapter_ids.push(String(ch.id ?? ""));
    for (const a of activitiesOf(ch)) {
      activity_count += 1;
      activity_ids.push(String(a.id ?? ""));
      const t = String(a.type ?? "unknown");
      activity_types[t] = (activity_types[t] ?? 0) + 1;
    }
  }

  const data = campaign.data ?? {};
  return {
    chapter_count: chapters.length,
    activity_count,
    activity_types,
    chapter_ids,
    activity_ids,
    unlocks: collectUnlocks(campaign),
    related_entities: collectRelatedEntities(campaign),
    world_slug: str(data.worldSlug) ?? str(data.world),
    era: str(data.era),
    chronological_order: num(data.chronological_order) ?? num(data.chronologicalOrder),
  };
}

export function buildEnvelope(
  rows: RawCampaignExportRow[],
  opts: { scope: "selection" | "all"; includeAudit: boolean },
): CampaignExportEnvelope {
  const campaigns: CampaignExportEntry[] = rows.map((r, i) => ({
    ...r,
    export_order: i + 1,
    derived: deriveCampaign(r),
  }));

  const counts = campaigns.reduce(
    (acc, c) => ({
      campaigns: acc.campaigns + 1,
      chapters: acc.chapters + c.derived.chapter_count,
      activities: acc.activities + c.derived.activity_count,
    }),
    { campaigns: 0, chapters: 0, activities: 0 },
  );

  return {
    envelope_version: CAMPAIGN_EXPORT_ENVELOPE_VERSION,
    generator: CAMPAIGN_EXPORT_GENERATOR,
    exported_at: new Date().toISOString(),
    source: {
      schema: "public",
      table: "admin_campaigns",
      document_column: "data",
      draft_column: "draft_data",
      related_tables: ["admin_campaign_versions (count only)", "story_relations (inbound, target_type=campaign)"],
      note:
        "`data` and `draft_data` are emitted verbatim and are the only re-import inputs. " +
        "`derived` is an additive read-only projection for auditing and must be ignored on import.",
    },
    scope: opts.scope,
    campaign_ids: campaigns.map((c) => c.id),
    counts,
    ...(opts.includeAudit ? { audit: buildAuditReport(campaigns) } : {}),
    campaigns,
  };
}

// ---------------------------------------------------------------- CSV

export const CSV_COLUMNS = [
  "campaign_id",
  "campaign_slug",
  "campaign_title",
  "campaign_status",
  "campaign_order",
  "chapter_id",
  "chapter_slug",
  "chapter_title",
  "chapter_order",
  "activity_id",
  "activity_type",
  "activity_order",
  "question_or_prompt",
  "context_or_body",
  "options_json",
  "correct_answer_json",
  "explanation",
  "hints_json",
  "rewards_json",
  "unlocks_json",
  "related_entities_json",
  "metadata_json",
] as const;

function csvCell(v: Json): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function jsonCell(v: Json): string {
  return v === undefined ? "" : csvCell(JSON.stringify(v ?? null));
}

/** Flat audit sheet — one row per activity (chapters/campaigns without
 *  activities still emit a row so gaps stay visible). */
export function buildAuditCsv(entries: CampaignExportEntry[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];

  for (const c of entries) {
    const d = c.data ?? {};
    const campaignCommon = [
      csvCell(c.id),
      csvCell(c.slug),
      csvCell(c.title),
      csvCell(c.status),
      csvCell(c.derived.chronological_order ?? c.export_order),
    ];
    const relatedJson = jsonCell(c.derived.related_entities);
    const chapters = chaptersOf(c);

    if (chapters.length === 0) {
      lines.push([
        ...campaignCommon,
        "", "", "", "", "", "", "", "", "", "", "", "", "",
        jsonCell(c.derived.unlocks),
        relatedJson,
        jsonCell(d.metadata ?? null),
      ].join(","));
      continue;
    }

    chapters.forEach((ch, ci) => {
      const chapterCommon = [
        csvCell(ch.id),
        csvCell(ch.slug ?? null),
        csvCell(ch.title),
        csvCell(ch.order ?? ci + 1),
      ];
      const acts = activitiesOf(ch);

      if (acts.length === 0) {
        lines.push([
          ...campaignCommon, ...chapterCommon,
          "", "", "", "", "", "", "", "", "",
          jsonCell(ch.rewards ?? null),
          jsonCell((ch.rewards as Dict | undefined)?.unlocks ?? ch.unlocks ?? null),
          relatedJson,
          jsonCell(ch.metadata ?? null),
        ].join(","));
        return;
      }

      acts.forEach((a, ai) => {
        lines.push([
          ...campaignCommon,
          ...chapterCommon,
          csvCell(a.id),
          csvCell(a.type),
          csvCell(a.order ?? ai + 1),
          csvCell(a.prompt ?? a.question ?? null),
          csvCell(a.contextText ?? a.body ?? a.historicalReadingText ?? null),
          jsonCell(a.options ?? null),
          jsonCell(a.correctAnswer ?? a.correctOrder ?? a.correct ?? null),
          csvCell(a.explanation ?? a.feedbackCorrect ?? null),
          jsonCell(a.hints ?? null),
          jsonCell({
            xpReward: a.xpReward ?? null,
            coinsReward: a.coinsReward ?? null,
            heartsPenalty: a.heartsPenalty ?? null,
            feedbackCorrect: a.feedbackCorrect ?? null,
            feedbackWrong: a.feedbackWrong ?? null,
            chapter_rewards: ch.rewards ?? null,
          }),
          jsonCell((ch.rewards as Dict | undefined)?.unlocks ?? ch.unlocks ?? null),
          relatedJson,
          jsonCell(a.metadata ?? null),
        ].join(","));
      });
    });
  }

  return lines.join("\r\n");
}

// ---------------------------------------------------------------- audit

export type AuditSeverity = "error" | "warning";

export interface AuditIssue {
  severity: AuditSeverity;
  code: string;
  message: string;
  chapter_id?: string;
  activity_id?: string;
}

export interface CampaignAuditEntry {
  campaign_id: string;
  slug: string | null;
  title: string;
  status: string;
  chapter_count: number;
  activity_count: number;
  activity_types: Record<string, number>;
  errors: number;
  warnings: number;
  issues: AuditIssue[];
}

export interface CampaignAuditReport {
  generated_at: string;
  totals: { campaigns: number; chapters: number; activities: number; errors: number; warnings: number };
  campaigns: CampaignAuditEntry[];
}

function auditCampaign(c: CampaignExportEntry, knownEntityIds: Set<string> | null): CampaignAuditEntry {
  const issues: AuditIssue[] = [];
  const add = (severity: AuditSeverity, code: string, message: string, extra?: Partial<AuditIssue>) =>
    issues.push({ severity, code, message, ...extra });

  const chapters = chaptersOf(c);
  const knownIds = new Set<string>(KNOWN_ACTIVITY_TYPES);

  // Chapter counts vary by design across the library (7–10), so only a
  // completely empty campaign is an error.
  if (chapters.length === 0) add("error", "campaign_without_chapters", "الحملة لا تحتوي على أي فصل.");


  // chapter ordering
  const chapterOrders = chapters.map((ch, i) => num(ch.order) ?? i + 1);
  const seenOrder = new Set<number>();
  chapterOrders.forEach((o, i) => {
    if (seenOrder.has(o)) add("error", "duplicate_chapter_order", `ترتيب الفصل ${o} مكرر.`, { chapter_id: String(chapters[i].id ?? "") });
    seenOrder.add(o);
  });
  for (let i = 1; i <= chapters.length; i++) {
    if (!seenOrder.has(i)) add("warning", "missing_chapter_order", `ترتيب الفصل ${i} مفقود في التسلسل.`);
  }

  const chapterIds = new Set<string>();
  const promptSeen = new Map<string, string>();

  for (const ch of chapters) {
    const chId = String(ch.id ?? "");
    if (!chId) add("error", "chapter_without_id", "فصل بلا معرّف.");
    else if (chapterIds.has(chId)) add("error", "duplicate_chapter_id", `معرّف الفصل مكرر: ${chId}.`, { chapter_id: chId });
    chapterIds.add(chId);

    if (!str(ch.title)) add("warning", "chapter_without_title", "فصل بلا عنوان.", { chapter_id: chId });

    const acts = activitiesOf(ch);
    if (acts.length === 0) {
      add("error", "chapter_without_activities", "فصل بلا أنشطة.", { chapter_id: chId });
      continue;
    }

    const hasContent = acts.some((a) => str(a.contextText) || str(a.prompt) || str(a.body));
    if (!hasContent) add("error", "chapter_without_content", "فصل بلا محتوى نصي.", { chapter_id: chId });

    const actIds = new Set<string>();
    const actOrders = new Set<number>();

    acts.forEach((a, ai) => {
      const aId = String(a.id ?? "");
      const type = String(a.type ?? "");
      const at = { chapter_id: chId, activity_id: aId };

      if (!aId) add("error", "activity_without_id", "نشاط بلا معرّف.", at);
      else if (actIds.has(aId)) add("error", "duplicate_activity_id", `معرّف النشاط مكرر: ${aId}.`, at);
      actIds.add(aId);

      const ord = num(a.order) ?? ai + 1;
      if (actOrders.has(ord)) add("error", "duplicate_activity_order", `ترتيب النشاط ${ord} مكرر.`, at);
      actOrders.add(ord);

      if (!type) add("error", "activity_without_type", "نشاط بلا نوع.", at);
      else if (!knownIds.has(type)) add("error", "unknown_activity_type", `نوع نشاط غير معروف: ${type}.`, at);

      const prompt = str(a.prompt) ?? str(a.question);
      if (!prompt) add("error", "activity_without_prompt", "نشاط بلا نص سؤال أو توجيه.", at);
      else if (ANSWER_TYPES.has(type)) {
        // Narrative activities intentionally reuse boilerplate prompts
        // («اقرأ المشهد.»), so duplicate detection covers answerable
        // questions only, keyed by prompt + options.
        const key = `${prompt.trim()}::${JSON.stringify(a.options ?? null)}`;
        const prev = promptSeen.get(key);
        if (prev && prev !== aId) add("warning", "duplicate_question_in_campaign", `سؤال مكرر داخل الحملة: «${prompt.trim().slice(0, 40)}…».`, at);
        else promptSeen.set(key, aId);
      }


      const options = Array.isArray(a.options) ? (a.options as Json[]) : null;
      if (OPTION_TYPES.has(type)) {
        if (!options || options.length < 2) add("error", "question_without_options", "سؤال بلا خيارات كافية.", at);
      }

      if (ANSWER_TYPES.has(type)) {
        const answer = a.correctAnswer ?? a.correct ?? null;
        if (answer === null || answer === undefined) {
          add("error", "question_without_correct_answer", "سؤال بلا إجابة صحيحة.", at);
        } else if (options) {
          const ok =
            typeof answer === "number"
              ? answer >= 0 && answer < options.length
              : options.some((o) => String(o) === String(answer));
          if (!ok) add("error", "correct_answer_not_in_options", "الإجابة الصحيحة غير موجودة ضمن الخيارات.", at);
        }
        if (!str(a.explanation) && !str(a.feedbackCorrect)) {
          add("warning", "question_without_explanation", "سؤال بلا شرح للإجابة.", at);
        }
      }

      if (type === "arrange_events") {
        const order = a.correctOrder;
        if (!Array.isArray(order) || order.length === 0) {
          add("error", "incomplete_activity_payload", "نشاط ترتيب بلا تسلسل صحيح (correctOrder).", at);
        } else if (options && order.length !== options.length) {
          add("error", "incomplete_activity_payload", "طول التسلسل الصحيح لا يطابق عدد العناصر.", at);
        }
      }

      if (NARRATIVE_TYPES.has(type) && type === "reading_then_question" && !str(a.contextText)) {
        add("error", "incomplete_activity_payload", "نشاط قراءة بلا نص (contextText).", at);
      }
    });
  }

  // unlocks + related entity resolution
  for (const u of c.derived.unlocks) {
    if (!/^[a-z_]+:[A-Za-z0-9._-]+$/.test(u)) {
      add("warning", "malformed_unlock", `صيغة unlock غير قياسية: ${u}.`);
    }
  }
  if (knownEntityIds) {
    for (const ref of c.derived.related_entities) {
      const id = ref.includes(":") ? ref.split(":").slice(1).join(":") : ref;
      if (!knownEntityIds.has(id) && !knownEntityIds.has(ref)) {
        add("error", "unresolvable_related_entity", `مرجع موسوعي غير قابل للحل: ${ref}.`);
      }
    }
  }

  return {
    campaign_id: c.id,
    slug: c.slug,
    title: c.title,
    status: c.status,
    chapter_count: c.derived.chapter_count,
    activity_count: c.derived.activity_count,
    activity_types: c.derived.activity_types,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues,
  };
}

export function buildAuditReport(
  entries: CampaignExportEntry[],
  knownEntityIds: Set<string> | null = null,
): CampaignAuditReport {
  const campaigns = entries.map((c) => auditCampaign(c, knownEntityIds));
  return {
    generated_at: new Date().toISOString(),
    
    totals: {
      campaigns: campaigns.length,
      chapters: campaigns.reduce((n, c) => n + c.chapter_count, 0),
      activities: campaigns.reduce((n, c) => n + c.activity_count, 0),
      errors: campaigns.reduce((n, c) => n + c.errors, 0),
      warnings: campaigns.reduce((n, c) => n + c.warnings, 0),
    },
    campaigns,
  };
}

/** Optional: resolve encyclopedia entity ids so related-entity refs can be
 *  validated. Read-only; returns null when unavailable. */
export async function fetchKnownEntityIds(): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id, slug")
      .limit(20000);
    if (error || !data) return null;
    const set = new Set<string>();
    for (const row of data as { id: string; slug: string | null }[]) {
      if (row.id) set.add(row.id);
      if (row.slug) set.add(row.slug);
    }
    return set;
  } catch {
    return null;
  }
}

// ============================================================
// Phase 1 — Import engines.
//
// A thin adapter layer that wraps the existing per-type validators,
// examples, and Supabase write paths behind a single ImportEngine
// contract. The ImportWizard UI consumes engines; each engine reuses
// Irth's existing validation (validateCampaign, per-config validate)
// and canonical helpers (inferWorldFromMetadata,
// withBackfilledChronology, runCampaignIntegrity) without duplicating
// any rules.
//
// No DB schema changes. No new tables. Backward compatible with the
// legacy /admin/import behavior.
// ============================================================
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateCampaign } from "@/lib/campaignStorage";
import { withBackfilledChronology } from "@/lib/campaignChronologyBackfill";
import {
  inferWorldFromMetadata,
  runCampaignIntegrity,
  type CampaignIntegrityReport,
} from "@/lib/contentIntegrity";
import type { Campaign } from "@/types/campaign";
import { ensureLocalSnapshotLoaded } from "@/lib/local-first-store";
import {
  applyAcceptedRepairs,
  buildCampaignRelationReport,
  buildEncyclopediaRelationReport,
  buildInvestigationRelationReport,
  summarizeRelations,
  type RelationReport,
} from "./relations-report";
import {
  scoreEncyclopedia,
  scoreCampaign,
  scoreInvestigation,
  scoreShortEditorial,
  detectRegression,
  summarizeQuality,
  type QualityReport,
  type QualityBatchSummary,
} from "./quality";

// ---------- Shared types ----------

export type Severity = "blocker" | "warning" | "info";

export interface Issue {
  severity: Severity;
  message: string;
  /** Zero-based item index in the parsed batch, when applicable. */
  itemIndex?: number;
  /** Optional field path for future field-level errors. */
  path?: string;
  /** Optional stable code for filtering/grouping later phases. */
  code?: string;
}

export type RowStatus = "new" | "update" | "skip" | "blocked";
/** Explicit per-row admin decision. `alias` merges into an existing row's aliases. */
export type RowAction = "new" | "update" | "skip" | "alias";

export interface PreviewRow {
  index: number;
  status: RowStatus;
  /** Row-scoped issues (validation, batch dupe, will-be-skipped, etc.). */
  issues: Issue[];
  /** Short title for the preview table. */
  title: string;
  /** Optional subtitle (id/slug/type). */
  subtitle?: string;
  /** Rich preview node from the type-specific config. */
  render: ReactNode;
  /** Raw normalized data — engines use this on commit. */
  data: unknown;
  /** Stable dedupe key for within-batch duplicate detection. */
  key: string;
  /** Phase 2 — duplicate candidates found in the DB (encyclopedia). */
  candidates?: import("./duplicate-detection").DuplicateCandidate[];
  /** Phase 2 — admin decision override that beats `status` at commit time. */
  override?: RowAction;
  /** Phase 2 — admin acknowledgement note when overriding warnings. */
  overrideNote?: string;
  /** Phase 3 — relation validation report. */
  relations?: import("./relations-report").RelationReport;
  /** Phase 4 — content quality report. */
  quality?: QualityReport;
  /** Phase 4 — admin flag: import even though publish would fail. */
  importAsDraft?: boolean;
  /** Phase 4 — admin note when overriding quality/regression warnings. */
  qualityAckNote?: string;
  /**
   * Phase 5.5a — DB primary-key of the matched existing row, when
   * classify() found one. Simple content types (daily_facts,
   * today_in_history_events, notifications, investigations) need
   * this so the transactional RPC can target the row by id.
   */
  existingId?: string;
  /**
   * Phase 5.5a — value captured from the matched row at preview time
   * that the RPC compares against the current DB row to detect
   * concurrent edits. `updated_at` when the table has it, else
   * `created_at`. NULL for tables/rows without either — the RPC
   * skips the staleness check in that case.
   */
  existingVersionSignal?: string | null;
}

export interface CommitResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Sample of per-row errors, capped for UI display. */
  errors: string[];
  /** Optional integrity reports (currently campaigns only). */
  integrity?: CampaignIntegrityReport[];
  /** Phase 3 — aggregate relation summary across the batch. */
  /** Phase 3 — aggregate relation summary across the batch. */
  relationSummary?: import("./relations-report").RelationSummary;
  /** Phase 4 — aggregate content-quality summary. */
  qualitySummary?: QualityBatchSummary;
}

export interface CommitOptions {
  /** Update existing rows on conflict when the engine supports it. */
  overwrite: boolean;
  /** Publish immediately (campaigns only). */
  publish?: boolean;
  /** Phase 3 — compute automatic repair suggestions (never applies them). */
  autoRepair?: boolean;
}

// ---------- Phase 4 helpers: quality → row issues ----------

/**
 * Convert a QualityReport into row-level Issue entries + adjust status.
 *   • Publish-mode fatal (missing required, placeholder body) → blocker.
 *   • Publish-mode below threshold or missing sources → blocker unless
 *     admin sets `importAsDraft` on the row.
 *   • Draft-eligible only → warning (never blocker).
 *   • Regression detected → warning.
 * The gating never silently downgrades a failed publish item to draft;
 * the admin must flip `importAsDraft` explicitly (see CommitOptions).
 */
export function qualityToIssues(q: QualityReport, itemIndex: number, opts: { publish: boolean; importAsDraft: boolean }): Issue[] {
  const out: Issue[] = [];
  for (const m of q.missingRequired) {
    out.push({
      severity: opts.publish && !opts.importAsDraft ? "blocker" : "warning",
      message: `حقل مطلوب مفقود: ${m}.`,
      itemIndex, code: "quality.missing_required",
    });
  }
  for (const r of q.reasons) {
    out.push({ severity: "warning", message: r, itemIndex, code: "quality.reason" });
  }
  for (const m of q.missingOptional) {
    out.push({ severity: "info", message: `اختياري مفقود: ${m}.`, itemIndex, code: "quality.missing_optional" });
  }
  if (q.sourceStatus === "missing" && opts.publish && !opts.importAsDraft) {
    out.push({ severity: "blocker", message: "لا يمكن النشر بلا مصادر — استورد كمسودة أو أضف مصادر.", itemIndex, code: "quality.sources_missing" });
  } else if (q.sourceStatus === "missing") {
    out.push({ severity: "warning", message: "لا توجد مصادر — سيُستورد كمسودة.", itemIndex, code: "quality.sources_missing_draft" });
  } else if (q.sourceStatus === "weak") {
    out.push({ severity: "info", message: "المصادر ضعيفة — يُوصى بإضافة مؤلف أو رابط.", itemIndex, code: "quality.sources_weak" });
  }
  if (opts.publish && !opts.importAsDraft && !q.publishEligible) {
    out.push({
      severity: "blocker",
      message: `الجودة (${q.score}٪) دون عتبة النشر — استورد كمسودة أو حسّن المحتوى.`,
      itemIndex, code: "quality.below_threshold",
    });
  }
  if (q.regression) {
    out.push({
      severity: "warning",
      message: `تراجع محتوى: ${q.regression.losses.join("، ")}.`,
      itemIndex, code: "quality.regression",
    });
  }
  return out;
}

/** Applies quality gating to a row: attaches issues, flips status when blockers appear. */
function applyQuality(row: PreviewRow, q: QualityReport, opts: { publish: boolean; }): PreviewRow {
  const importAsDraft = !!row.importAsDraft;
  const issues = qualityToIssues(q, row.index, { publish: opts.publish, importAsDraft });
  const nextIssues = [...row.issues, ...issues];
  const nowBlocked = nextIssues.some((i) => i.severity === "blocker");
  return {
    ...row,
    quality: q,
    issues: nextIssues,
    status: nowBlocked ? ("blocked" as RowStatus) : row.status,
  };
}


export interface ImportEngine {
  /** Stable engine key, matches the URL ?type= param. */
  key: string;
  /** Arabic label shown in the header. */
  label: string;
  /** Content-type icon rendered in the tabs and header. */
  icon: ReactNode;
  /** JSON example inserted when the admin clicks "مثال". */
  example: string;
  /** True → engine exposes the "استبدال الموجود" toggle. */
  supportsOverwrite: boolean;
  /** True → engine exposes the "نشر فور الاستيراد" toggle. */
  supportsPublish: boolean;
  /**
   * Parse + schema-validate a raw JSON string. Runs synchronously and
   * MUST classify blocker-severity failures inline (missing fields,
   * invalid JSON, batch-internal dupe keys).
   */
  parse(raw: string): { rows: PreviewRow[]; issues: Issue[] };
  /**
   * Look up existing DB rows and mark rows as `new` vs `update` vs
   * `skip`. Called when the admin advances to the preview step.
   */
  classify(rows: PreviewRow[], options: CommitOptions): Promise<PreviewRow[]>;
  /** Commit approved (non-blocked, non-skip) rows. */
  commit(rows: PreviewRow[], options: CommitOptions): Promise<CommitResult>;
}

// ---------- Legacy per-type config shape (unchanged) ----------

export interface ImportConfig<T> {
  label: string;
  table: string;
  example: string;
  validate: (row: unknown, i: number) => { ok: true; row: T } | { ok: false; error: string };
  rowKey: (r: T) => string;
  dedupeColumns: string[];
  buildDedupeFilter: (rows: T[]) => Record<string, unknown[]>;
  matchExisting: (existing: any, r: T) => boolean;
  preview: (r: T) => ReactNode;
  previewTitle: (r: T) => string;
  previewSubtitle?: (r: T) => string | undefined;
  allowOverwrite?: boolean;
  conflictTarget?: string;
  overwriteFields?: string[];
}

// ---------- Phase 3 helpers: relation report → row issues ----------

/**
 * Convert a RelationReport into row-level Issue entries. Missing/broken
 * refs surface as warnings by default (never blockers) so admins can still
 * import and repair later; batch-level errors (dup ids, cycles) become
 * blockers as they indicate structural problems.
 */
export function relationsToIssues(rep: RelationReport, itemIndex: number): Issue[] {
  const out: Issue[] = [];
  for (const b of rep.batchIssues) {
    out.push({ severity: b.level === "error" ? "blocker" : "warning", message: b.message, itemIndex, path: b.path, code: "batch.integrity" });
  }
  const c = rep.counts;
  if (c.missing > 0) out.push({ severity: "warning", message: `مراجع مفقودة: ${c.missing}`, itemIndex, code: "rel.missing" });
  if (c.ambiguous > 0) out.push({ severity: "warning", message: `مراجع غامضة: ${c.ambiguous}`, itemIndex, code: "rel.ambiguous" });
  if (c.disabled + c.archived > 0) out.push({ severity: "warning", message: `مراجع معطّلة/مؤرشفة: ${c.disabled + c.archived}`, itemIndex, code: "rel.stale" });
  if (c.remapped > 0) out.push({ severity: "info", message: `مراجع بحاجة لإعادة توجيه: ${c.remapped}`, itemIndex, code: "rel.remap" });
  if (c.type_mismatch > 0) out.push({ severity: "warning", message: `نوع لا يطابق: ${c.type_mismatch}`, itemIndex, code: "rel.type_mismatch" });
  if (rep.duplicates.size > 0) out.push({ severity: "info", message: `مراجع مكرّرة: ${rep.duplicates.size}`, itemIndex, code: "rel.duplicate" });
  return out;
}

// ---------- Adapter: legacy ImportConfig → ImportEngine ----------

export function makeLegacyEngine<T>(config: ImportConfig<T>, meta: {
  key: string;
  label: string;
  icon: ReactNode;
  /** Phase 4 — optional per-row quality scorer. */
  scoreRow?: (row: T) => QualityReport | undefined;
}): ImportEngine {
  return {
    key: meta.key,
    label: meta.label,
    icon: meta.icon,
    example: config.example,
    supportsOverwrite: !!config.allowOverwrite,
    supportsPublish: false,

    parse(raw) {
      const issues: Issue[] = [];
      if (!raw.trim()) return { rows: [], issues };
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        issues.push({
          severity: "blocker",
          message: `JSON غير صالح: ${(e as Error).message}`,
          code: "json.invalid",
        });
        return { rows: [], issues };
      }
      if (!Array.isArray(data)) {
        issues.push({
          severity: "blocker",
          message: "يجب أن يكون JSON مصفوفة [ ... ] من العناصر.",
          code: "json.not_array",
        });
        return { rows: [], issues };
      }

      const seenKeys = new Map<string, number>();
      const rows: PreviewRow[] = [];
      data.forEach((item, i) => {
        const v = config.validate(item, i);
        if (!v.ok) {
          rows.push({
            index: i,
            status: "blocked",
            issues: [{ severity: "blocker", message: v.error, itemIndex: i, code: "schema.invalid" }],
            title: `العنصر #${i + 1}`,
            render: <div className="text-xs text-red-300">{v.error}</div>,
            data: item,
            key: `__invalid_${i}`,
          });
          return;
        }
        const key = config.rowKey(v.row);
        const rowIssues: Issue[] = [];
        const firstSeenAt = seenKeys.get(key);
        if (firstSeenAt !== undefined) {
          rowIssues.push({
            severity: "warning",
            message: `مكرر داخل نفس الدفعة (يطابق العنصر #${firstSeenAt + 1}).`,
            itemIndex: i,
            code: "batch.duplicate",
          });
        } else {
          seenKeys.set(key, i);
        }
        rows.push({
          index: i,
          // Provisional; classify() sets new/update/skip after DB lookup.
          status: firstSeenAt !== undefined ? "skip" : "new",
          issues: rowIssues,
          title: config.previewTitle(v.row),
          subtitle: config.previewSubtitle?.(v.row),
          render: config.preview(v.row),
          data: v.row,
          key,
        });
      });
      return { rows, issues };
    },

    async classify(rows, options) {
      if (rows.length === 0) return rows;
      const eligible = rows.filter((r) => r.status !== "blocked");
      if (eligible.length === 0) return rows;
      const filter = config.buildDedupeFilter(eligible.map((r) => r.data as T));
      // Phase 5.5a — always include id + timestamps so the transactional
      // RPC can target the matched row by id and detect stale updates.
      const selectCols = Array.from(new Set([
        "id", "updated_at", "created_at", ...config.dedupeColumns,
      ])).join(",");
      let q = supabase.from(config.table as any).select(selectCols);
      for (const [col, vals] of Object.entries(filter)) {
        q = q.in(col, vals as any[]);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const existing = (data ?? []) as any[];
      const seen = new Set<string>();
      const publish = !!options.publish;
      return rows.map((row) => {
        if (row.status === "blocked") return row;
        let out: PreviewRow = row;
        if (seen.has(row.key)) {
          out = { ...row, status: "skip" as RowStatus };
        } else {
          seen.add(row.key);
          const match = existing.find((e) => config.matchExisting(e, row.data as T));
          if (!match) out = { ...row, status: "new" as RowStatus };
          else {
            const versionSignal: string | null =
              (typeof match.updated_at === "string" && match.updated_at) ||
              (typeof match.created_at === "string" && match.created_at) ||
              null;
            const withMatch: PreviewRow = {
              ...row,
              existingId: typeof match.id === "string" ? match.id : row.existingId,
              existingVersionSignal: versionSignal,
            };
            if (options.overwrite && config.allowOverwrite) out = { ...withMatch, status: "update" as RowStatus };
            else out = {
              ...withMatch,
              status: "skip" as RowStatus,
              issues: [
                ...row.issues,
                { severity: "info", message: "موجود مسبقاً — سيُتخطّى (فعّل الاستبدال لتحديثه).", itemIndex: row.index, code: "existing.skip" },
              ],
            };
          }
        }
        if (meta.scoreRow && out.status !== "skip") {
          const q = meta.scoreRow(out.data as T);
          if (q) out = applyQuality(out, q, { publish });
        }
        return out;
      });
    },


    async commit(rows, options) {
      const toInsert: T[] = [];
      const toUpdate: T[] = [];
      let skipped = 0;
      for (const r of rows) {
        if (r.status === "blocked") continue;
        if (r.status === "skip") { skipped++; continue; }
        if (r.status === "new") toInsert.push(r.data as T);
        else if (r.status === "update") toUpdate.push(r.data as T);
      }

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error, count } = await supabase
          .from(config.table as any)
          .insert(chunk as any, { count: "exact" });
        if (error) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from(config.table as any).insert(row as any);
            if (e2) { failed++; errors.push(e2.message); } else { inserted++; }
          }
        } else {
          inserted += count ?? chunk.length;
        }
      }

      if (toUpdate.length > 0 && options.overwrite && config.allowOverwrite && config.conflictTarget) {
        const fields = config.overwriteFields;
        const payloads = toUpdate.map((r) => {
          if (!fields) return r as any;
          const out: any = {};
          for (const k of config.conflictTarget!.split(",")) {
            const col = k.trim();
            out[col] = (r as any)[col];
          }
          for (const k of fields) out[k] = (r as any)[k];
          return out;
        });
        for (let i = 0; i < payloads.length; i += 100) {
          const chunk = payloads.slice(i, i + 100);
          const { error, count } = await supabase
            .from(config.table as any)
            .upsert(chunk as any, { onConflict: config.conflictTarget, count: "exact" });
          if (error) {
            for (const row of chunk) {
              const { error: e2 } = await supabase
                .from(config.table as any)
                .upsert(row as any, { onConflict: config.conflictTarget });
              if (e2) { failed++; errors.push(e2.message); } else { updated++; }
            }
          } else {
            updated += count ?? chunk.length;
          }
        }
      }

      return {
        inserted, updated, skipped, failed,
        errors: errors.slice(0, 10),
        qualitySummary: summarizeQuality(rows.map((r) => r.quality)),
      };
    },
  };
}

// ---------- Campaign engine ----------
//
// Reuses validateCampaign, inferWorldFromMetadata, withBackfilledChronology
// and runCampaignIntegrity as-is. Import path preserves manual
// chronological_order on existing rows and slots new rows without
// renumbering the library — identical to the legacy CampaignImporter.

export function makeCampaignEngine(meta: {
  label: string;
  icon: ReactNode;
  example: string;
}): ImportEngine {
  return {
    key: "campaigns",
    label: meta.label,
    icon: meta.icon,
    example: meta.example,
    supportsOverwrite: true,
    supportsPublish: true,

    parse(raw) {
      const issues: Issue[] = [];
      if (!raw.trim()) return { rows: [], issues };
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        issues.push({ severity: "blocker", message: `JSON غير صالح: ${(e as Error).message}`, code: "json.invalid" });
        return { rows: [], issues };
      }
      const list: unknown[] = Array.isArray(data) ? data : [data];
      const rows: PreviewRow[] = [];
      const seen = new Map<string, number>();
      list.forEach((item, i) => {
        // Section dividers are a different entity type and are never
        // importable through the campaign pipeline.
        if (isDividerPayload(item)) {
          rows.push({
            index: i,
            status: "blocked",
            issues: [{
              severity: "blocker" as Severity,
              message: "فاصل عصر (divider) — لا يمكن استيراده كحملة.",
              itemIndex: i,
              code: "campaign.divider",
            }],
            title: `عنصر #${i + 1}`,
            render: <div className="text-xs text-red-300">فاصل عصر وليس حملة.</div>,
            data: item,
            key: `__divider_${i}`,
          });
          return;
        }
        const v = validateCampaign(item);
        const errs = v.issues.filter((x) => x.level === "error");
        const warns = v.issues.filter((x) => x.level === "warning");
        if (!v.ok || !v.normalized) {
          rows.push({
            index: i,
            status: "blocked",
            issues: [
              ...errs.map((e) => ({ severity: "blocker" as Severity, message: e.message, itemIndex: i, code: "campaign.schema" })),
              ...warns.map((w) => ({ severity: "warning" as Severity, message: w.message, itemIndex: i, code: "campaign.schema.warn" })),
            ],
            title: `الحملة #${i + 1}`,
            render: <div className="text-xs text-red-300">{errs.map((e) => e.message).join(" · ") || "غير صالح"}</div>,
            data: item,
            key: `__invalid_${i}`,
          });
          return;
        }
        const c = v.normalized;
        const key = `campaign|${c.id}`;
        const rowIssues: Issue[] = warns.map((w) => ({
          severity: "warning" as Severity,
          message: w.message,
          itemIndex: i,
          code: "campaign.warning",
        }));
        const firstSeen = seen.get(key);
        if (firstSeen !== undefined) {
          rowIssues.push({
            severity: "warning",
            message: `تكرار داخل نفس الدفعة (يطابق الحملة #${firstSeen + 1}).`,
            itemIndex: i,
            code: "batch.duplicate",
          });
        } else {
          seen.set(key, i);
        }
        rows.push({
          index: i,
          status: firstSeen !== undefined ? "skip" : "new",
          issues: rowIssues,
          title: c.title,
          subtitle: `${c.id} · ${c.chapters.length} فصول`,
          render: (
            <div>
              <div className="text-xs text-amber-300">{c.id}{c.era ? ` · ${c.era}` : ""}</div>
              <div className="font-medium">{c.title}{c.subtitle ? ` — ${c.subtitle}` : ""}</div>
              <div className="text-xs text-slate-400">{c.chapters.length} فصول · {c.difficulty ?? "—"}</div>
            </div>
          ),
          data: c,
          key,
        });
      });
      return { rows, issues };
    },

    async classify(rows, options) {
      if (rows.length === 0) return rows;
      const eligible = rows.filter((r) => r.status !== "blocked");
      if (eligible.length === 0) return rows;
      // Phase 3 — snapshot must be loaded before any relation resolution.
      await ensureLocalSnapshotLoaded();
      const ids = eligible.map((r) => (r.data as Campaign).id);
      const { data, error } = await supabase
        .from("admin_campaigns" as any)
        .select("id, updated_at")
        .in("id", ids);
      if (error) throw new Error(error.message);
      const existingMap = new Map<string, string>(
        (((data ?? []) as unknown) as { id: string; updated_at: string }[]).map((r) => [r.id, r.updated_at]),
      );
      const seen = new Set<string>();
      return rows.map((row) => {
        if (row.status === "blocked") return row;
        if (seen.has(row.key)) return { ...row, status: "skip" as RowStatus };
        seen.add(row.key);
        const c = row.data as Campaign;
        const existingUpdatedAt = existingMap.get(c.id);
        const exists = !!existingUpdatedAt;
        const relations = buildCampaignRelationReport(c, options.autoRepair !== false);
        const relationIssues = relationsToIssues(relations, row.index);
        const nextIssues = [...row.issues, ...relationIssues];
        const nowBlocked = nextIssues.some((i) => i.severity === "blocker");
        const nextStatus: RowStatus = nowBlocked
          ? "blocked"
          : !exists ? "new"
          : options.overwrite ? "update"
          : "skip";
        const extraSkipIssue: Issue[] = (!nowBlocked && exists && !options.overwrite)
          ? [{ severity: "info", message: "الحملة موجودة — سيُتخطّى (فعّل الاستبدال للتحديث).", itemIndex: row.index, code: "existing.skip" }]
          : [];
        let out: PreviewRow = {
          ...row,
          status: nextStatus,
          relations,
          issues: [...nextIssues, ...extraSkipIssue],
          existingId: exists ? c.id : undefined,
          existingVersionSignal: existingUpdatedAt ?? null,
        };
        if (out.status !== "skip" && out.status !== "blocked") {
          out = applyQuality(out, scoreCampaign(c as any), { publish: !!options.publish });
        }
        return out;
      });
    },

    async commit(rows, options) {
      const eligible = rows.filter((r) => r.status === "new" || r.status === "update");
      const validCampaigns: Campaign[] = eligible.map((r) => {
        const c = r.data as Campaign;
        return r.relations ? applyAcceptedRepairs(c, r.relations) : c;
      });
      let skipped = rows.filter((r) => r.status === "skip").length;
      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];
      const integrity: CampaignIntegrityReport[] = [];

      // Preserve manual chronological_order on existing rows; suggest a
      // gap-slot for new rows without renumbering any other campaign.
      const ids = validCampaigns.map((c) => c.id);
      const { data: existing } = await supabase
        .from("admin_campaigns" as any)
        .select("id, data")
        .in("id", ids);
      const existingById = new Map<string, any>(
        (((existing as unknown) ?? []) as Array<{ id: string; data: any }>).map((r) => [r.id, r.data ?? {}]),
      );
      const existingIds = new Set(existingById.keys());

      const { data: allRows } = await supabase
        .from("admin_campaigns" as any)
        .select("id, data")
        .limit(2000);
      const corpus = (((allRows as unknown) ?? []) as Array<{ id: string; data: any }>)
        .map((r) => {
          const d = r.data ?? {};
          const order = typeof d.chronological_order === "number" ? d.chronological_order : null;
          const bf = withBackfilledChronology({ ...(d as Campaign), id: r.id, title: d.title ?? "" });
          const bfKey = typeof bf.chronological_order === "number" ? bf.chronological_order : null;
          return { id: r.id, order, bfKey };
        })
        .filter((r) => r.order != null) as Array<{ id: string; order: number; bfKey: number | null }>;
      corpus.sort((a, b) => a.order - b.order);
      let maxOrder = corpus.reduce((m, r) => Math.max(m, r.order), 0);

      const suggestSlot = (key: number | null): { order: number; status: "auto" | "review" } => {
        if (key == null || corpus.length === 0) {
          maxOrder += 10;
          return { order: maxOrder, status: "review" };
        }
        let after = -1;
        for (let i = 0; i < corpus.length; i++) {
          if (corpus[i].bfKey != null && (corpus[i].bfKey as number) <= key) after = i;
        }
        if (after < 0) {
          const first = corpus[0].order;
          return { order: first - 5, status: "auto" };
        }
        if (after >= corpus.length - 1) {
          maxOrder += 10;
          return { order: maxOrder, status: "auto" };
        }
        const a = corpus[after].order;
        const b = corpus[after + 1].order;
        const mid = (a + b) / 2;
        return { order: mid, status: a === b ? "review" : "auto" };
      };

      for (const c of validCampaigns) {
        const exists = existingIds.has(c.id);
        if (exists && !options.overwrite) { skipped++; continue; }

        let enriched = c;
        if (!c.worldSlug) {
          const inf = inferWorldFromMetadata(c);
          if (inf && inf.confidence === "high") {
            enriched = { ...c, worldSlug: inf.worldSlug, era: c.era ?? inf.era };
          }
        }

        const status = options.publish ? "published" : (exists ? undefined : "draft");

        let chronoOrder: number | undefined;
        let orderStatus: "manual" | "auto" | "review" | undefined;
        if (exists) {
          const prev = existingById.get(c.id) ?? {};
          chronoOrder = typeof prev.chronological_order === "number" ? prev.chronological_order : undefined;
          orderStatus = prev.order_status === "manual" || prev.order_status === "auto" || prev.order_status === "review"
            ? prev.order_status : undefined;
        } else {
          const bf = withBackfilledChronology(enriched);
          const key = typeof bf.chronological_order === "number" ? bf.chronological_order : null;
          const slot = suggestSlot(key);
          chronoOrder = slot.order;
          orderStatus = slot.status;
          corpus.push({ id: enriched.id, order: chronoOrder, bfKey: key });
          corpus.sort((a, b) => a.order - b.order);
        }

        const dataPayload: any = {
          ...enriched,
          status: options.publish ? "published" : (enriched.status ?? "draft"),
        };
        if (typeof chronoOrder === "number") dataPayload.chronological_order = chronoOrder;
        if (orderStatus) dataPayload.order_status = orderStatus;

        const row: any = {
          id: enriched.id,
          slug: enriched.slug ?? null,
          title: enriched.title,
          data: dataPayload,
          updated_at: new Date().toISOString(),
        };
        if (status) row.status = status;
        const { error } = await supabase
          .from("admin_campaigns" as any)
          .upsert(row, { onConflict: "id" });
        if (error) {
          failed++;
          errors.push(`${enriched.id}: ${error.message}`);
          continue;
        }
        if (exists) updated++; else inserted++;
        integrity.push(runCampaignIntegrity(enriched));
      }

      const relationSummary = summarizeRelations(rows.map((r) => r.relations));
      return {
        inserted, updated, skipped, failed,
        errors: errors.slice(0, 10),
        integrity, relationSummary,
        qualitySummary: summarizeQuality(rows.map((r) => r.quality)),
      };
    },
  };
}

// ============================================================
// Phase 2 — Encyclopedia engine with duplicate detection.
//
// Wraps the legacy encyclopedia config so JSON contracts stay identical,
// but overrides classify() to attach DuplicateCandidate[] to each row
// and downgrade/upgrade severity based on match strength:
//
//   exact identifier  (slug / canonical_id / external_id) → blocker
//   exact normalized name                                 → blocker
//   score ≥ 0.90                                          → warning
//   score ≥ 0.75                                          → info
//
// Cross-type conflicts (same entity name under another entity_type)
// never block automatically — they surface as warnings.
//
// commit() honors PreviewRow.override so admins can decide per-row:
//   new     → force insert (bypass same-slug block only for candidate
//             hits that are NOT slug matches; a real slug collision stays
//             a blocker).
//   update  → upsert (requires config.allowOverwrite).
//   skip    → do nothing.
//   alias   → merge the incoming title into the target row's
//             metadata.aliases (no destructive rewrite).
// ============================================================
import {
  buildExistingIndex,
  findCandidates,
  normalizeForCompare,
  CANDIDATE_REASON_AR,
  type DuplicateCandidate,
  type ExistingIndexRow,
} from "./duplicate-detection";

interface EncRowLike {
  entity_type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  metadata?: any;
}

export function makeEncyclopediaEngine<T extends EncRowLike>(
  config: ImportConfig<T>,
  meta: { key: string; label: string; icon: ReactNode },
): ImportEngine {
  const base = makeLegacyEngine(config, meta);
  return {
    ...base,

    async classify(rows, options) {
      // First run the base classifier to establish new/update/skip against
      // exact (entity_type, slug) — that's Irth's canonical exact-match rule.
      const baseClassified = await base.classify(rows, options);
      await ensureLocalSnapshotLoaded();

      const eligible = baseClassified.filter((r) => r.status !== "blocked");
      if (eligible.length === 0) return baseClassified;

      // Load a corpus for candidate detection. Cap generously (encyclopedia
      // is a few thousand rows). If cap is hit we still proceed — fuzzy
      // detection degrades gracefully rather than blocking imports.
      const { data, error } = await supabase
        .from("encyclopedia_entities" as any)
        .select("id, entity_type, slug, title, subtitle, metadata, enabled, body")
        .limit(10000);
      if (error) throw new Error(error.message);

      const rawCorpus = (((data ?? []) as unknown) as Array<{
        id: string; entity_type: string; slug: string;
        title: string; subtitle: string | null; metadata: any; enabled: boolean;
        body: any;
      }>);
      const corpus: ExistingIndexRow[] = rawCorpus.map((r) => ({
        id: r.id,
        entity_type: r.entity_type,
        slug: r.slug,
        title: r.title,
        subtitle: r.subtitle,
        metadata: r.metadata,
      }));
      // Key existing rows by (entity_type,slug) for regression lookup.
      const bySlug = new Map<string, { body: any; metadata: any }>();
      for (const r of rawCorpus) bySlug.set(`${r.entity_type}|${r.slug}`, { body: r.body, metadata: r.metadata });
      const idx = buildExistingIndex(corpus);

      const publishFlag = !!options.publish;
      return baseClassified.map((row) => {
        if (row.status === "blocked") return row;
        const item = row.data as EncRowLike;
        const candidates = findCandidates(item, idx);
        if (candidates.length === 0) {
          // No duplicates → still score quality + regression.
          const existing = row.status === "update" ? bySlug.get(`${item.entity_type}|${item.slug}`) : undefined;
          const q = scoreEncyclopedia(item as any);
          if (existing) q.regression = detectRegression(existing, { body: item.metadata ? (item as any).body : {}, metadata: item.metadata });
          const relations = buildEncyclopediaRelationReport(item as any, options.autoRepair !== false);
          const relationIssues = relationsToIssues(relations, row.index);
          let out: PreviewRow = { ...row, candidates: [], relations, issues: [...row.issues, ...relationIssues] };
          const nowBlockedRel = out.issues.some((i) => i.severity === "blocker");
          if (nowBlockedRel) out = { ...out, status: "blocked" as RowStatus };
          if (out.status !== "blocked") out = applyQuality(out, q, { publish: publishFlag });
          return out;
        }


        const nextIssues: Issue[] = [...row.issues];
        // Best identifier vs best fuzzy — we treat them separately so a
        // slug-hit stays a blocker even if fuzzy score is lower.
        const idHit = candidates.find(
          (c) => c.reasons.includes("slug") ||
                 c.reasons.includes("canonical_id") ||
                 c.reasons.includes("external_id"),
        );
        const nameHit = candidates.find(
          (c) => c.reasons.includes("exact_name") || c.reasons.includes("alias_match"),
        );
        const bestFuzzy = candidates.find((c) => c.severity !== "exact");

        // Exact identifier match → blocker unless admin flips overwrite.
        if (idHit && !options.overwrite) {
          nextIssues.push({
            severity: "blocker",
            message: `تكرار مطابق (${idHit.reasons.map((r) => CANDIDATE_REASON_AR[r]).join(" · ")}) — ${idHit.existingTitle}`,
            itemIndex: row.index,
            code: "dup.exact_id",
          });
        } else if (idHit && options.overwrite) {
          nextIssues.push({
            severity: "info",
            message: `سيُحدَّث الكيان الموجود (${idHit.reasons.map((r) => CANDIDATE_REASON_AR[r]).join(" · ")}).`,
            itemIndex: row.index,
            code: "dup.will_update",
          });
        }

        // Exact normalized-name match on a different slug → treat as blocker
        // by default: admin must explicitly choose new/update/alias/skip.
        if (!idHit && nameHit) {
          nextIssues.push({
            severity: "blocker",
            message: `اسم مطابق لكيان موجود بمُعرّف مختلف — ${nameHit.existingTitle} (${nameHit.existingType}/${nameHit.existingSlug}). اختر إجراءً للصف.`,
            itemIndex: row.index,
            code: "dup.exact_name",
          });
        }

        // Fuzzy tiers.
        if (!idHit && !nameHit && bestFuzzy) {
          const pct = Math.round(bestFuzzy.score * 100);
          if (bestFuzzy.severity === "high") {
            nextIssues.push({
              severity: "warning",
              message: `تشابه ${pct}٪ مع ${bestFuzzy.existingTitle} (${bestFuzzy.existingType}/${bestFuzzy.existingSlug}).`,
              itemIndex: row.index,
              code: "dup.high",
            });
          } else {
            nextIssues.push({
              severity: "info",
              message: `تشابه محتمل ${pct}٪ مع ${bestFuzzy.existingTitle} (${bestFuzzy.existingType}/${bestFuzzy.existingSlug}).`,
              itemIndex: row.index,
              code: "dup.medium",
            });
          }
        }

        // Cross-type note (info-only; never blocks alone).
        const crossType = candidates.find((c) => c.crossType && c.score >= 0.9);
        if (crossType) {
          nextIssues.push({
            severity: "warning",
            message: `تعارض عبر الأنواع — يوجد "${crossType.existingTitle}" كـ ${crossType.existingType}، والمُستورد كـ ${item.entity_type}.`,
            itemIndex: row.index,
            code: "dup.cross_type",
          });
        }

        // Phase 3 — encyclopedia relation report (metadata refs + atlas).
        const relations = buildEncyclopediaRelationReport(item as any, options.autoRepair !== false);
        const relationIssues = relationsToIssues(relations, row.index);
        for (const ri of relationIssues) nextIssues.push(ri);

        // If we injected a new blocker, flip status.
        const nowBlocked = nextIssues.some((i) => i.severity === "blocker");
        let out: PreviewRow = {
          ...row,
          status: nowBlocked ? ("blocked" as RowStatus) : row.status,
          issues: nextIssues,
          candidates,
          relations,
        };
        if (out.status !== "blocked") {
          const existing = out.status === "update" ? bySlug.get(`${item.entity_type}|${item.slug}`) : undefined;
          const q = scoreEncyclopedia(item as any);
          if (existing) q.regression = detectRegression(existing, { body: (item as any).body ?? {}, metadata: item.metadata });
          out = applyQuality(out, q, { publish: publishFlag });
        }
        return out;
      });
    },

    async commit(rows, options) {
      // Split rows by admin override.
      const asNew: PreviewRow[] = [];
      const asUpdate: PreviewRow[] = [];
      const asAlias: PreviewRow[] = [];
      const asSkip: PreviewRow[] = [];
      const stillBlocked: PreviewRow[] = [];

      for (const r of rows) {
        const action = r.override ?? (r.status === "blocked" ? "skip" : r.status);
        if (r.status === "blocked" && !r.override) { stillBlocked.push(r); continue; }
        if (action === "new") asNew.push(r);
        else if (action === "update") asUpdate.push(r);
        else if (action === "alias") asAlias.push(r);
        else asSkip.push(r);
      }

      // Rebuild sanitized PreviewRow[] and delegate insert/update to base engine.
      // Phase 3 — apply accepted relation repairs to each row's data first.
      const withRepairs = (r: PreviewRow): PreviewRow =>
        r.relations ? { ...r, data: applyAcceptedRepairs(r.data, r.relations) } : r;
      const forBase: PreviewRow[] = [];
      for (const r of asNew) forBase.push({ ...withRepairs(r), status: "new", issues: [] });
      for (const r of asUpdate) forBase.push({ ...withRepairs(r), status: "update", issues: [] });
      for (const r of asSkip) forBase.push({ ...r, status: "skip", issues: [] });
      // Blocked rows without override → carry through as skipped in the report.
      for (const r of stillBlocked) forBase.push({ ...r, status: "skip", issues: [] });

      // The base commit path only performs updates when options.overwrite is on;
      // per-row explicit "update" must succeed regardless. So we pass overwrite=true
      // when the batch contains any explicit updates.
      const baseResult = await base.commit(forBase, {
        ...options,
        overwrite: options.overwrite || asUpdate.length > 0,
      });

      // Alias merges — additive to metadata.aliases on the matched existing row.
      let aliasMerged = 0;
      let aliasFailed = 0;
      const aliasErrors: string[] = [];
      for (const r of asAlias) {
        const item = r.data as EncRowLike;
        const target = (r.candidates ?? []).find((c) => c.severity === "exact")
          ?? (r.candidates ?? [])[0];
        if (!target) { aliasFailed++; aliasErrors.push(`#${r.index + 1}: لا يوجد مرشح للربط.`); continue; }
        try {
          const { data: existing, error: readErr } = await supabase
            .from("encyclopedia_entities" as any)
            .select("metadata")
            .eq("id", target.existingId)
            .maybeSingle();
          if (readErr) throw readErr;
          const md = ((existing as any)?.metadata as any) ?? {};
          const prev: string[] = Array.isArray(md.aliases) ? md.aliases.filter((x: any) => typeof x === "string") : [];
          const merged = new Set(prev.map((x) => x));
          const incomingAliases: string[] = Array.isArray(item.metadata?.aliases)
            ? item.metadata.aliases.filter((x: any) => typeof x === "string")
            : [];
          for (const a of [item.title, ...incomingAliases]) {
            const norm = normalizeForCompare(a);
            if (!norm) continue;
            if (norm === normalizeForCompare(target.existingTitle)) continue;
            merged.add(String(a).trim());
          }
          const nextAliases = Array.from(merged);
          const nextMeta = { ...md, aliases: nextAliases };
          const { error: writeErr } = await supabase
            .from("encyclopedia_entities" as any)
            .update({ metadata: nextMeta })
            .eq("id", target.existingId);
          if (writeErr) throw writeErr;
          aliasMerged++;
        } catch (e) {
          aliasFailed++;
          aliasErrors.push(`#${r.index + 1}: ${(e as Error).message}`);
        }
      }

      return {
        inserted: baseResult.inserted,
        updated: baseResult.updated + aliasMerged,
        skipped: baseResult.skipped + stillBlocked.length,
        failed: baseResult.failed + aliasFailed,
        errors: [...baseResult.errors, ...aliasErrors].slice(0, 20),
        relationSummary: summarizeRelations(rows.map((r) => r.relations)),
        qualitySummary: summarizeQuality(rows.map((r) => r.quality)),
      };
    },
  };
}

// re-export for admin route
export { findCandidates, normalizeForCompare, CANDIDATE_REASON_AR };
export type { DuplicateCandidate };

// ============================================================
// Phase 3 — Investigations engine with relation validation.
// Thin wrapper over the legacy engine that attaches a relation
// report + applies accepted repairs before insert/update.
// ============================================================
export function makeInvestigationsEngine<T extends { related_entities?: unknown; slug: string; title: string }>(
  config: ImportConfig<T>,
  meta: { key: string; label: string; icon: ReactNode },
): ImportEngine {
  const base = makeLegacyEngine(config, meta);
  return {
    ...base,
    async classify(rows, options) {
      const classified = await base.classify(rows, options);
      await ensureLocalSnapshotLoaded();
      return classified.map((row) => {
        if (row.status === "blocked") return row;
        const relations = buildInvestigationRelationReport(row.data as any, options.autoRepair !== false);
        const extraIssues = relationsToIssues(relations, row.index);
        const nextIssues = [...row.issues, ...extraIssues];
        const nowBlocked = nextIssues.some((i) => i.severity === "blocker");
        let out: PreviewRow = { ...row, relations, issues: nextIssues, status: nowBlocked ? ("blocked" as RowStatus) : row.status };
        if (out.status !== "blocked" && out.status !== "skip") {
          out = applyQuality(out, scoreInvestigation(row.data as any), { publish: !!options.publish });
        }
        return out;
      });
    },
    async commit(rows, options) {
      const patched = rows.map((r) => r.relations ? { ...r, data: applyAcceptedRepairs(r.data, r.relations) } : r);
      const result = await base.commit(patched, options);
      return {
        ...result,
        relationSummary: summarizeRelations(rows.map((r) => r.relations)),
        qualitySummary: summarizeQuality(rows.map((r) => r.quality)),
      };
    },
  };
}

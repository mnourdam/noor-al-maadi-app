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
}

export interface CommitOptions {
  /** Update existing rows on conflict when the engine supports it. */
  overwrite: boolean;
  /** Publish immediately (campaigns only). */
  publish?: boolean;
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

// ---------- Adapter: legacy ImportConfig → ImportEngine ----------

export function makeLegacyEngine<T>(config: ImportConfig<T>, meta: {
  key: string;
  label: string;
  icon: ReactNode;
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
      let q = supabase.from(config.table as any).select(config.dedupeColumns.join(","));
      for (const [col, vals] of Object.entries(filter)) {
        q = q.in(col, vals as any[]);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const existing = (data ?? []) as any[];
      const seen = new Set<string>();
      return rows.map((row) => {
        if (row.status === "blocked") return row;
        if (seen.has(row.key)) {
          return { ...row, status: "skip" as RowStatus };
        }
        seen.add(row.key);
        const match = existing.find((e) => config.matchExisting(e, row.data as T));
        if (!match) return { ...row, status: "new" as RowStatus };
        if (options.overwrite && config.allowOverwrite) {
          return { ...row, status: "update" as RowStatus };
        }
        return {
          ...row,
          status: "skip" as RowStatus,
          issues: [
            ...row.issues,
            {
              severity: "info",
              message: "موجود مسبقاً — سيُتخطّى (فعّل الاستبدال لتحديثه).",
              itemIndex: row.index,
              code: "existing.skip",
            },
          ],
        };
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

      return { inserted, updated, skipped, failed, errors: errors.slice(0, 10) };
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
      const ids = eligible.map((r) => (r.data as Campaign).id);
      const { data, error } = await supabase
        .from("admin_campaigns" as any)
        .select("id")
        .in("id", ids);
      if (error) throw new Error(error.message);
      const existingIds = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
      const seen = new Set<string>();
      return rows.map((row) => {
        if (row.status === "blocked") return row;
        if (seen.has(row.key)) return { ...row, status: "skip" as RowStatus };
        seen.add(row.key);
        const c = row.data as Campaign;
        const exists = existingIds.has(c.id);
        if (!exists) return { ...row, status: "new" as RowStatus };
        if (options.overwrite) return { ...row, status: "update" as RowStatus };
        return {
          ...row,
          status: "skip" as RowStatus,
          issues: [
            ...row.issues,
            {
              severity: "info",
              message: "الحملة موجودة — سيُتخطّى (فعّل الاستبدال للتحديث).",
              itemIndex: row.index,
              code: "existing.skip",
            },
          ],
        };
      });
    },

    async commit(rows, options) {
      const eligible = rows.filter((r) => r.status === "new" || r.status === "update");
      const validCampaigns: Campaign[] = eligible.map((r) => r.data as Campaign);
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

      return { inserted, updated, skipped, failed, errors: errors.slice(0, 10), integrity };
    },
  };
}

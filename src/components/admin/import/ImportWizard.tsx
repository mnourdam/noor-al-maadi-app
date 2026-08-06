// ============================================================
// Phase 1 — Import Wizard shell.
//
// A multi-step workflow that drives an ImportEngine through:
//   Upload → Validate → Preview → Approve → Commit → Report
//
// Nothing is written to the database until the admin explicitly
// approves the plan on the "Approve" step. Blockers disable forward
// progression; warnings/info require a single acknowledgement.
// ============================================================
import { useMemo, useState, useEffect, type ChangeEvent } from "react";
import {
  Upload,
  FileJson,
  RefreshCcw,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info,
  Loader2,
  Filter,
} from "lucide-react";
import type {
  ImportEngine,
  Issue,
  PreviewRow,
  RowStatus,
  RowAction,
  CommitResult,
  Severity,
} from "@/lib/import/engines";
import { CANDIDATE_REASON_AR, type DuplicateCandidate } from "@/lib/import/duplicate-detection";
import { QUALITY_LABEL_AR, SOURCE_STATUS_AR, type QualityReport, type QualityLabel } from "@/lib/import/quality";
import { buildTransactionalPlan, stableHash, isTransactionalContentType } from "@/lib/import/plan";
import { runImportBatch, runCampaignBatch } from "@/lib/import/import-batch.functions";
import { notifyContentInvalidated } from "@/lib/adminCampaignsApi";
import { Link } from "@tanstack/react-router";
import { FlaskConical, ScrollText, ShieldCheck, Database, Download } from "lucide-react";

type Step = "upload" | "validate" | "preview" | "approve" | "committing" | "report";

interface WizardProps {
  engine: ImportEngine;
}

const STEP_ORDER: Step[] = ["upload", "validate", "preview", "approve", "committing", "report"];

const STEP_LABELS: Record<Step, string> = {
  upload: "الرفع",
  validate: "التحقق",
  preview: "المعاينة",
  approve: "الاعتماد",
  committing: "التنفيذ",
  report: "التقرير",
};

export function ImportWizard({ engine }: WizardProps) {
  // Force full reset when the engine (content type) changes.
  const [engineKey, setEngineKey] = useState(engine.key);
  const [step, setStep] = useState<Step>("upload");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [topIssues, setTopIssues] = useState<Issue[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [publish, setPublish] = useState(false);
  const [autoRepair, setAutoRepair] = useState(true);
  // Phase 5.5b: destructive-removal opt-in (used by investigations RPC).
  const [allowRemovals, setAllowRemovals] = useState(false);
  // Phase 5 close-out: explicit opt-in to un-archive a campaign via publish import.
  const [allowUnarchive, setAllowUnarchive] = useState(false);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RowStatus | "warnings" | "publish_ready" | "needs_content" | "no_sources" | "regressions">("all");
  // Phase 5 — Dry Run + transactional commit state
  const [dryRunReport, setDryRunReport] = useState<any | null>(null);
  const [dryRunHash, setDryRunHash] = useState<string | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [committingStage, setCommittingStage] = useState<string>("");
  const [committedBatchId, setCommittedBatchId] = useState<string | null>(null);
  const supportsTransactional = isTransactionalContentType(engine.key);

  useEffect(() => {
    if (engineKey !== engine.key) {
      setEngineKey(engine.key);
      setStep("upload");
      setRaw("");
      setRows([]);
      setTopIssues([]);
      setResult(null);
      setCommitError(null);
      setClassifyError(null);
      setAckWarnings(false);
      setOverwrite(false);
      setPublish(false);
      setFilter("all");
    }
  }, [engine.key, engineKey]);

  // Parse whenever raw text changes.
  const parsed = useMemo(() => engine.parse(raw), [raw, engine]);

  useEffect(() => {
    setRows(parsed.rows);
    setTopIssues(parsed.issues);
    setAckWarnings(false);
    // Any change to the parsed batch invalidates a prior dry-run.
    setDryRunReport(null);
    setDryRunHash(null);
  }, [parsed]);

  const counts = useMemo(() => {
    const c = { new: 0, update: 0, skip: 0, blocked: 0, warnings: 0, info: 0 };
    for (const r of rows) {
      c[r.status]++;
      for (const iss of r.issues) {
        if (iss.severity === "warning") c.warnings++;
        else if (iss.severity === "info") c.info++;
      }
    }
    for (const iss of topIssues) {
      if (iss.severity === "warning") c.warnings++;
      else if (iss.severity === "info") c.info++;
    }
    return c;
  }, [rows, topIssues]);

  const blockers = useMemo(() => {
    const items: Issue[] = [];
    for (const iss of topIssues) if (iss.severity === "blocker") items.push(iss);
    for (const r of rows) for (const iss of r.issues) if (iss.severity === "blocker") items.push(iss);
    return items;
  }, [rows, topIssues]);

  const warningsList = useMemo(() => {
    const items: Issue[] = [];
    for (const iss of topIssues) if (iss.severity === "warning") items.push(iss);
    for (const r of rows) for (const iss of r.issues) if (iss.severity === "warning") items.push(iss);
    return items;
  }, [rows, topIssues]);

  // Blockers are gated at the batch level, but Phase 2 lets admins resolve
  // duplicate blockers per-row via `override`. A row-level blocker with an
  // explicit action no longer blocks the batch.
  const unresolvedBlockers = useMemo(() => {
    const items: Issue[] = [];
    for (const iss of topIssues) if (iss.severity === "blocker") items.push(iss);
    for (const r of rows) {
      if (r.override) continue;
      for (const iss of r.issues) if (iss.severity === "blocker") items.push(iss);
    }
    return items;
  }, [rows, topIssues]);
  const hasBlockers = unresolvedBlockers.length > 0;
  const hasWarnings = counts.warnings > 0;
  const eligibleCount = counts.new + counts.update + rows.filter((r) => r.override && r.override !== "skip").length;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    e.target.value = "";
  };

  const goValidate = () => {
    if (!raw.trim()) return;
    setStep("validate");
  };

  const goPreview = async () => {
    setClassifyError(null);
    setClassifying(true);
    try {
      const next = await engine.classify(rows, { overwrite, publish, autoRepair });
      setRows(next);
      setStep("preview");
    } catch (e) {
      setClassifyError((e as Error).message);
    } finally {
      setClassifying(false);
    }
  };

  const goApprove = () => setStep("approve");
  const back = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const buildPlanForCurrent = () => {
    if (!isTransactionalContentType(engine.key)) {
      throw new Error(`نوع المحتوى «${engine.key}» لا يدعم الاستيراد المعاملي بعد.`);
    }
    return buildTransactionalPlan(rows, {
      contentType: engine.key,
      fileName: null,
      originalPayloadHash: stableHash(raw),
      overwrite, publish,
      allowRemovals: (engine.key === "investigations" || engine.key === "campaigns") ? allowRemovals : false,
      allowUnarchive: engine.key === "campaigns" ? allowUnarchive : false,
    });
  };

  const runDryRun = async () => {
    setCommitError(null);
    setDryRunReport(null);
    setDryRunning(true);
    try {
      const plan = buildPlanForCurrent();
      const rpc = engine.key === "campaigns" ? runCampaignBatch : runImportBatch;
      const res = await rpc({ data: { plan, mode: "dry_run" } });
      setDryRunReport(res);
      setDryRunHash(plan.approved_plan_hash);
    } catch (e) {
      setCommitError((e as Error).message);
    } finally {
      setDryRunning(false);
    }
  };

  const runCommit = async () => {
    setCommitError(null);
    setResult(null);
    setCommittedBatchId(null);
    setStep("committing");
    try {
      if (supportsTransactional) {
        setCommittingStage("جاري تجهيز خطة التنفيذ…");
        const plan = buildPlanForCurrent();
        if (!dryRunHash || dryRunHash !== plan.approved_plan_hash) {
          throw new Error("خطة الاستيراد تغيّرت منذ آخر تشغيل تجريبي. شغّل التشغيل التجريبي مجدداً.");
        }
        setCommittingStage("جاري تنفيذ الاستيراد داخل عملية واحدة…");
        const rpc = engine.key === "campaigns" ? runCampaignBatch : runImportBatch;
        const res = await rpc({ data: { plan, mode: "commit" } });
        setCommittingStage("جاري إنشاء سجل العملية…");
        if (res.status === "failed") {
          throw new Error(res.error || "فشل الاستيراد وتم التراجع عن جميع التغييرات.");
        }
        if (res.status === "already_committed") {
          setCommitError("تم تنفيذ هذه الخطة مسبقاً — تحقق من سجل الاستيراد.");
          setStep("approve");
          return;
        }
        setCommittedBatchId(res.batch_id ?? null);
        setResult({
          inserted: res.created ?? 0,
          updated: res.updated ?? 0,
          skipped: res.skipped ?? 0,
          failed: res.failed ?? 0,
          errors: [],
          // Phase 5.5 - detailed metadata from transactional RPC
          metadata: {
            matched: res.items?.length ?? 0,
            attempted: (res.created ?? 0) + (res.updated ?? 0) + (res.failed ?? 0),
            unchanged: res.unchanged ?? 0,
          }
        } as any);
        // Fix 5: emit the same content-invalidation signal the editor uses,
        // so /admin/campaigns, /admin/campaign-order and open player tabs
        // (via BroadcastChannel) refetch immediately after a campaign import.
        if (engine.key === "campaigns") {
          const items = Array.isArray(res.items) ? (res.items as any[]) : [];
          for (const it of items) {
            const id = it?.campaign_id;
            const result = it?.result;
            if (typeof id === "string" && id && (result === "inserted" || result === "updated")) {
              notifyContentInvalidated(id, publish ? "publish" : "draft");
            }
          }
        }
      } else {
        // Phase 5.5c — every supported type is transactional. Anything else
        // is fail-closed to prevent legacy row-by-row browser writes.
        throw new Error("لا يتوفر مسار استيراد آمن لهذا النوع — تواصل مع فريق التطوير.");
      }
      setStep("report");
    } catch (e) {
      setCommitError((e as Error).message);
      setStep("approve");
    }
  };

  const restart = () => {
    setStep("upload");
    setRaw("");
    setRows([]);
    setTopIssues([]);
    setResult(null);
    setCommitError(null);
    setClassifyError(null);
    setAckWarnings(false);
    setFilter("all");
  };

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "warnings") return rows.filter((r) => r.issues.some((i) => i.severity === "warning"));
    if (filter === "publish_ready") return rows.filter((r) => r.quality?.label === "publish_ready" || r.quality?.label === "publish_with_notes");
    if (filter === "needs_content") return rows.filter((r) => r.quality?.label === "needs_content" || r.quality?.label === "needs_review");
    if (filter === "no_sources") return rows.filter((r) => r.quality?.sourceStatus === "missing");
    if (filter === "regressions") return rows.filter((r) => !!r.quality?.regression);
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const qualityStats = useMemo(() => {
    let publishReady = 0, needsContent = 0, noSources = 0, regressions = 0, sum = 0, n = 0;
    for (const r of rows) {
      const q = r.quality;
      if (!q) continue;
      n++;
      sum += q.score;
      if (q.label === "publish_ready" || q.label === "publish_with_notes") publishReady++;
      if (q.label === "needs_content" || q.label === "needs_review") needsContent++;
      if (q.sourceStatus === "missing") noSources++;
      if (q.regression) regressions++;
    }
    return { publishReady, needsContent, noSources, regressions, avg: n ? Math.round(sum / n) : 0, scored: n };
  }, [rows]);

  const setRowOverride = (index: number, action: RowAction | undefined) => {
    setRows((prev) => prev.map((r) => r.index === index ? { ...r, override: action } : r));
  };

  const setImportAsDraft = (index: number, on: boolean) => {
    setRows((prev) => prev.map((r) => {
      if (r.index !== index) return r;
      // Recompute issues: strip publish-only blockers when draft is on.
      const nextIssues = r.issues.map((iss) => {
        if (!on) return iss;
        if (iss.code === "quality.missing_required" || iss.code === "quality.below_threshold" || iss.code === "quality.sources_missing") {
          return { ...iss, severity: "warning" as Severity };
        }
        return iss;
      });
      const wasBlockedByQuality = r.issues.some((i) => i.severity === "blocker" && (i.code?.startsWith("quality.") ?? false));
      const stillBlocked = nextIssues.some((i) => i.severity === "blocker");
      return {
        ...r,
        importAsDraft: on,
        issues: nextIssues,
        status: on && wasBlockedByQuality && !stillBlocked ? (r.override === "update" ? "update" : "new") : r.status,
      };
    }));
  };

  const setResolutionAccept = (rowIndex: number, resIndex: number, accepted: boolean) => {
    setRows((prev) => prev.map((r) => {
      if (r.index !== rowIndex || !r.relations) return r;
      return {
        ...r,
        relations: {
          ...r.relations,
          accepted: { ...r.relations.accepted, [resIndex]: accepted },
        },
      };
    }));
  };

  // -------- Phase 5.5a — Dry Run export (JSON + CSV) --------
  const buildDryRunExportRows = () => {
    if (!dryRunReport) return [];
    const itemsById = new Map<number, any>();
    for (const it of (dryRunReport.items ?? []) as any[]) {
      const idx = typeof it?.index === "number" ? it.index : Number(it?.index);
      if (Number.isFinite(idx)) itemsById.set(idx, it);
    }
    return rows.map((r) => {
      const it = itemsById.get(r.index) ?? {};
      const action: string = r.override ?? (r.status === "blocked" ? "skip" : r.status);
      const blockers = r.issues.filter((i) => i.severity === "blocker").map((i) => i.message);
      const warnings = r.issues.filter((i) => i.severity === "warning").map((i) => i.message);
      const acceptedRepairs = r.relations
        ? Object.entries(r.relations.accepted).filter(([, v]) => v).length
        : 0;
      const relationRemaps = (r.relations?.counts?.remapped ?? 0);
      const projected =
        it?.result ??
        (action === "new" ? "would_insert"
          : action === "update" ? "would_update"
          : action === "alias" ? "would_alias"
          : "would_skip");
      return {
        index: r.index,
        title: r.title,
        content_type: engine.key,
        classification: r.status,
        action,
        target_id: it?.target_record_id ?? r.existingId ?? null,
        quality_score: r.quality?.score ?? null,
        quality_label: r.quality?.label ?? null,
        blockers,
        warnings,
        accepted_repairs: acceptedRepairs,
        relation_remaps: relationRemaps,
        projected_result: projected,
        error: it?.error ?? null,
      };
    });
  };

  const triggerDownload = (name: string, blob: Blob) => {
    if (typeof window === "undefined") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportDryRunJSON = () => {
    if (!dryRunReport) return;
    const payload = {
      batch_id: dryRunReport.batch_id ?? null,
      approved_plan_hash: dryRunHash,
      content_type: engine.key,
      mode: "dry_run",
      totals: {
        created: dryRunReport.created ?? 0,
        updated: dryRunReport.updated ?? 0,
        skipped: dryRunReport.skipped ?? 0,
        failed: dryRunReport.failed ?? 0,
        conflicts: dryRunReport.conflicts ?? 0,
      },
      items: buildDryRunExportRows(),
    };
    triggerDownload(
      `dry-run-${engine.key}-${(dryRunHash ?? "unknown").slice(0, 12)}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
  };

  const exportDryRunCSV = () => {
    if (!dryRunReport) return;
    const items = buildDryRunExportRows();
    const cols = [
      "index", "title", "content_type", "classification", "action",
      "target_id", "quality_score", "quality_label",
      "blockers", "warnings",
      "accepted_repairs", "relation_remaps", "projected_result", "error",
    ] as const;
    const esc = (v: unknown): string => {
      if (v == null) return "";
      const s = Array.isArray(v) ? v.join(" | ") : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = cols.join(",");
    const lines = items.map((it) => cols.map((c) => esc((it as any)[c])).join(","));
    // Prepend UTF-8 BOM so Excel opens Arabic correctly.
    const csv = "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
    triggerDownload(
      `dry-run-${engine.key}-${(dryRunHash ?? "unknown").slice(0, 12)}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
  };


  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {/* ---------- Upload ---------- */}
      {step === "upload" && (
        <section className="space-y-4 rounded-2xl border border-amber-500/20 bg-slate-900/60 p-6">
          <header className="flex flex-wrap items-center gap-3 border-b border-amber-500/10 pb-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              {engine.icon}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-amber-100">{engine.label}</h2>
              <p className="text-xs text-slate-400">الصق JSON أو ارفع ملفاً — التحقق والمعاينة قبل أي كتابة.</p>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-600 bg-slate-950/40 px-3 py-1.5 text-sm hover:border-amber-500/40 hover:bg-slate-900">
              <Upload className="h-4 w-4" /> رفع ملف .json
              <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            </label>
            <button
              onClick={() => setRaw(engine.example)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-200"
            >
              <FileJson className="h-3.5 w-3.5" /> مثال
            </button>
            {raw && (
              <button
                onClick={() => setRaw("")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-red-400/60 hover:text-red-300"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> مسح
              </button>
            )}
            <label className="ms-auto inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-600 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={autoRepair}
                onChange={(e) => setAutoRepair(e.target.checked)}
                className="accent-amber-500"
              />
              اقتراح إصلاحات تلقائية للمراجع
            </label>
          </div>

          <textarea
            dir="ltr"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={16}
            placeholder='[ { ... }, { ... } ]'
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-amber-400 focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {raw.trim() ? `تم تحميل ${raw.length.toLocaleString("ar")} حرف.` : "لم يُرفع محتوى بعد."}
            </p>
            <button
              onClick={goValidate}
              disabled={!raw.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              التحقق <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* ---------- Validate ---------- */}
      {step === "validate" && (
        <section className="space-y-4">
          <SummaryCard counts={counts} totalRows={rows.length} />

          {topIssues.length > 0 && (
            <IssueList
              title="مشاكل في الملف نفسه"
              issues={topIssues}
              tone="top"
            />
          )}

          {blockers.length > 0 && (
            <IssueList
              title={`محظورات — ${blockers.length}`}
              issues={blockers}
              tone="blocker"
            />
          )}

          {warningsList.length > 0 && (
            <IssueList
              title={`تحذيرات — ${warningsList.length}`}
              issues={warningsList.slice(0, 30)}
              tone="warning"
              footnote={warningsList.length > 30 ? `…و${warningsList.length - 30} تحذير آخر.` : undefined}
            />
          )}

          {classifyError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertTriangle className="me-1 inline h-4 w-4" /> {classifyError}
            </div>
          )}

          <NavBar
            onBack={back}
            forwardLabel={classifying ? "…" : "المعاينة"}
            onForward={goPreview}
            forwardDisabled={hasBlockers || classifying || rows.length === 0}
            forwardHint={
              hasBlockers
                ? "يجب معالجة المحظورات قبل المتابعة."
                : rows.length === 0
                ? "لا توجد صفوف صالحة."
                : undefined
            }
          />
        </section>
      )}

      {/* ---------- Preview ---------- */}
      {step === "preview" && (
        <section className="space-y-4">
          <SummaryCard counts={counts} totalRows={rows.length} />

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/10 bg-slate-900/40 p-3 text-xs">
            <Filter className="h-3.5 w-3.5 text-amber-300" />
            <FilterChip label={`الكل (${rows.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label={`جديد (${counts.new})`} active={filter === "new"} onClick={() => setFilter("new")} tone="new" />
            <FilterChip label={`تحديث (${counts.update})`} active={filter === "update"} onClick={() => setFilter("update")} tone="update" />
            <FilterChip label={`تخطّي (${counts.skip})`} active={filter === "skip"} onClick={() => setFilter("skip")} tone="skip" />
            <FilterChip label={`محظور (${counts.blocked})`} active={filter === "blocked"} onClick={() => setFilter("blocked")} tone="blocked" />
            <FilterChip label={`تحذيرات (${counts.warnings})`} active={filter === "warnings"} onClick={() => setFilter("warnings")} tone="warning" />
            {qualityStats.scored > 0 && <>
              <FilterChip label={`جاهز للنشر (${qualityStats.publishReady})`} active={filter === "publish_ready"} onClick={() => setFilter("publish_ready")} tone="new" />
              <FilterChip label={`يحتاج محتوى (${qualityStats.needsContent})`} active={filter === "needs_content"} onClick={() => setFilter("needs_content")} tone="warning" />
              <FilterChip label={`بلا مصادر (${qualityStats.noSources})`} active={filter === "no_sources"} onClick={() => setFilter("no_sources")} tone="warning" />
              {qualityStats.regressions > 0 && (
                <FilterChip label={`تراجع (${qualityStats.regressions})`} active={filter === "regressions"} onClick={() => setFilter("regressions")} tone="blocked" />
              )}
              <span className="ms-auto text-[10px] text-slate-400">متوسط الجودة: <span className="font-mono text-amber-200">{qualityStats.avg}٪</span></span>
            </>}
          </div>


          <div className="overflow-hidden rounded-xl border border-slate-800">
            <ul className="max-h-[520px] divide-y divide-slate-800 overflow-auto">
              {filteredRows.slice(0, 200).map((r) => (
                <li key={r.index} className="flex items-start gap-3 bg-slate-950/40 p-3 text-sm">
                  <div className="pt-0.5"><StatusBadge status={r.status} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">#{r.index + 1}</span>
                      {r.subtitle && <span className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-300">{r.subtitle}</span>}
                      {r.quality && <QualityBadge q={r.quality} />}
                      {r.importAsDraft && <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] text-slate-200">مسودة</span>}
                    </div>
                    <div className="mt-1 text-slate-100">{r.render}</div>
                    {r.issues.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px]">
                        {r.issues.map((iss, i) => (
                          <li key={i} className={
                            iss.severity === "blocker" ? "text-red-300"
                            : iss.severity === "warning" ? "text-amber-300"
                            : "text-slate-400"
                          }>
                            {iss.severity === "blocker" ? "✖" : iss.severity === "warning" ? "⚠" : "ℹ"} {iss.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.quality && (
                      <QualityPanel
                        row={r}
                        onToggleDraft={(on) => setImportAsDraft(r.index, on)}
                      />
                    )}
                    {r.candidates && r.candidates.length > 0 && (
                      <CandidatePanel row={r} onOverride={(a) => setRowOverride(r.index, a)} />
                    )}
                    {r.relations && (r.relations.resolutions.length > 0 || r.relations.batchIssues.length > 0) && (
                      <RelationsPanel row={r} onToggle={(idx, on) => setResolutionAccept(r.index, idx, on)} />
                    )}
                    {r.relations && (r.relations.resolutions.length > 0 || r.relations.batchIssues.length > 0) && (
                      <RelationsPanel row={r} onToggle={(idx, on) => setResolutionAccept(r.index, idx, on)} />
                    )}
                  </div>
                </li>
              ))}
              {filteredRows.length === 0 && (
                <li className="p-6 text-center text-xs text-slate-500">لا توجد صفوف تطابق هذا الفلتر.</li>
              )}
            </ul>
            {filteredRows.length > 200 && (
              <p className="border-t border-slate-800 bg-slate-950/60 p-2 text-center text-[11px] text-slate-500">
                عُرضت أول 200 صف فقط. استخدم الفلاتر لتضييق النطاق.
              </p>
            )}
          </div>

          <NavBar
            onBack={back}
            forwardLabel="الاعتماد"
            onForward={goApprove}
            forwardDisabled={hasBlockers || eligibleCount === 0}
            forwardHint={
              hasBlockers
                ? "يجب معالجة المحظورات قبل الاعتماد."
                : eligibleCount === 0
                ? "لا توجد صفوف جديدة أو للتحديث."
                : undefined
            }
          />
        </section>
      )}

      {/* ---------- Approve ---------- */}
      {step === "approve" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-5">
            <h3 className="mb-3 text-sm font-bold text-amber-200">مراجعة الاعتماد</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="جديد" value={counts.new} tone="new" />
              <Stat label="تحديث" value={counts.update} tone="update" />
              <Stat label="سيُتخطّى" value={counts.skip} tone="skip" />
              <Stat label="محظور" value={counts.blocked} tone="blocked" />
            </dl>

            {(engine.supportsOverwrite || engine.supportsPublish) && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
                {engine.supportsOverwrite && (
                  <label className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={async (e) => {
                        setOverwrite(e.target.checked);
                        // Re-classify with new overwrite policy so previews stay honest.
                        setClassifying(true);
                        try {
                          const next = await engine.classify(rows, { overwrite: e.target.checked, publish });
                          setRows(next);
                        } catch (err) {
                          setClassifyError((err as Error).message);
                        } finally {
                          setClassifying(false);
                        }
                      }}
                      className="accent-amber-500"
                    />
                    استبدال الموجود
                  </label>
                )}
                {engine.supportsPublish && (
                  <label className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={publish}
                      onChange={(e) => setPublish(e.target.checked)}
                      className="accent-amber-500"
                    />
                    نشر فور الاستيراد
                  </label>
                )}
                {(engine.key === "investigations" || engine.key === "campaigns") && (
                  <label className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-100">
                    <input
                      type="checkbox"
                      checked={allowRemovals}
                      onChange={(e) => { setAllowRemovals(e.target.checked); setDryRunHash(null); }}
                      className="accent-rose-500"
                    />
                    {engine.key === "investigations"
                      ? "السماح بحذف أسئلة موجودة (مدمّر)"
                      : "السماح بحذف فصول تحتوي تقدّم لاعبين (مدمّر)"}
                  </label>
                )}
                {engine.key === "campaigns" && (
                  <label className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-100">
                    <input
                      type="checkbox"
                      checked={allowUnarchive}
                      onChange={(e) => { setAllowUnarchive(e.target.checked); setDryRunHash(null); }}
                      className="accent-rose-500"
                    />
                    السماح بإلغاء أرشفة الحملات عند النشر
                  </label>
                )}
              </div>
            )}

            {hasWarnings && (
              <label className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={ackWarnings}
                  onChange={(e) => setAckWarnings(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  أُقرّ بمراجعة جميع التحذيرات ({counts.warnings}) وأرغب بمتابعة الاستيراد رغمها.
                </span>
              </label>
            )}

            {supportsTransactional && (
              <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <FlaskConical className="h-4 w-4" /> تشغيل تجريبي (Dry Run)
                </div>
                <p className="mb-2 text-slate-300">
                  ينفّذ الخطة على الخادم داخل عملية واحدة ثم يتراجع عنها بالكامل — يكشف قيود قاعدة البيانات
                  والتعارضات دون كتابة أي صف.
                </p>
                <button
                  onClick={() => void runDryRun()}
                  disabled={dryRunning || hasBlockers}
                  className="inline-flex items-center gap-2 rounded border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-sky-100 hover:border-sky-300 disabled:opacity-50"
                >
                  {dryRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  {dryRunning ? "جارٍ التنفيذ التجريبي…" : "تشغيل تجريبي الآن"}
                </button>
                {dryRunReport && (
                  <div className="mt-3 rounded border border-sky-500/40 bg-slate-950/40 p-2 text-[11px] text-sky-100">
                    <div className="mb-1 font-semibold">نتيجة التشغيل التجريبي (لم يُكتب أي صف):</div>
                    <ul className="list-inside list-disc space-y-0.5">
                      <li>سيُنشأ: {dryRunReport.created ?? 0}</li>
                      <li>سيُعدَّل: {dryRunReport.updated ?? 0}</li>
                      <li>سيُتخطى: {dryRunReport.skipped ?? 0}</li>
                      <li>سيفشل: {dryRunReport.failed ?? 0}</li>
                      {dryRunReport.conflicts ? <li className="text-amber-300">تعارضات إصدار: {dryRunReport.conflicts}</li> : null}
                    </ul>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-slate-400">Hash: <span className="font-mono">{dryRunHash?.slice(0, 12)}</span></div>
                      <div className="flex gap-2">
                        <button
                          onClick={exportDryRunJSON}
                          className="inline-flex items-center gap-1 rounded border border-sky-400/50 bg-slate-900 px-2 py-1 text-[11px] text-sky-100 hover:border-sky-300"
                        >
                          <Download className="h-3 w-3" /> تصدير JSON
                        </button>
                        <button
                          onClick={exportDryRunCSV}
                          className="inline-flex items-center gap-1 rounded border border-sky-400/50 bg-slate-900 px-2 py-1 text-[11px] text-sky-100 hover:border-sky-300"
                        >
                          <Download className="h-3 w-3" /> تصدير CSV
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {commitError && (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                <AlertTriangle className="me-1 inline h-4 w-4" /> {commitError}
              </div>
            )}
          </div>

          <NavBar
            onBack={back}
            forwardLabel={supportsTransactional ? `تنفيذ آمن داخل عملية واحدة (${eligibleCount})` : `تنفيذ الاستيراد (${eligibleCount})`}
            forwardIcon={supportsTransactional ? <ShieldCheck className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            onForward={runCommit}
            forwardDisabled={
              hasBlockers ||
              eligibleCount === 0 ||
              (hasWarnings && !ackWarnings) ||
              (supportsTransactional && !dryRunReport)
            }
            forwardHint={
              hasBlockers ? "يجب معالجة المحظورات."
              : eligibleCount === 0 ? "لا يوجد ما يُستورد."
              : hasWarnings && !ackWarnings ? "أقرّ بالتحذيرات قبل المتابعة."
              : (supportsTransactional && !dryRunReport) ? "شغّل التشغيل التجريبي قبل التنفيذ."
              : undefined
            }
            forwardTone="primary"
          />
        </section>
      )}

      {/* ---------- Committing ---------- */}
      {step === "committing" && (
        <section className="flex items-center justify-center rounded-2xl border border-amber-500/20 bg-slate-900/60 p-10 text-amber-200">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          <span>{committingStage || "جارٍ تنفيذ الاستيراد…"}</span>
        </section>
      )}

      {/* ---------- Report ---------- */}
      {step === "report" && result && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="text-sm font-bold">اكتمل الاستيراد</h3>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="أُدرج" value={result.inserted} tone="new" />
              <Stat label="حُدِّث" value={result.updated} tone="update" />
              <Stat label="تُخطّي" value={result.skipped} tone="skip" />
              <Stat label="فشل" value={result.failed} tone={result.failed > 0 ? "blocked" : "skip"} />
            </dl>
            {result.errors.length > 0 && (
              <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                <div className="mb-1 font-semibold">عيّنة من الأخطاء:</div>
                <ul className="list-inside list-disc space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {committedBatchId && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Database className="h-3.5 w-3.5 text-sky-300" />
                <span className="text-slate-300">سجل العملية:</span>
                <Link
                  to="/admin/import-history/$id"
                  params={{ id: committedBatchId }}
                  className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-sky-100 hover:border-sky-300"
                >
                  <ScrollText className="h-3.5 w-3.5" /> فتح التفاصيل + إمكانية التراجع
                </Link>
              </div>
            )}
          </div>

          {result.relationSummary && (
            <div className="rounded-2xl border border-amber-500/20 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-bold text-amber-200">تقرير المراجع</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="مراجع مفحوصة" value={result.relationSummary.checked} tone="neutral" />
                <Stat label="تم إصلاحه" value={result.relationSummary.repaired} tone="update" />
                <Stat label="غير محلول" value={result.relationSummary.unresolved} tone="blocked" />
                <Stat label="إعادة توجيه قياسية" value={result.relationSummary.canonicalRemaps} tone="new" />
                <Stat label="إعادة توجيه بأسماء بديلة" value={result.relationSummary.aliasRemaps} tone="new" />
                <Stat label="مراجع مكسورة" value={result.relationSummary.brokenRefs} tone="blocked" />
                <Stat label="تحذيرات نوع" value={result.relationSummary.crossTypeWarnings} tone="warning" />
              </dl>
            </div>
          )}

          {result.qualitySummary && (
            <div className="rounded-2xl border border-amber-500/20 bg-slate-900/60 p-5">
              <h3 className="mb-3 flex items-center justify-between text-sm font-bold text-amber-200">
                <span>تقرير جودة المحتوى</span>
                <span className="font-mono text-xs text-slate-400">متوسط: {result.qualitySummary.avgScore}٪</span>
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="جاهز للنشر" value={result.qualitySummary.publishReady} tone="new" />
                <Stat label="مع ملاحظات" value={result.qualitySummary.publishWithNotes} tone="update" />
                <Stat label="يحتاج مراجعة" value={result.qualitySummary.needsReview} tone="warning" />
                <Stat label="يحتاج محتوى" value={result.qualitySummary.needsContent} tone="warning" />
                <Stat label="مسودة فقط" value={result.qualitySummary.draftOnly} tone="skip" />
                <Stat label="بلا مصادر" value={result.qualitySummary.missingSources} tone="warning" />
                <Stat label="تراجع" value={result.qualitySummary.regressions} tone="blocked" />
                <Stat label="محظور" value={result.qualitySummary.blocked} tone="blocked" />
              </dl>
            </div>
          )}




          {result.integrity && result.integrity.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-slate-900/60 p-5">
              <h3 className="mb-3 text-sm font-bold text-amber-200">تقرير سلامة المحتوى</h3>
              <div className="space-y-3">
                {result.integrity.map((r) => (
                  <div key={r.campaignId} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                    <div className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="font-semibold text-amber-200">{r.title}</span>
                      <span className="text-slate-500">{r.campaignId}</span>
                      {r.needsReview && (
                        <span className="ms-auto rounded bg-amber-500/20 px-2 py-0.5 text-amber-200">يتطلب مراجعة</span>
                      )}
                    </div>
                    <ul className="space-y-0.5 text-[11px]">
                      {r.lines.map((l, i) => (
                        <li key={i} className={
                          l.status === "ok" ? "text-emerald-300"
                          : l.status === "warning" ? "text-amber-300"
                          : "text-red-300"
                        }>
                          {l.status === "ok" ? "✔" : l.status === "warning" ? "⚠" : "✖"} {l.label}
                          {l.detail && <span className="text-slate-400"> — {l.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={restart}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20"
            >
              استيراد جديد
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function Stepper({ current }: { current: Step }) {
  const activeIdx = STEP_ORDER.indexOf(current);
  const visible = STEP_ORDER.filter((s) => s !== "committing" || current === "committing");
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {visible.map((s, i) => {
        const idx = STEP_ORDER.indexOf(s);
        const active = s === current;
        const done = idx < activeIdx && current !== "report" ? true : (current === "report" && s !== "report");
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 font-mono text-[11px] ${
                active
                  ? "border-amber-400 bg-amber-500/20 text-amber-100"
                  : done
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900/40 text-slate-400"
              }`}
            >
              {done && !active ? "✓" : i + 1}
            </span>
            <span className={active ? "font-semibold text-amber-100" : done ? "text-emerald-200/80" : "text-slate-400"}>
              {STEP_LABELS[s]}
            </span>
            {i < visible.length - 1 && <span className="text-slate-600">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({ counts, totalRows }: {
  counts: { new: number; update: number; skip: number; blocked: number; warnings: number; info: number };
  totalRows: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-amber-500/20 bg-slate-900/60 p-4 sm:grid-cols-6">
      <Stat label="إجمالي" value={totalRows} tone="neutral" />
      <Stat label="جديد" value={counts.new} tone="new" />
      <Stat label="تحديث" value={counts.update} tone="update" />
      <Stat label="تخطّي" value={counts.skip} tone="skip" />
      <Stat label="محظور" value={counts.blocked} tone="blocked" />
      <Stat label="تحذيرات" value={counts.warnings} tone="warning" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "new" | "update" | "skip" | "blocked" | "warning" | "neutral" }) {
  const toneClass = {
    new: "text-emerald-300",
    update: "text-amber-300",
    skip: "text-slate-400",
    blocked: "text-red-300",
    warning: "text-amber-200",
    neutral: "text-slate-200",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-center">
      <div className={`font-mono text-lg font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  const cfg = {
    new:     { cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", label: "جديد" },
    update:  { cls: "border-amber-400/30 bg-amber-500/10 text-amber-200",        label: "تحديث" },
    skip:    { cls: "border-slate-600 bg-slate-800/60 text-slate-300",           label: "تخطّي" },
    blocked: { cls: "border-red-400/40 bg-red-500/10 text-red-200",              label: "محظور" },
  }[status];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function FilterChip({ label, active, onClick, tone }: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: RowStatus | "warning";
}) {
  const toneCls = tone === "new" ? "hover:border-emerald-400/60"
    : tone === "update" ? "hover:border-amber-400/60"
    : tone === "blocked" ? "hover:border-red-400/60"
    : tone === "warning" ? "hover:border-amber-400/60"
    : "hover:border-slate-500";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
        active ? "border-amber-400 bg-amber-500/15 text-amber-100" : `border-slate-700 bg-slate-950/40 text-slate-300 ${toneCls}`
      }`}
    >
      {label}
    </button>
  );
}

function IssueList({ title, issues, tone, footnote }: {
  title: string;
  issues: Issue[];
  tone: "blocker" | "warning" | "info" | "top";
  footnote?: string;
}) {
  const toneCfg = {
    blocker: { border: "border-red-500/40", bg: "bg-red-500/5", text: "text-red-100", icon: <ShieldAlert className="h-4 w-4 text-red-300" /> },
    warning: { border: "border-amber-500/40", bg: "bg-amber-500/5", text: "text-amber-100", icon: <AlertTriangle className="h-4 w-4 text-amber-300" /> },
    info:    { border: "border-slate-700", bg: "bg-slate-900/40", text: "text-slate-200", icon: <Info className="h-4 w-4 text-slate-400" /> },
    top:     { border: "border-red-500/40", bg: "bg-red-500/5", text: "text-red-100", icon: <ShieldAlert className="h-4 w-4 text-red-300" /> },
  }[tone];
  return (
    <div className={`rounded-xl border ${toneCfg.border} ${toneCfg.bg} p-3 text-xs ${toneCfg.text}`}>
      <div className="mb-2 flex items-center gap-2 font-semibold">{toneCfg.icon} {title}</div>
      <ul className="space-y-0.5">
        {issues.map((iss, i) => (
          <li key={i}>
            {typeof iss.itemIndex === "number" && <span className="me-1 text-slate-400">#{iss.itemIndex + 1}</span>}
            {iss.message}
          </li>
        ))}
      </ul>
      {footnote && <p className="mt-2 text-[11px] opacity-70">{footnote}</p>}
    </div>
  );
}

function NavBar({ onBack, onForward, forwardLabel, forwardDisabled, forwardHint, forwardIcon, forwardTone }: {
  onBack: () => void;
  onForward: () => void;
  forwardLabel: string;
  forwardDisabled?: boolean;
  forwardHint?: string;
  forwardIcon?: React.ReactNode;
  forwardTone?: "primary" | "default";
}) {
  const primary = forwardTone === "primary";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400/40 hover:text-amber-200"
      >
        <ArrowRight className="h-3.5 w-3.5" /> رجوع
      </button>
      <div className="flex flex-col items-end gap-1">
        {forwardHint && <span className="text-[11px] text-slate-500">{forwardHint}</span>}
        <button
          onClick={onForward}
          disabled={forwardDisabled}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
            forwardDisabled
              ? "cursor-not-allowed bg-slate-800 text-slate-500"
              : primary
              ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
              : "bg-amber-500/90 text-slate-950 hover:bg-amber-400"
          }`}
        >
          {forwardIcon} {forwardLabel} <ArrowLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Phase 2 — Candidate panel: side-by-side comparison + per-row
// admin decision (New / Update / Skip / Alias / Ignore warning).
// ============================================================
function CandidatePanel({ row, onOverride }: {
  row: PreviewRow;
  onOverride: (a: RowAction | undefined) => void;
}) {
  const list = row.candidates ?? [];
  if (list.length === 0) return null;
  const primary = list[0];
  const incoming: any = row.data ?? {};
  const current: RowAction | undefined = row.override;
  const hasBlocker = row.issues.some((i) => i.severity === "blocker");
  const hasWarning = row.issues.some((i) => i.severity === "warning");

  return (
    <div className="mt-2 rounded-md border border-amber-500/20 bg-slate-950/40 p-2 text-[11px]">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-amber-200/90">
        <span className="font-semibold">مرشحون مطابقون ({list.length}):</span>
        {list.slice(0, 4).map((c) => (
          <CandidateChip key={c.existingId} c={c} />
        ))}
      </div>
      <SideBySide incoming={incoming} candidate={primary} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-400">الإجراء:</span>
        <ActionBtn label="استيراد كجديد" v="new" cur={current} onClick={onOverride} tone="new" />
        <ActionBtn label="تحديث الموجود" v="update" cur={current} onClick={onOverride} tone="update" />
        <ActionBtn label="اسم بديل" v="alias" cur={current} onClick={onOverride} tone="alias" />
        <ActionBtn label="تخطّي" v="skip" cur={current} onClick={onOverride} tone="skip" />
        {current && (
          <button
            onClick={() => onOverride(undefined)}
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
          >
            إعادة تعيين
          </button>
        )}
        {current && (hasBlocker || hasWarning) && (
          <span className="text-[10px] text-amber-300">
            {hasBlocker ? "تجاوز المحظور بقرار المسؤول." : "تجاوز التحذير بقرار المسؤول."}
          </span>
        )}
      </div>
    </div>
  );
}

function CandidateChip({ c }: { c: DuplicateCandidate }) {
  const pct = Math.round(c.score * 100);
  const tone =
    c.severity === "exact" ? "border-red-400/40 bg-red-500/10 text-red-200"
    : c.severity === "high" ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
    : "border-slate-500/40 bg-slate-500/10 text-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${tone}`}>
      <span className="font-mono">{pct}٪</span>
      <span className="truncate max-w-[16ch]">{c.existingTitle}</span>
      <span className="text-[9px] opacity-70">{c.existingType}/{c.existingSlug}</span>
      {c.crossType && <span className="rounded bg-amber-500/20 px-1 text-[9px]">نوع مختلف</span>}
      <span className="text-[9px] opacity-70">
        {c.reasons.map((r) => CANDIDATE_REASON_AR[r]).join(" · ")}
      </span>
    </span>
  );
}

function SideBySide({ incoming, candidate }: { incoming: any; candidate: DuplicateCandidate }) {
  const fields: Array<[string, any, any]> = [
    ["العنوان", incoming.title, candidate.existingTitle],
    ["العنوان الفرعي", incoming.subtitle ?? "—", candidate.existingSubtitle ?? "—"],
    ["النوع", incoming.entity_type, candidate.existingType],
    ["slug", incoming.slug, candidate.existingSlug],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-950/60 p-2">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">الموجود في القاعدة</div>
        <ul className="space-y-0.5">
          {fields.map(([label, _incVal, exVal]) => (
            <li key={label} className="flex gap-1">
              <span className="text-slate-500">{label}:</span>
              <span className="text-slate-200">{String(exVal ?? "—")}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">المُستورد</div>
        <ul className="space-y-0.5">
          {fields.map(([label, incVal, exVal]) => {
            const changed = String(incVal ?? "") !== String(exVal ?? "");
            return (
              <li key={label} className="flex gap-1">
                <span className="text-slate-500">{label}:</span>
                <span className={changed ? "text-amber-200" : "text-slate-200"}>{String(incVal ?? "—")}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ActionBtn({ label, v, cur, onClick, tone }: {
  label: string;
  v: RowAction;
  cur: RowAction | undefined;
  onClick: (a: RowAction) => void;
  tone: "new" | "update" | "skip" | "alias";
}) {
  const active = cur === v;
  const toneCls = active
    ? tone === "new" ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
      : tone === "update" ? "border-amber-400 bg-amber-500/20 text-amber-100"
      : tone === "alias" ? "border-sky-400 bg-sky-500/20 text-sky-100"
      : "border-slate-500 bg-slate-500/20 text-slate-100"
    : "border-slate-700 text-slate-300 hover:border-slate-500";
  return (
    <button
      onClick={() => onClick(v)}
      className={`rounded border px-1.5 py-0.5 text-[10px] transition ${toneCls}`}
    >
      {label}
    </button>
  );
}

// ============================================================
// Phase 3 — Relations panel: per-row report with old→new arrow
// and per-suggestion accept toggle. Reads RelationReport directly
// from the row; toggling calls back into the wizard state.
// ============================================================
import type { RelationReport, RelationResolution } from "@/lib/import/relations-report";

const STATUS_TONE: Record<RelationResolution["status"], string> = {
  valid: "text-emerald-300",
  remapped: "text-amber-300",
  type_mismatch: "text-amber-300",
  archived: "text-orange-300",
  disabled: "text-orange-300",
  ambiguous: "text-amber-300",
  missing: "text-red-300",
};

const STATUS_LABEL: Record<RelationResolution["status"], string> = {
  valid: "صالح",
  remapped: "إعادة توجيه",
  type_mismatch: "نوع مختلف",
  archived: "مؤرشف",
  disabled: "معطّل",
  ambiguous: "غامض",
  missing: "مفقود",
};

function RelationsPanel({ row, onToggle }: {
  row: PreviewRow;
  onToggle: (resolutionIndex: number, accepted: boolean) => void;
}) {
  const rep = row.relations!;
  const [open, setOpen] = useState(false);
  const counts = rep.counts;
  const total = rep.resolutions.length;
  const summary =
    total === 0
      ? "لا توجد مراجع"
      : `${counts.valid} ✓ · ${counts.remapped + counts.type_mismatch + counts.archived + counts.disabled + counts.ambiguous} ⚠ · ${counts.missing} ✖`;

  return (
    <div className="mt-2 rounded-md border border-slate-700/60 bg-slate-950/40 p-2 text-[11px]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <span className="font-semibold text-slate-200">المراجع · {summary}</span>
        <span className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {rep.batchIssues.length > 0 && (
            <ul className="space-y-0.5 rounded border border-red-500/30 bg-red-500/5 p-2 text-red-200">
              {rep.batchIssues.map((b, i) => (
                <li key={i}>{b.level === "error" ? "✖" : "⚠"} {b.message}</li>
              ))}
            </ul>
          )}
          {rep.resolutions.length === 0 && rep.batchIssues.length === 0 && (
            <p className="text-slate-500">لا توجد مراجع للتحقّق منها.</p>
          )}
          {rep.resolutions.length > 0 && (
            <ul className="divide-y divide-slate-800 rounded border border-slate-800">
              {rep.resolutions.map((res, i) => (
                <ResolutionRow key={i} res={res} accepted={!!rep.accepted[i]} onToggle={(v) => onToggle(i, v)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ResolutionRow({ res, accepted, onToggle }: {
  res: RelationResolution;
  accepted: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-start gap-2 p-1.5">
      <span className={`shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] ${STATUS_TONE[res.status]}`}>
        {STATUS_LABEL[res.status]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-slate-400">{res.ref.path}</div>
        <div className="flex flex-wrap items-center gap-1 text-slate-200">
          <code className="rounded bg-slate-800/60 px-1 font-mono text-[10px]">{res.ref.raw}</code>
          {res.suggestRewrite && res.rewriteTo && (
            <>
              <span className="text-slate-500">←</span>
              <code className="rounded bg-emerald-500/10 px-1 font-mono text-[10px] text-emerald-200">{res.rewriteTo}</code>
            </>
          )}
          {res.target && !res.suggestRewrite && res.status === "valid" && (
            <span className="text-slate-500">→ {res.target.title || res.target.slug}</span>
          )}
        </div>
        {res.note && <div className="mt-0.5 text-slate-500">{res.note}</div>}
        {res.candidates && res.candidates.length > 0 && !res.target && (
          <div className="mt-0.5 flex flex-wrap gap-1 text-slate-500">
            <span>مرشحون:</span>
            {res.candidates.slice(0, 4).map((c) => (
              <span key={c.id} className="rounded bg-slate-800/40 px-1 text-[10px]">{c.title || c.slug}</span>
            ))}
          </div>
        )}
      </div>
      {res.suggestRewrite && (
        <label className="inline-flex items-center gap-1 text-[10px] text-slate-300">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onToggle(e.target.checked)}
            className="accent-amber-500"
          />
          تطبيق الإصلاح
        </label>
      )}
    </li>
  );
}

// ============================================================
// Phase 4 — Quality badge + per-row quality panel.
// Reads r.quality (populated by the engine's classify() step).
// ============================================================

const QUALITY_TONE: Record<QualityLabel, string> = {
  publish_ready:      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  publish_with_notes: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  needs_review:       "border-amber-500/40 bg-amber-500/10 text-amber-200",
  needs_content:      "border-rose-500/40 bg-rose-500/10 text-rose-200",
  draft_only:         "border-slate-500/40 bg-slate-500/10 text-slate-200",
  blocked:            "border-red-500/40 bg-red-500/10 text-red-200",
};

function QualityBadge({ q }: { q: QualityReport }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${QUALITY_TONE[q.label]}`}>
      <span className="font-mono">{q.score}٪</span>
      <span>{QUALITY_LABEL_AR[q.label]}</span>
    </span>
  );
}

function QualityPanel({ row, onToggleDraft }: {
  row: PreviewRow;
  onToggleDraft: (on: boolean) => void;
}) {
  const q = row.quality!;
  const [open, setOpen] = useState(false);
  const sourceTone =
    q.sourceStatus === "verified"   ? "text-emerald-300" :
    q.sourceStatus === "acceptable" ? "text-slate-300"   :
    q.sourceStatus === "weak"       ? "text-amber-300"   : "text-red-300";
  return (
    <div className="mt-2 rounded-md border border-slate-700/60 bg-slate-950/40 p-2 text-[11px]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-200">الجودة · {q.score}٪ · {QUALITY_LABEL_AR[q.label]}</span>
          <span className={`text-[10px] ${sourceTone}`}>{SOURCE_STATUS_AR[q.sourceStatus]}</span>
          {q.regression && (
            <span className="rounded bg-red-500/20 px-1 text-[10px] text-red-200">
              تراجع {q.regression.before}→{q.regression.after}٪
            </span>
          )}
        </span>
        <span className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {q.missingRequired.length > 0 && (
            <div className="text-red-300">مطلوب مفقود: {q.missingRequired.join("، ")}</div>
          )}
          {q.missingOptional.length > 0 && (
            <div className="text-slate-400">اختياري مفقود: {q.missingOptional.join("، ")}</div>
          )}
          {q.reasons.length > 0 && (
            <ul className="space-y-0.5 text-slate-400">
              {q.reasons.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          )}
          {q.regression && (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-1.5 text-red-200">
              فقدان محتوى: {q.regression.losses.join("، ")}
            </div>
          )}
          {!q.publishEligible && (
            <label className="mt-1 inline-flex items-center gap-1.5 rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-200">
              <input
                type="checkbox"
                checked={!!row.importAsDraft}
                onChange={(e) => onToggleDraft(e.target.checked)}
                className="accent-amber-500"
              />
              استيراد كمسودة
            </label>
          )}
        </div>
      )}
    </div>
  );
}


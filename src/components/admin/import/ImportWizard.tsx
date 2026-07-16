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
  const [ackWarnings, setAckWarnings] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RowStatus | "warnings">("all");

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

  const runCommit = async () => {
    setCommitError(null);
    setResult(null);
    setStep("committing");
    try {
      const r = await engine.commit(rows, { overwrite, publish, autoRepair });
      setResult(r);
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
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const setRowOverride = (index: number, action: RowAction | undefined) => {
    setRows((prev) => prev.map((r) => r.index === index ? { ...r, override: action } : r));
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
                    {r.candidates && r.candidates.length > 0 && (
                      <CandidatePanel row={r} onOverride={(a) => setRowOverride(r.index, a)} />
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

            {commitError && (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                <AlertTriangle className="me-1 inline h-4 w-4" /> {commitError}
              </div>
            )}
          </div>

          <NavBar
            onBack={back}
            forwardLabel={`تنفيذ الاستيراد (${eligibleCount})`}
            forwardIcon={<Upload className="h-4 w-4" />}
            onForward={runCommit}
            forwardDisabled={hasBlockers || eligibleCount === 0 || (hasWarnings && !ackWarnings)}
            forwardHint={
              hasBlockers ? "يجب معالجة المحظورات."
              : eligibleCount === 0 ? "لا يوجد ما يُستورد."
              : hasWarnings && !ackWarnings ? "أقرّ بالتحذيرات قبل المتابعة."
              : undefined
            }
            forwardTone="primary"
          />
        </section>
      )}

      {/* ---------- Committing ---------- */}
      {step === "committing" && (
        <section className="flex items-center justify-center rounded-2xl border border-amber-500/20 bg-slate-900/60 p-10 text-amber-200">
          <Loader2 className="me-2 h-5 w-5 animate-spin" /> جارٍ تنفيذ الاستيراد…
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
          </div>

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

// ============================================================
// Investigation editorial Import dialog (admin only)
// ------------------------------------------------------------
// Two-phase workflow:
//   1. Pick / paste the exported JSON → dry run (no writes)
//   2. Review the diff summary → confirm → commit (transaction)
// Errors block the commit; warnings never do.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Upload, FileJson, AlertTriangle, CheckCircle2, Loader2, ShieldCheck,
  Plus, Minus, Pencil, Ban,
} from "lucide-react";
import {
  parseImportFile, previewInvestigationImport, commitInvestigationImport,
  FIELD_LABELS, type ImportRunResult, type ImportItemResult,
} from "@/lib/investigations/import";
import { downloadGoldenTemplate } from "@/lib/investigations/golden-template";


interface Props {
  onClose: () => void;
  onImported?: () => void;
}

const ACTION_META: Record<string, { label: string; cls: string; Icon: typeof Pencil }> = {
  create: { label: "إنشاء جديد", cls: "text-emerald-300 border-emerald-500/40", Icon: Plus },
  update: { label: "تحديث قائم", cls: "text-amber-200 border-amber-500/40", Icon: Pencil },
  noop: { label: "لا تغيير", cls: "text-slate-400 border-slate-700", Icon: CheckCircle2 },
  blocked: { label: "محجوب", cls: "text-rose-300 border-rose-500/40", Icon: Ban },
};

export function InvestigationImportDialog({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [allowRemovals, setAllowRemovals] = useState(false);
  const [preview, setPreview] = useState<ImportRunResult | null>(null);
  const [committed, setCommitted] = useState<ImportRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const loadText = useCallback((text: string, name: string | null) => {
    setError(null); setPreview(null); setCommitted(null);
    try {
      const parsed = parseImportFile(text);
      setItems(parsed.investigations);
      setParseWarnings(parsed.warnings);
      setFileName(name);
    } catch (e: any) {
      setItems(null); setParseWarnings([]);
      setError(e?.message ?? "تعذّر قراءة الملف.");
    }
  }, []);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadText(await f.text(), f.name);
  }, [loadText]);

  const runPreview = useCallback(async () => {
    if (!items) return;
    setBusy(true); setError(null); setCommitted(null);
    try {
      setPreview(await previewInvestigationImport(items, allowRemovals));
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تنفيذ المعاينة.");
    } finally { setBusy(false); }
  }, [items, allowRemovals]);

  const runCommit = useCallback(async () => {
    if (!items || !preview?.ok) return;
    setBusy(true); setError(null);
    try {
      const res = await commitInvestigationImport(items, allowRemovals);
      setCommitted(res);
      onImported?.();
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تنفيذ الاستيراد.");
    } finally { setBusy(false); }
  }, [items, preview, allowRemovals, onImported]);

  const shown = committed ?? preview;
  const blockedCount = shown?.totals.blocked ?? 0;
  const hasWarnings = useMemo(
    () => (shown?.items ?? []).some((i) => i.warnings?.length),
    [shown],
  );

  return (
    <div dir="rtl" className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-amber-100">استيراد تحقيق (تحديث آمن)</h2>
              <p className="text-[11px] text-slate-400">
                يُحدّث التحقيق القائم بنفس المعرّف — لا نسخ مكرّرة، ولا فقدان للبيانات غير المذكورة في الملف.
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* Step 1 — file */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FileJson className="h-3.5 w-3.5 text-amber-400" /> ١. ملف JSON المُصدَّر
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".json,application/json" onChange={onPick} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" /> اختيار ملف
              </button>
              {fileName && (
                <span className="text-[11px] text-slate-400">
                  {fileName} — {items?.length ?? 0} تحقيق
                </span>
              )}
            </div>
            <button type="button" onClick={() => { void downloadGoldenTemplate(); }}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-300 underline decoration-dotted hover:text-amber-200">
              <FileJson className="h-3 w-3" /> تنزيل القالب الذهبي المرجعي (من التحقيق الحيّ — بنية كاملة 100%)
            </button>

            <textarea
              onChange={(e) => { if (e.target.value.trim()) loadText(e.target.value, "لصق يدوي"); }}
              placeholder="أو الصق محتوى JSON هنا…"
              className="mt-2 h-20 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200 outline-none focus:border-amber-400/50"
              dir="ltr"
            />
            {parseWarnings.map((w, i) => (
              <p key={i} className="mt-1 text-[11px] text-amber-300">⚠ {w}</p>
            ))}
          </section>

          {/* Step 2 — options + dry run */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" /> ٢. معاينة قبل التنفيذ (Dry Run)
            </div>
            <label className="flex items-start gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={allowRemovals} disabled={busy}
                onChange={(e) => { setAllowRemovals(e.target.checked); setPreview(null); setCommitted(null); }}
                className="mt-0.5 accent-amber-500" />
              <span>
                السماح بحذف خطوات اللعب المفقودة من الملف.
                <span className="text-slate-500"> بدون تفعيله، أي حذف يوقف الاستيراد.</span>
              </span>
            </label>
            <button onClick={runPreview} disabled={!items || busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-400 hover:text-amber-300 disabled:opacity-50">
              {busy && !committed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              تشغيل المعاينة
            </button>
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {/* Summary */}
          {shown && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([
                  ["الإجمالي", shown.totals.items, "text-slate-200"],
                  ["جديد", shown.totals.created, "text-emerald-300"],
                  ["تحديث", shown.totals.updated, "text-amber-200"],
                  ["بدون تغيير", shown.totals.unchanged, "text-slate-400"],
                  ["محجوب", shown.totals.blocked, "text-rose-300"],
                ] as const).map(([label, value, cls]) => (
                  <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-center">
                    <div className={`text-lg font-bold ${cls}`}>{value}</div>
                    <div className="text-[10px] text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              {shown.items.map((item, i) => <ItemCard key={i} item={item} />)}

              {committed ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> تم تنفيذ الاستيراد وحفظ نسخة في سجل الإصدارات.
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-[11px] text-slate-400">
                    {blockedCount > 0
                      ? "توجد أخطاء تمنع الاستيراد — صحّح الملف ثم أعد المعاينة."
                      : hasWarnings
                        ? "توجد تنبيهات فقط — الاستيراد مسموح."
                        : "لا توجد أخطاء. جاهز للتنفيذ."}
                  </p>
                  <button onClick={runCommit} disabled={busy || !shown.ok}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    تأكيد وتنفيذ الاستيراد
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: ImportItemResult }) {
  const meta = ACTION_META[item.action] ?? ACTION_META.noop;
  const { Icon } = meta;
  const addedSteps = item.added?.steps ?? [];
  const removedSteps = item.removed?.steps ?? [];
  const addedRel = item.added?.related_entities ?? [];
  const removedRel = item.removed?.related_entities ?? [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{item.title ?? "—"}</p>
          <p className="truncate text-[11px] text-slate-500" dir="ltr">
            {item.slug ?? "—"}{item.id ? ` · ${item.id}` : ""}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${meta.cls}`}>
          <Icon className="h-3 w-3" /> {meta.label}
          {item.matched_by && <span className="text-slate-500">· مطابقة بـ{item.matched_by === "id" ? "المعرّف" : "الـslug"}</span>}
        </span>
      </div>

      <dl className="mt-2 space-y-1 text-[11px]">
        {item.updated_fields?.length > 0 && (
          <Row label="حقول محدّثة" tone="text-amber-200"
            value={item.updated_fields.map((f) => FIELD_LABELS[f] ?? f).join(" · ")} />
        )}
        {(addedSteps.length > 0 || addedRel.length > 0) && (
          <Row label="إضافات" tone="text-emerald-300" icon={<Plus className="h-3 w-3" />}
            value={[
              addedSteps.length ? `${addedSteps.length} خطوة` : null,
              addedRel.length ? `${addedRel.length} مرجع` : null,
            ].filter(Boolean).join(" · ")} />
        )}
        {(removedSteps.length > 0 || removedRel.length > 0) && (
          <Row label="حذف" tone="text-rose-300" icon={<Minus className="h-3 w-3" />}
            value={[
              removedSteps.length ? `${removedSteps.length} خطوة` : null,
              removedRel.length ? `${removedRel.length} مرجع` : null,
            ].filter(Boolean).join(" · ")} />
        )}
        {item.counts && (
          <Row label="بعد الاستيراد" tone="text-slate-400"
            value={`${item.counts.steps} خطوة · ${item.counts.related_entities} مرجع`} />
        )}
      </dl>

      {item.errors?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span className="break-words">{e}</span>
            </li>
          ))}
        </ul>
      )}
      {item.warnings?.length > 0 && (
        <ul className="mt-1 space-y-1">
          {item.warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-amber-300">⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value, tone, icon }: { label: string; value: string; tone: string; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className={`flex items-center gap-1 ${tone}`}>{icon}{value}</dd>
    </div>
  );
}

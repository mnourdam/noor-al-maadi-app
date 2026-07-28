// ============================================================
// Campaign Import dialog (admin only)
// ------------------------------------------------------------
// Reads the exact envelope produced by "تصدير الحملات":
//   file → dry run (no writes) → review diff → apply (transaction)
// Never routes through the generic content/entity validator.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Upload, FileJson, AlertTriangle, CheckCircle2, Loader2, ShieldCheck,
  Plus, Minus, Pencil, Ban,
} from "lucide-react";
import {
  parseCampaignImportFile, previewCampaignImport, commitCampaignImport,
  CAMPAIGN_FIELD_LABELS,
  type CampaignImportRunResult, type CampaignImportWriteMode,
} from "@/lib/admin/campaignImport";

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

export function CampaignImportDialog({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [allowRemovals, setAllowRemovals] = useState(false);
  const [writeMode, setWriteMode] = useState<CampaignImportWriteMode>("draft");
  const [preview, setPreview] = useState<CampaignImportRunResult | null>(null);
  const [committed, setCommitted] = useState<CampaignImportRunResult | null>(null);
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
      const parsed = parseCampaignImportFile(text);
      setItems(parsed.campaigns);
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
      setPreview(await previewCampaignImport(items, allowRemovals, writeMode));
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تنفيذ المعاينة.");
    } finally { setBusy(false); }
  }, [items, allowRemovals, writeMode]);

  const runCommit = useCallback(async () => {
    if (!items || !preview?.ok) return;
    setBusy(true); setError(null);
    try {
      setCommitted(await commitCampaignImport(items, allowRemovals, writeMode));
      onImported?.();
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تنفيذ الاستيراد.");
    } finally { setBusy(false); }
  }, [items, preview, allowRemovals, writeMode, onImported]);

  const shown = committed ?? preview;
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
              <h2 className="text-base font-bold text-amber-100">استيراد حملات (تحديث آمن)</h2>
              <p className="text-[11px] text-slate-400">
                يقرأ ملف «تصدير الحملات» نفسه — يُحدّث الحملة القائمة بنفس المعرّف مع الحفاظ على معرّفات الفصول والأنشطة.
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
              <FileJson className="h-3.5 w-3.5 text-amber-400" /> ١. ملف JSON المُصدَّر من الحملات
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".json,application/json" onChange={onPick} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" /> اختيار ملف
              </button>
              {fileName && (
                <span className="text-[11px] text-slate-400">{fileName} — {items?.length ?? 0} حملة</span>
              )}
            </div>
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

            <div className="mb-2 flex flex-wrap gap-2">
              {([
                ["draft", "حفظ كمسوّدة (لا يؤثر على اللاعبين)"],
                ["publish", "تطبيق ونشر (نسخة احتياطية تلقائية)"],
              ] as const).map(([v, label]) => (
                <button key={v} type="button" disabled={busy}
                  onClick={() => { setWriteMode(v); setPreview(null); setCommitted(null); }}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] ${
                    writeMode === v
                      ? "border-amber-400 bg-amber-500/10 text-amber-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <label className="flex items-start gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={allowRemovals} disabled={busy}
                onChange={(e) => { setAllowRemovals(e.target.checked); setPreview(null); setCommitted(null); }}
                className="mt-0.5 accent-amber-500" />
              <span>
                السماح بحذف الفصول والأنشطة المفقودة من الملف.
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

              {hasWarnings && (
                <p className="text-[11px] text-amber-300">⚠ توجد تنبيهات — راجع التفاصيل أدناه.</p>
              )}

              <div className="max-h-[45vh] space-y-2 overflow-y-auto pl-1">
                {shown.items.map((it, i) => {
                  const meta = ACTION_META[it.action] ?? ACTION_META.noop;
                  return (
                    <article key={`${it.id ?? i}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">{it.title ?? it.id ?? "—"}</div>
                          <div className="truncate text-[10px] text-slate-500" dir="ltr">
                            {it.id ?? "—"}{it.slug ? ` · ${it.slug}` : ""}
                            {it.matched_by ? ` · مطابقة بـ${it.matched_by}` : ""}
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${meta.cls}`}>
                          <meta.Icon className="h-3 w-3" /> {meta.label}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                        <span className="rounded border border-slate-800 px-1.5 py-0.5">
                          {it.counts?.chapters ?? 0} فصلًا · {it.counts?.activities ?? 0} نشاطًا
                        </span>
                        {(it.updated_fields ?? []).map((f) => (
                          <span key={f} className="rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-200">
                            {CAMPAIGN_FIELD_LABELS[f] ?? f}
                          </span>
                        ))}
                        {(it.added?.chapters?.length || it.added?.activities?.length) ? (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300">
                            <Plus className="h-3 w-3" /> {it.added.chapters.length} فصل / {it.added.activities.length} نشاط
                          </span>
                        ) : null}
                        {(it.removed?.chapters?.length || it.removed?.activities?.length) ? (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-500/30 px-1.5 py-0.5 text-rose-300">
                            <Minus className="h-3 w-3" /> {it.removed.chapters.length} فصل / {it.removed.activities.length} نشاط
                          </span>
                        ) : null}
                      </div>

                      {(it.warnings ?? []).map((w, k) => (
                        <p key={k} className="mt-1 text-[11px] text-amber-300">⚠ {w}</p>
                      ))}
                      {(it.errors ?? []).map((e, k) => (
                        <p key={k} className="mt-1 text-[11px] text-rose-300">✖ {e}</p>
                      ))}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            {committed
              ? "تم تنفيذ الاستيراد."
              : preview
                ? preview.ok ? "المعاينة جاهزة — يمكنك التنفيذ." : "توجد أخطاء تمنع التنفيذ."
                : "لم تُنفّذ معاينة بعد."}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-50">
              إغلاق
            </button>
            <button onClick={runCommit} disabled={!preview?.ok || busy || !!committed}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
              {busy && preview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              تنفيذ الاستيراد
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

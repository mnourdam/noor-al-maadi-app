// Import Preview — dry-run classifier for future JSON content packs.
// NO write paths. Paste/upload an array of entity objects (or a single
// object) and we classify each item against the live catalog:
//   • new                  — slug + normalized name unknown
//   • updated              — slug exists, content differs (field-level deltas)
//   • duplicate_candidate  — normalized name match against a different slug
//   • canonical_match      — slug is registered as a redirect → canonical
//   • conflict             — slug collision with a different entity_type / shape
//
// The actual importer remains the existing admin page. This screen exists
// only to prevent duplicate explosions when a new pack is being prepared.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, CheckCircle2, FileJson, GitCompareArrows, Loader2,
  PlusCircle, RefreshCw, ScanSearch, ShieldAlert, Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { entityNameKeys, normalizeArabicName } from "@/lib/arabic-normalize";

type LiveRow = {
  id: string; entity_type: string; slug: string; title: string;
  subtitle: string | null; summary: string | null; body: any; metadata: any;
};

type Incoming = {
  entity_type?: string;
  slug?: string;
  title?: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: any;
  metadata?: any;
};

type Verdict =
  | { kind: "new"; item: Incoming }
  | { kind: "updated"; item: Incoming; existing: LiveRow; diffs: string[] }
  | { kind: "duplicate_candidate"; item: Incoming; existing: LiveRow }
  | { kind: "canonical_match"; item: Incoming; canonicalSlug: string; canonical: LiveRow }
  | { kind: "conflict"; item: Incoming; existing: LiveRow; reason: string }
  | { kind: "invalid"; item: Incoming; reason: string };

export const Route = createFileRoute("/admin/encyclopedia-cleanup/import-preview")({
  head: () => ({ meta: [{ title: "معاينة استيراد — إرث" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ImportPreview,
});

function ImportPreview() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [results, setResults] = useState<Verdict[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCatalog = async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase
        .from("encyclopedia_entities" as any)
        .select("id,entity_type,slug,title,subtitle,summary,body,metadata")
        .limit(5000);
      if (error) throw error;
      setRows((data ?? []) as unknown as LiveRow[]);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    f.text().then((t) => setRaw(t));
  };

  const analyze = async () => {
    setParseErr(null); setResults(null);
    if (rows.length === 0) await loadCatalog();
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch (e: any) { setParseErr("JSON غير صالح: " + e.message); return; }
    const items: Incoming[] = Array.isArray(parsed) ? parsed : [parsed];
    setResults(classify(items, rows));
  };

  const counts = useMemo(() => {
    const c = { new: 0, updated: 0, duplicate_candidate: 0, canonical_match: 0, conflict: 0, invalid: 0 };
    for (const v of results ?? []) c[v.kind]++;
    return c;
  }, [results]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <ScanSearch className="size-5 text-amber-400" />
          <div>
            <h1 className="text-lg font-bold text-amber-100">معاينة استيراد JSON</h1>
            <p className="text-xs text-slate-400">
              فحص جاف فقط — لن يُكتب شيء في قاعدة البيانات.
              {" · "}<Link to="/admin/encyclopedia-cleanup" className="underline hover:text-amber-200">عودة للورشة</Link>
            </p>
          </div>
        </div>
        <button onClick={loadCatalog} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحميل الفهرس ({rows.length})
        </button>
      </header>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
        <ShieldAlert className="me-1 inline size-3.5" />
        هذه الأداة لا تكتب أي بيانات. استخدم صفحة الاستيراد الرسمية بعد المراجعة.
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-slate-400">
            ألصق JSON (كائن واحد أو مصفوفة)
          </label>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10} dir="ltr"
            placeholder='[{ "entity_type":"figure", "slug":"abu-bakr", "title":"أبو بكر", ... }]'
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[12px] leading-5" />
          {parseErr && <p className="text-[12px] text-rose-300"><AlertCircle className="me-1 inline size-3.5" />{parseErr}</p>}
        </div>
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="application/json,.json"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-600/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60">
            <Upload className="size-3.5" /> رفع ملف
          </button>
          <button onClick={analyze} disabled={loading || !raw.trim()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <FileJson className="size-3.5" />} حلّل
          </button>
        </div>
      </div>

      {results && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Counter label="جديد" value={counts.new} icon={PlusCircle} tone="emerald" />
            <Counter label="تحديث" value={counts.updated} icon={ArrowDown} tone="sky" />
            <Counter label="مكرر محتمل" value={counts.duplicate_candidate} icon={GitCompareArrows} tone="fuchsia" />
            <Counter label="مطابقة قياسية" value={counts.canonical_match} icon={CheckCircle2} tone="amber" />
            <Counter label="تعارض" value={counts.conflict} icon={ShieldAlert} tone="rose" />
            <Counter label="غير صالح" value={counts.invalid} icon={AlertCircle} tone="slate" />
          </div>

          <div className="space-y-2">
            {results.map((v, i) => (
              <VerdictRow key={i} v={v} />
            ))}
            {results.length === 0 && (
              <p className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-6 text-center text-xs text-slate-400">
                لا توجد عناصر للتحليل.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Counter({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: any;
  tone: "emerald" | "sky" | "fuchsia" | "amber" | "rose" | "slate";
}) {
  const cls: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
    sky: "border-sky-500/40 bg-sky-500/5 text-sky-200",
    fuchsia: "border-fuchsia-500/40 bg-fuchsia-500/5 text-fuchsia-200",
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-200",
    rose: "border-rose-500/40 bg-rose-500/5 text-rose-200",
    slate: "border-slate-700/60 bg-slate-900/40 text-slate-300",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls[tone]}`}>
      <div className="flex items-center justify-between">
        <Icon className="size-3.5 opacity-80" />
        <span className="text-lg font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function VerdictRow({ v }: { v: Verdict }) {
  const tone: Record<Verdict["kind"], string> = {
    new: "border-emerald-500/30 bg-emerald-500/5",
    updated: "border-sky-500/30 bg-sky-500/5",
    duplicate_candidate: "border-fuchsia-500/30 bg-fuchsia-500/5",
    canonical_match: "border-amber-500/30 bg-amber-500/5",
    conflict: "border-rose-500/30 bg-rose-500/5",
    invalid: "border-slate-700/60 bg-slate-900/40",
  };
  const label: Record<Verdict["kind"], string> = {
    new: "جديد", updated: "تحديث", duplicate_candidate: "مكرر محتمل",
    canonical_match: "مطابقة قياسية", conflict: "تعارض", invalid: "غير صالح",
  };
  const title = v.item.title ?? v.item.slug ?? "(بدون اسم)";
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone[v.kind]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0">
          <span className="font-semibold text-slate-100">{title}</span>{" "}
          {v.item.slug && <span dir="ltr" className="font-mono text-[10px] text-slate-400">({v.item.slug})</span>}
          {v.item.entity_type && <span className="ms-2 text-slate-400">[{v.item.entity_type}]</span>}
        </div>
        <span className="rounded-full border border-slate-700/60 bg-slate-950/40 px-2 py-0.5 text-[10px] text-slate-200">
          {label[v.kind]}
        </span>
      </div>
      {v.kind === "updated" && v.diffs.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-300">
          {v.diffs.map((d) => <li key={d}>• {d}</li>)}
        </ul>
      )}
      {v.kind === "duplicate_candidate" && (
        <p className="mt-1 text-[11px] text-fuchsia-200">
          يتطابق الاسم مع كيان قائم بـ slug مختلف: <span dir="ltr" className="font-mono">{v.existing.slug}</span> — «{v.existing.title}».
        </p>
      )}
      {v.kind === "canonical_match" && (
        <p className="mt-1 text-[11px] text-amber-200">
          هذا الـ slug مسجّل كتحويلة إلى القياسي:{" "}
          <span dir="ltr" className="font-mono">{v.canonicalSlug}</span> — «{v.canonical.title}».
        </p>
      )}
      {v.kind === "conflict" && (
        <p className="mt-1 text-[11px] text-rose-200">{v.reason}</p>
      )}
      {v.kind === "invalid" && (
        <p className="mt-1 text-[11px] text-slate-300">{v.reason}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Classifier
// ------------------------------------------------------------
function summarize(s: string | null | undefined): number {
  return (s ?? "").trim().length;
}
function bodySize(b: any): number {
  if (!b) return 0;
  if (typeof b === "string") return b.length;
  try { return JSON.stringify(b).length; } catch { return 0; }
}

function classify(items: Incoming[], live: LiveRow[]): Verdict[] {
  const bySlug = new Map<string, LiveRow>();
  const byNormName = new Map<string, LiveRow[]>(); // type+name -> rows
  const redirectIndex = new Map<string, LiveRow>(); // old slug -> canonical row

  for (const r of live) {
    if (r.slug) bySlug.set(r.slug, r);
    const keys = entityNameKeys({ title: r.title, subtitle: r.subtitle, metadata: r.metadata });
    keys.push(normalizeArabicName(r.title));
    for (const k of keys) {
      const composite = `${r.entity_type}::${k}`;
      const arr = byNormName.get(composite) ?? [];
      arr.push(r);
      byNormName.set(composite, arr);
    }
    const redirects = r.metadata?.redirect_from;
    if (Array.isArray(redirects)) {
      for (const s of redirects) if (typeof s === "string") redirectIndex.set(s, r);
    }
  }

  const out: Verdict[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      out.push({ kind: "invalid", item: item as any, reason: "ليس كائن JSON" });
      continue;
    }
    if (!item.entity_type || !item.slug || !item.title) {
      out.push({ kind: "invalid", item, reason: "حقول مطلوبة ناقصة: entity_type/slug/title" });
      continue;
    }

    // canonical_match: incoming slug is already a registered redirect
    const redirected = redirectIndex.get(item.slug);
    if (redirected) {
      out.push({ kind: "canonical_match", item, canonicalSlug: redirected.slug, canonical: redirected });
      continue;
    }

    const existing = bySlug.get(item.slug);
    if (existing) {
      if (existing.entity_type !== item.entity_type) {
        out.push({ kind: "conflict", item, existing, reason: `الـ slug مستخدم لنوع آخر: ${existing.entity_type}` });
        continue;
      }
      const diffs: string[] = [];
      if ((item.title ?? "") !== existing.title) diffs.push(`العنوان: «${existing.title}» → «${item.title}»`);
      if ((item.summary ?? null) !== (existing.summary ?? null)) {
        diffs.push(`الملخص (${summarize(existing.summary)} → ${summarize(item.summary)} حرف)`);
      }
      if (bodySize(item.body) !== bodySize(existing.body)) {
        diffs.push(`المتن (${bodySize(existing.body)} → ${bodySize(item.body)} بايت)`);
      }
      if (diffs.length === 0) diffs.push("لا تغييرات نصية ملحوظة (قد تتغير حقول metadata).");
      out.push({ kind: "updated", item, existing, diffs });
      continue;
    }

    // duplicate candidate: same normalized name within type, different slug
    const norm = normalizeArabicName(item.title);
    const composite = `${item.entity_type}::${norm}`;
    const matches = byNormName.get(composite);
    if (matches && matches.length > 0) {
      out.push({ kind: "duplicate_candidate", item, existing: matches[0] });
      continue;
    }

    out.push({ kind: "new", item });
  }
  return out;
}

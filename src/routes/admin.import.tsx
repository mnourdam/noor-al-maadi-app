import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowRight, BookOpen, Bell, CalendarDays, FileJson, Sword, Upload, Landmark, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { validateCampaign } from "@/lib/campaignStorage";
import { inferWorldFromMetadata, runCampaignIntegrity, summarizeIntegrity, type CampaignIntegrityReport } from "@/lib/contentIntegrity";
import type { Campaign } from "@/types/campaign";


type ImportType = "daily_facts" | "today_in_history_events" | "notifications" | "campaigns" | "encyclopedia" | "investigations";

export const Route = createFileRoute("/admin/import")({
  head: () => ({
    meta: [
      { title: "استيراد المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { type?: ImportType } => {
    const t = s.type as string | undefined;
    if (t === "daily_facts" || t === "today_in_history_events" || t === "notifications" || t === "campaigns" || t === "encyclopedia" || t === "investigations") {
      return { type: t };
    }
    return {};
  },
  component: () => <AdminGate><ImportPage /></AdminGate>,
});

function ImportPage() {
  const { type } = Route.useSearch();
  const [active, setActive] = useState<ImportType>(type ?? "daily_facts");

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
          <div className="flex items-center gap-3">
            <Upload className="h-6 w-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-amber-100">استيراد المحتوى (JSON)</h1>
          </div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-amber-300 hover:text-amber-200">
            <ArrowRight className="h-4 w-4" /> لوحة الإدارة
          </Link>
        </header>

        <div className="flex flex-wrap gap-2">
          <TypeBtn active={active === "daily_facts"} onClick={() => setActive("daily_facts")} icon={<BookOpen className="h-4 w-4" />}>معلومات يومية</TypeBtn>
          <TypeBtn active={active === "today_in_history_events"} onClick={() => setActive("today_in_history_events")} icon={<CalendarDays className="h-4 w-4" />}>أحداث تاريخية</TypeBtn>
          <TypeBtn active={active === "notifications"} onClick={() => setActive("notifications")} icon={<Bell className="h-4 w-4" />}>مسودات إشعارات</TypeBtn>
          <TypeBtn active={active === "campaigns"} onClick={() => setActive("campaigns")} icon={<Sword className="h-4 w-4" />}>حملات</TypeBtn>
          <TypeBtn active={active === "encyclopedia"} onClick={() => setActive("encyclopedia")} icon={<Landmark className="h-4 w-4" />}>الموسوعة</TypeBtn>
          <TypeBtn active={active === "investigations"} onClick={() => setActive("investigations")} icon={<Search className="h-4 w-4" />}>التحقيقات</TypeBtn>
        </div>

        {active === "daily_facts" && <Importer key="f" config={dailyFactsConfig} />}
        {active === "today_in_history_events" && <Importer key="e" config={todayEventsConfig} />}
        {active === "notifications" && <Importer key="n" config={notificationsConfig} />}
        {active === "encyclopedia" && <Importer key="enc" config={encyclopediaConfig} />}
        {active === "investigations" && <Importer key="inv" config={investigationsConfig} />}
        {active === "campaigns" && <CampaignImporter />}
      </div>
    </div>
  );
}

function TypeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
        active ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-300 hover:border-slate-500"
      }`}
    >
      {icon}{children}
    </button>
  );
}

// ============================================================
// Campaign Importer (admin_campaigns)
// ------------------------------------------------------------
// Accepts a single Campaign JSON object OR an array of them.
// Validates with shared validateCampaign (Arabic messages),
// then upserts into Supabase public.admin_campaigns as draft by default.
// ============================================================

const CAMPAIGN_EXAMPLE = `{
  "id": "fath-makka",
  "slug": "fath-makka",
  "title": "فتح مكة",
  "subtitle": "اليوم الذي تغيّر فيه وجه الجزيرة",
  "period": "8 هـ / 630 م",
  "description": "رحلة عبر الأحداث التي مهّدت لفتح مكة وما تلاه من تأسيس مجتمع التوحيد.",
  "difficulty": "medium",
  "estimatedDuration": "20 دقيقة",
  "tags": ["السيرة","فتوحات"],
  "rewards": { "xp": 200, "coins": 100, "badgeId": "fath-makka-badge", "unlocks": ["artifact:miftah-al-kaaba"] },
  "chapters": [
    {
      "id": "ch1",
      "title": "نقض العهد",
      "order": 1,
      "xp": 30, "coins": 15, "hearts_penalty": 1,
      "unlocks": [],
      "activities": [
        {
          "type": "reading",
          "prompt": "اقرأ المقطع ثم أجب.",
          "contextText": "في السنة الثامنة للهجرة نقضت قريش صلح الحديبية...",
          "feedbackCorrect": "أحسنت."
        },
        {
          "type": "multiple_choice",
          "prompt": "في أي سنة هجرية كان فتح مكة؟",
          "options": ["6 هـ","7 هـ","8 هـ","9 هـ"],
          "correctAnswer": 2,
          "feedbackCorrect": "صحيح.",
          "feedbackWrong": "في رمضان من السنة الثامنة."
        },
        {
          "type": "ordering",
          "prompt": "رتّب الأحداث زمنيًا.",
          "options": ["صلح الحديبية","نقض قريش العهد","خروج النبي ﷺ بعشرة آلاف","دخول مكة"],
          "correctOrder": ["صلح الحديبية","نقض قريش العهد","خروج النبي ﷺ بعشرة آلاف","دخول مكة"]
        },
        {
          "type": "decision",
          "prompt": "ماذا تختار لو كنت قائدًا للجيش؟",
          "options": ["الهجوم المباشر","التطويق السلمي","التفاوض"],
          "correctAnswer": 1
        },
        {
          "type": "reflection",
          "prompt": "ما أعظم درس تعلّمته من فتح مكة؟"
        }
      ]
    }
  ]
}`;

interface CampaignImportRow { ok: boolean; campaign?: Campaign; errors: string[]; warnings: string[]; }

function CampaignImporter() {
  const [raw, setRaw] = useState("");
  const [publishOnImport, setPublishOnImport] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number; errors: string[]; reports: CampaignIntegrityReport[] } | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const parsed = useMemo<CampaignImportRow[]>(() => {
    if (!raw.trim()) return [];
    let data: any;
    try { data = JSON.parse(raw); }
    catch (e: any) { return [{ ok: false, errors: [`JSON غير صالح: ${e.message}`], warnings: [] }]; }
    const list: any[] = Array.isArray(data) ? data : [data];
    return list.map((item, i) => {
      const v = validateCampaign(item);
      const errs = v.issues.filter(x => x.level === "error").map(x => `الحملة #${i + 1}: ${x.message}`);
      const warns = v.issues.filter(x => x.level === "warning").map(x => `الحملة #${i + 1}: ${x.message}`);
      return { ok: v.ok, campaign: v.normalized, errors: errs, warnings: warns };
    });
  }, [raw]);

  const validCampaigns = parsed.filter(p => p.ok && p.campaign).map(p => p.campaign!) as Campaign[];
  const allErrors = parsed.flatMap(p => p.errors);
  const allWarnings = parsed.flatMap(p => p.warnings);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    e.target.value = "";
  };

  const runImport = async () => {
    setBusy(true); setResult(null); setTopError(null);
    try {
      let inserted = 0, updated = 0, skipped = 0, failed = 0;
      const rowErrs: string[] = [];
      const reports: CampaignIntegrityReport[] = [];

      // Pre-fetch existing ids to differentiate insert vs update.
      const ids = validCampaigns.map(c => c.id);
      const { data: existing } = await supabase
        .from("admin_campaigns" as any)
        .select("id")
        .in("id", ids);
      const existingIds = new Set((((existing as unknown) ?? []) as Array<{ id: string }>).map(r => r.id));

      for (const c of validCampaigns) {
        const exists = existingIds.has(c.id);
        if (exists && !overwrite) { skipped++; continue; }

        // Auto-assign world/era from metadata when confident.
        let enriched = c;
        if (!c.worldSlug) {
          const inf = inferWorldFromMetadata(c);
          if (inf && inf.confidence === "high") {
            enriched = { ...c, worldSlug: inf.worldSlug, era: c.era ?? inf.era };
          }
        }

        const status = publishOnImport ? "published" : (exists ? undefined : "draft");
        const row: any = {
          id: enriched.id,
          slug: enriched.slug ?? null,
          title: enriched.title,
          data: { ...enriched, status: publishOnImport ? "published" : (enriched.status ?? "draft") },
          updated_at: new Date().toISOString(),
        };
        if (status) row.status = status;
        const { error } = await supabase
          .from("admin_campaigns" as any)
          .upsert(row, { onConflict: "id" });
        if (error) { failed++; rowErrs.push(`${enriched.id}: ${error.message}`); continue; }
        if (exists) updated++; else inserted++;

        reports.push(runCampaignIntegrity(enriched));
      }

      setResult({ inserted, updated, skipped, failed, errors: rowErrs.slice(0, 10), reports });
    } catch (err: any) {
      setTopError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };


  const canImport = validCampaigns.length > 0 && !busy && allErrors.length === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
            <Upload className="h-4 w-4" /> رفع ملف .json
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
          <button onClick={() => setRaw(CAMPAIGN_EXAMPLE)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            <FileJson className="h-3.5 w-3.5" /> مثال
          </button>
          <button onClick={() => { setRaw(""); setResult(null); }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            مسح
          </button>
          <label className="ms-auto inline-flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={publishOnImport} onChange={e => setPublishOnImport(e.target.checked)} />
            نشر فور الاستيراد
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
            استبدال إن وُجد
          </label>
        </div>
        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="الصق JSON للحملة هنا… (كائن واحد أو مصفوفة [ ... ])"
          dir="ltr"
          className="h-72 w-full rounded-md border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs text-slate-100"
        />
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer hover:text-amber-300">نموذج schema</summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-300">{CAMPAIGN_EXAMPLE}</pre>
        </details>
      </div>

      {raw.trim() && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-200">نتيجة التحقق</h3>
          <p className="text-xs text-slate-300">
            صالح: <span className="text-emerald-300">{validCampaigns.length}</span> ·
            أخطاء: <span className="text-red-300"> {allErrors.length}</span> ·
            تحذيرات: <span className="text-amber-300"> {allWarnings.length}</span>
          </p>
          {allErrors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-red-200">
              {allErrors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}
              {allErrors.length > 12 && <li>…و{allErrors.length - 12} خطأ آخر</li>}
            </ul>
          )}
          {allWarnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-200">
              {allWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {validCampaigns.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-200">
              {validCampaigns.map(c => (
                <li key={c.id} className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                  <span className="text-amber-300">{c.id}</span> — {c.title} · {c.chapters.length} فصول
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={!canImport}
          onClick={runImport}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
            canImport ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "cursor-not-allowed bg-slate-800 text-slate-500"
          }`}
        >
          <Upload className="h-4 w-4" /> {busy ? "جارٍ الاستيراد…" : `استيراد ${validCampaigns.length} حملة`}
        </button>
        <Link to="/admin/campaigns" className="text-xs text-amber-300 hover:text-amber-200">
          فتح إدارة الحملات →
        </Link>
      </div>

      {topError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle className="me-1 inline h-4 w-4" /> {topError}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <CheckCircle2 className="me-1 inline h-4 w-4" />
            تم. تمت إضافة {result.inserted} · تحديث {result.updated} · تخطّي {result.skipped} · فشل {result.failed}.
            {result.errors.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-red-200">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>

          {result.reports.length > 0 && (() => {
            const sum = summarizeIntegrity(result.reports);
            return (
              <div className="rounded-xl border border-amber-500/30 bg-slate-900/60 p-4">
                <h3 className="mb-2 text-sm font-bold text-amber-200">تقرير سلامة المحتوى</h3>
                <p className="mb-3 text-xs text-slate-300">
                  المجموع: <span className="text-amber-200">{sum.total}</span> ·
                  جاهز: <span className="text-emerald-300"> {sum.ok}</span> ·
                  يحتاج مراجعة: <span className="text-amber-300"> {sum.review}</span>
                </p>
                <div className="space-y-3">
                  {result.reports.map((r) => (
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
            );
          })()}
        </div>
      )}

    </div>
  );
}


// ============================================================
// Per-type configuration
// ============================================================

interface ImportConfig<T> {
  label: string;
  table: string;
  example: string;
  validate: (row: any, i: number) => { ok: true; row: T } | { ok: false; error: string };
  rowKey: (r: T) => string; // dedupe key (within the imported batch + existing rows)
  dedupeColumns: string[]; // columns used to query existing rows for dedupe
  buildDedupeFilter: (rows: T[]) => Record<string, any[]>;
  matchExisting: (existing: any, r: T) => boolean;
  preview: (r: T) => React.ReactNode;
  /** Allow user to enable overwrite (upsert) for duplicates. */
  allowOverwrite?: boolean;
  /** Comma-separated unique columns for upsert onConflict (required when allowOverwrite). */
  conflictTarget?: string;
  /** Subset of columns to update on overwrite. If omitted, full row is upserted. */
  overwriteFields?: string[];
}

const dailyFactsConfig: ImportConfig<{ title: string; body: string; deep_link: string | null; enabled: boolean }> = {
  label: "daily_facts",
  table: "daily_facts",
  example: `[
  {
    "title": "معلومة من إرث",
    "body": "هل تعلم أن بيت الحكمة كان...",
    "deep_link": "/timeline",
    "enabled": true
  }
]`,
  validate: (row, i) => {
    if (!row || typeof row !== "object") return { ok: false, error: `الصف ${i + 1}: ليس كائن JSON.` };
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!title) return { ok: false, error: `الصف ${i + 1}: العنوان مطلوب.` };
    if (!body) return { ok: false, error: `الصف ${i + 1}: المحتوى مطلوب.` };
    return {
      ok: true,
      row: {
        title, body,
        deep_link: typeof row.deep_link === "string" && row.deep_link.trim() ? row.deep_link.trim() : null,
        enabled: row.enabled === false ? false : true,
      },
    };
  },
  rowKey: r => `${r.title}|${r.body}`,
  dedupeColumns: ["title", "body"],
  buildDedupeFilter: rows => ({ title: Array.from(new Set(rows.map(r => r.title))) }),
  matchExisting: (e, r) => e.title === r.title && e.body === r.body,
  preview: r => (
    <div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

const todayEventsConfig: ImportConfig<{
  month: number; day: number; title: string; body: string;
  hijri_year: string | null; gregorian_year: string | null; deep_link: string | null; enabled: boolean;
}> = {
  label: "today_in_history_events",
  table: "today_in_history_events",
  example: `[
  {
    "month": 7,
    "day": 4,
    "title": "معركة حطين",
    "body": "في مثل هذا اليوم...",
    "hijri_year": "583هـ",
    "gregorian_year": "1187م",
    "deep_link": "/battles/hattin",
    "enabled": true
  }
]`,
  validate: (row, i) => {
    if (!row || typeof row !== "object") return { ok: false, error: `الصف ${i + 1}: ليس كائن JSON.` };
    const month = Number(row.month);
    const day = Number(row.day);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!month || month < 1 || month > 12) return { ok: false, error: `الصف ${i + 1}: الشهر يجب أن يكون بين 1 و12.` };
    if (!day || day < 1 || day > 31) return { ok: false, error: `الصف ${i + 1}: اليوم يجب أن يكون بين 1 و31.` };
    if (!title) return { ok: false, error: `الصف ${i + 1}: العنوان مطلوب.` };
    if (!body) return { ok: false, error: `الصف ${i + 1}: المحتوى مطلوب.` };
    return {
      ok: true,
      row: {
        month, day, title, body,
        hijri_year: typeof row.hijri_year === "string" && row.hijri_year.trim() ? row.hijri_year.trim() : null,
        gregorian_year: typeof row.gregorian_year === "string" && row.gregorian_year.trim() ? row.gregorian_year.trim() : null,
        deep_link: typeof row.deep_link === "string" && row.deep_link.trim() ? row.deep_link.trim() : null,
        enabled: row.enabled === false ? false : true,
      },
    };
  },
  rowKey: r => `${r.month}-${r.day}|${r.title}`,
  dedupeColumns: ["month", "day", "title"],
  buildDedupeFilter: rows => ({ title: Array.from(new Set(rows.map(r => r.title))) }),
  matchExisting: (e, r) => e.month === r.month && e.day === r.day && e.title === r.title,
  preview: r => (
    <div>
      <div className="text-xs text-amber-300">{r.day}/{r.month}{r.hijri_year ? ` · ${r.hijri_year}` : ""}{r.gregorian_year ? ` · ${r.gregorian_year}` : ""}</div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

const notificationsConfig: ImportConfig<{
  title: string; body: string; type: string; target_type: string;
  deep_link: string | null; image_url: string | null; status: string;
}> = {
  label: "notifications",
  table: "notifications",
  example: `[
  {
    "title": "إرث",
    "body": "النص...",
    "type": "manual",
    "target_type": "all",
    "deep_link": "/campaigns",
    "image_url": null,
    "status": "draft"
  }
]`,
  validate: (row, i) => {
    if (!row || typeof row !== "object") return { ok: false, error: `الصف ${i + 1}: ليس كائن JSON.` };
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!title) return { ok: false, error: `الصف ${i + 1}: العنوان مطلوب.` };
    if (!body) return { ok: false, error: `الصف ${i + 1}: المحتوى مطلوب.` };
    const allowedStatus = ["draft", "scheduled"];
    const status = typeof row.status === "string" && allowedStatus.includes(row.status) ? row.status : "draft";
    return {
      ok: true,
      row: {
        title, body,
        type: typeof row.type === "string" && row.type ? row.type : "manual",
        target_type: row.target_type === "user" ? "user" : "all",
        deep_link: typeof row.deep_link === "string" && row.deep_link.trim() ? row.deep_link.trim() : null,
        image_url: typeof row.image_url === "string" && row.image_url.trim() ? row.image_url.trim() : null,
        status,
      },
    };
  },
  rowKey: r => `${r.title}|${r.body}|${r.status}`,
  dedupeColumns: ["title", "body", "status"],
  buildDedupeFilter: rows => ({ title: Array.from(new Set(rows.map(r => r.title))) }),
  matchExisting: (e, r) => e.title === r.title && e.body === r.body && e.status === r.status,
  preview: r => (
    <div>
      <div className="text-xs text-amber-300">{r.type} · {r.target_type} · {r.status}</div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

const ENCYCLOPEDIA_TYPES = ["figure","city","battle","state","event","landmark","artifact"] as const;
type EncEntityType = typeof ENCYCLOPEDIA_TYPES[number];

interface EncRow {
  entity_type: EncEntityType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  timeline_year: number | null;
  timeline_start_year: number | null;
  timeline_end_year: number | null;
  timeline_hijri: string | null;
  timeline_order: number | null;
  timeline_category: string | null;
  timeline_tone: string | null;
  timeline_glyph: string | null;
}

const TIMELINE_CATEGORIES = ["caliphate", "figure", "battle", "book", "event"] as const;

function parseIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function parseStrOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

const encyclopediaConfig: ImportConfig<EncRow> = {
  label: "encyclopedia_entities",
  table: "encyclopedia_entities",
  example: `[
  {
    "entity_type": "figure",
    "slug": "salah-al-din",
    "title": "صلاح الدين الأيوبي",
    "subtitle": "محرر القدس",
    "summary": "قائد ومؤسس الدولة الأيوبية...",
    "body": { "sections": [{ "heading": "النشأة", "text": "..." }] },
    "metadata": { "era": "ayyubid", "birth_year": 532, "tags": ["قائد","حكام"] },
    "enabled": true,
    "timeline_start_year": 1137,
    "timeline_end_year": 1193,
    "timeline_category": "figure",
    "timeline_tone": "gold"
  },
  {
    "entity_type": "battle",
    "slug": "hattin",
    "title": "معركة حطين",
    "subtitle": "583هـ / 1187م",
    "summary": "النصر الذي مهّد لتحرير القدس.",
    "body": {},
    "metadata": { "era": "ayyubid" },
    "enabled": true,
    "timeline_year": 1187,
    "timeline_hijri": "583 هـ",
    "timeline_category": "battle",
    "timeline_glyph": "⚔️"
  }
]`,
  validate: (row, i) => {
    if (!row || typeof row !== "object") return { ok: false, error: `الصف ${i + 1}: ليس كائن JSON.` };
    const entity_type = String(row.entity_type ?? "").trim() as EncEntityType;
    if (!ENCYCLOPEDIA_TYPES.includes(entity_type)) {
      return { ok: false, error: `الصف ${i + 1}: entity_type يجب أن يكون أحد: ${ENCYCLOPEDIA_TYPES.join(", ")}.` };
    }
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!slug) return { ok: false, error: `الصف ${i + 1}: slug مطلوب.` };
    if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: `الصف ${i + 1}: slug يجب أن يكون أحرف صغيرة وأرقام و-.` };
    if (!title) return { ok: false, error: `الصف ${i + 1}: title مطلوب.` };
    const body = row.body && typeof row.body === "object" ? row.body : {};
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    // Accept snake_case (canonical) AND camelCase aliases so JSON authored
    // with either convention does not silently drop timeline fields.
    const pick = <T,>(snake: string, camel: string): T | undefined =>
      row[snake] !== undefined ? row[snake] : row[camel];
    const cat = parseStrOrNull(pick("timeline_category", "timelineCategory"));
    if (cat && !TIMELINE_CATEGORIES.includes(cat as any)) {
      return { ok: false, error: `الصف ${i + 1}: timeline_category يجب أن يكون أحد: ${TIMELINE_CATEGORIES.join(", ")}.` };
    }
    return {
      ok: true,
      row: {
        entity_type, slug, title,
        subtitle: typeof row.subtitle === "string" && row.subtitle.trim() ? row.subtitle.trim() : null,
        summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : null,
        body, metadata,
        enabled: row.enabled === false ? false : true,
        timeline_year: parseIntOrNull(pick("timeline_year", "timelineYear")),
        timeline_start_year: parseIntOrNull(pick("timeline_start_year", "timelineStartYear")),
        timeline_end_year: parseIntOrNull(pick("timeline_end_year", "timelineEndYear")),
        timeline_hijri: parseStrOrNull(pick("timeline_hijri", "timelineHijri")),
        timeline_order: parseIntOrNull(pick("timeline_order", "timelineOrder")) ?? 0,
        timeline_category: cat,
        timeline_tone: parseStrOrNull(pick("timeline_tone", "timelineTone")),
        timeline_glyph: parseStrOrNull(pick("timeline_glyph", "timelineGlyph")),
      },
    };
  },
  rowKey: r => `${r.entity_type}|${r.slug}`,
  dedupeColumns: ["entity_type", "slug"],
  buildDedupeFilter: rows => ({ slug: Array.from(new Set(rows.map(r => r.slug))) }),
  matchExisting: (e, r) => e.entity_type === r.entity_type && e.slug === r.slug,
  preview: r => (
    <div>
      <div className="text-xs text-amber-300">{r.entity_type} · {r.slug}{r.enabled ? "" : " · معطّل"}</div>
      <div className="font-medium">{r.title}{r.subtitle ? ` — ${r.subtitle}` : ""}</div>
      {r.summary && <div className="line-clamp-2 text-xs text-slate-400">{r.summary}</div>}
      {(r.timeline_year || r.timeline_start_year) && (
        <div className="mt-1 text-[10px] text-amber-200/80">
          خط زمني: {r.timeline_year
            ? `${r.timeline_year} م`
            : `${r.timeline_start_year} – ${r.timeline_end_year ?? "?"} م`}
          {r.timeline_category ? ` · ${r.timeline_category}` : ""}
        </div>
      )}
    </div>
  ),
  allowOverwrite: true,
  conflictTarget: "entity_type,slug",
  overwriteFields: [
    "title", "subtitle", "summary", "body", "metadata", "enabled",
    "timeline_year", "timeline_start_year", "timeline_end_year",
    "timeline_hijri", "timeline_order", "timeline_category",
    "timeline_tone", "timeline_glyph",
  ],
};

// ---- Investigations ----

interface InvRow {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  difficulty: string;
  reward: any;
  steps: any[];
  related_entities: any[];
  enabled: boolean;
}

const investigationsConfig: ImportConfig<InvRow> = {
  label: "investigations",
  table: "investigations",
  example: `[
  {
    "slug": "saqifah-investigation",
    "title": "ماذا حدث في السقيفة؟",
    "subtitle": "تحقيق في لحظة انتقال القيادة",
    "description": "اكشف القرائن وحدّد ما جرى في سقيفة بني ساعدة.",
    "difficulty": "easy",
    "reward": { "hearts": 2, "xp": 40, "coins": 20 },
    "related_entities": ["event:saqifah-meeting","figure:abu-bakr","landmark:saqifah-bani-saidah"],
    "steps": [
      { "type": "briefing",   "title": "بداية القضية", "text": "..." },
      { "type": "evidence",   "id": "e1", "title": "قرينة تاريخية", "text": "..." },
      { "type": "question",   "prompt": "ما الأقرب لما جرى؟", "options": ["...","..."], "correctAnswer": 1 },
      { "type": "decision",   "prompt": "ماذا تختار؟", "options": ["...","..."], "correctAnswer": 0 },
      { "type": "conclusion", "title": "الخلاصة", "text": "..." }
    ],
    "enabled": true
  }
]`,
  validate: (row, i) => {
    if (!row || typeof row !== "object") return { ok: false, error: `الصف ${i + 1}: ليس كائن JSON.` };
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!slug) return { ok: false, error: `الصف ${i + 1}: slug مطلوب.` };
    if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: `الصف ${i + 1}: slug يجب أن يكون أحرف صغيرة وأرقام و-.` };
    if (!title) return { ok: false, error: `الصف ${i + 1}: title مطلوب.` };
    const difficulty = typeof row.difficulty === "string" && row.difficulty.trim() ? row.difficulty.trim() : "easy";
    const reward = row.reward && typeof row.reward === "object" && !Array.isArray(row.reward) ? row.reward : {};
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const related = Array.isArray(row.related_entities) ? row.related_entities : [];
    const allowedStepTypes = new Set(["briefing", "evidence", "question", "decision", "conclusion"]);
    for (let s = 0; s < steps.length; s++) {
      const st = steps[s];
      if (!st || typeof st !== "object" || !allowedStepTypes.has(st.type)) {
        return { ok: false, error: `الصف ${i + 1}: الخطوة #${s + 1} نوعها غير صالح.` };
      }
      if ((st.type === "question" || st.type === "decision") && !Array.isArray(st.options)) {
        return { ok: false, error: `الصف ${i + 1}: الخطوة #${s + 1} (${st.type}) تحتاج options.` };
      }
    }
    return {
      ok: true,
      row: {
        slug, title,
        subtitle: typeof row.subtitle === "string" && row.subtitle.trim() ? row.subtitle.trim() : null,
        description: typeof row.description === "string" && row.description.trim() ? row.description.trim() : null,
        difficulty,
        reward, steps, related_entities: related,
        enabled: row.enabled === false ? false : true,
      },
    };
  },
  rowKey: (r) => `inv|${r.slug}`,
  dedupeColumns: ["slug"],
  buildDedupeFilter: (rows) => ({ slug: Array.from(new Set(rows.map((r) => r.slug))) }),
  matchExisting: (e, r) => e.slug === r.slug,
  preview: (r) => {
    const reward = r.reward ?? {};
    const qCount = r.steps.filter((s: any) => s?.type === "question" || s?.type === "decision").length;
    return (
      <div>
        <div className="text-xs text-amber-300">
          {r.slug} · {r.difficulty}{r.enabled ? "" : " · معطّل"}
        </div>
        <div className="font-medium">{r.title}{r.subtitle ? ` — ${r.subtitle}` : ""}</div>
        <div className="text-xs text-slate-400">
          {r.steps.length} خطوة · {qCount} سؤال
          {reward.hearts ? ` · ❤️${reward.hearts}` : ""}
          {reward.xp ? ` · XP+${reward.xp}` : ""}
          {reward.coins ? ` · 🪙${reward.coins}` : ""}
        </div>
      </div>
    );
  },
  allowOverwrite: true,
  conflictTarget: "slug",
  overwriteFields: ["title", "subtitle", "description", "difficulty", "reward", "steps", "related_entities", "enabled"],
};

// ============================================================
// Importer
// ============================================================

function Importer<T>({ config }: { config: ImportConfig<T> }) {
  const [raw, setRaw] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [existing, setExisting] = useState<any[]>([]);

  const parsed = useMemo(() => {
    if (!raw.trim()) return { rows: [] as T[], errors: [] as string[] };
    let data: any;
    try { data = JSON.parse(raw); } catch (e: any) { return { rows: [], errors: [`JSON غير صالح: ${e.message}`] }; }
    if (!Array.isArray(data)) return { rows: [], errors: ["يجب أن يكون JSON مصفوفة [ ... ]."] };
    const rows: T[] = [];
    const errs: string[] = [];
    data.forEach((r, i) => {
      const v = config.validate(r, i);
      if (v.ok) rows.push(v.row); else errs.push(v.error);
    });
    return { rows, errors: errs };
  }, [raw, config]);

  // Fetch existing rows for live preview status (جديد / تحديث / تخطّي)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (parsed.rows.length === 0) { setExisting([]); return; }
      const filter = config.buildDedupeFilter(parsed.rows);
      let q = supabase.from(config.table as any).select(config.dedupeColumns.join(","));
      for (const [col, vals] of Object.entries(filter)) {
        q = q.in(col, vals as any[]);
      }
      const { data } = await q;
      if (!cancelled) setExisting((data ?? []) as any[]);
    })();
    return () => { cancelled = true; };
  }, [parsed.rows, config]);

  // Compute per-row status for preview, factoring in within-batch dupes.
  const statuses = useMemo<("new" | "update" | "skip")[]>(() => {
    const seen = new Set<string>();
    return parsed.rows.map(r => {
      const k = config.rowKey(r);
      if (seen.has(k)) return "skip";
      seen.add(k);
      const isExisting = existing.some(e => config.matchExisting(e, r));
      if (!isExisting) return "new";
      return (overwrite && config.allowOverwrite) ? "update" : "skip";
    });
  }, [parsed.rows, existing, overwrite, config]);

  const counts = useMemo(() => {
    const c = { new: 0, update: 0, skip: 0 };
    for (const s of statuses) c[s]++;
    return c;
  }, [statuses]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    e.target.value = "";
  };

  const runImport = async () => {
    setBusy(true);
    setResult(null);
    setErrors([]);
    try {
      // Dedupe within batch
      const seen = new Set<string>();
      const batch: T[] = [];
      let skippedInBatch = 0;
      for (const r of parsed.rows) {
        const k = config.rowKey(r);
        if (seen.has(k)) { skippedInBatch++; continue; }
        seen.add(k);
        batch.push(r);
      }

      // Refetch existing rows (preview list may be stale)
      const filter = config.buildDedupeFilter(batch);
      let existingNow: any[] = [];
      if (batch.length > 0) {
        let q = supabase.from(config.table as any).select(config.dedupeColumns.join(","));
        for (const [col, vals] of Object.entries(filter)) {
          q = q.in(col, vals as any[]);
        }
        const { data } = await q;
        existingNow = (data ?? []) as any[];
      }

      const toInsert: T[] = [];
      const toUpdate: T[] = [];
      let skippedExisting = 0;
      for (const r of batch) {
        const isExisting = existingNow.some(e => config.matchExisting(e, r));
        if (!isExisting) toInsert.push(r);
        else if (overwrite && config.allowOverwrite) toUpdate.push(r);
        else skippedExisting++;
      }

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const rowErrors: string[] = [];

      // Insert in chunks of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error, count } = await supabase
          .from(config.table as any)
          .insert(chunk as any, { count: "exact" });
        if (error) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from(config.table as any).insert(row as any);
            if (e2) { failed++; rowErrors.push(e2.message); } else { inserted++; }
          }
        } else {
          inserted += count ?? chunk.length;
        }
      }

      // Upsert updates by conflict target — only patches allowed fields,
      // never id/created_at.
      if (toUpdate.length > 0 && config.allowOverwrite && config.conflictTarget) {
        const fields = config.overwriteFields;
        const payloads = toUpdate.map(r => {
          if (!fields) return r as any;
          // Preserve conflict-target columns plus the allowlisted update columns.
          const out: any = {};
          for (const k of config.conflictTarget!.split(",")) {
            out[k.trim()] = (r as any)[k.trim()];
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
              if (e2) { failed++; rowErrors.push(e2.message); } else { updated++; }
            }
          } else {
            updated += count ?? chunk.length;
          }
        }
      }

      setResult({
        inserted,
        updated,
        skipped: skippedInBatch + skippedExisting,
        failed,
        errors: rowErrors.slice(0, 10),
      });
    } catch (err: any) {
      setErrors([err.message ?? String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
            <Upload className="h-4 w-4" /> رفع ملف .json
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
          <button
            onClick={() => setRaw(config.example)}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >مثال</button>
          <button
            onClick={() => { setRaw(""); setResult(null); setErrors([]); }}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >مسح</button>
          <div className="ml-auto text-xs text-slate-400">الجدول: {config.label}</div>
        </div>

        {config.allowOverwrite && (
          <label className="mb-3 inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-slate-950/50 px-3 py-1.5 text-sm text-amber-100">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={e => setOverwrite(e.target.checked)}
              className="accent-amber-500"
            />
            استبدال العناصر الموجودة
            <span className="text-[11px] text-slate-400">(تحديث بنفس entity_type + slug)</span>
          </label>
        )}

        <textarea
          dir="ltr"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={12}
          placeholder='[ { ... }, { ... } ]'
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
        />
      </div>

      {(parsed.errors.length > 0 || errors.length > 0) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-semibold">أخطاء التحقق:</div>
          <ul className="mt-1 list-disc space-y-0.5 pr-5">
            {[...parsed.errors, ...errors].slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {parsed.rows.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-amber-200">معاينة ({parsed.rows.length} صف)</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">جديد: {counts.new}</span>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">تحديث: {counts.update}</span>
              <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-slate-300">تخطّي: {counts.skip}</span>
            </div>
            <button
              onClick={runImport}
              disabled={busy || parsed.rows.length === 0 || parsed.errors.length > 0}
              className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {busy ? "جارٍ الاستيراد…" : "استيراد"}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-slate-800 overflow-auto rounded-md border border-slate-800">
            {parsed.rows.slice(0, 50).map((r, i) => {
              const s = statuses[i];
              const badge =
                s === "new"
                  ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">جديد</span>
                  : s === "update"
                  ? <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">تحديث</span>
                  : <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300">تخطّي</span>;
              return (
                <li key={i} className="flex items-start gap-3 p-3 text-sm">
                  <div className="pt-0.5">{badge}</div>
                  <div className="min-w-0 flex-1">{config.preview(r)}</div>
                </li>
              );
            })}
          </ul>
          {parsed.rows.length > 50 && <p className="mt-2 text-xs text-slate-400">تُعرض أول 50 صف فقط في المعاينة.</p>}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          <div className="font-semibold">نتيجة الاستيراد:</div>
          <ul className="mt-1 pr-5 list-disc">
            <li>تم الإدراج: {result.inserted}</li>
            <li>تم التحديث: {result.updated}</li>
            <li>تم تخطّيه (مكرر): {result.skipped}</li>
            <li>فشل: {result.failed}</li>
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-2 text-xs text-destructive">
              <div className="font-semibold">عينة أخطاء:</div>
              <ul className="list-disc pr-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

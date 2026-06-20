import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowRight, BookOpen, Bell, CalendarDays, FileJson, Sword, Upload, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";

type ImportType = "daily_facts" | "today_in_history_events" | "notifications" | "campaigns" | "encyclopedia";

export const Route = createFileRoute("/admin/import")({
  head: () => ({
    meta: [
      { title: "استيراد المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { type?: ImportType } => {
    const t = s.type as string | undefined;
    if (t === "daily_facts" || t === "today_in_history_events" || t === "notifications" || t === "campaigns" || t === "encyclopedia") {
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
        </div>

        {active === "daily_facts" && <Importer key="f" config={dailyFactsConfig} />}
        {active === "today_in_history_events" && <Importer key="e" config={todayEventsConfig} />}
        {active === "notifications" && <Importer key="n" config={notificationsConfig} />}
        {active === "encyclopedia" && <Importer key="enc" config={encyclopediaConfig} />}
        {active === "campaigns" && <ComingSoon />}
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

function ComingSoon() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-slate-400">
      <FileJson className="mx-auto h-8 w-8 text-amber-400/60" />
      <h3 className="mt-3 text-lg font-semibold text-slate-200">استيراد الحملات — قريبًا</h3>
      <p className="mt-2 text-sm">قريبًا — سيتم تفعيل استيراد الحملات بعد اعتماد schema النهائي.</p>
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
    "enabled": true
  },
  {
    "entity_type": "battle",
    "slug": "hattin",
    "title": "معركة حطين",
    "subtitle": "583هـ / 1187م",
    "summary": "النصر الذي مهّد لتحرير القدس.",
    "body": {},
    "metadata": { "era": "ayyubid", "year_hijri": 583 },
    "enabled": true
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
    return {
      ok: true,
      row: {
        entity_type, slug, title,
        subtitle: typeof row.subtitle === "string" && row.subtitle.trim() ? row.subtitle.trim() : null,
        summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : null,
        body, metadata,
        enabled: row.enabled === false ? false : true,
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
    </div>
  ),
};

// ============================================================
// Importer
// ============================================================

function Importer<T>({ config }: { config: ImportConfig<T> }) {
  const [raw, setRaw] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number; failed: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

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

      // Fetch existing rows for dedupe
      const filter = config.buildDedupeFilter(batch);
      let existing: any[] = [];
      if (batch.length > 0) {
        let q = supabase.from(config.table as any).select(config.dedupeColumns.join(","));
        for (const [col, vals] of Object.entries(filter)) {
          q = q.in(col, vals as any[]);
        }
        const { data } = await q;
        existing = (data ?? []) as any[];
      }

      const toInsert: T[] = [];
      let skippedExisting = 0;
      for (const r of batch) {
        if (existing.some(e => config.matchExisting(e, r))) { skippedExisting++; continue; }
        toInsert.push(r);
      }

      let inserted = 0;
      let failed = 0;
      const rowErrors: string[] = [];
      // Insert in chunks of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error, count } = await supabase
          .from(config.table as any)
          .insert(chunk as any, { count: "exact" });
        if (error) {
          // fall back to row-by-row to attribute failures
          for (const row of chunk) {
            const { error: e2 } = await supabase.from(config.table as any).insert(row as any);
            if (e2) { failed++; rowErrors.push(e2.message); } else { inserted++; }
          }
        } else {
          inserted += count ?? chunk.length;
        }
      }

      setResult({
        inserted,
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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-amber-200">معاينة ({parsed.rows.length} صف)</h3>
            <button
              onClick={runImport}
              disabled={busy || parsed.rows.length === 0 || parsed.errors.length > 0}
              className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {busy ? "جارٍ الاستيراد…" : "استيراد"}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-slate-800 overflow-auto rounded-md border border-slate-800">
            {parsed.rows.slice(0, 50).map((r, i) => (
              <li key={i} className="p-3 text-sm">{config.preview(r)}</li>
            ))}
          </ul>
          {parsed.rows.length > 50 && <p className="mt-2 text-xs text-slate-400">تُعرض أول 50 صف فقط في المعاينة.</p>}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          <div className="font-semibold">نتيجة الاستيراد:</div>
          <ul className="mt-1 pr-5 list-disc">
            <li>تم الإدراج: {result.inserted}</li>
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

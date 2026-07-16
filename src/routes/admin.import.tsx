// ============================================================
// /admin/import — Phase 1.
//
// Multi-step import wizard. The per-type config objects below are
// preserved verbatim from the legacy importer to keep JSON contracts
// backward compatible; the UI shell is new (see ImportWizard).
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Bell,
  CalendarDays,
  Sword,
  Landmark,
  Search,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ImportWizard } from "@/components/admin/import/ImportWizard";
import {
  makeLegacyEngine,
  makeCampaignEngine,
  makeEncyclopediaEngine,
  makeInvestigationsEngine,
  type ImportConfig,
  type ImportEngine,
} from "@/lib/import/engines";
import { scoreShortEditorial } from "@/lib/import/quality";

type ImportType =
  | "daily_facts"
  | "today_in_history_events"
  | "notifications"
  | "campaigns"
  | "encyclopedia"
  | "investigations";

export const Route = createFileRoute("/admin/import")({
  head: () => ({
    meta: [
      { title: "استيراد المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { type?: ImportType } => {
    const t = s.type as string | undefined;
    if (
      t === "daily_facts" ||
      t === "today_in_history_events" ||
      t === "notifications" ||
      t === "campaigns" ||
      t === "encyclopedia" ||
      t === "investigations"
    ) {
      return { type: t };
    }
    return {};
  },
  component: () => <AdminGate><ImportPage /></AdminGate>,
});

function ImportPage() {
  const { type } = Route.useSearch();
  const [active, setActive] = useState<ImportType>(type ?? "daily_facts");
  const engine = ENGINES[active];

  return (
    <AdminLayout
      title="استيراد المحتوى"
      subtitle="تحقّق، قارِن، عالج التعارضات، ثم اعتمِد المحتوى بأمان."
      breadcrumbs={[{ label: "الاستيراد" }]}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <nav className="flex flex-wrap gap-2">
          <TypeBtn active={active === "daily_facts"} onClick={() => setActive("daily_facts")} icon={<BookOpen className="h-4 w-4" />}>معلومات يومية</TypeBtn>
          <TypeBtn active={active === "today_in_history_events"} onClick={() => setActive("today_in_history_events")} icon={<CalendarDays className="h-4 w-4" />}>أحداث تاريخية</TypeBtn>
          <TypeBtn active={active === "notifications"} onClick={() => setActive("notifications")} icon={<Bell className="h-4 w-4" />}>مسودات إشعارات</TypeBtn>
          <TypeBtn active={active === "campaigns"} onClick={() => setActive("campaigns")} icon={<Sword className="h-4 w-4" />}>حملات</TypeBtn>
          <TypeBtn active={active === "encyclopedia"} onClick={() => setActive("encyclopedia")} icon={<Landmark className="h-4 w-4" />}>الموسوعة</TypeBtn>
          <TypeBtn active={active === "investigations"} onClick={() => setActive("investigations")} icon={<Search className="h-4 w-4" />}>التحقيقات</TypeBtn>
        </nav>

        <ImportWizard key={active} engine={engine} />
      </div>
    </AdminLayout>
  );
}

function TypeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
        active
          ? "border-amber-400 bg-amber-500/10 text-amber-200"
          : "border-slate-700 text-slate-300 hover:border-slate-500"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ============================================================
// Per-type configurations (preserved from legacy /admin/import).
// Each config is wrapped in an ImportEngine adapter.
// ============================================================

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

// ---- daily_facts ----

interface DailyFactRow { title: string; body: string; deep_link: string | null; enabled: boolean }
const dailyFactsConfig: ImportConfig<DailyFactRow> = {
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
  validate: (row: any, i) => {
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
  rowKey: (r) => `${r.title}|${r.body}`,
  dedupeColumns: ["title", "body"],
  buildDedupeFilter: (rows) => ({ title: Array.from(new Set(rows.map((r) => r.title))) }),
  matchExisting: (e, r) => e.title === r.title && e.body === r.body,
  previewTitle: (r) => r.title,
  preview: (r) => (
    <div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

// ---- today_in_history_events ----

interface TodayEventRow {
  month: number; day: number; title: string; body: string;
  hijri_year: string | null; gregorian_year: string | null;
  deep_link: string | null; enabled: boolean;
}
const todayEventsConfig: ImportConfig<TodayEventRow> = {
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
  validate: (row: any, i) => {
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
  rowKey: (r) => `${r.month}-${r.day}|${r.title}`,
  dedupeColumns: ["month", "day", "title"],
  buildDedupeFilter: (rows) => ({ title: Array.from(new Set(rows.map((r) => r.title))) }),
  matchExisting: (e, r) => e.month === r.month && e.day === r.day && e.title === r.title,
  previewTitle: (r) => r.title,
  previewSubtitle: (r) => `${r.day}/${r.month}${r.hijri_year ? ` · ${r.hijri_year}` : ""}${r.gregorian_year ? ` · ${r.gregorian_year}` : ""}`,
  preview: (r) => (
    <div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

// ---- notifications ----

interface NotificationRow {
  title: string; body: string; type: string; target_type: string;
  deep_link: string | null; image_url: string | null; status: string;
}
const notificationsConfig: ImportConfig<NotificationRow> = {
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
  validate: (row: any, i) => {
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
  rowKey: (r) => `${r.title}|${r.body}|${r.status}`,
  dedupeColumns: ["title", "body", "status"],
  buildDedupeFilter: (rows) => ({ title: Array.from(new Set(rows.map((r) => r.title))) }),
  matchExisting: (e, r) => e.title === r.title && e.body === r.body && e.status === r.status,
  previewTitle: (r) => r.title,
  previewSubtitle: (r) => `${r.type} · ${r.target_type} · ${r.status}`,
  preview: (r) => (
    <div>
      <div className="font-medium">{r.title}</div>
      <div className="line-clamp-2 text-xs text-slate-400">{r.body}</div>
    </div>
  ),
};

// ---- encyclopedia_entities ----

const ENCYCLOPEDIA_TYPES = ["figure", "city", "battle", "state", "event", "landmark", "artifact"] as const;
type EncEntityType = typeof ENCYCLOPEDIA_TYPES[number];
const TIMELINE_CATEGORIES = ["caliphate", "figure", "battle", "book", "event"] as const;

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
  }
]`,
  validate: (row: any, i) => {
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
  rowKey: (r) => `${r.entity_type}|${r.slug}`,
  dedupeColumns: ["entity_type", "slug"],
  buildDedupeFilter: (rows) => ({ slug: Array.from(new Set(rows.map((r) => r.slug))) }),
  matchExisting: (e, r) => e.entity_type === r.entity_type && e.slug === r.slug,
  previewTitle: (r) => r.title,
  previewSubtitle: (r) => `${r.entity_type} · ${r.slug}${r.enabled ? "" : " · معطّل"}`,
  preview: (r) => (
    <div>
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

// ---- investigations ----

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
  validate: (row: any, i) => {
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
  previewTitle: (r) => r.title,
  previewSubtitle: (r) => `${r.slug} · ${r.difficulty}${r.enabled ? "" : " · معطّل"}`,
  preview: (r) => {
    const reward = r.reward ?? {};
    const qCount = r.steps.filter((s: any) => s?.type === "question" || s?.type === "decision").length;
    return (
      <div>
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

// ---- Campaign example ----

const CAMPAIGN_EXAMPLE = `{
  "id": "fath-makka",
  "slug": "fath-makka",
  "title": "فتح مكة",
  "subtitle": "اليوم الذي تغيّر فيه وجه الجزيرة",
  "period": "8 هـ / 630 م",
  "description": "رحلة عبر الأحداث التي مهّدت لفتح مكة.",
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
        }
      ]
    }
  ]
}`;

// ---- Engine map ----

const ENGINES: Record<ImportType, ImportEngine> = {
  daily_facts: makeLegacyEngine(dailyFactsConfig, {
    key: "daily_facts",
    label: "معلومات يومية",
    icon: <BookOpen className="h-5 w-5" />,
  }),
  today_in_history_events: makeLegacyEngine(todayEventsConfig, {
    key: "today_in_history_events",
    label: "أحداث تاريخية",
    icon: <CalendarDays className="h-5 w-5" />,
  }),
  notifications: makeLegacyEngine(notificationsConfig, {
    key: "notifications",
    label: "مسودات إشعارات",
    icon: <Bell className="h-5 w-5" />,
  }),
  encyclopedia: makeEncyclopediaEngine(encyclopediaConfig, {
    key: "encyclopedia",
    label: "الموسوعة",
    icon: <Landmark className="h-5 w-5" />,
  }),
  investigations: makeInvestigationsEngine(investigationsConfig, {
    key: "investigations",
    label: "التحقيقات",
    icon: <Search className="h-5 w-5" />,
  }),
  campaigns: makeCampaignEngine({
    label: "حملات",
    icon: <Sword className="h-5 w-5" />,
    example: CAMPAIGN_EXAMPLE,
  }),
};

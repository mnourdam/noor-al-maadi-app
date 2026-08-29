import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, BookOpen, Boxes, Compass, Database, Download,
  HardDrive, Map as MapIcon, ShieldCheck, Users, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { AdminGate, ManagerOnly } from "@/lib/admin-guard";
import {
  resolveRange, overviewQuery, contentHealthQuery, atlasQuery,
  systemHealthQuery, seriesQuery, engagementQuery,
  type RangeKey, type TimeRange,
} from "@/lib/analytics";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "مركز التحليلات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AnalyticsHome />
    </AdminGate>
  ),
});

// ── Time filter ───────────────────────────────────────────────
const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today",     label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "last_7d",   label: "7 أيام" },
  { key: "last_30d",  label: "30 يومًا" },
  { key: "last_90d",  label: "90 يومًا" },
  { key: "this_year", label: "هذه السنة" },
  { key: "all_time",  label: "منذ البداية" },
];

function TimeRangeBar({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-amber-500/20 bg-slate-900/60 p-1 text-xs">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={
            "rounded-lg px-3 py-1.5 transition-colors " +
            (value === p.key
              ? "bg-amber-400 text-slate-950 font-semibold"
              : "text-slate-300 hover:bg-slate-800")
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Atoms ──────────────────────────────────────────────────────
function Kpi({
  label, value, hint, accent,
}: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (accent
          ? "border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5"
          : "border-slate-700/50 bg-slate-900/50")
      }
    >
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={"mt-1 text-2xl font-bold " + (accent ? "text-amber-200" : "text-slate-100")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Section({
  title, icon, defaultOpen = true, children,
}: { title: string; icon: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-slate-700/50 bg-slate-900/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-amber-200">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <span className="text-xs text-slate-400">{open ? "—" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

const fmt = (n: number | null | undefined) =>
  typeof n === "number" ? new Intl.NumberFormat("en-US").format(n) : "—";

// ── Sections ───────────────────────────────────────────────────
function ProjectHealthSection({ range }: { range: TimeRange }) {
  const { data, isLoading, error } = useQuery(overviewQuery());
  const series = useQuery(seriesQuery("new_users", range));
  const active = useQuery(seriesQuery("active_users", range));

  if (isLoading) return <p className="text-xs text-slate-400">جارٍ التحميل…</p>;
  if (error) return <p className="text-xs text-red-300">تعذّر الجلب: {(error as Error).message}</p>;
  if (!data) return null;
  const u = data.users;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi label="إجمالي المسجلين" value={fmt(u.total)} accent />
        <Kpi label="متصلون الآن" value={fmt(u.online_now)} hint="آخر 5 دقائق" />
        <Kpi label="نشاط اليوم (DAU)" value={fmt(u.dau)} />
        <Kpi label="نشاط الأسبوع (WAU)" value={fmt(u.wau)} />
        <Kpi label="نشاط الشهر (MAU)" value={fmt(u.mau)} />
        <Kpi label="DAU / MAU" value={`${u.dau_mau_ratio ?? 0}%`} hint="مؤشر المداومة" />
        <Kpi label="مسجّلون جدد اليوم" value={fmt(u.new_today)} />
        <Kpi label="مسجّلون جدد · 7 أيام" value={fmt(u.new_week)} />
      </div>

      <ManagerOnly>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="ضيوف" value={fmt(u.guests)} />
          <Kpi label="محرّرون" value={fmt(u.editors)} />
          <Kpi label="مدراء" value={fmt(u.admins)} />
          <Kpi label="موقوفون" value={fmt(u.suspended)} />
          <Kpi label="معطّلون" value={fmt(u.disabled)} />
        </div>
      </ManagerOnly>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title={`مسجّلون جدد · ${range.label}`} points={series.data?.points ?? []}
          loading={series.isLoading} error={series.error as Error | null} />
        <ChartCard title={`المستخدمون النشطون · ${range.label}`} points={active.data?.points ?? []}
          loading={active.isLoading} error={active.error as Error | null} />

      </div>
    </div>
  );
}

function ChartCard({ title, points, loading, error }: {
  title: string; points: { t: string; v: number }[];
  loading?: boolean; error?: Error | null;
}) {
  const data = useMemo(
    () => points.map((p) => ({ t: new Date(p.t).toLocaleDateString("en-CA"), v: Number(p.v) })),
    [points],
  );
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">{title}</div>
      {/* Never render a failed metric as an empty/zero chart. */}
      {error ? (
        <div className="h-40 flex items-center justify-center text-center text-xs text-red-300 px-3">
          تعذّر جلب هذا المؤشر — القيمة غير متاحة (وليست صفرًا).
          <br />{error.message}
        </div>
      ) : loading ? (
        <div className="h-40 flex items-center justify-center text-xs text-slate-400">جارٍ التحميل…</div>
      ) : data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-slate-500">لا توجد بيانات لهذا النطاق.</div>
      ) : (

        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#fcd34d" }}
            />
            <Area type="monotone" dataKey="v" stroke="#fbbf24" strokeWidth={2} fill="url(#ag)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ContentHealthSection() {
  const { data, isLoading, error } = useQuery(contentHealthQuery());
  if (isLoading) return <p className="text-xs text-slate-400">جارٍ التحميل…</p>;
  if (error) return <p className="text-xs text-red-300">تعذّر الجلب.</p>;
  if (!data) return null;
  const c = data.campaigns, e = data.encyclopedia;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="الحملات" value={fmt(c.total)} accent />
        <Kpi label="منشورة" value={fmt(c.published)} />
        <Kpi label="مسودّة" value={fmt(c.draft)} />
        <Kpi label="مؤرشفة" value={fmt(c.archived)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Kpi label="الموسوعة (مفعّلة)" value={fmt(e.enabled)} accent />
        <Kpi label="شخصيات" value={fmt(e.figures)} />
        <Kpi label="مدن" value={fmt(e.cities)} />
        <Kpi label="دول/حضارات" value={fmt(e.states)} />
        <Kpi label="معارك" value={fmt(e.battles)} />
        <Kpi label="أحداث" value={fmt(e.events)} />
        <Kpi label="معالم" value={fmt(e.landmarks)} />
        <Kpi label="آثار" value={fmt(e.artifacts)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="ينقص نصّ" value={fmt(e.missing_body)} />
        <Kpi label="ينقص مصادر" value={fmt(e.missing_sources)} />
        <Kpi label="ينقص ترتيب زمني" value={fmt(e.missing_timeline_order)} />
        <Kpi label="معرّفات مكرّرة" value={fmt(data.integrity.duplicate_slugs)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="التحقيقات (مفعّلة)" value={fmt(data.investigations.enabled)} />
        <Kpi label="في مثل هذا اليوم" value={fmt(data.today_in_history.enabled)} />
        <Kpi label="الحقيقة اليومية" value={fmt(data.daily_facts.enabled)} />
      </div>
    </div>
  );
}

function AtlasSection() {
  const { data, isLoading, error } = useQuery(atlasQuery());
  if (isLoading) return <p className="text-xs text-slate-400">جارٍ التحميل…</p>;
  if (error) return <p className="text-xs text-red-300">تعذّر الجلب.</p>;
  if (!data) return null;
  const t = data.totals;
  const kindData = Object.entries(data.by_kind).map(([k, v]) => ({ name: k, value: v as number }));
  const COLORS = ["#fbbf24", "#f59e0b", "#10b981", "#3b82f6", "#a78bfa", "#ec4899", "#94a3b8"];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="تغطية الأطلس" value={`${data.coverage_pct}%`} accent
          hint={`${fmt(t.published)} من ${fmt(data.eligible_encyclopedia)}`} />
        <Kpi label="موثّق" value={fmt(t.verified)} />
        <Kpi label="منشور" value={fmt(t.published)} />
        <Kpi label="مسودّة" value={fmt(t.draft)} />
        <Kpi label="قيد المراجعة" value={fmt(t.review)} />
        <Kpi label="بحاجة موقع" value={fmt(t.needs_placement)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">حسب النوع</div>
          {kindData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-500">—</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={kindData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {kindData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">حسب الحقبة</div>
          <ul className="space-y-1 text-xs text-slate-300 max-h-44 overflow-y-auto pr-1">
            {Object.entries(data.by_era).map(([era, n]) => (
              <li key={era} className="flex justify-between border-b border-slate-800/60 py-1">
                <span>{era}</span><span className="text-amber-200">{fmt(n as number)}</span>
              </li>
            ))}
            {Object.keys(data.by_era).length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SystemHealthSection() {
  const { data, isLoading, error } = useQuery(systemHealthQuery());
  if (isLoading) return <p className="text-xs text-slate-400">جارٍ التحميل…</p>;
  if (error) return <p className="text-xs text-red-300">تعذّر الجلب.</p>;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Kpi label="روابط موسوعة مفقودة" value={fmt(data.missing_encyclopedia_links)} />
      <Kpi label="معرّفات أطلس مكرّرة" value={fmt(data.duplicate_atlas_slugs)} />
      <Kpi label="معرّفات موسوعة مكرّرة" value={fmt(data.duplicate_encyclopedia_slugs)} />
    </div>
  );
}


// ── Engagement + content performance (V16) ─────────────────────
function EngagementSection({ range }: { range: TimeRange }) {
  const { data, isLoading, error } = useQuery(engagementQuery(range));
  if (isLoading) return <p className="text-xs text-slate-400">جارٍ التحميل…</p>;
  if (error) return (
    <p className="text-xs text-red-300">
      تعذّر جلب مؤشرات التفاعل — القيم غير متاحة (وليست صفرًا): {(error as Error).message}
    </p>
  );
  if (!data) return null;
  const ev = data.events, st = data.state;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold text-amber-200">أحداث خلال النطاق المحدّد</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Kpi label="إكمال قصص" value={fmt(ev.story_completions)} hint={`${fmt(ev.story_completions_users)} لاعب`} accent />
          <Kpi label="إكمال حملات" value={fmt(ev.campaign_completions)} hint={`${fmt(ev.campaign_completions_users)} لاعب`} />
          <Kpi label="اكتشافات الموسوعة" value={fmt(ev.discoveries)} hint={`${fmt(ev.discoveries_users)} لاعب`} />
          <Kpi label="إكمال تحقيقات" value={fmt(ev.investigation_completions)} />
          <Kpi label="مقتنيات المتحف" value={fmt(ev.museum_unlocks)} />
          <Kpi label="تعليقات" value={fmt(ev.comments)} />
          <Kpi label="تفاعلات" value={fmt(ev.reactions)} />
          <Kpi label="مساهمات" value={fmt(ev.contributions)} />
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold text-slate-300">الحالة الحالية (تراكمي — لا يتأثر بالنطاق)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Kpi label="قصص قيد التقدّم" value={fmt(st.story_progress_rows)} hint={`${fmt(st.story_progress_users)} لاعب`} />
          <Kpi label="تقدّم الحملات" value={fmt(st.campaign_progress_rows)} hint={`${fmt(st.campaign_progress_users)} لاعب`} />
          <Kpi label="إجمالي إكمال القصص" value={fmt(st.story_completions_total)} />
          <Kpi label="إجمالي الاكتشافات" value={fmt(st.discoveries_total)} />
          <Kpi label="مقتنيات المتحف" value={fmt(st.museum_items)} />
          <Kpi label="تحقيقات" value={fmt(st.investigation_progress_rows)} />
          <Kpi label="تعليقات المجتمع" value={fmt(st.comments_total)} />
          <Kpi label="المساهمات" value={fmt(st.contributions_total)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RankCard title="الأكثر إكمالًا (قصص)" items={data.top_stories.map((s) => ({ title: s.title, n: s.completions ?? 0 }))} />
        <RankCard title="الأكثر لعبًا (حملات)" items={data.top_campaigns.map((c) => ({ title: c.title, n: c.players ?? 0 }))} />
        <RankCard title="الأكثر اكتشافًا (الموسوعة)" items={data.top_entities.map((e) => ({ title: e.title, n: e.discoveries ?? 0 }))} />
      </div>
    </div>
  );
}

function RankCard({ title, items }: { title: string; items: { title: string; n: number }[] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-500">لا توجد بيانات.</div>
      ) : (
        <ol className="space-y-1 text-xs text-slate-300">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-slate-800/60 py-1">
              <span className="truncate">{it.title}</span>
              <span className="shrink-0 text-amber-200">{fmt(it.n)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function QuickActionsSection() {
  const items: { to: string; label: string; icon: ReactNode }[] = [
    { to: "/admin/offline",            label: "لقطة دون اتصال",  icon: <HardDrive className="h-4 w-4" /> },
    { to: "/admin/atlas-review",       label: "مراجعة الأطلس",   icon: <MapIcon className="h-4 w-4" /> },
    { to: "/admin/content-integrity",  label: "سلامة المحتوى",   icon: <ShieldCheck className="h-4 w-4" /> },
    { to: "/admin/users",              label: "المستخدمون",      icon: <Users className="h-4 w-4" /> },
    { to: "/admin/notifications",      label: "الإشعارات",       icon: <Zap className="h-4 w-4" /> },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 hover:bg-amber-500/10 hover:border-amber-400/40 transition-colors"
        >
          {it.icon}<span>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────
function AnalyticsHome() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("last_7d");
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">مركز التحليلات</h1>
              <p className="text-xs text-slate-400">لوحة قيادة إرث — كل الأرقام مُجمَّعة من قاعدة البيانات مباشرةً.</p>
            </div>
          </div>
          <TimeRangeBar value={rangeKey} onChange={setRangeKey} />
        </header>

        <Section title="إجراءات سريعة" icon={<Zap className="h-4 w-4" />}>
          <QuickActionsSection />
        </Section>

        <Section title="صحة المشروع" icon={<Users className="h-4 w-4" />}>
          <ProjectHealthSection range={range} />
        </Section>

        <Section title="صحة المحتوى" icon={<BookOpen className="h-4 w-4" />}>
          <ContentHealthSection />
        </Section>

        <Section title="تحليلات الأطلس" icon={<Compass className="h-4 w-4" />}>
          <AtlasSection />
        </Section>

        <Section title="صحة النظام" icon={<Database className="h-4 w-4" />}>
          <SystemHealthSection />
        </Section>

        <Section title="حالة اللقطة (دون اتصال)" icon={<Download className="h-4 w-4" />} defaultOpen={false}>
          <p className="text-xs text-slate-400">
            تفاصيل اللقطة المضمّنة والمحلية متوفّرة في{" "}
            <Link to="/admin/offline" className="text-amber-300 underline">مركز اللقطة</Link>.
          </p>
        </Section>

        <Section title={`التفاعل · ${range.label}`} icon={<Boxes className="h-4 w-4" />}>
          <EngagementSection range={range} />
        </Section>

        <Section title="الاحتفاظ والأجهزة والدول" icon={<Users className="h-4 w-4" />} defaultOpen={false}>
          <div className="space-y-2 text-xs text-slate-400">
            <p className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-3">
              <span className="font-semibold text-slate-300">الاحتفاظ (D1/D7/D30): </span>
              لا تتوفر بيانات تاريخية كافية بعد — لا يوجد سجل نشاط يومي لكل لاعب
              (الموجود حاليًا آخر ظهور فقط)، لذلك لا يمكن حساب الاحتفاظ بدقة ولن يُعرض رقم تقديري.
            </p>
            <p className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-3">
              <span className="font-semibold text-slate-300">الدولة/الجهاز/المنصّة/إصدار التطبيق: </span>
              غير مُجمَّعة حاليًا في الإنتاج — تتطلّب أدوات قياس مستقبلية (Firebase Analytics).
              لن يتم استنتاجها من البريد أو الملف الشخصي.
            </p>
          </div>
        </Section>

      </div>
    </div>
  );
}

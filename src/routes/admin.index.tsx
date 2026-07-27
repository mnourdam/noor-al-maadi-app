import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Bell, BookOpen, Upload, Sword, Landmark, ShieldCheck, Database, Search, HardDrive, MapPin, Compass, Network, Hammer, Users, Gamepad2, MessagesSquare, Layers, Mail, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminHub /></AdminGate>,
});

interface Stats {
  facts: number | null;
  events: number | null;
  notifications: number | null;
  devices: number | null;
  newsletter: number | null;
  artifacts: number | null;
  artifactsUpdatedAt: string | null;
}

function AdminHub() {
  const [stats, setStats] = useState<Stats>({ facts: null, events: null, notifications: null, devices: null, newsletter: null, artifacts: null, artifactsUpdatedAt: null });

  useEffect(() => {
    (async () => {
      const opts = { count: "exact" as const, head: true };
      const [f, e, n, d, ns, art, artLast] = await Promise.all([
        supabase.from("daily_facts" as any).select("*", opts),
        supabase.from("today_in_history_events" as any).select("*", opts),
        supabase.from("notifications" as any).select("*", opts),
        supabase.from("device_tokens" as any).select("*", opts).eq("enabled", true),
        supabase.from("newsletter_subscribers" as any).select("*", opts).eq("subscribed", true),
        supabase.from("encyclopedia_entities" as any).select("*", opts).eq("entity_type", "artifact").eq("enabled", true),
        supabase.from("encyclopedia_entities" as any)
          .select("updated_at")
          .eq("entity_type", "artifact")
          .eq("enabled", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setStats({
        facts: f.count ?? 0,
        events: e.count ?? 0,
        notifications: n.count ?? 0,
        devices: d.count ?? 0,
        newsletter: ns.count ?? 0,
        artifacts: art.count ?? 0,
        artifactsUpdatedAt: (artLast?.data as { updated_at?: string } | null)?.updated_at ?? null,
      });
    })();
  }, []);


  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <ShieldCheck className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">لوحة إدارة إرث</h1>
            <p className="text-sm text-slate-400">مركز إدارة المحتوى والإشعارات والحملات</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="معلومات يومية" value={stats.facts} />
          <StatCard label="أحداث تاريخية" value={stats.events} />
          <StatCard label="إشعارات" value={stats.notifications} />
          <StatCard label="أجهزة نشطة" value={stats.devices} />
        </section>

        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-amber-300">
            <Upload className="h-4 w-4" />
            <h2 className="text-sm font-semibold">إدارة المحتوى المستقبلية</h2>
          </div>
          <p className="text-xs leading-6 text-slate-300">
            كل محتوى جديد — الموسوعة، الحملات، الإشعارات، المعلومات اليومية،
            وأحداث «في مثل هذا اليوم» — يجب إدخاله عبر{" "}
            <Link to="/admin/import" className="text-amber-300 underline">مركز الاستيراد</Link>{" "}
            باستخدام ملفات JSON معتمدة. لا تُضِف محتوى يدويًا داخل الكود.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AdminCard to="/admin/users" icon={<Users className="h-5 w-5" />} title="إدارة المستخدمين"
            desc="قائمة اللاعبين، البحث والتصفية، إجراءات إدارية موثّقة، وتصدير CSV." />
          <AdminCard to="/admin/community" icon={<MessagesSquare className="h-5 w-5" />} title="مساهمات المجتمع"
            desc="إدارة البلاغات والاقتراحات وتصحيحات المعلومات والرد على المستخدمين." />
          <AdminCard to="/admin/moderation" icon={<Flag className="h-5 w-5" />} title="طابور الإشراف"
            desc="بلاغات القرّاء على المساهمات: إخفاء، استعادة، إزالة، وسجلّ إشراف موثّق." />
          <AdminCard to="/admin/notifications" icon={<Bell className="h-5 w-5" />} title="إدارة الإشعارات"
            desc="إنشاء وإرسال إشعارات يدوية والاطلاع على المسودات." />
          <AdminCard to="/admin/newsletter" icon={<Mail className="h-5 w-5" />} title="النشرة البريدية"
            desc="اشتراكات النشرة، حالة Double Opt-In، وتصدير القوائم للإرسال عبر مزوّد خارجي."
            badge={stats.newsletter} />
          <AdminCard to="/admin/content" icon={<BookOpen className="h-5 w-5" />} title="محتوى الإشعارات التلقائية"
            desc="إدارة المعلومات اليومية وأحداث في مثل هذا اليوم." />
          <AdminCard to="/admin/import" icon={<Upload className="h-5 w-5" />} title="استيراد المحتوى"
            desc="استيراد JSON للموسوعة والحملات والإشعارات والمعلومات اليومية." />
          <AdminCard to="/admin/campaigns" icon={<Sword className="h-5 w-5" />} title="إدارة الحملات"
            desc="إدارة حملات إرث التاريخية." />
          <AdminCard to="/admin/campaign-order" icon={<Sword className="h-5 w-5" />} title="ترتيب الحملات"
            desc="تحكّم بالترتيب الزمني الذي يراه اللاعبون في صفحة الحملات." />
          <AdminCard to="/admin/games" icon={<Gamepad2 className="h-5 w-5" />} title="إدارة الألعاب"
            desc="إطار JSON للتحديات التاريخية: كلمات متقاطعة، ترتيب الأحداث، من أنا؟، الروابط، الذاكرة." />
          <AdminCard to="/admin/encyclopedia" icon={<Landmark className="h-5 w-5" />} title="إدارة الموسوعة"
            desc="إدارة مدخلات الموسوعة (شخصيات، مدن، معارك...)." />
          <AdminCard to="/admin/artifacts" icon={<Gem className="h-5 w-5" />} title="إدارة الآثار 🏺"
            desc={`مراجعة وتصحيح تصنيفات الآثار (الاسم، المعرف، النوع، الندرة) مع تصدير واستيراد.${
              stats.artifactsUpdatedAt ? ` آخر تحديث: ${new Date(stats.artifactsUpdatedAt).toLocaleDateString("ar")}` : ""
            }`}
            badge={stats.artifacts} />

          <AdminCard to="/admin/encyclopedia-report" icon={<Database className="h-5 w-5" />} title="تقرير بيانات الموسوعة"
            desc="التصنيف القياسي، آلية الروابط، بوابة الجودة، الكيانات اليتيمة، ودليل تأليف الميتاداتا." />
          <AdminCard to="/admin/taxonomy" icon={<Layers className="h-5 w-5" />} title="إدارة التصنيفات (Taxonomy)"
            desc="مصدر واحد للحقيقة لكل التصنيفات: العصور، المحاور، الدول، أنواع الكيانات — بدون تعديل الكود." />
          <AdminCard to="/admin/encyclopedia-audit" icon={<ShieldCheck className="h-5 w-5" />} title="تدقيق توحيد الموسوعة"
            desc="مكررات slug/عناوين/legacy_id، صفوف ضعيفة، تعطيل آمن." />
          <AdminCard to="/admin/canonical-duplicates" icon={<ShieldCheck className="h-5 w-5" />} title="حل المكررات القياسية"
            desc="كشف الكيانات المكررة، تعيين قياسي، إخفاء ناعم وإعادة توجيه الأطلس والحملات." />
          <AdminCard to="/admin/encyclopedia-cleanup" icon={<Landmark className="h-5 w-5" />} title="ورشة تنظيف الموسوعة"
            desc="بحث ذكي، محرر JSON، كشف مكررات، دمج آمن، تحويلات slug، أرشفة وتسجيل تدقيق." />
          <AdminCard to="/admin/content-cleanup" icon={<ShieldCheck className="h-5 w-5" />} title="تنظيف المحتوى (دفعي)"
            desc="أرشفة المكررات وإعادة ربط الأطلس بالقياسي — معاينة قبل التنفيذ." />
          <AdminCard to="/admin/exploration-path-repair" icon={<Compass className="h-5 w-5" />} title="إصلاح مسارات الاستكشاف"
            desc="إضافة related_entities إلى محاور المسارات الفارغة بناءً على بيانات Supabase فقط." />
          <AdminCard to="/admin/historical-hubs-audit" icon={<Network className="h-5 w-5" />} title="تدقيق المحاور التاريخية"
            desc="قياس قوة الربط في الرسم البياني للمحاور الكبرى — للقراءة فقط." />
          <AdminCard to="/admin/hub-builder" icon={<Hammer className="h-5 w-5" />} title="باني المحاور التاريخية"
            desc="بناء related_entities لكل محور من المرشحين الحقيقيين في Supabase." />
          <AdminCard to="/admin/cross-hub-links" icon={<Network className="h-5 w-5" />} title="روابط المحاور المتقاطعة"
            desc="ربط المحاور الكبرى ببعضها (نبوي ↔ راشدون ↔ أموي ↔ ...) داخل related_entities." />


          <AdminCard to="/admin/investigations" icon={<Search className="h-5 w-5" />} title="إدارة التحقيقات"
            desc="تحقيقات تاريخية قابلة للعب من Supabase." />
          <AdminCard to="/admin/investigation-rewards" icon={<ShieldCheck className="h-5 w-5" />} title="مطابقة مكافآت التحقيقات"
            desc="أداة صيانة آمنة: تمنح المكافآت المفقودة للتحقيقات المنجزة دون تكرار المنح." />

          <AdminCard to="/admin/crash-diagnostics" icon={<AlertTriangle className="h-5 w-5" />} title="تشخيص الأعطال"
            desc="سجل محلي لآخر الأعطال الفادحة وحالة التنقل، مع إعادة ضبط آمنة." />

          <AdminCard to="/admin/stories" icon={<BookOpen className="h-5 w-5" />} title="إدارة القصص"
            desc="إنشاء وتحرير ونشر القصص التاريخية والمشاهد والوسائط." />
          <AdminCard to="/admin/map" icon={<MapPin className="h-5 w-5" />} title="إدارة الخريطة"
            desc="إدارة المواقع والإحداثيات الجغرافية لعالم إرث." />
          <AdminCard to="/admin/atlas-entities" icon={<MapPin className="h-5 w-5" />} title="كيانات الأطلس (Phase 1)"
            desc="إنشاء وتأكيد ونشر كيانات الأطلس على رسم v1." />
          <AdminCard to="/admin/atlas-import" icon={<Upload className="h-5 w-5" />} title="استيراد دفعات الأطلس (Phase 2.5)"
            desc="استيراد JSON جماعي لكيانات الأطلس — يحفظ الصفوف كقيد مراجعة دون نشر." />
          <AdminCard to="/admin/atlas-review" icon={<MapPin className="h-5 w-5" />} title="مراجعة الأطلس الجماعية"
            desc="سحب وتأكيد ونشر كيانات المراجعة على الأطلس من شاشة واحدة." />
          <AdminCard to="/admin/atlas-repair" icon={<ShieldCheck className="h-5 w-5" />} title="إصلاح روابط الأطلس"
            desc="ربط دبابيس الأطلس بكيانات الموسوعة القياسية — اقتراح ومراجعة وإصلاح." />


          <AdminCard to="/admin/migration" icon={<Database className="h-5 w-5" />} title="ترحيل المحتوى القديم"
            desc="نسخ data.ts / cities.ts / packs إلى Supabase دون حذف." />
          <AdminCard to="/admin/offline" icon={<HardDrive className="h-5 w-5" />} title="لقطة المحتوى دون اتصال"
            desc="توليد لقطة JSON موحّدة وتخزينها محليًا (Phase 1)." />
          <AdminCard to="/admin/offline-diagnostics" icon={<ShieldCheck className="h-5 w-5" />} title="تشخيص العمل دون اتصال"
            desc="حالة الاتصال، مصدر البيانات، عدّادات المجموعات، كاش الصور، ومزامنة يدوية — للاختبار على APK." />
        </section>


      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4 shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-amber-300">{value ?? "…"}</div>
    </div>
  );
}

function AdminCard({
  to, icon, title, desc, comingSoon, badge,
}: { to?: string; icon: React.ReactNode; title: string; desc: string; comingSoon?: boolean; badge?: number | null }) {
  const body = (
    <div className={`group h-full rounded-xl border p-5 transition ${
      comingSoon
        ? "border-slate-700 bg-slate-900/40 opacity-60"
        : "border-amber-500/30 bg-slate-900/60 hover:border-amber-400 hover:bg-slate-900"
    }`}>
      <div className="mb-2 flex items-center gap-2 text-amber-300">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
        {comingSoon && <span className="ml-auto rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">قريبًا</span>}
        {!comingSoon && typeof badge === "number" && (
          <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-200">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-400">{desc}</p>
    </div>
  );
  if (comingSoon || !to) return body;
  return <Link to={to as any}>{body}</Link>;
}

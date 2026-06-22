import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BookOpen, Upload, Sword, Landmark, ShieldCheck, Database, Search, HardDrive, MapPin } from "lucide-react";
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
}

function AdminHub() {
  const [stats, setStats] = useState<Stats>({ facts: null, events: null, notifications: null, devices: null });

  useEffect(() => {
    (async () => {
      const opts = { count: "exact" as const, head: true };
      const [f, e, n, d] = await Promise.all([
        supabase.from("daily_facts" as any).select("*", opts),
        supabase.from("today_in_history_events" as any).select("*", opts),
        supabase.from("notifications" as any).select("*", opts),
        supabase.from("device_tokens" as any).select("*", opts).eq("enabled", true),
      ]);
      setStats({
        facts: f.count ?? 0,
        events: e.count ?? 0,
        notifications: n.count ?? 0,
        devices: d.count ?? 0,
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
          <AdminCard to="/admin/notifications" icon={<Bell className="h-5 w-5" />} title="إدارة الإشعارات"
            desc="إنشاء وإرسال إشعارات يدوية والاطلاع على المسودات." />
          <AdminCard to="/admin/content" icon={<BookOpen className="h-5 w-5" />} title="محتوى الإشعارات التلقائية"
            desc="إدارة المعلومات اليومية وأحداث في مثل هذا اليوم." />
          <AdminCard to="/admin/import" icon={<Upload className="h-5 w-5" />} title="استيراد المحتوى"
            desc="استيراد JSON للموسوعة والحملات والإشعارات والمعلومات اليومية." />
          <AdminCard to="/admin/campaigns" icon={<Sword className="h-5 w-5" />} title="إدارة الحملات"
            desc="إدارة حملات إرث التاريخية." />
          <AdminCard to="/admin/encyclopedia" icon={<Landmark className="h-5 w-5" />} title="إدارة الموسوعة"
            desc="إدارة مدخلات الموسوعة (شخصيات، مدن، معارك...)." />
          <AdminCard to="/admin/investigations" icon={<Search className="h-5 w-5" />} title="إدارة التحقيقات"
            desc="تحقيقات تاريخية قابلة للعب من Supabase." />
          <AdminCard to="/admin/migration" icon={<Database className="h-5 w-5" />} title="ترحيل المحتوى القديم"
            desc="نسخ data.ts / cities.ts / packs إلى Supabase دون حذف." />
          <AdminCard to="/admin/offline" icon={<HardDrive className="h-5 w-5" />} title="لقطة المحتوى دون اتصال"
            desc="توليد لقطة JSON موحّدة وتخزينها محليًا (Phase 1)." />
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
  to, icon, title, desc, comingSoon,
}: { to?: string; icon: React.ReactNode; title: string; desc: string; comingSoon?: boolean }) {
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
      </div>
      <p className="text-sm text-slate-400">{desc}</p>
    </div>
  );
  if (comingSoon || !to) return body;
  return <Link to={to as any}>{body}</Link>;
}

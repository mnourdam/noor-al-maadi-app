import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Map, Swords, Users, Landmark, ScrollText, Compass, GitBranch, Library, Shield, FileText, Lock, ExternalLink } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import irthIcon from "@/assets/irth-icon.png.asset.json";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "حول إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "description", content: "إرث مشروع عربي يقدّم التاريخ الإسلامي بطريقة تفاعلية حديثة عبر الشخصيات والدول والمعارك والمدن والأحداث." },
      { property: "og:title", content: "حول إرث" },
      { property: "og:description", content: "مشروع عربي لتقديم التاريخ الإسلامي بطريقة تفاعلية حديثة تجمع بين المعرفة والاستكشاف." },
    ],
  }),
  component: AboutPage,
});

const FEATURES = [
  { icon: Swords, label: "الحملات التاريخية" },
  { icon: Map, label: "الخريطة التفاعلية" },
  { icon: Users, label: "الشخصيات التاريخية" },
  { icon: Compass, label: "المعارك" },
  { icon: Landmark, label: "المدن" },
  { icon: Library, label: "المتحف والمقتنيات" },
  
  { icon: GitBranch, label: "شبكة العلاقات التاريخية" },
];

function AboutPage() {
  return (
    <AppShell>
      <Screen title="حول إرث" subtitle="رحلة عبر التاريخ الإسلامي">
        {/* Hero identity */}
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-6 text-center shadow-elegant">
          <div className="particle-field" />
          <div className="relative mx-auto flex size-28 items-center justify-center overflow-hidden rounded-3xl border border-gold/30 bg-background shadow-gold">
            <img src={irthIcon.url} alt="شعار إرث" className="size-full object-cover" />
          </div>
          <h2 className="font-display mt-4 text-3xl font-bold text-gold">إرث</h2>
          <p className="mt-1 text-xs text-muted-foreground">رحلة عبر التاريخ الإسلامي</p>
          <div className="ornament-divider mt-4" />
        </div>

        {/* Description */}
        <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-surface p-4 text-sm leading-7 text-foreground/90">
          <p>
            إرث مشروع عربي يهدف إلى تقديم التاريخ الإسلامي بطريقة تفاعلية حديثة تجمع بين المعرفة والاستكشاف.
          </p>
          <p>
            يتيح التطبيق استكشاف الشخصيات والدول والمعارك والمدن والأحداث التاريخية ضمن شبكة مترابطة تساعد على فهم السياق التاريخي بصورة أعمق.
          </p>
          <p>
            يعتمد المشروع على بناء موسوعة تاريخية متنامية تستند إلى مصادر معتبرة، مع تطوير حملات تفاعلية وتجارب تعليمية تجعل التاريخ أكثر قرباً ووضوحاً للمستخدم.
          </p>
        </div>

        {/* Producer */}
        <div className="mt-5 rounded-2xl border border-gold/25 bg-gradient-gold/10 p-4 text-sm leading-7">
          <p className="font-display text-sm font-bold text-gold">إرث من إنتاج فريق دسر</p>
          <p className="mt-2 text-foreground/85">
            إرث مشروع معرفي تفاعلي من إنتاج فريق دسر، يهدف إلى تقديم التاريخ الإسلامي والعربي بطريقة حديثة تجمع بين الموسوعة، الخرائط، الحملات، التحديات، والرحلة التعليمية الممتعة.
          </p>
          <a
            href="https://www.dosur1444.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-gold underline-offset-4 hover:underline"
          >
            www.dosur1444.com
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Features */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] text-gold">الميزات الحالية</p>
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-surface p-3">
                <div className="grid size-8 place-items-center rounded-xl bg-gold/15 text-gold">
                  <Icon className="size-4" />
                </div>
                <p className="font-display text-[12px] font-bold text-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust links */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] text-gold">الثقة والخصوصية</p>
          <div className="grid grid-cols-3 gap-2">
            <Link to="/privacy" className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-surface p-3 text-center">
              <Shield className="size-4 text-gold" />
              <span className="text-[11px]">الخصوصية</span>
            </Link>
            <Link to="/terms" className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-surface p-3 text-center">
              <FileText className="size-4 text-gold" />
              <span className="text-[11px]">الشروط</span>
            </Link>
            <Link to="/security" className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-surface p-3 text-center">
              <Lock className="size-4 text-gold" />
              <span className="text-[11px]">الأمان</span>
            </Link>
          </div>
        </div>

        {/* Explore */}
        <Link
          to="/"
          className="mt-5 flex items-center justify-between rounded-2xl border border-gold/25 bg-gradient-gold/10 p-4"
        >
          <div>
            <p className="font-display text-sm font-bold text-gold">ابدأ الرحلة</p>
            <p className="text-[11px] text-muted-foreground">عُد إلى عالم إرث وتابع الاستكشاف</p>
          </div>
          <ChevronRight className="size-5 rotate-180 text-gold" />
        </Link>

        {/* Footer */}
        <div className="mt-6 mb-2 text-center text-[11px] text-muted-foreground">
          <p>الإصدار 1.0</p>
          <p className="mt-1">Irth Historical Project</p>
        </div>
      </Screen>
    </AppShell>
  );
}
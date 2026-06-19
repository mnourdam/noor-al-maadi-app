import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ChevronRight } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شروط الاستخدام — إرث" },
      { name: "description", content: "الشروط الأساسية لاستخدام تطبيق إرث للمحتوى التاريخي التفاعلي." },
    ],
  }),
  component: TermsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-surface p-4">
      <h2 className="font-display mb-2 text-sm font-bold text-gold">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-foreground/90">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <AppShell>
      <Screen title="شروط الاستخدام" subtitle="استخدام تطبيق إرث">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
            <FileText className="size-6" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            هذه الشروط يحرّرها فريق دسر، وتُحدَّث من حين لآخر مع تطوّر المشروع.
          </p>
        </div>

        <Section title="غرض التطبيق">
          <p>إرث منصة تعليمية وترفيهية لاستكشاف التاريخ الإسلامي والعربي عبر الموسوعة والخرائط والحملات والتحديات.</p>
        </Section>

        <Section title="الحساب والمسؤولية">
          <ul className="list-disc pr-5 space-y-1">
            <li>عند إنشاء حساب، أنت مسؤول عن صحة بياناتك وسرية كلمة المرور.</li>
            <li>يُمنع انتحال شخصية الآخرين أو استخدام أسماء مستخدمين مسيئة.</li>
            <li>يحق للفريق إيقاف الحسابات المخالفة لحماية باقي المستخدمين.</li>
          </ul>
        </Section>

        <Section title="المحتوى التاريخي">
          <p>نسعى لتقديم محتوى تاريخي دقيق مستند إلى مصادر معتبرة، لكنه يبقى لأغراض تعليمية وقد يُحدَّث باستمرار.</p>
        </Section>

        <Section title="الاستخدام الاجتماعي">
          <p>ميزات الأصدقاء والإحالات اختيارية. يُمنع استخدامها للتسويق غير المرغوب أو خداع المستخدمين الجدد.</p>
        </Section>

        <Section title="إنهاء الخدمة">
          <p>يحق لك حذف حسابك في أي وقت. كما يحق للفريق تعديل أو إيقاف أجزاء من الخدمة عند الضرورة، مع الحرص على إشعار المستخدمين قدر الإمكان.</p>
        </Section>

        <Section title="التواصل">
          <p>لأي استفسار أو ملاحظة:{" "}
            <a href="https://www.dosur1444.com" target="_blank" rel="noopener noreferrer" className="text-gold underline-offset-4 hover:underline">www.dosur1444.com</a>
          </p>
        </Section>

        <Link to="/about" className="mt-5 flex items-center justify-between rounded-2xl border border-gold/25 bg-gradient-gold/10 p-4">
          <div>
            <p className="font-display text-sm font-bold text-gold">عودة إلى حول إرث</p>
            <p className="text-[11px] text-muted-foreground">تعرّف أكثر على المشروع</p>
          </div>
          <ChevronRight className="size-5 rotate-180 text-gold" />
        </Link>
      </Screen>
    </AppShell>
  );
}
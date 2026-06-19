import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, ChevronRight } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — إرث" },
      { name: "description", content: "كيف يتعامل تطبيق إرث مع بياناتك: ما يُخزَّن، ولماذا، وكيف تبقى آمناً." },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-surface p-4">
      <h2 className="font-display mb-2 text-sm font-bold text-gold">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-foreground/90">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <AppShell>
      <Screen title="سياسة الخصوصية" subtitle="بياناتك في إرث">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
            <Shield className="size-6" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            هذه الصفحة يحرّرها فريق دسر لشرح كيفية تعامل تطبيق إرث مع بياناتك.
          </p>
        </div>

        <Section title="البيانات التي نخزّنها">
          <ul className="list-disc pr-5 space-y-1">
            <li>اسم المستخدم والبريد الإلكتروني عند إنشاء حساب.</li>
            <li>تقدّمك في الحملات والتحديات والاكتشافات.</li>
            <li>إحصاءات اللعب: المستوى، النقاط، السلسلة، الإنجازات.</li>
            <li>رمز الإحالة الخاص بك إن استخدمته أو شاركته.</li>
          </ul>
        </Section>

        <Section title="لماذا نستخدم الحسابات">
          <p>الحساب يتيح حفظ التقدم سحابياً ومزامنته بين أجهزتك، إضافة إلى الميزات الاجتماعية الاختيارية مثل الأصدقاء والإحالات.</p>
          <p>اللعب كضيف ممكن، ويبقى التقدم محلياً على جهازك فقط.</p>
        </Section>

        <Section title="حماية البريد الإلكتروني">
          <p>عنوان بريدك الإلكتروني لا يظهر لأي مستخدم آخر. الصفحات العامة (الملف الشخصي، الأصدقاء، المقارنات، الإحالات) لا تكشف عن البريد إطلاقاً.</p>
          <p>تستطيع رؤية بريدك أنت فقط من إعدادات حسابك.</p>
        </Section>

        <Section title="ماذا يظهر علناً">
          <ul className="list-disc pr-5 space-y-1">
            <li>اسم المستخدم، اللقب، المستوى، النقاط.</li>
            <li>السلسلة، الحملات المُكتملة، نسبة الاكتشاف.</li>
            <li>الدولة المفضّلة والشخصية المفضّلة (إن اخترتها).</li>
          </ul>
        </Section>

        <Section title="مسؤولية المستخدم">
          <p>أنت مسؤول عن حماية كلمة المرور وعدم مشاركتها. أبلغنا فوراً إذا اشتبهت في وصول غير مصرّح به لحسابك.</p>
        </Section>

        <Section title="التواصل">
          <p>لأي استفسار يخصّ الخصوصية، يمكنك التواصل عبر موقع الفريق:{" "}
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
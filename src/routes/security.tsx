import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, ChevronRight, ShieldCheck, KeyRound, Database, Mail } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "الأمان — إرث" },
      { name: "description", content: "كيف يحمي إرث حسابك وبياناتك: المصادقة، حماية البريد، وحفظ التقدم السحابي." },
    ],
  }),
  component: SecurityPage,
});

function Item({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-xl bg-gold/15 text-gold">
          <Icon className="size-4" />
        </div>
        <h2 className="font-display text-sm font-bold text-gold">{title}</h2>
      </div>
      <div className="text-sm leading-7 text-foreground/90">{children}</div>
    </section>
  );
}

function SecurityPage() {
  return (
    <AppShell>
      <Screen title="الأمان" subtitle="حماية حسابك وبياناتك">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
            <Lock className="size-6" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            هذه الصفحة يحرّرها فريق دسر لتوضيح الإجراءات الأمنية المُفعَّلة في إرث. ليست شهادة استقلالية.
          </p>
        </div>

        <Item icon={ShieldCheck} title="المصادقة">
          يستخدم إرث نظام مصادقة قياسي بالبريد وكلمة المرور. الجلسات مُؤمّنة برموز توصول مُجدَّدة تلقائياً ولا تُحفَظ كلمة المرور بصيغة مقروءة.
        </Item>

        <Item icon={Mail} title="حماية البريد الإلكتروني">
          البريد الإلكتروني لا يظهر لأي مستخدم آخر. صفحات الملف العام والأصدقاء والإحالات والمقارنات تُقدِّم فقط الأعمدة العامة الآمنة (الاسم، المستوى، النقاط، الإحصاءات).
        </Item>

        <Item icon={Database} title="حفظ التقدم سحابياً">
          عند تسجيل الدخول يُرفع تقدمك إلى قاعدة بيانات محمية بسياسات صارمة، وتقرأ بياناتك من جهازك فقط. تطبيق صلاحيات على مستوى الصفوف يضمن أن لا يطّلع أحد على بيانات حساب غيره.
        </Item>

        <Item icon={KeyRound} title="مسؤولية المستخدم">
          استخدم كلمة مرور قوية ولا تشاركها. عند الاشتباه بأي وصول غير مصرَّح به، سجّل الخروج من جميع الأجهزة وغيّر كلمة المرور فوراً. أبلغنا إن لاحظت أي خلل أمني.
        </Item>

        <Item icon={Lock} title="التواصل الأمني">
          للإبلاغ عن مشكلة أمنية، تواصل مع فريق دسر عبر:{" "}
          <a href="https://www.dosur1444.com" target="_blank" rel="noopener noreferrer" className="text-gold underline-offset-4 hover:underline">www.dosur1444.com</a>
        </Item>

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
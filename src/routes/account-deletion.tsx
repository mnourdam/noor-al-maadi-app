import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, Mail, ShieldCheck } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

const SUPPORT_EMAIL = "info@dosur1444.com";

export const Route = createFileRoute("/account-deletion")({
  head: () => ({
    meta: [
      { title: "حذف الحساب — إرث" },
      { name: "description", content: "كيفية حذف حسابك في تطبيق إرث نهائيًا، وما البيانات التي تُحذف، وكيفية طلب الحذف إذا تعذّر الوصول إلى حسابك." },
      { property: "og:title", content: "حذف الحساب — إرث" },
      { property: "og:description", content: "خطوات حذف حساب إرث نهائيًا وطلب الحذف عبر الدعم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountDeletionPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-surface p-4">
      <h2 className="font-display mb-2 text-sm font-bold text-gold">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-foreground/90">{children}</div>
    </section>
  );
}

function AccountDeletionPage() {
  const subject = encodeURIComponent("طلب حذف حساب — تطبيق إرث");
  const body = encodeURIComponent(
    "البريد الإلكتروني المرتبط بالحساب:\nاسم المستخدم (إن وُجد):\nسبب تعذّر الحذف من داخل التطبيق:\n\nأؤكد أنني مالك هذا الحساب وأطلب حذفه نهائيًا.",
  );

  return (
    <AppShell>
      <Screen title="حذف الحساب" subtitle="تطبيق إرث — Irth (app.lovable.irth)">
        <div className="rounded-3xl border border-rose-500/25 bg-surface p-5 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
            <Trash2 className="size-6" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            هذه الصفحة توضّح كيفية حذف حسابك في تطبيق «إرث» نهائيًا، وما البيانات التي تُحذف.
          </p>
        </div>

        <Section title="الحذف من داخل التطبيق (الطريقة الموصى بها)">
          <ol className="list-decimal space-y-1 pr-5">
            <li>افتح تطبيق إرث وسجّل الدخول إلى حسابك.</li>
            <li>انتقل إلى «الملف الشخصي» ثم تبويب «الإعدادات».</li>
            <li>مرّر إلى قسم «منطقة الخطر» واضغط «حذف الحساب نهائيًا».</li>
            <li>اقرأ التحذير، ثم اكتب عبارة التأكيد «حذف حسابي».</li>
            <li>اضغط «حذف حسابي نهائيًا». يتم الحذف فورًا ويُسجَّل خروجك تلقائيًا.</li>
          </ol>
          <p className="text-xs text-muted-foreground">لا يحتاج الحذف إلى أي تدخل من فريق الدعم.</p>
          <Link to="/profile" search={{ tab: "settings" }} className="inline-block rounded-full border border-gold/30 px-4 py-1.5 text-xs font-bold text-gold">
            فتح إعدادات الملف الشخصي
          </Link>
        </Section>

        <Section title="البيانات التي تُحذف نهائيًا">
          <ul className="list-disc space-y-1 pr-5">
            <li>الحساب وبيانات تسجيل الدخول (البريد الإلكتروني والهويات المرتبطة مثل Google).</li>
            <li>الملف الشخصي: الاسم، اسم المستخدم، النبذة، الشعار المختار.</li>
            <li>التقدم في الحملات والقصص والتحقيقات والألعاب اليومية.</li>
            <li>الخبرة (XP) والمستوى والإنجازات والألقاب.</li>
            <li>الاكتشافات ومقتنيات المتحف والمجموعات.</li>
            <li>الدنانير والقلوب والستريك ومكافآته.</li>
            <li>رموز الأجهزة (Device tokens) وتفضيلات الإشعارات وسجلات الإشعارات الشخصية.</li>
            <li>الانعكاسات والملاحظات الشخصية.</li>
            <li>رسائل الدعم والملاحظات التي أرسلتها، وتعليقاتك وتفاعلاتك.</li>
            <li>الاشتراك في النشرة البريدية.</li>
            <li>النسخ السحابية للتقدّم (Cloud saves).</li>
          </ul>
        </Section>

        <Section title="بيانات لا تُحذف">
          <p>
            المحتوى العام الذي لا تملكه وحدك — مثل القصص والحملات ومداخل الموسوعة والأطلس المنشورة — يبقى منشورًا، لكن تُزال أي صلة بينه وبين حسابك (لا يبقى أي معرّف شخصي مرتبط به).
          </p>
        </Section>

        <Section title="مدة التنفيذ والاحتفاظ القانوني">
          <ul className="list-disc space-y-1 pr-5">
            <li>الحذف من داخل التطبيق يتم فورًا (خلال ثوانٍ).</li>
            <li>طلبات الحذف عبر البريد تُنفَّذ خلال 30 يومًا كحد أقصى بعد التحقق من ملكية الحساب.</li>
            <li>قد تبقى نسخ احتياطية مشفّرة للنظام لمدة تصل إلى 30 يومًا قبل أن تُستبدل تلقائيًا.</li>
            <li>قد نحتفظ بسجلات تقنية وأمنية مجهولة الهوية (بدون معرّفات شخصية) لأغراض منع إساءة الاستخدام.</li>
          </ul>
        </Section>

        <Section title="طلب حذف عند تعذّر الوصول إلى الحساب">
          <p>
            إذا لم تستطع تسجيل الدخول، أرسل طلبًا من البريد الإلكتروني المرتبط بالحساب متضمنًا: البريد الإلكتروني، اسم المستخدم إن وُجد، وسبب تعذّر الحذف من داخل التطبيق. نتحقق من ملكية الحساب قبل التنفيذ.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            <Mail className="size-4" /> إرسال طلب حذف إلى {SUPPORT_EMAIL}
          </a>
        </Section>

        <Section title="الدعم والخصوصية">
          <p className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4 text-gold" />
            للاستفسارات: <a className="text-gold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
          <p>
            راجع أيضًا <Link to="/privacy" className="text-gold underline">سياسة الخصوصية</Link> و<Link to="/terms" className="text-gold underline">شروط الاستخدام</Link>.
          </p>
        </Section>
      </Screen>
    </AppShell>
  );
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, ChevronRight, Languages, Trash2 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

const LAST_UPDATED_ISO = "2026-07-31";
const SUPPORT_EMAIL = "info@dosur1444.com";
const OWNER_SITE = "https://www.dosur1444.com";
const PACKAGE_ID = "app.lovable.irth";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — إرث | Privacy Policy" },
      {
        name: "description",
        content:
          "سياسة خصوصية تطبيق إرث (عربي/English): البيانات التي نجمعها، أغراضها، الخدمات الخارجية، الاحتفاظ، حذف الحساب، وحقوق المستخدم.",
      },
      { property: "og:title", content: "سياسة الخصوصية — إرث | Privacy Policy" },
      {
        property: "og:description",
        content: "كيف يتعامل تطبيق إرث مع بياناتك: الجمع، التخزين، الخدمات الخارجية، الاحتفاظ، وحذف الحساب.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

// ---------------------------------------------------------------------------
// Policy content — the Arabic and English versions are semantically identical.
// Every statement below reflects the current implementation of the app.
// ---------------------------------------------------------------------------

type Block = { p: string } | { ul: string[] };
type PolicySection = { id: string; title: string; blocks: Block[] };

const AR: PolicySection[] = [
  {
    id: "owner",
    title: "1. هوية الجهة المالكة والتواصل",
    blocks: [
      {
        p: `تطبيق «إرث» (Irth) — معرّف الحزمة ${PACKAGE_ID} — تملكه وتشغّله «دسر» (Dosur)، وهي الجهة المسؤولة عن معالجة البيانات (Data Controller).`,
      },
      {
        ul: [
          `الموقع الرسمي: ${OWNER_SITE}`,
          `بريد التواصل وطلبات الخصوصية: ${SUPPORT_EMAIL}`,
          `تاريخ آخر تحديث: ${LAST_UPDATED_ISO}`,
        ],
      },
      {
        p: "لغة السياسة الأصلية هي العربية، والنسخة الإنجليزية ترجمة مطابقة في المعنى.",
      },
    ],
  },
  {
    id: "collected",
    title: "2. البيانات التي نجمعها",
    blocks: [
      { p: "أ) بيانات الحساب (عند إنشاء حساب فقط):" },
      {
        ul: [
          "البريد الإلكتروني (عبر التسجيل بالبريد وكلمة المرور أو عبر تسجيل الدخول بحساب Google).",
          "معرّف حساب داخلي فريد (UUID).",
          "الاسم المعروض واسم المستخدم والنبذة الشخصية والشعار (Emblem) المختار — كلها اختيارية وأنت من يحدّدها.",
        ],
      },
      { p: "ب) بيانات اللعب والتقدّم:" },
      {
        ul: [
          "التقدّم في الحملات والقصص والتحقيقات والألعاب اليومية.",
          "الخبرة (XP) والمستوى والدنانير والقلوب وسلسلة الأيام (Streak).",
          "الإنجازات والألقاب والاكتشافات ومقتنيات المتحف.",
          "الانعكاسات والملاحظات الشخصية التي تكتبها داخل التطبيق.",
          "النسخ السحابية للتقدّم لمزامنته بين أجهزتك.",
        ],
      },
      { p: "ج) بيانات المحتوى الاجتماعي (اختيارية بالكامل):" },
      {
        ul: [
          "الصداقات وطلبات الصداقة.",
          "التعليقات والتفاعلات والمساهمات على المحتوى.",
          "بلاغات المحتوى غير المناسب.",
        ],
      },
      { p: "د) الإشعارات:" },
      {
        ul: [
          "رمز جهاز الإشعارات (FCM token) ونوع المنصة (Android) وحالة تفعيل الإشعارات وتاريخ آخر استخدام للجهاز.",
          "تفضيلات الإشعارات وسجلّ الإشعارات التي أُرسلت إليك.",
        ],
      },
      { p: "هـ) الدعم والمراسلات:" },
      {
        ul: [
          "رسائل الدعم والملاحظات التي ترسلها داخل التطبيق.",
          "الاشتراك في النشرة البريدية إن اخترته، وسجلّ إرسال البريد (حالة التسليم) وحالات إلغاء الاشتراك.",
        ],
      },
      { p: "و) بيانات تقنية محدودة:" },
      {
        ul: [
          "معرّف تثبيت محلي (Device ID) يُنشأ داخل التطبيق لفصل بيانات وضع الضيف، ولا يُستخدم للتتبّع الإعلاني.",
          "سجلات تشغيلية وأمنية قصيرة الأجل لدى مزوّدي البنية التحتية (مثل عناوين IP في سجلات الخادم) لأغراض الأمان ومنع إساءة الاستخدام.",
        ],
      },
    ],
  },
  {
    id: "not-collected",
    title: "3. البيانات التي لا نجمعها",
    blocks: [
      {
        ul: [
          "لا نجمع الموقع الجغرافي (GPS) ولا نطلب إذن الموقع.",
          "لا نستخدم الكاميرا ولا الميكروفون ولا نطلب أذوناتهما.",
          "لا نقرأ جهات الاتصال ولا الرسائل ولا سجلّ المكالمات ولا ملفات جهازك.",
          "لا نرفع صورًا شخصية؛ صورة الملف الشخصي هي شعار جاهز من مكتبة التطبيق فقط.",
          "لا نجمع بيانات صحية ولا مالية ولا معلومات دفع (لا توجد مشتريات داخل التطبيق).",
          "لا نستخدم معرّف الإعلان (Advertising ID) ولا أي تتبّع إعلاني أو ملفات تعريف إعلانية.",
          "لا نجمع بيانات تحليلات سلوكية لطرف ثالث ولا نستخدم Google Analytics أو Firebase Analytics.",
        ],
      },
    ],
  },
  {
    id: "purposes",
    title: "4. أغراض جمع البيانات",
    blocks: [
      {
        ul: [
          "تشغيل التطبيق وحفظ تقدّمك ومزامنته بين أجهزتك.",
          "إدارة الحساب والمصادقة وحماية الدخول.",
          "تشغيل الميزات الاجتماعية الاختيارية (الأصدقاء، المقارنات، التعليقات).",
          "إرسال الإشعارات والتذكيرات التي وافقت عليها.",
          "الرد على رسائل الدعم وتحسين المحتوى التاريخي وتصحيح الأخطاء.",
          "حماية النظام من إساءة الاستخدام والاحتيال، وضمان استقرار الخدمة.",
        ],
      },
      {
        p: "الأساس القانوني (وفق GDPR حيث ينطبق): تنفيذ العقد (تشغيل الحساب والخدمة)، والموافقة (الإشعارات والنشرة البريدية والميزات الاجتماعية)، والمصلحة المشروعة (الأمان ومنع إساءة الاستخدام وتحسين الخدمة).",
      },
    ],
  },
  {
    id: "storage",
    title: "5. كيفية التخزين والتشفير",
    blocks: [
      {
        ul: [
          "تُخزَّن بيانات الحساب والتقدّم في قاعدة بيانات مُدارة (Supabase عبر Lovable Cloud) محمية بسياسات وصول على مستوى الصف (Row Level Security) تمنع أي مستخدم من قراءة بيانات مستخدم آخر.",
          "جميع الاتصالات بين التطبيق والخوادم تتم عبر HTTPS/TLS (تشفير أثناء النقل).",
          "البيانات مشفّرة أثناء التخزين لدى مزوّد البنية التحتية (Encryption at rest).",
          "كلمات المرور لا تُخزَّن كنص صريح؛ تُدار عبر نظام المصادقة المُدار (Supabase Auth) بصيغة مُجزّأة (hashed).",
          "في وضع الضيف، يُحفظ التقدّم محليًا على جهازك فقط داخل تخزين التطبيق.",
        ],
      },
    ],
  },
  {
    id: "third-parties",
    title: "6. الخدمات الخارجية (المعالِجون الفرعيون)",
    blocks: [
      {
        ul: [
          "Supabase (عبر Lovable Cloud): قاعدة البيانات والمصادقة ودوال الخادم — يعالج بيانات الحساب والتقدّم.",
          "Firebase Cloud Messaging (Google): إرسال الإشعارات الفورية — يعالج رمز الجهاز ومحتوى الإشعار. لا نستخدم أي وحدة تحليلات أو إعلانات من Firebase.",
          "تسجيل الدخول بحساب Google (Google Sign-In): مصادقة اختيارية — نستقبل البريد الإلكتروني ومعرّف الحساب فقط، ولا نصل إلى بريدك أو ملفاتك أو جهات اتصالك.",
          "Resend: إرسال رسائل البريد (تأكيد الحساب، استعادة كلمة المرور، النشرة البريدية) — يعالج بريدك الإلكتروني ومحتوى الرسالة.",
          "Lovable Hosting: استضافة الموقع والتطبيق وتقديم الملفات — قد تظهر عناوين IP في السجلات التقنية.",
          "Have I Been Pwned: فحص كلمات المرور المسرّبة عند التسجيل أو تغيير كلمة المرور باستخدام أسلوب k-anonymity — لا تُرسل كلمة مرورك ولا بريدك، بل جزء مجزّأ لا يمكن الاستدلال منه على كلمة المرور.",
        ],
      },
      {
        p: "قد تُعالَج البيانات على خوادم خارج بلدك، بما في ذلك داخل الاتحاد الأوروبي أو الولايات المتحدة، وفق الضمانات التعاقدية القياسية لهؤلاء المزوّدين. لا نشارك بياناتك مع أي طرف آخر خارج هذه القائمة إلا إذا فرض ذلك التزام قانوني.",
      },
    ],
  },
  {
    id: "public",
    title: "7. البيانات العامة الظاهرة للمستخدمين الآخرين",
    blocks: [
      {
        ul: [
          "اسم المستخدم والاسم المعروض والنبذة والشعار المختار.",
          "المستوى ونقاط الخبرة وسلسلة الأيام ونسبة الاكتشاف والإنجازات والألقاب.",
          "تعليقاتك ومساهماتك المنشورة إن كتبتها.",
        ],
      },
      {
        p: "بريدك الإلكتروني لا يظهر لأي مستخدم آخر إطلاقًا، ولا يظهر في الملف الشخصي العام ولا في قوائم الأصدقاء ولا في صفحات المقارنة.",
      },
    ],
  },
  {
    id: "notifications",
    title: "8. الإشعارات",
    blocks: [
      {
        p: "الإشعارات اختيارية وتتطلب موافقتك الصريحة على مستوى نظام التشغيل (إذن POST_NOTIFICATIONS على أندرويد).",
      },
      {
        ul: [
          "تُستخدم للتذكير بالتحديات اليومية، وسلسلة الأيام، وطلبات الصداقة، وأحداث حسابك.",
          "يمكنك إيقافها في أي وقت من إعدادات التطبيق أو إعدادات النظام.",
          "عند إيقافها أو حذف حسابك يُحذف رمز جهازك من خوادمنا.",
        ],
      },
    ],
  },
  {
    id: "guest",
    title: "9. وضع الضيف (بدون حساب)",
    blocks: [
      {
        p: "يمكنك استخدام التطبيق دون إنشاء حساب. في هذه الحالة يُحفظ تقدّمك محليًا على جهازك فقط، ولا نجمع بريدًا إلكترونيًا ولا نُنشئ لك ملفًا على الخادم.",
      },
      {
        ul: [
          "حذف التطبيق أو مسح بيانات التطبيق يحذف تقدّم الضيف نهائيًا ولا يمكن استرجاعه.",
          "عند تسجيل الدخول لاحقًا قد يُنقل تقدّم الضيف إلى حسابك على الجهاز نفسه.",
          "بيانات الضيف معزولة تمامًا عن بيانات أي حساب على الجهاز نفسه.",
        ],
      },
    ],
  },
  {
    id: "retention",
    title: "10. الاحتفاظ بالبيانات",
    blocks: [
      {
        ul: [
          "تُحفظ بيانات حسابك طوال بقاء الحساب نشطًا.",
          "عند حذف الحساب تُحذف بياناتك الشخصية فورًا من قواعد البيانات التشغيلية.",
          "قد تبقى نسخ احتياطية مشفّرة للنظام حتى 30 يومًا قبل أن تُستبدل تلقائيًا.",
          "قد نحتفظ بسجلات تقنية وأمنية مجهولة الهوية (بدون معرّفات شخصية) لأغراض منع إساءة الاستخدام.",
          "بيانات وضع الضيف تبقى على جهازك فقط ولا تخضع لأي احتفاظ لدينا.",
        ],
      },
    ],
  },
  {
    id: "deletion",
    title: "11. حذف الحساب",
    blocks: [
      {
        p: "يمكنك حذف حسابك وكل بياناتك بنفسك من داخل التطبيق: الملف الشخصي ← الإعدادات ← «حذف الحساب نهائيًا»، دون الحاجة إلى مراسلة الدعم. الحذف فوري ونهائي وغير قابل للاسترجاع.",
      },
      {
        p: `إذا تعذّر عليك الدخول إلى حسابك، يمكنك طلب الحذف عبر ${SUPPORT_EMAIL} من البريد المرتبط بالحساب، ويُنفَّذ خلال 30 يومًا كحد أقصى بعد التحقق من الملكية.`,
      },
      { p: "التفاصيل الكاملة لما يُحذف وما لا يُحذف موجودة في صفحة حذف الحساب المرتبطة أدناه." },
    ],
  },
  {
    id: "rights",
    title: "12. حقوق المستخدم",
    blocks: [
      {
        ul: [
          "الوصول إلى بياناتك ومعرفة ما نحتفظ به.",
          "تصحيح بياناتك (الاسم، اسم المستخدم، النبذة) من داخل التطبيق.",
          "حذف حسابك وبياناتك نهائيًا في أي وقت.",
          "سحب الموافقة على الإشعارات أو النشرة البريدية في أي وقت.",
          "الحصول على نسخة من بياناتك (قابلية النقل) بطلبها عبر البريد.",
          "الاعتراض على معالجة معيّنة أو تقييدها وفق ما يسمح به القانون المطبّق.",
          "تقديم شكوى إلى جهة حماية البيانات المختصة في بلدك.",
        ],
      },
      { p: `لممارسة أي من هذه الحقوق راسلنا على ${SUPPORT_EMAIL}. نرد خلال 30 يومًا كحد أقصى.` },
    ],
  },
  {
    id: "children",
    title: "13. الأطفال",
    blocks: [
      {
        p: "التطبيق محتوى تعليمي تاريخي مناسب للعائلة، لكنه غير موجّه للأطفال دون 13 عامًا، ولا نجمع بيانات عن قصد ممن هم دون هذه السن.",
      },
      {
        p: `إذا علمنا بجمع بيانات من طفل دون السن المسموح بها، نحذفها فورًا. يمكن لولي الأمر مراسلتنا على ${SUPPORT_EMAIL} لطلب الحذف.`,
      },
    ],
  },
  {
    id: "ads",
    title: "14. لا إعلانات ولا بيع للبيانات",
    blocks: [
      {
        ul: [
          "لا يعرض التطبيق أي إعلانات ولا يحتوي على أي شبكة إعلانية.",
          "لا نبيع بياناتك الشخصية ولا نؤجّرها ولا نشاركها لأغراض تسويقية مع أي طرف ثالث.",
          "لا نستخدم بياناتك لبناء ملفات إعلانية أو تتبّع عبر التطبيقات.",
          "لا توجد مشتريات داخل التطبيق؛ الدنانير عملة داخل اللعبة تُكتسب باللعب فقط.",
        ],
      },
    ],
  },
  {
    id: "changes",
    title: "15. التعديلات على هذه السياسة",
    blocks: [
      {
        p: "قد نحدّث هذه السياسة عند إضافة ميزات جديدة أو تغيير مزوّدي الخدمة. يُحدَّث «تاريخ آخر تحديث» أعلى الصفحة مع كل تعديل.",
      },
      {
        p: "في حال وجود تغيير جوهري في طريقة معالجة بياناتك، سنُعلمك داخل التطبيق أو عبر البريد الإلكتروني قبل سريان التغيير.",
      },
    ],
  },
];

const EN: PolicySection[] = [
  {
    id: "owner",
    title: "1. Owner identity and contact",
    blocks: [
      {
        p: `The Irth app (إرث) — package ID ${PACKAGE_ID} — is owned and operated by Dosur, which acts as the data controller.`,
      },
      {
        ul: [
          `Official website: ${OWNER_SITE}`,
          `Contact and privacy requests: ${SUPPORT_EMAIL}`,
          `Last updated: ${LAST_UPDATED_ISO}`,
        ],
      },
      { p: "Arabic is the original language of this policy; the English version is an equivalent translation." },
    ],
  },
  {
    id: "collected",
    title: "2. Data we collect",
    blocks: [
      { p: "a) Account data (only if you create an account):" },
      {
        ul: [
          "Email address (via email/password sign-up or Google Sign-In).",
          "A unique internal account identifier (UUID).",
          "Display name, username, bio and chosen emblem — all optional and set by you.",
        ],
      },
      { p: "b) Gameplay and progress data:" },
      {
        ul: [
          "Progress across campaigns, stories, investigations and daily challenges.",
          "Experience (XP), level, dinars, hearts and daily streak.",
          "Achievements, titles, discoveries and museum collection items.",
          "Personal reflections and notes you write in the app.",
          "Cloud saves used to sync your progress across your devices.",
        ],
      },
      { p: "c) Social content (entirely optional):" },
      {
        ul: [
          "Friendships and friend requests.",
          "Comments, reactions and content contributions.",
          "Reports you submit about inappropriate content.",
        ],
      },
      { p: "d) Notifications:" },
      {
        ul: [
          "Device push token (FCM), platform (Android), notification-enabled state and last-seen timestamp.",
          "Notification preferences and a log of notifications delivered to you.",
        ],
      },
      { p: "e) Support and correspondence:" },
      {
        ul: [
          "Support messages and feedback you send from inside the app.",
          "Newsletter subscription if you opt in, plus email delivery status and unsubscribe records.",
        ],
      },
      { p: "f) Limited technical data:" },
      {
        ul: [
          "A locally generated install identifier (device ID) used to isolate guest-mode data. It is not used for advertising or tracking.",
          "Short-lived operational and security logs at our infrastructure providers (e.g. IP addresses in server logs) for security and abuse prevention.",
        ],
      },
    ],
  },
  {
    id: "not-collected",
    title: "3. Data we do NOT collect",
    blocks: [
      {
        ul: [
          "No GPS or location data; we never request location permission.",
          "No camera or microphone access; we never request those permissions.",
          "No contacts, SMS, call logs or device files.",
          "No photo uploads — your avatar is a preset emblem from the app's own library.",
          "No health, financial or payment data (the app has no in-app purchases).",
          "No Advertising ID, ad tracking or advertising profiles.",
          "No third-party behavioural analytics — we do not use Google Analytics or Firebase Analytics.",
        ],
      },
    ],
  },
  {
    id: "purposes",
    title: "4. Why we collect data",
    blocks: [
      {
        ul: [
          "To run the app and save and sync your progress across devices.",
          "To manage your account, authenticate you and protect sign-in.",
          "To power optional social features (friends, comparisons, comments).",
          "To send the notifications and reminders you have agreed to.",
          "To answer support requests and improve historical content and fix bugs.",
          "To protect the service against abuse and fraud and keep it stable.",
        ],
      },
      {
        p: "Legal bases (where GDPR applies): performance of a contract (running your account and the service), consent (notifications, newsletter, social features), and legitimate interests (security, abuse prevention, service improvement).",
      },
    ],
  },
  {
    id: "storage",
    title: "5. Storage and encryption",
    blocks: [
      {
        ul: [
          "Account and progress data is stored in a managed database (Supabase via Lovable Cloud) protected by Row Level Security policies that prevent any user from reading another user's data.",
          "All traffic between the app and our servers uses HTTPS/TLS (encryption in transit).",
          "Data is encrypted at rest by the infrastructure provider.",
          "Passwords are never stored in plain text; they are handled in hashed form by the managed authentication system (Supabase Auth).",
          "In guest mode, progress is stored only locally in the app's storage on your device.",
        ],
      },
    ],
  },
  {
    id: "third-parties",
    title: "6. Third-party services (sub-processors)",
    blocks: [
      {
        ul: [
          "Supabase (via Lovable Cloud): database, authentication and server functions — processes account and progress data.",
          "Firebase Cloud Messaging (Google): push notification delivery — processes the device token and notification content. We use no Firebase analytics or ads modules.",
          "Google Sign-In: optional authentication — we receive only your email address and account identifier; we never access your mail, files or contacts.",
          "Resend: email delivery (account confirmation, password reset, newsletter) — processes your email address and message content.",
          "Lovable Hosting: hosting of the site, the app bundle and static assets — IP addresses may appear in technical logs.",
          "Have I Been Pwned: leaked-password check at sign-up and password change using k-anonymity — neither your password nor your email is sent, only a partial hash from which the password cannot be derived.",
        ],
      },
      {
        p: "Data may be processed on servers outside your country, including in the EU or the United States, under those providers' standard contractual safeguards. We do not share your data with anyone outside this list unless required by law.",
      },
    ],
  },
  {
    id: "public",
    title: "7. Data visible to other users",
    blocks: [
      {
        ul: [
          "Username, display name, bio and chosen emblem.",
          "Level, XP, streak, discovery percentage, achievements and titles.",
          "Comments and contributions you have published.",
        ],
      },
      {
        p: "Your email address is never shown to other users — not on your public profile, not in friend lists, and not on comparison pages.",
      },
    ],
  },
  {
    id: "notifications",
    title: "8. Notifications",
    blocks: [
      {
        p: "Notifications are optional and require your explicit OS-level consent (the POST_NOTIFICATIONS permission on Android).",
      },
      {
        ul: [
          "They are used for daily-challenge reminders, streaks, friend requests and account events.",
          "You can turn them off at any time in the app settings or your system settings.",
          "When you disable them or delete your account, your device token is removed from our servers.",
        ],
      },
    ],
  },
  {
    id: "guest",
    title: "9. Guest mode (no account)",
    blocks: [
      {
        p: "You can use the app without creating an account. In that case your progress is stored only on your device; we collect no email address and create no server-side profile for you.",
      },
      {
        ul: [
          "Uninstalling the app or clearing its data permanently deletes guest progress; it cannot be recovered.",
          "If you sign in later, guest progress on the same device may be migrated into your account.",
          "Guest data is fully isolated from any account's data on the same device.",
        ],
      },
    ],
  },
  {
    id: "retention",
    title: "10. Data retention",
    blocks: [
      {
        ul: [
          "Your account data is kept for as long as the account remains active.",
          "When you delete your account, your personal data is removed from the operational databases immediately.",
          "Encrypted system backups may persist for up to 30 days before being automatically rotated out.",
          "We may keep anonymised technical and security logs (with no personal identifiers) for abuse prevention.",
          "Guest-mode data stays on your device only and is not retained by us at all.",
        ],
      },
    ],
  },
  {
    id: "deletion",
    title: "11. Account deletion",
    blocks: [
      {
        p: "You can delete your account and all of your data yourself, inside the app: Profile → Settings → \"Delete account permanently\". No support request is needed. Deletion is immediate, permanent and irreversible.",
      },
      {
        p: `If you cannot sign in, you can request deletion from ${SUPPORT_EMAIL} using the email address linked to the account; we complete it within 30 days at most after verifying ownership.`,
      },
      { p: "A full breakdown of what is and is not deleted is on the account deletion page linked below." },
    ],
  },
  {
    id: "rights",
    title: "12. Your rights",
    blocks: [
      {
        ul: [
          "Access the data we hold about you.",
          "Correct your data (name, username, bio) from inside the app.",
          "Delete your account and data permanently at any time.",
          "Withdraw consent for notifications or the newsletter at any time.",
          "Obtain a copy of your data (portability) by requesting it via email.",
          "Object to or restrict certain processing where applicable law allows.",
          "Lodge a complaint with your local data protection authority.",
        ],
      },
      { p: `To exercise any of these rights, contact ${SUPPORT_EMAIL}. We respond within 30 days at most.` },
    ],
  },
  {
    id: "children",
    title: "13. Children",
    blocks: [
      {
        p: "The app is family-friendly educational history content, but it is not directed at children under 13, and we do not knowingly collect data from anyone under that age.",
      },
      {
        p: `If we learn that we have collected data from a child below the permitted age, we delete it immediately. Parents or guardians may contact ${SUPPORT_EMAIL} to request deletion.`,
      },
    ],
  },
  {
    id: "ads",
    title: "14. No ads, no data selling",
    blocks: [
      {
        ul: [
          "The app shows no advertising and contains no ad network.",
          "We do not sell, rent or share your personal data with third parties for marketing.",
          "We do not use your data to build advertising profiles or track you across apps.",
          "There are no in-app purchases; dinars are an in-game currency earned by playing.",
        ],
      },
    ],
  },
  {
    id: "changes",
    title: "15. Changes to this policy",
    blocks: [
      {
        p: "We may update this policy when we add features or change service providers. The \"Last updated\" date at the top of this page changes with every revision.",
      },
      {
        p: "If a change materially affects how your data is processed, we will notify you in the app or by email before it takes effect.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------

function Section({ title, blocks, dir }: { title: string; blocks: Block[]; dir: "rtl" | "ltr" }) {
  const pad = dir === "rtl" ? "pr-5" : "pl-5";
  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-surface p-4">
      <h2 className="font-display mb-2 text-sm font-bold text-gold">{title}</h2>
      <div className="space-y-2 text-sm leading-7 text-foreground/90">
        {blocks.map((b, i) =>
          "p" in b ? (
            <p key={i}>{b.p}</p>
          ) : (
            <ul key={i} className={`list-disc space-y-1 ${pad}`}>
              {b.ul.map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
          ),
        )}
      </div>
    </section>
  );
}

function PrivacyPage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const ar = lang === "ar";
  const dir = ar ? "rtl" : "ltr";
  const sections = ar ? AR : EN;

  return (
    <AppShell>
      <Screen
        title={ar ? "سياسة الخصوصية" : "Privacy Policy"}
        subtitle={ar ? "تطبيق إرث — دسر" : "Irth app — Dosur"}
      >
        <div dir={dir} className={ar ? "text-right" : "text-left"}>
          <div className="rounded-3xl border border-gold/25 bg-surface p-5 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Shield className="size-6" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {ar
                ? `آخر تحديث: ${LAST_UPDATED_ISO} — تنطبق هذه السياسة على تطبيق إرث (${PACKAGE_ID}) وموقعه.`
                : `Last updated: ${LAST_UPDATED_ISO} — This policy applies to the Irth app (${PACKAGE_ID}) and its website.`}
            </p>
            <button
              type="button"
              onClick={() => setLang(ar ? "en" : "ar")}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-1.5 text-xs font-bold text-gold hover:bg-gold/10"
            >
              <Languages className="size-4" />
              {ar ? "English version" : "النسخة العربية"}
            </button>
          </div>

          {sections.map((s) => (
            <Section key={s.id} title={s.title} blocks={s.blocks} dir={dir} />
          ))}

          <Link
            to="/account-deletion"
            className="mt-5 flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-4"
          >
            <div className="grid size-9 place-items-center rounded-xl bg-rose-500/15 text-rose-300">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-rose-200">
                {ar ? "حذف الحساب والبيانات" : "Account & data deletion"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {ar ? "الخطوات الكاملة وما يُحذف بالتفصيل" : "Full steps and exactly what gets deleted"}
              </p>
            </div>
            <ChevronRight className={`size-5 text-rose-300 ${ar ? "rotate-180" : ""}`} />
          </Link>

          <div className="mt-3 rounded-2xl border border-white/10 bg-surface p-4 text-sm leading-7 text-foreground/90">
            {ar ? "للاستفسارات المتعلقة بالخصوصية: " : "For privacy enquiries: "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold underline">
              {SUPPORT_EMAIL}
            </a>
            {" · "}
            <a href={OWNER_SITE} target="_blank" rel="noopener noreferrer" className="text-gold underline">
              dosur1444.com
            </a>
          </div>

          <Link
            to="/about"
            className="mt-3 flex items-center justify-between rounded-2xl border border-gold/25 bg-gradient-gold/10 p-4"
          >
            <div>
              <p className="font-display text-sm font-bold text-gold">{ar ? "عودة إلى حول إرث" : "Back to About Irth"}</p>
              <p className="text-[11px] text-muted-foreground">
                {ar ? "تعرّف أكثر على المشروع" : "Learn more about the project"}
              </p>
            </div>
            <ChevronRight className={`size-5 text-gold ${ar ? "rotate-180" : ""}`} />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}

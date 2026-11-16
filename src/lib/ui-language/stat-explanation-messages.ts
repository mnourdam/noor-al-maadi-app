import type { AppLocale } from "./locale-policy";

/** HUD explanations and status labels only. Never changes balances, streak eligibility or locale activation. */
const ar = {
  dinarsExplanation:
    "تكسب الدنانير من إكمال الفصول، التحديات، التحقيقات والإنجازات. ستُستخدم لاحقًا لفتح عناصر وتخصيصات داخل إرث.",
  currentBalance: "رصيدك الحالي",
  xpExplanation: "ترتفع خبرتك كلما تقدمت في الحملات والألعاب والتحقيقات.",
  currentXP: "الخبرة الحالية",
  levelLabel: "المستوى",
  nextLevelLabel: "التالي:",
  highestLevel: "أعلى مستوى",
  streakBroken: "انقطعت سلسلتك. أكمل نشاطًا مؤهلًا لبدء سلسلة جديدة.",
  streakSafe: "حماستك محفوظة اليوم.",
  streakMaintain: "أكمل فصلًا أو تحديًا اليوم للحفاظ على السلسلة.",
  currentStreak: "السلسلة الحالية",
  lastActiveDay: "آخر يوم نشاط",
  timeBeforeRisk: "الوقت قبل المخاطرة",
} as const;
export type StatExplanationKey = keyof typeof ar;
type StatExplanationMessages = Readonly<Record<StatExplanationKey, string>>;
const en = {
  dinarsExplanation:
    "Earn dinars by completing chapters, challenges, investigations and achievements. They will later be used to unlock items and customizations in Irth.",
  currentBalance: "Current balance",
  xpExplanation: "Gain experience as you progress through campaigns, games and investigations.",
  currentXP: "Current experience",
  levelLabel: "Level",
  nextLevelLabel: "Next:",
  highestLevel: "Highest level",
  streakBroken: "Your streak has ended. Complete a qualifying activity to start a new one.",
  streakSafe: "Your streak is safe today.",
  streakMaintain: "Complete a chapter or challenge today to maintain your streak.",
  currentStreak: "Current streak",
  lastActiveDay: "Last active day",
  timeBeforeRisk: "Time before your streak is at risk",
} satisfies StatExplanationMessages;
const ur = {
  dinarsExplanation:
    "آپ ابواب، چیلنجز، تحقیقات اور کامیابیاں مکمل کرکے دینار کماتے ہیں۔ بعد میں انہیں إرث میں اشیا اور تخصیصات کھولنے کے لیے استعمال کیا جائے گا۔",
  currentBalance: "آپ کا موجودہ بیلنس",
  xpExplanation: "مہمات، کھیلوں اور تحقیقات میں آگے بڑھنے سے آپ کا تجربہ بڑھتا ہے۔",
  currentXP: "موجودہ تجربہ",
  levelLabel: "درجہ",
  nextLevelLabel: "اگلا:",
  highestLevel: "بلند ترین درجہ",
  streakBroken:
    "آپ کا تسلسل ٹوٹ گیا ہے۔ نیا تسلسل شروع کرنے کے لیے شرائط پر پوری اترنے والی کوئی سرگرمی مکمل کریں۔",
  streakSafe: "آج آپ کا تسلسل محفوظ ہے۔",
  streakMaintain: "تسلسل برقرار رکھنے کے لیے آج کوئی باب یا چیلنج مکمل کریں۔",
  currentStreak: "موجودہ تسلسل",
  lastActiveDay: "آخری سرگرمی کا دن",
  timeBeforeRisk: "تسلسل خطرے میں پڑنے تک باقی وقت",
} satisfies StatExplanationMessages;
const id = {
  dinarsExplanation:
    "Anda memperoleh dinar dengan menyelesaikan bab, tantangan, investigasi, dan pencapaian. Nantinya, dinar dapat digunakan untuk membuka item dan penyesuaian di Irth.",
  currentBalance: "Saldo Anda saat ini",
  xpExplanation:
    "Pengalaman Anda bertambah seiring kemajuan dalam kampanye, permainan, dan investigasi.",
  currentXP: "Pengalaman saat ini",
  levelLabel: "Level",
  nextLevelLabel: "Berikutnya:",
  highestLevel: "Level tertinggi",
  streakBroken:
    "Rangkaian aktivitas Anda terputus. Selesaikan aktivitas yang memenuhi syarat untuk memulai rangkaian baru.",
  streakSafe: "Rangkaian aktivitas Anda aman hari ini.",
  streakMaintain:
    "Selesaikan satu bab atau tantangan hari ini untuk mempertahankan rangkaian aktivitas.",
  currentStreak: "Rangkaian aktivitas saat ini",
  lastActiveDay: "Hari terakhir aktif",
  timeBeforeRisk: "Waktu sebelum rangkaian aktivitas Anda terancam",
} satisfies StatExplanationMessages;
const tr = {
  dinarsExplanation:
    "Bölümleri, meydan okumaları, araştırmaları ve başarımları tamamlayarak dinar kazanırsınız. Dinarlar daha sonra Irth içindeki öğelerin ve özelleştirmelerin kilidini açmak için kullanılacaktır.",
  currentBalance: "Güncel bakiyeniz",
  xpExplanation: "Kampanyalarda, oyunlarda ve araştırmalarda ilerledikçe deneyiminiz artar.",
  currentXP: "Mevcut deneyim",
  levelLabel: "Seviye",
  nextLevelLabel: "Sonraki:",
  highestLevel: "En yüksek seviye",
  streakBroken: "Seriniz sona erdi. Yeni bir seri başlatmak için uygun bir etkinliği tamamlayın.",
  streakSafe: "Seriniz bugün güvende.",
  streakMaintain: "Seriyi sürdürmek için bugün bir bölüm veya meydan okuma tamamlayın.",
  currentStreak: "Mevcut seri",
  lastActiveDay: "Son etkinlik günü",
  timeBeforeRisk: "Serinizin riske girmesine kalan süre",
} satisfies StatExplanationMessages;
const fr = {
  dinarsExplanation:
    "Vous gagnez des dinars en terminant des chapitres, des défis et des enquêtes, et en obtenant des succès. Ils serviront plus tard à débloquer des éléments et des options de personnalisation dans Irth.",
  currentBalance: "Votre solde actuel",
  xpExplanation:
    "Votre expérience augmente à mesure que vous progressez dans les campagnes, les jeux et les enquêtes.",
  currentXP: "Expérience actuelle",
  levelLabel: "Niveau",
  nextLevelLabel: "Suivant :",
  highestLevel: "Niveau maximal",
  streakBroken:
    "Votre série est interrompue. Terminez une activité admissible pour en commencer une nouvelle.",
  streakSafe: "Votre série est préservée pour aujourd’hui.",
  streakMaintain: "Terminez un chapitre ou un défi aujourd’hui pour maintenir votre série.",
  currentStreak: "Série actuelle",
  lastActiveDay: "Dernier jour d’activité",
  timeBeforeRisk: "Temps avant que votre série soit en danger",
} satisfies StatExplanationMessages;
export const STAT_EXPLANATION_MESSAGES: Readonly<Record<AppLocale, StatExplanationMessages>> = {
  ar,
  en,
  ur,
  id,
  tr,
  fr,
};

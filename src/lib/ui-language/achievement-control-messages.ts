import type { AppLocale } from './locale-policy';

/** Achievement display controls only. No reward/ownership decisions. */
const ar = {
  achSecretLabel: "سرّي",
  achSecretTitle: "إنجاز سرّي",
  achSecretDescription: "اكتشفه بنفسك خلال رحلتك.",
  achCabinet: "خزانة الإنجازات",
  achUnlockedCount: "{earned} من {total} مفتوحة",
  achOwnershipUnconfirmed: "تحقق شرط الاقتناء. لم يُؤكد صرف مكافأة هذا الإنجاز بعد.",
  achProgress: "التقدم",
  achUnlockedOn: "فُتح في",
  achRewards: "المكافآت",
  achPointsUnit: "نقطة",
  achDinarsUnit: "دينار",
  achRewardTitle: "لقب:",
  achMuseumReward: "قطعة متحف",
  achCosmeticReward: "زخرفة",
} as const;
export type AchievementControlKey = keyof typeof ar;
export type AchievementControlMessages = Readonly<Record<AchievementControlKey, string>>;
const en = {
  achSecretLabel: "Secret",
  achSecretTitle: "Secret achievement",
  achSecretDescription: "Discover it for yourself during your journey.",
  achCabinet: "Achievement cabinet",
  achUnlockedCount: "{earned} of {total} unlocked",
  achOwnershipUnconfirmed: "The ownership requirement is met. The reward for this achievement has not been confirmed as granted.",
  achProgress: "Progress",
  achUnlockedOn: "Unlocked on",
  achRewards: "Rewards",
  achPointsUnit: "points",
  achDinarsUnit: "dinars",
  achRewardTitle: "Title:",
  achMuseumReward: "Museum item",
  achCosmeticReward: "Decoration",
} satisfies AchievementControlMessages;
const ur = {
  "achSecretLabel": "خفیہ",
  "achSecretTitle": "خفیہ کامیابی",
  "achSecretDescription": "اپنے سفر کے دوران اسے خود دریافت کریں۔",
  "achCabinet": "کامیابیوں کی الماری",
  "achUnlockedCount": "{total} میں سے {earned} کھل چکی ہیں",
  "achOwnershipUnconfirmed": "ملکیت کی شرط پوری ہو گئی ہے۔ اس کامیابی کا انعام ملنے کی ابھی تصدیق نہیں ہوئی۔",
  "achProgress": "پیش رفت",
  "achUnlockedOn": "کھلنے کی تاریخ",
  "achRewards": "انعامات",
  "achPointsUnit": "پوائنٹ",
  "achDinarsUnit": "دینار",
  "achRewardTitle": "لقب:",
  "achMuseumReward": "عجائب گھر کی شے",
  "achCosmeticReward": "سجاوٹ"
} satisfies AchievementControlMessages;
const id = {
  "achSecretLabel": "Rahasia",
  "achSecretTitle": "Pencapaian rahasia",
  "achSecretDescription": "Temukan sendiri selama perjalanan Anda.",
  "achCabinet": "Lemari pencapaian",
  "achUnlockedCount": "{earned} dari {total} terbuka",
  "achOwnershipUnconfirmed": "Syarat kepemilikan telah terpenuhi. Pemberian hadiah pencapaian ini belum dikonfirmasi.",
  "achProgress": "Kemajuan",
  "achUnlockedOn": "Terbuka pada",
  "achRewards": "Hadiah",
  "achPointsUnit": "poin",
  "achDinarsUnit": "dinar",
  "achRewardTitle": "Gelar:",
  "achMuseumReward": "Benda koleksi museum",
  "achCosmeticReward": "Hiasan"
} satisfies AchievementControlMessages;
const tr = {
  "achSecretLabel": "Gizli",
  "achSecretTitle": "Gizli başarım",
  "achSecretDescription": "Yolculuğunuz sırasında kendiniz keşfedin.",
  "achCabinet": "Başarım vitrini",
  "achUnlockedCount": "{total} başarımın {earned} tanesi açıldı",
  "achOwnershipUnconfirmed": "Sahip olma koşulu sağlandı. Bu başarımın ödülünün verildiği henüz doğrulanmadı.",
  "achProgress": "İlerleme",
  "achUnlockedOn": "Açılma tarihi",
  "achRewards": "Ödüller",
  "achPointsUnit": "puan",
  "achDinarsUnit": "dinar",
  "achRewardTitle": "Unvan:",
  "achMuseumReward": "Müze eseri",
  "achCosmeticReward": "Süsleme"
} satisfies AchievementControlMessages;
const fr = {
  "achSecretLabel": "Secret",
  "achSecretTitle": "Succès secret",
  "achSecretDescription": "Découvrez-le par vous-même au fil de votre parcours.",
  "achCabinet": "Vitrine des succès",
  "achUnlockedCount": "{earned} sur {total} débloqués",
  "achOwnershipUnconfirmed": "La condition de possession est remplie. L’attribution de la récompense de ce succès n’a pas encore été confirmée.",
  "achProgress": "Progression",
  "achUnlockedOn": "Débloqué le",
  "achRewards": "Récompenses",
  "achPointsUnit": "point",
  "achDinarsUnit": "dinar",
  "achRewardTitle": "Titre :",
  "achMuseumReward": "Objet de musée",
  "achCosmeticReward": "Décoration"
} satisfies AchievementControlMessages;
export const ACHIEVEMENT_CONTROL_MESSAGES: Readonly<Record<AppLocale, AchievementControlMessages>> = { ar, en, ur, id, tr, fr };

/** Reward counts are nonnegative integers. Preserve existing ar/en wording. */
export function achievementRewardUnit(locale: AppLocale, kind: 'xp' | 'dinars', count: number): string {
  const key = kind === 'xp' ? 'achPointsUnit' : 'achDinarsUnit';
  const unit = ACHIEVEMENT_CONTROL_MESSAGES[locale][key];
  // French singular includes zero; all other counts here are integer rewards.
  return locale === 'fr' && Math.abs(count) >= 2 ? unit + 's' : unit;
}

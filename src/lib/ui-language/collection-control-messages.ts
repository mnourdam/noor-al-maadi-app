import type { AppLocale } from "./locale-policy";

/** Collection/card UI labels only. No story content, rewards, progression or locale activation. */
const ar = {
  collectionStoryCount: "عدد القصص",
  collectionCompletion: "نسبة الإنجاز",
  collectionProgress: "تقدم السلسلة",
  collectionCompleted: "مكتملة",
  collectionStart: "ابدأ السلسلة",
  collectionContinue: "متابعة القراءة",
  collectionReread: "إعادة القراءة",
  catalogTitle: "مكتبة السلاسل القصصية",
  catalogSubtitle: "رحلات عبر الزمن من خلال سلاسل موثقة",
  catalogSearchCollection: "ابحث داخل السلسلة…",
  catalogSearchAll: "ابحث في السلاسل والقصص…",
  catalogCollections: "سلسلة",
  catalogStories: "قصة",
  storyResume: "استئناف",
  storyNew: "جديدة",
  storyHistoryUnknown: "تعذر التحقق من سجل الإكمال",
  storySecondsUnit: "ث",
  storyOneMinute: "دقيقة",
  storyMinutesUnit: "د",
} as const;
export type CollectionControlKey = keyof typeof ar;
export type CollectionControlMessages = Readonly<Record<CollectionControlKey, string>>;
const en = {
  collectionStoryCount: "Story count",
  collectionCompletion: "Completion",
  collectionProgress: "Collection progress",
  collectionCompleted: "completed",
  collectionStart: "Start collection",
  collectionContinue: "Continue reading",
  collectionReread: "Read again",
  catalogTitle: "Story collections",
  catalogSubtitle: "Journeys through time in documented collections",
  catalogSearchCollection: "Search this collection…",
  catalogSearchAll: "Search collections and stories…",
  catalogCollections: "collections",
  catalogStories: "stories",
  storyResume: "Resume",
  storyNew: "New",
  storyHistoryUnknown: "Completion history could not be verified",
  storySecondsUnit: "s",
  storyOneMinute: "1 min",
  storyMinutesUnit: "min",
} satisfies CollectionControlMessages;
const ur = {
  collectionStoryCount: "کہانیوں کی تعداد",
  collectionCompletion: "تکمیل کی شرح",
  collectionProgress: "سلسلے کی پیش رفت",
  collectionCompleted: "مکمل",
  collectionStart: "سلسلہ شروع کریں",
  collectionContinue: "پڑھنا جاری رکھیں",
  collectionReread: "دوبارہ پڑھیں",
  catalogTitle: "کہانیوں کے سلسلوں کی لائبریری",
  catalogSubtitle: "مستند سلسلوں کے ذریعے زمانوں کا سفر",
  catalogSearchCollection: "اس سلسلے میں تلاش کریں…",
  catalogSearchAll: "سلسلوں اور کہانیوں میں تلاش کریں…",
  catalogCollections: "سلسلے",
  catalogStories: "کہانیاں",
  storyResume: "جاری رکھیں",
  storyNew: "نئی",
  storyHistoryUnknown: "تکمیل کے ریکارڈ کی تصدیق نہیں ہو سکی",
  storySecondsUnit: "سیکنڈ",
  storyOneMinute: "۱ منٹ",
  storyMinutesUnit: "منٹ",
} satisfies CollectionControlMessages;
const id = {
  collectionStoryCount: "Jumlah cerita",
  collectionCompletion: "Persentase penyelesaian",
  collectionProgress: "Kemajuan koleksi",
  collectionCompleted: "Selesai",
  collectionStart: "Mulai koleksi",
  collectionContinue: "Lanjutkan membaca",
  collectionReread: "Baca ulang",
  catalogTitle: "Koleksi cerita",
  catalogSubtitle: "Perjalanan melintasi waktu melalui koleksi terdokumentasi",
  catalogSearchCollection: "Cari dalam koleksi ini…",
  catalogSearchAll: "Cari koleksi dan cerita…",
  catalogCollections: "koleksi",
  catalogStories: "cerita",
  storyResume: "Lanjutkan",
  storyNew: "Baru",
  storyHistoryUnknown: "Riwayat penyelesaian tidak dapat diverifikasi",
  storySecondsUnit: "dtk",
  storyOneMinute: "1 mnt",
  storyMinutesUnit: "mnt",
} satisfies CollectionControlMessages;
const tr = {
  collectionStoryCount: "Hikâye sayısı",
  collectionCompletion: "Tamamlanma oranı",
  collectionProgress: "Koleksiyon ilerlemesi",
  collectionCompleted: "Tamamlandı",
  collectionStart: "Koleksiyona başla",
  collectionContinue: "Okumaya devam et",
  collectionReread: "Yeniden oku",
  catalogTitle: "Hikâye koleksiyonları",
  catalogSubtitle: "Belgelenmiş koleksiyonlarla zamanda yolculuk",
  catalogSearchCollection: "Bu koleksiyonda ara…",
  catalogSearchAll: "Koleksiyonlarda ve hikâyelerde ara…",
  catalogCollections: "koleksiyon",
  catalogStories: "hikâye",
  storyResume: "Devam et",
  storyNew: "Yeni",
  storyHistoryUnknown: "Tamamlanma geçmişi doğrulanamadı",
  storySecondsUnit: "sn",
  storyOneMinute: "1 dk",
  storyMinutesUnit: "dk",
} satisfies CollectionControlMessages;
const fr = {
  collectionStoryCount: "Nombre d’histoires",
  collectionCompletion: "Taux d’achèvement",
  collectionProgress: "Progression de la collection",
  collectionCompleted: "Terminée",
  collectionStart: "Commencer la collection",
  collectionContinue: "Continuer la lecture",
  collectionReread: "Relire",
  catalogTitle: "Collections d’histoires",
  catalogSubtitle: "Des voyages dans le temps à travers des collections documentées",
  catalogSearchCollection: "Rechercher dans cette collection…",
  catalogSearchAll: "Rechercher des collections et des histoires…",
  catalogCollections: "collections",
  catalogStories: "histoires",
  storyResume: "Reprendre",
  storyNew: "Nouvelle",
  storyHistoryUnknown: "Impossible de vérifier l’historique d’achèvement",
  storySecondsUnit: "s",
  storyOneMinute: "1 min",
  storyMinutesUnit: "min",
} satisfies CollectionControlMessages;

export const COLLECTION_CONTROL_MESSAGES: Readonly<Record<AppLocale, CollectionControlMessages>> = {
  ar,
  en,
  ur,
  id,
  tr,
  fr,
};

/** Catalog counters are nonnegative integers; preserve current ar/en labels. */
export function collectionCountLabel(
  locale: AppLocale,
  kind: "catalogCollections" | "catalogStories",
  count: number,
): string {
  if (locale === "fr" && count < 2) {
    return kind === "catalogCollections" ? "collection" : "histoire";
  }
  if (locale === "ur" && count === 1) {
    return kind === "catalogCollections" ? "سلسلہ" : "کہانی";
  }
  return COLLECTION_CONTROL_MESSAGES[locale][kind];
}

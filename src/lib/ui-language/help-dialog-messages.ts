import type { AppLocale } from './locale-policy';

const ar = {
  "help": "المساعدة",
  "description": "اختر إحدى المساعدات المتاحة لمواصلة التحدّي.",
  "balance": "رصيدك",
  "dinars": "{count} دينار",
  "empty": "لا تتوفّر مساعدات في هذه اللعبة حاليًا.",
  "close": "إغلاق",
  "insufficient": "ليس لديك دنانير كافية",
  "required": "تحتاج إلى {cost} دنانير لاستخدام هذه المساعدة. اجمع المزيد من الدنانير من الحملات والتحديات ثم حاول مرة أخرى.",
  "okay": "حسنًا",
  "errorTitle": "حدث خطأ في نظام المساعدة",
  "errorDescription": "نعتذر، واجهنا مشكلة تقنية أثناء تحميل خيارات المساعدة لهذا التحدي.",
  "retry": "إعادة المحاولة"
} as const;
export type HelpDialogKey = keyof typeof ar;
export const HELP_DIALOG_MESSAGES: Readonly<Record<AppLocale, Readonly<Record<HelpDialogKey, string>>>> = { ar,
en: {
  "help": "Help",
  "description": "Choose an available help option to continue the challenge.",
  "balance": "Your balance",
  "dinars": "{count} dinars",
  "empty": "No help options are currently available for this game.",
  "close": "Close",
  "insufficient": "Not enough dinars",
  "required": "You need {cost} dinars to use this help option. Earn more dinars from campaigns and challenges, then try again.",
  "okay": "OK",
  "errorTitle": "The help system encountered an error",
  "errorDescription": "Sorry, a technical problem occurred while loading help options for this challenge.",
  "retry": "Try again"
},
ur: {
  "help": "مدد",
  "description": "چیلنج جاری رکھنے کے لیے دستیاب مدد کے اختیارات میں سے ایک منتخب کریں۔",
  "balance": "آپ کا بیلنس",
  "dinars": "{count} دینار",
  "empty": "اس کھیل کے لیے فی الحال مدد کے کوئی اختیارات دستیاب نہیں ہیں۔",
  "close": "بند کریں",
  "insufficient": "دینار ناکافی ہیں",
  "required": "یہ مدد استعمال کرنے کے لیے آپ کو {cost} دینار درکار ہیں۔ مہمات اور چیلنجوں سے مزید دینار حاصل کریں، پھر دوبارہ کوشش کریں۔",
  "okay": "ٹھیک ہے",
  "errorTitle": "مدد کے نظام میں خرابی پیش آئی",
  "errorDescription": "معذرت، اس چیلنج کے لیے مدد کے اختیارات لوڈ کرتے وقت ایک تکنیکی مسئلہ پیش آیا۔",
  "retry": "دوبارہ کوشش کریں"
},
id: {
  "help": "Bantuan",
  "description": "Pilih bantuan yang tersedia untuk melanjutkan tantangan.",
  "balance": "Saldo Anda",
  "dinars": "{count} dinar",
  "empty": "Saat ini tidak ada bantuan yang tersedia untuk permainan ini.",
  "close": "Tutup",
  "insufficient": "Dinar tidak cukup",
  "required": "Anda memerlukan {cost} dinar untuk menggunakan bantuan ini. Dapatkan lebih banyak dinar dari kampanye dan tantangan, lalu coba lagi.",
  "okay": "OK",
  "errorTitle": "Terjadi kesalahan pada sistem bantuan",
  "errorDescription": "Maaf, terjadi masalah teknis saat memuat pilihan bantuan untuk tantangan ini.",
  "retry": "Coba lagi"
},
tr: {
  "help": "Yardım",
  "description": "Meydan okumaya devam etmek için mevcut yardım seçeneklerinden birini seçin.",
  "balance": "Bakiyeniz",
  "dinars": "{count} dinar",
  "empty": "Bu oyun için şu anda yardım seçeneği bulunmuyor.",
  "close": "Kapat",
  "insufficient": "Yeterli dinar yok",
  "required": "Bu yardımı kullanmak için {cost} dinara ihtiyacınız var. Seferlerden ve meydan okumalardan daha fazla dinar kazanıp tekrar deneyin.",
  "okay": "Tamam",
  "errorTitle": "Yardım sisteminde bir hata oluştu",
  "errorDescription": "Üzgünüz, bu meydan okumanın yardım seçenekleri yüklenirken teknik bir sorun oluştu.",
  "retry": "Tekrar dene"
},
fr: {
  "help": "Aide",
  "description": "Choisissez une aide disponible pour poursuivre le défi.",
  "balance": "Votre solde",
  "dinars": "{count} dinars",
  "empty": "Aucune aide n’est disponible pour ce jeu pour le moment.",
  "close": "Fermer",
  "insufficient": "Dinars insuffisants",
  "required": "Il vous faut {cost} dinars pour utiliser cette aide. Gagnez davantage de dinars dans les campagnes et les défis, puis réessayez.",
  "okay": "OK",
  "errorTitle": "Une erreur est survenue dans le système d’aide",
  "errorDescription": "Désolé, un problème technique est survenu lors du chargement des aides pour ce défi.",
  "retry": "Réessayer"
}
};
export function helpDialogText(locale: AppLocale, key: HelpDialogKey, values: Record<string, string | number> = {}): string {
  return HELP_DIALOG_MESSAGES[locale][key].replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}

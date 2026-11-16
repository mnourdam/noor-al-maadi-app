import type { AppLocale } from './locale-policy';

// Display text only: canonical letters, costs and timer values remain unchanged.
const ar = {
  "help": "المساعدة",
  "description": "اختر إحدى المساعدات لمواصلة المخطوط.",
  "balance": "رصيدك",
  "dinars": "{count} دينار",
  "reveal": "كشف حرف",
  "revealDescription": "كشف حرف واحد من كلمة لم تُحلَّ بعد.",
  "none": "لا توجد حروف مخفية",
  "addTime": "إضافة دقيقتين",
  "timeDescription": "أضف دقيقتين إلى الوقت المتبقي.",
  "close": "إغلاق",
  "insufficient": "ليس لديك دنانير كافية",
  "earnMore": "اجمع المزيد من الدنانير من الحملات والتحديات ثم حاول مرة أخرى.",
  "ok": "حسنًا",
  "revealed": "تم كشف حرف مقابل {cost} دنانير.",
  "timeAdded": "تمت إضافة دقيقتين مقابل {cost} دنانير."
} as const;
export type CrosswordHelpKey = keyof typeof ar;
export const CROSSWORD_HELP_MESSAGES: Readonly<Record<AppLocale, Readonly<Record<CrosswordHelpKey, string>>>> = { ar,
en: {
  "help": "Help",
  "description": "Choose a help option to continue the manuscript puzzle.",
  "balance": "Your balance",
  "dinars": "{count} dinars",
  "reveal": "Reveal a letter",
  "revealDescription": "Reveal one letter in an unsolved word.",
  "none": "No hidden letters remain",
  "addTime": "Add two minutes",
  "timeDescription": "Add two minutes to the remaining time.",
  "close": "Close",
  "insufficient": "Not enough dinars",
  "earnMore": "Earn more dinars from campaigns and challenges, then try again.",
  "ok": "OK",
  "revealed": "Revealed a letter for {cost} dinars.",
  "timeAdded": "Added two minutes for {cost} dinars."
},
ur: {
  "help": "مدد",
  "description": "مخطوطے کی پہیلی جاری رکھنے کے لیے ایک مدد منتخب کریں۔",
  "balance": "آپ کا بیلنس",
  "dinars": "{count} دینار",
  "reveal": "ایک حرف ظاہر کریں",
  "revealDescription": "کسی نامکمل لفظ کا ایک حرف ظاہر کریں۔",
  "none": "کوئی پوشیدہ حرف باقی نہیں",
  "addTime": "دو منٹ بڑھائیں",
  "timeDescription": "باقی وقت میں دو منٹ بڑھائیں۔",
  "close": "بند کریں",
  "insufficient": "دینار ناکافی ہیں",
  "earnMore": "مہمات اور چیلنجوں سے مزید دینار حاصل کریں، پھر دوبارہ کوشش کریں۔",
  "ok": "ٹھیک ہے",
  "revealed": "{cost} دینار کے عوض ایک حرف ظاہر کیا گیا۔",
  "timeAdded": "{cost} دینار کے عوض دو منٹ بڑھائے گئے۔"
},
id: {
  "help": "Bantuan",
  "description": "Pilih bantuan untuk melanjutkan teka-teki manuskrip.",
  "balance": "Saldo Anda",
  "dinars": "{count} dinar",
  "reveal": "Tampilkan satu huruf",
  "revealDescription": "Tampilkan satu huruf dari kata yang belum terjawab.",
  "none": "Tidak ada huruf tersembunyi",
  "addTime": "Tambah dua menit",
  "timeDescription": "Tambahkan dua menit ke waktu yang tersisa.",
  "close": "Tutup",
  "insufficient": "Dinar tidak cukup",
  "earnMore": "Dapatkan lebih banyak dinar dari kampanye dan tantangan, lalu coba lagi.",
  "ok": "OK",
  "revealed": "Satu huruf ditampilkan dengan biaya {cost} dinar.",
  "timeAdded": "Dua menit ditambahkan dengan biaya {cost} dinar."
},
tr: {
  "help": "Yardım",
  "description": "Yazma bulmacasına devam etmek için bir yardım seçin.",
  "balance": "Bakiyeniz",
  "dinars": "{count} dinar",
  "reveal": "Bir harf aç",
  "revealDescription": "Henüz çözülmemiş bir kelimenin bir harfini aç.",
  "none": "Gizli harf kalmadı",
  "addTime": "İki dakika ekle",
  "timeDescription": "Kalan süreye iki dakika ekle.",
  "close": "Kapat",
  "insufficient": "Yeterli dinar yok",
  "earnMore": "Seferlerden ve meydan okumalardan daha fazla dinar kazanıp tekrar deneyin.",
  "ok": "Tamam",
  "revealed": "{cost} dinar karşılığında bir harf açıldı.",
  "timeAdded": "{cost} dinar karşılığında iki dakika eklendi."
},
fr: {
  "help": "Aide",
  "description": "Choisissez une aide pour poursuivre l’énigme du manuscrit.",
  "balance": "Votre solde",
  "dinars": "{count} dinars",
  "reveal": "Révéler une lettre",
  "revealDescription": "Révélez une lettre d’un mot non résolu.",
  "none": "Aucune lettre cachée restante",
  "addTime": "Ajouter deux minutes",
  "timeDescription": "Ajoutez deux minutes au temps restant.",
  "close": "Fermer",
  "insufficient": "Dinars insuffisants",
  "earnMore": "Gagnez davantage de dinars dans les campagnes et les défis, puis réessayez.",
  "ok": "OK",
  "revealed": "Une lettre a été révélée pour {cost} dinars.",
  "timeAdded": "Deux minutes ont été ajoutées pour {cost} dinars."
}
};
export function crosswordHelpText(locale: AppLocale, key: CrosswordHelpKey, values: Record<string, string | number> = {}): string {
  return CROSSWORD_HELP_MESSAGES[locale][key].replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}

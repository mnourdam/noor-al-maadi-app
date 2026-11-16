import type { AppLocale } from './locale-policy';

/** Controls only. Never use translated labels as game answers, IDs or reward keys. */
const ar = {
  lastAttempt: 'فرصتك الأخيرة', attempts: 'المحاولات المتبقية', attemptCount: '{remaining} من {total}', timer: 'عدّاد الوقت',
  exitTitle: 'الخروج من التحدي؟', exitDescription: 'إذا خرجت الآن ستفقد تقدمك الحالي في هذه المرحلة.', continue: 'متابعة التحدي', exit: 'خروج',
  expired: 'انتهى الوقت', addTime: 'إضافة دقيقتين', end: 'إنهاء التحدي', insufficient: 'لا توجد دنانير كافية', okay: 'حسنًا',
  offer: 'يمكنك إضافة دقيقتين ومتابعة التحدي مقابل {cost} دنانير.', price: '{cost} دنانير', balance: 'رصيدك الحالي: {balance} دينار', required: 'تحتاج إلى {cost} دنانير لإضافة دقيقتين إلى الوقت.',
} as const;
export type GameControlKey = keyof typeof ar;
export type GameControlMessages = Readonly<Record<GameControlKey, string>>;
export const GAME_CONTROL_MESSAGES: Readonly<Record<AppLocale, GameControlMessages>> = {
  ar,
  en: {
    lastAttempt: 'Your last attempt', attempts: 'Attempts remaining', attemptCount: '{remaining} of {total}', timer: 'Countdown timer',
    exitTitle: 'Leave the challenge?', exitDescription: 'If you leave now, you will lose your current progress in this stage.', continue: 'Continue challenge', exit: 'Leave',
    expired: 'Time is up', addTime: 'Add two minutes', end: 'End challenge', insufficient: 'Not enough dinars', okay: 'OK',
    offer: 'Add two minutes and continue the challenge for {cost} dinars.', price: '{cost} dinars', balance: 'Current balance: {balance} dinars', required: 'You need {cost} dinars to add two minutes.',
  },
  ur: {
    lastAttempt: 'آپ کا آخری موقع', attempts: 'باقی کوششیں', attemptCount: '{total} میں سے {remaining}', timer: 'باقی وقت کا ٹائمر',
    exitTitle: 'چیلنج سے نکلیں؟', exitDescription: 'اب نکلنے سے اس مرحلے میں آپ کی موجودہ پیش رفت ضائع ہو جائے گی۔', continue: 'چیلنج جاری رکھیں', exit: 'نکلیں',
    expired: 'وقت ختم ہو گیا', addTime: 'دو منٹ بڑھائیں', end: 'چیلنج ختم کریں', insufficient: 'دینار ناکافی ہیں', okay: 'ٹھیک ہے',
    offer: '{cost} دینار کے عوض دو منٹ بڑھا کر چیلنج جاری رکھیں۔', price: '{cost} دینار', balance: 'موجودہ بیلنس: {balance} دینار', required: 'دو منٹ بڑھانے کے لیے آپ کو {cost} دینار درکار ہیں۔',
  },
  id: {
    lastAttempt: 'Kesempatan terakhir Anda', attempts: 'Percobaan tersisa', attemptCount: '{remaining} dari {total}', timer: 'Penghitung waktu mundur',
    exitTitle: 'Keluar dari tantangan?', exitDescription: 'Jika keluar sekarang, kemajuan Anda saat ini pada tahap ini akan hilang.', continue: 'Lanjutkan tantangan', exit: 'Keluar',
    expired: 'Waktu habis', addTime: 'Tambah dua menit', end: 'Akhiri tantangan', insufficient: 'Dinar tidak cukup', okay: 'Oke',
    offer: 'Tambah dua menit dan lanjutkan tantangan dengan {cost} dinar.', price: '{cost} dinar', balance: 'Saldo saat ini: {balance} dinar', required: 'Anda memerlukan {cost} dinar untuk menambah dua menit.',
  },
  tr: {
    lastAttempt: 'Son deneme hakkınız', attempts: 'Kalan deneme hakkı', attemptCount: '{remaining} / {total}', timer: 'Geri sayım sayacı',
    exitTitle: 'Mücadeleden çıkılsın mı?', exitDescription: 'Şimdi çıkarsanız bu aşamadaki mevcut ilerlemenizi kaybedersiniz.', continue: 'Mücadeleye devam et', exit: 'Çık',
    expired: 'Süre doldu', addTime: 'İki dakika ekle', end: 'Mücadeleyi bitir', insufficient: 'Yeterli dinar yok', okay: 'Tamam',
    offer: '{cost} dinar karşılığında iki dakika ekleyip mücadeleye devam edebilirsiniz.', price: '{cost} dinar', balance: 'Mevcut bakiyeniz: {balance} dinar', required: 'İki dakika eklemek için {cost} dinar gerekiyor.',
  },
  fr: {
    lastAttempt: 'Votre dernière tentative', attempts: 'Tentatives restantes', attemptCount: '{remaining} sur {total}', timer: 'Compte à rebours',
    exitTitle: 'Quitter le défi ?', exitDescription: 'Si vous quittez maintenant, vous perdrez votre progression actuelle dans cette étape.', continue: 'Continuer le défi', exit: 'Quitter',
    expired: 'Temps écoulé', addTime: 'Ajouter deux minutes', end: 'Terminer le défi', insufficient: 'Pas assez de dinars', okay: 'OK',
    offer: 'Ajoutez deux minutes et continuez le défi pour {cost} dinars.', price: '{cost} dinars', balance: 'Solde actuel : {balance} dinars', required: 'Il vous faut {cost} dinars pour ajouter deux minutes.',
  },
};

/** Fixed purchase cost is plural; the variable balance needs singular forms. */
export function gameControlText(locale: AppLocale, key: GameControlKey, values: Record<string, number> = {}): string {
  let text = GAME_CONTROL_MESSAGES[locale][key];
  if (key === 'balance' && values.balance === 1 && locale === 'en') text = 'Current balance: {balance} dinar';
  if (key === 'balance' && (values.balance === 0 || values.balance === 1) && locale === 'fr') text = 'Solde actuel : {balance} dinar';
  return text.replace(/\{(\w+)\}/g, (token, name: string) => name in values ? String(values[name]) : token);
}

import type { AppLocale } from './locale-policy';

/** Reading/review controls only; not a translation of chapter content. */
const ar = {
  reread: 'إعادة قراءة نص الفصل', rereadTitle: 'نص الفصل:', rereadDescription: 'راجع ما قرأته ثم عد إلى نشاطك كما تركته، دون تغيير تقدمك أو مكافآتك.', rereadReturn: 'العودة إلى النشاط', rereadIntro: 'مقدمة الفصل', rereadHistory: 'قراءة تاريخية', rereadText: 'نص القراءة', rereadContinuation: 'متابعة القراءة', close: 'إغلاق',
  completedReviewChapter: 'أنهيتَ هذا الفصل — راجع الأنشطة المكتملة دون أثر على تقدمك.',
  completedReviewCampaign: 'أنهيتَ هذه الحملة — أنت الآن في وضع المراجعة. تصفّح المحتوى دون أثر على تقدمك.',
  completedReviewEmpty: 'لا تتوفر أنشطة مكتملة موثقة للمراجعة في هذا الفصل.',
  completedReviewNext: 'الفصل التالي', completedReviewBack: 'عودة لقائمة الفصول',
} as const;
export type ReadingReviewKey = keyof typeof ar;
export type ReadingReviewMessages = Readonly<Record<ReadingReviewKey, string>>;
const en = {
  reread: 'Reread chapter text', rereadTitle: 'Chapter text:', rereadDescription: 'Review what you have read, then return to your activity as you left it, without changing progress or rewards.', rereadReturn: 'Return to activity', rereadIntro: 'Chapter introduction', rereadHistory: 'Historical reading', rereadText: 'Reading text', rereadContinuation: 'Continue reading', close: 'Close',
  completedReviewChapter: 'You completed this chapter. Review completed activities without changing your progress.',
  completedReviewCampaign: 'You completed this campaign. Browse the review without changing your progress.',
  completedReviewEmpty: 'No recorded completed activities are available to review in this chapter.',
  completedReviewNext: 'Next chapter', completedReviewBack: 'Back to chapter list',
} satisfies ReadingReviewMessages;
const ur = {
  "reread": "باب کا متن دوبارہ پڑھیں",
  "rereadTitle": "باب کا متن:",
  "rereadDescription": "جو متن آپ پڑھ چکے ہیں اسے دوبارہ دیکھیں، پھر اپنی سرگرمی میں وہیں واپس جائیں جہاں آپ تھے۔ آپ کی پیش رفت اور انعامات میں کوئی تبدیلی نہیں ہوگی۔",
  "rereadReturn": "سرگرمی میں واپس جائیں",
  "rereadIntro": "باب کا تعارف",
  "rereadHistory": "تاریخی مطالعہ",
  "rereadText": "مطالعے کا متن",
  "rereadContinuation": "مطالعہ جاری رکھیں",
  "close": "بند کریں",
  "completedReviewChapter": "آپ نے یہ باب مکمل کر لیا ہے۔ اپنی پیش رفت میں تبدیلی کیے بغیر مکمل شدہ سرگرمیوں کا دوبارہ جائزہ لیں۔",
  "completedReviewCampaign": "آپ نے یہ مہم مکمل کر لی ہے۔ اب آپ جائزے کے موڈ میں ہیں۔ اپنی پیش رفت میں تبدیلی کیے بغیر مواد کا دوبارہ جائزہ لیں۔",
  "completedReviewEmpty": "اس باب میں دوبارہ جائزے کے لیے کوئی ایسی سرگرمی دستیاب نہیں جس کی تکمیل ریکارڈ ہو۔",
  "completedReviewNext": "اگلا باب",
  "completedReviewBack": "ابواب کی فہرست میں واپس جائیں"
} satisfies ReadingReviewMessages;
const id = {
  "reread": "Baca ulang teks bab",
  "rereadTitle": "Teks bab:",
  "rereadDescription": "Baca kembali teks yang sudah Anda baca, lalu kembali ke aktivitas Anda di posisi semula tanpa mengubah kemajuan atau hadiah Anda.",
  "rereadReturn": "Kembali ke aktivitas",
  "rereadIntro": "Pengantar bab",
  "rereadHistory": "Bacaan sejarah",
  "rereadText": "Teks bacaan",
  "rereadContinuation": "Lanjutkan membaca",
  "close": "Tutup",
  "completedReviewChapter": "Anda telah menyelesaikan bab ini. Tinjau aktivitas yang sudah selesai tanpa mengubah kemajuan Anda.",
  "completedReviewCampaign": "Anda telah menyelesaikan kampanye ini. Anda kini berada dalam mode peninjauan. Tinjau kembali isinya tanpa mengubah kemajuan Anda.",
  "completedReviewEmpty": "Tidak ada aktivitas yang tercatat selesai untuk ditinjau dalam bab ini.",
  "completedReviewNext": "Bab berikutnya",
  "completedReviewBack": "Kembali ke daftar bab"
} satisfies ReadingReviewMessages;
const tr = {
  "reread": "Bölüm metnini yeniden oku",
  "rereadTitle": "Bölüm metni:",
  "rereadDescription": "Okuduğunuz metni gözden geçirin, ardından ilerlemeniz veya ödülleriniz değişmeden etkinliğinize kaldığınız yerden dönün.",
  "rereadReturn": "Etkinliğe dön",
  "rereadIntro": "Bölüm girişi",
  "rereadHistory": "Tarih okuması",
  "rereadText": "Okuma metni",
  "rereadContinuation": "Okumaya devam et",
  "close": "Kapat",
  "completedReviewChapter": "Bu bölümü tamamladınız. İlerlemeniz değişmeden tamamladığınız etkinlikleri gözden geçirin.",
  "completedReviewCampaign": "Bu kampanyayı tamamladınız. Şu anda gözden geçirme modundasınız. İlerlemeniz değişmeden içeriği inceleyebilirsiniz.",
  "completedReviewEmpty": "Bu bölümde gözden geçirilebilecek, tamamlandığı kaydedilmiş bir etkinlik bulunmuyor.",
  "completedReviewNext": "Sonraki bölüm",
  "completedReviewBack": "Bölüm listesine dön"
} satisfies ReadingReviewMessages;
const fr = {
  "reread": "Relire le texte du chapitre",
  "rereadTitle": "Texte du chapitre :",
  "rereadDescription": "Relisez les textes déjà consultés, puis reprenez votre activité là où vous en étiez, sans modifier votre progression ni vos récompenses.",
  "rereadReturn": "Revenir à l’activité",
  "rereadIntro": "Introduction du chapitre",
  "rereadHistory": "Lecture historique",
  "rereadText": "Texte à lire",
  "rereadContinuation": "Poursuivre la lecture",
  "close": "Fermer",
  "completedReviewChapter": "Vous avez terminé ce chapitre. Revoyez les activités terminées sans modifier votre progression.",
  "completedReviewCampaign": "Vous avez terminé cette campagne. Vous êtes maintenant en mode révision. Parcourez son contenu sans modifier votre progression.",
  "completedReviewEmpty": "Aucune activité enregistrée comme terminée n’est disponible à revoir dans ce chapitre.",
  "completedReviewNext": "Chapitre suivant",
  "completedReviewBack": "Revenir à la liste des chapitres"
} satisfies ReadingReviewMessages;

export const READING_REVIEW_MESSAGES: Readonly<Record<AppLocale, ReadingReviewMessages>> = { ar, en, ur, id, tr, fr };

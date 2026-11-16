import type { AppLocale } from "./locale-policy";

// UI only: never translate public notices, usernames or real messages.
const ar = {
  signUp: "سجّل لتبدأ",
  noFriends: "لا يوجد أصدقاء بعد",
  friendOne: "الأصدقاء: {count}",
  friendMany: "الأصدقاء: {count}",
  noRequests: "لا توجد طلبات",
  requestOne: "طلب جديد",
  requestMany: "طلبات جديدة: {count}",
  rankStart: "ابدأ رحلتك لتظهر في الترتيب",
  title: "مجتمع إرث",
  subtitle: "تواصل مع الباحثين، قارن تقدمك، وارتقِ في لوحة الترتيب.",
  pendingOne: "لديك طلب صداقة جديد",
  pendingMany: "طلبات صداقة بانتظار الرد: {count}",
  friends: "الأصدقاء",
  requests: "الطلبات",
  yourRank: "ترتيبك",
  guestHint: "سجّل الدخول لإضافة أصدقاء ومتابعة تقدمهم.",
  emptyHint: "لم تضف أصدقاء بعد. ابدأ بإضافة أول باحث يرافقك في الرحلة.",
  recentResearchers: "آخر الباحثين في مجتمعك",
  pendingHint: "لديك طلبات بانتظار الرد. ابدأ بقبولها لبناء مجتمعك.",
  viewFriends: "عرض الأصدقاء",
  leaderboard: "لوحة الترتيب",
  addFriend: "إضافة صديق",
  noticeAria: "إسهامات القرّاء في تحسين إرث",
  noticeTitle: "ساهم قرّاء في تحسين هذا المحتوى",
  showMore: "عرض {count} إضافيّة",
  anonymousNote: "المساهمات مجهولة الهوية — الاعتراف تحريري لا اجتماعي.",
  applied: "ساهمت في تحسين إرث",
  underReview: "قيد المراجعة التحريرية",
  fact_correction: "تصحيح معلومة",
  additional_context: "سياق إضافي",
  source_reference: "مصدر أو مرجع",
  translation_nuance: "دقة لغوية",
  other: "أخرى",
} as const;
export type CommunityControlMessages = Readonly<Record<keyof typeof ar, string>>;
const en = {
  signUp: "Sign up to get started",
  noFriends: "No friends yet",
  friendOne: "{count} friend",
  friendMany: "{count} friends",
  noRequests: "No requests",
  requestOne: "New request",
  requestMany: "{count} new requests",
  rankStart: "Begin your journey to appear on the leaderboard",
  title: "Irth community",
  subtitle: "Connect with fellow researchers, compare your progress, and climb the leaderboard.",
  pendingOne: "You have a new friend request",
  pendingMany: "You have {count} friend requests awaiting a response",
  friends: "Friends",
  requests: "Requests",
  yourRank: "Your rank",
  guestHint: "Sign in to add friends and follow their progress.",
  emptyHint:
    "You have not added any friends yet. Add your first fellow researcher to share the journey.",
  recentResearchers: "Recent researchers in your community",
  pendingHint:
    "You have requests awaiting a response. Start accepting them to build your community.",
  viewFriends: "View friends",
  leaderboard: "Leaderboard",
  addFriend: "Add friend",
  noticeAria: "Readers’ contributions to improving Irth",
  noticeTitle: "Readers helped improve this content",
  showMore: "Show {count} more",
  anonymousNote: "Contributions are anonymous. Recognition is editorial, not social.",
  applied: "You helped improve Irth",
  underReview: "Under editorial review",
  fact_correction: "Factual correction",
  additional_context: "Additional context",
  source_reference: "Source or reference",
  translation_nuance: "Linguistic accuracy",
  other: "Other",
} satisfies CommunityControlMessages;
const ur = {
  signUp: "شروع کرنے کے لیے رجسٹر کریں",
  noFriends: "ابھی کوئی دوست نہیں",
  friendOne: "{count} دوست",
  friendMany: "{count} دوست",
  noRequests: "کوئی درخواست نہیں",
  requestOne: "نئی درخواست",
  requestMany: "{count} نئی درخواستیں",
  rankStart: "درجہ بندی میں شامل ہونے کے لیے اپنا سفر شروع کریں",
  title: "ارث کی برادری",
  subtitle: "ساتھی محققین سے رابطہ کریں، اپنی پیش رفت کا موازنہ کریں اور درجہ بندی میں آگے بڑھیں۔",
  pendingOne: "آپ کو دوستی کی ایک نئی درخواست موصول ہوئی ہے",
  pendingMany: "دوستی کی {count} درخواستیں آپ کے جواب کی منتظر ہیں",
  friends: "دوست",
  requests: "درخواستیں",
  yourRank: "آپ کا درجہ",
  guestHint: "دوست شامل کرنے اور ان کی پیش رفت دیکھنے کے لیے سائن ان کریں۔",
  emptyHint:
    "آپ نے ابھی کوئی دوست شامل نہیں کیا۔ سفر میں ساتھ دینے کے لیے پہلے ساتھی محقق کو شامل کریں۔",
  recentResearchers: "آپ کی برادری کے حالیہ محققین",
  pendingHint:
    "درخواستیں آپ کے جواب کی منتظر ہیں۔ اپنی برادری بنانے کے لیے انہیں قبول کرنا شروع کریں۔",
  viewFriends: "دوست دیکھیں",
  leaderboard: "درجہ بندی",
  addFriend: "دوست شامل کریں",
  noticeAria: "ارث کی بہتری میں قارئین کی شراکتیں",
  noticeTitle: "قارئین نے اس مواد کو بہتر بنانے میں حصہ لیا",
  showMore: "مزید {count} دکھائیں",
  anonymousNote: "شراکتیں گمنام ہیں۔ اعتراف ادارتی ہے، سماجی نہیں۔",
  applied: "آپ نے ارث کو بہتر بنانے میں حصہ لیا",
  underReview: "ادارتی جائزہ جاری ہے",
  fact_correction: "معلومات کی تصحیح",
  additional_context: "اضافی سیاق و سباق",
  source_reference: "ماخذ یا حوالہ",
  translation_nuance: "لسانی درستگی",
  other: "دیگر",
} satisfies CommunityControlMessages;
const id = {
  signUp: "Daftar untuk memulai",
  noFriends: "Belum ada teman",
  friendOne: "{count} teman",
  friendMany: "{count} teman",
  noRequests: "Tidak ada permintaan",
  requestOne: "Permintaan baru",
  requestMany: "{count} permintaan baru",
  rankStart: "Mulai perjalanan Anda agar tampil di papan peringkat",
  title: "Komunitas Irth",
  subtitle: "Terhubung dengan sesama peneliti, bandingkan kemajuan, dan naik di papan peringkat.",
  pendingOne: "Anda memiliki permintaan pertemanan baru",
  pendingMany: "Anda memiliki {count} permintaan pertemanan yang menunggu tanggapan",
  friends: "Teman",
  requests: "Permintaan",
  yourRank: "Peringkat Anda",
  guestHint: "Masuk untuk menambahkan teman dan mengikuti kemajuan mereka.",
  emptyHint:
    "Anda belum menambahkan teman. Tambahkan rekan peneliti pertama untuk menemani perjalanan Anda.",
  recentResearchers: "Peneliti terbaru di komunitas Anda",
  pendingHint:
    "Ada permintaan yang menunggu tanggapan Anda. Mulailah menerimanya untuk membangun komunitas.",
  viewFriends: "Lihat teman",
  leaderboard: "Papan peringkat",
  addFriend: "Tambah teman",
  noticeAria: "Kontribusi pembaca untuk menyempurnakan Irth",
  noticeTitle: "Pembaca membantu menyempurnakan konten ini",
  showMore: "Tampilkan {count} lagi",
  anonymousNote: "Kontribusi bersifat anonim. Pengakuan bersifat editorial, bukan sosial.",
  applied: "Anda membantu menyempurnakan Irth",
  underReview: "Sedang ditinjau oleh editor",
  fact_correction: "Koreksi fakta",
  additional_context: "Konteks tambahan",
  source_reference: "Sumber atau referensi",
  translation_nuance: "Ketepatan bahasa",
  other: "Lainnya",
} satisfies CommunityControlMessages;
const tr = {
  signUp: "Başlamak için kaydol",
  noFriends: "Henüz arkadaş yok",
  friendOne: "{count} arkadaş",
  friendMany: "{count} arkadaş",
  noRequests: "İstek yok",
  requestOne: "Yeni istek",
  requestMany: "{count} yeni istek",
  rankStart: "Sıralamada yer almak için yolculuğuna başla",
  title: "Irth topluluğu",
  subtitle: "Diğer araştırmacılarla bağlantı kur, ilerlemeni karşılaştır ve sıralamada yüksel.",
  pendingOne: "Yeni bir arkadaşlık isteğin var",
  pendingMany: "Yanıt bekleyen {count} arkadaşlık isteğin var",
  friends: "Arkadaşlar",
  requests: "İstekler",
  yourRank: "Sıralaman",
  guestHint: "Arkadaş eklemek ve ilerlemelerini takip etmek için giriş yap.",
  emptyHint: "Henüz arkadaş eklemedin. Yolculuğuna eşlik edecek ilk araştırmacı arkadaşını ekle.",
  recentResearchers: "Topluluğundaki son araştırmacılar",
  pendingHint:
    "Yanıt bekleyen isteklerin var. Topluluğunu oluşturmak için bunları kabul etmeye başla.",
  viewFriends: "Arkadaşları gör",
  leaderboard: "Sıralama",
  addFriend: "Arkadaş ekle",
  noticeAria: "Okurların Irth’ü geliştirmeye katkıları",
  noticeTitle: "Okurlar bu içeriğin geliştirilmesine katkıda bulundu",
  showMore: "{count} tane daha göster",
  anonymousNote: "Katkılar anonimdir. Takdir, sosyal değil editoryal niteliktedir.",
  applied: "Irth’ün geliştirilmesine katkıda bulundun",
  underReview: "Editoryal incelemede",
  fact_correction: "Bilgi düzeltmesi",
  additional_context: "Ek bağlam",
  source_reference: "Kaynak veya referans",
  translation_nuance: "Dilsel doğruluk",
  other: "Diğer",
} satisfies CommunityControlMessages;
const fr = {
  signUp: "Inscrivez-vous pour commencer",
  noFriends: "Pas encore d’amis",
  friendOne: "{count} ami",
  friendMany: "{count} amis",
  noRequests: "Aucune demande",
  requestOne: "Nouvelle demande",
  requestMany: "{count} nouvelles demandes",
  rankStart: "Commencez votre parcours pour apparaître au classement",
  title: "Communauté Irth",
  subtitle: "Échangez avec d’autres chercheurs, comparez vos progrès et montez dans le classement.",
  pendingOne: "Vous avez une nouvelle demande d’amitié",
  pendingMany: "Vous avez {count} demandes d’amitié en attente de réponse",
  friends: "Amis",
  requests: "Demandes",
  yourRank: "Votre rang",
  guestHint: "Connectez-vous pour ajouter des amis et suivre leurs progrès.",
  emptyHint:
    "Vous n’avez pas encore ajouté d’amis. Ajoutez un premier compagnon de recherche pour partager votre parcours.",
  recentResearchers: "Les derniers chercheurs de votre communauté",
  pendingHint:
    "Des demandes attendent votre réponse. Commencez par les accepter pour bâtir votre communauté.",
  viewFriends: "Voir les amis",
  leaderboard: "Classement",
  addFriend: "Ajouter un ami",
  noticeAria: "Contributions des lecteurs à l’amélioration d’Irth",
  noticeTitle: "Des lecteurs ont contribué à améliorer ce contenu",
  showMore: "Afficher {count} de plus",
  anonymousNote:
    "Les contributions sont anonymes. La reconnaissance est éditoriale, et non sociale.",
  applied: "Vous avez contribué à améliorer Irth",
  underReview: "En cours de révision éditoriale",
  fact_correction: "Correction factuelle",
  additional_context: "Contexte supplémentaire",
  source_reference: "Source ou référence",
  translation_nuance: "Précision linguistique",
  other: "Autre",
} satisfies CommunityControlMessages;
export const COMMUNITY_CONTROL_MESSAGES: Readonly<Record<AppLocale, CommunityControlMessages>> = {
  ar,
  en,
  ur,
  id,
  tr,
  fr,
};
export function communityCount(
  locale: AppLocale,
  kind: "friends" | "requests" | "pending" | "more",
  count: number,
): string {
  const t = COMMUNITY_CONTROL_MESSAGES[locale];
  const template =
    kind === "friends"
      ? count === 0
        ? t.noFriends
        : count === 1
          ? t.friendOne
          : t.friendMany
      : kind === "requests"
        ? count === 0
          ? t.noRequests
          : count === 1
            ? t.requestOne
            : t.requestMany
        : kind === "pending"
          ? count === 1
            ? t.pendingOne
            : t.pendingMany
          : t.showMore;
  return template.replace("{count}", String(count));
}

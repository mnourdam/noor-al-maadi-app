import type { AppLocale } from "./locale-policy";

/** Navigation and home summary chrome only. No content, routes, reward or locale activation changes. */
const ar = {
  home: "الرئيسية",
  campaigns: "الحملات",
  encyclopedia: "الموسوعة",
  atlas: "الأطلس",
  museum: "المتحف",
  profile: "حسابي",
  navigation: "التنقل الرئيسي",
  homeProfileLink: "بطاقة هويتك — الذهاب إلى حسابي",
  homeGuest: "ضيف",
  homeCompletedCampaigns: "الحملات المكتملة",
  homeCompletedInvestigations: "التحقيقات المنجزة",
  homeReadStories: "القصص المقروءة",
} as const;
export type HomeNavigationKey = keyof typeof ar;
type HomeNavigationMessages = Readonly<Record<HomeNavigationKey, string>>;
const en = {
  home: "Home",
  campaigns: "Campaigns",
  encyclopedia: "Encyclopedia",
  atlas: "Atlas",
  museum: "Museum",
  profile: "My account",
  navigation: "Main navigation",
  homeProfileLink: "Your identity card — go to My account",
  homeGuest: "Guest",
  homeCompletedCampaigns: "Completed campaigns",
  homeCompletedInvestigations: "Completed investigations",
  homeReadStories: "Stories read",
} satisfies HomeNavigationMessages;
const ur = {
  home: "مرکزی صفحہ",
  campaigns: "مہمات",
  encyclopedia: "موسوعہ",
  atlas: "اٹلس",
  museum: "عجائب گھر",
  profile: "میرا اکاؤنٹ",
  navigation: "مرکزی نیویگیشن",
  homeProfileLink: "آپ کا شناختی کارڈ — میرے اکاؤنٹ پر جائیں",
  homeGuest: "مہمان",
  homeCompletedCampaigns: "مکمل کردہ مہمات",
  homeCompletedInvestigations: "مکمل کردہ تحقیقات",
  homeReadStories: "پڑھی گئی کہانیاں",
} satisfies HomeNavigationMessages;
const id = {
  home: "Beranda",
  campaigns: "Kampanye",
  encyclopedia: "Ensiklopedia",
  atlas: "Atlas",
  museum: "Museum",
  profile: "Akun saya",
  navigation: "Navigasi utama",
  homeProfileLink: "Kartu identitas Anda — buka Akun saya",
  homeGuest: "Tamu",
  homeCompletedCampaigns: "Kampanye selesai",
  homeCompletedInvestigations: "Investigasi selesai",
  homeReadStories: "Cerita yang sudah dibaca",
} satisfies HomeNavigationMessages;
const tr = {
  home: "Ana sayfa",
  campaigns: "Kampanyalar",
  encyclopedia: "Ansiklopedi",
  atlas: "Atlas",
  museum: "Müze",
  profile: "Hesabım",
  navigation: "Ana gezinme",
  homeProfileLink: "Kimlik kartınız — Hesabım sayfasına git",
  homeGuest: "Misafir",
  homeCompletedCampaigns: "Tamamlanan kampanyalar",
  homeCompletedInvestigations: "Tamamlanan araştırmalar",
  homeReadStories: "Okunan hikâyeler",
} satisfies HomeNavigationMessages;
const fr = {
  home: "Accueil",
  campaigns: "Campagnes",
  encyclopedia: "Encyclopédie",
  atlas: "Atlas",
  museum: "Musée",
  profile: "Mon compte",
  navigation: "Navigation principale",
  homeProfileLink: "Votre carte d’identité — accéder à Mon compte",
  homeGuest: "Invité",
  homeCompletedCampaigns: "Campagnes terminées",
  homeCompletedInvestigations: "Enquêtes terminées",
  homeReadStories: "Histoires lues",
} satisfies HomeNavigationMessages;
export const HOME_NAVIGATION_MESSAGES: Readonly<Record<AppLocale, HomeNavigationMessages>> = {
  ar,
  en,
  ur,
  id,
  tr,
  fr,
};

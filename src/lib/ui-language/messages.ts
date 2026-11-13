/** UI chrome only. Never use these keys to identify content, answers or routes. */
export const arabic = {
  home: 'الرئيسية', campaigns: 'الحملات', encyclopedia: 'الموسوعة', atlas: 'الأطلس', museum: 'المتحف', profile: 'حسابي',
  navigation: 'التنقل الرئيسي', language: 'لغة الواجهة', arabic: 'العربية', english: 'English — preview',
  scope: 'معاينة اللغة تشمل التنقل وتسميات الحالة الأساسية فقط؛ الصفحات والمحتوى ما زالت بالعربية.',
  hearts: 'القلوب', nextHeart: 'القلب التالي خلال', dinars: 'الدنانير', experience: 'الخبرة', streak: 'الحماسة', notifications: 'الإشعارات',
} as const;
export type MessageKey = keyof typeof arabic;
export type UiLanguage = 'ar' | 'en';
const english = {
  home: 'Home', campaigns: 'Campaigns', encyclopedia: 'Encyclopedia', atlas: 'Atlas', museum: 'Museum', profile: 'My account',
  navigation: 'Main navigation', language: 'Interface language', arabic: 'العربية', english: 'English — preview',
  scope: 'Preview: navigation and main status labels only. Pages, popovers and content remain in Arabic.',
  hearts: 'Hearts', nextHeart: 'Next heart in', dinars: 'Dinars', experience: 'Experience', streak: 'Streak', notifications: 'Notifications',
} satisfies Record<MessageKey, string>;
export const UI_MESSAGES: Readonly<Record<UiLanguage, Readonly<Record<MessageKey, string>>>> = { ar: arabic, en: english };
export const uiDirection = (language: UiLanguage) => language === 'ar' ? 'rtl' : 'ltr';

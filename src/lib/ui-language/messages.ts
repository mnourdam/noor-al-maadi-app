import { STAT_EXPLANATION_MESSAGES } from "./stat-explanation-messages";
import { HOME_NAVIGATION_MESSAGES } from "./home-navigation-messages";
import { HEART_CONTROL_MESSAGES } from "./heart-control-messages";
import { ACHIEVEMENT_TAXONOMY_MESSAGES } from "./achievement-taxonomy-messages";
import { COLLECTION_CONTROL_MESSAGES } from "./collection-control-messages";
import { STORY_UNLOCK_MESSAGES } from "./story-unlock-messages";
import { CATALOG_CONTROL_MESSAGES } from "./catalog-control-messages";
import { ACHIEVEMENT_CONTROL_MESSAGES } from './achievement-control-messages';
import { READING_REVIEW_MESSAGES } from './reading-review-messages';
import { LOCALE_META } from './locale-policy';
/** UI chrome only. Never use these keys to identify content, answers or routes. */
export const arabic = {
  encyclopediaUnavailable: "تعذّر فتح المكتبة الآن. تحقّق من الاتصال ثم أعد المحاولة.",
  encyclopediaRetry: "إعادة المحاولة",
  encyclopediaRetrying: "جارٍ إعادة المحاولة…",
  ...HOME_NAVIGATION_MESSAGES.ar,
  language: 'لغة الواجهة', arabic: 'العربية', english: 'English — preview',
  scope: 'المعاينة تشمل التنقل وتسميات الحالة ونوافذ إحصاءات الرصيد وأزرار إعادة القراءة ونصوص الإنجازات وتبويبها وتفاصيلها وعناوين بطاقات القصص ومجموعاتها وملخصاتها المتاحة بالإنكليزية وإحصاءات المجموعة وأزرار قراءتها وأدوات بحث المكتبة وتصفيتها وتسميات بطاقات القصص والنصوص العامة لشروط فتحها؛ بقية تبويبات الحساب والواجهات والمحتوى ما زالت بالعربية.',
  ...READING_REVIEW_MESSAGES.ar,
  hearts: 'القلوب', nextHeart: 'القلب التالي خلال', dinars: 'الدنانير', experience: 'الخبرة', streak: 'الحماسة', notifications: 'الإشعارات',
  ...HEART_CONTROL_MESSAGES.ar,
  ...STAT_EXPLANATION_MESSAGES.ar,
  pointsRemaining: "متبقّي {amount} نقطة",
  hoursShort: "س",
  minutesShort: "د",
  daysUnit: "يوم",
  ...ACHIEVEMENT_TAXONOMY_MESSAGES.ar,
  ...ACHIEVEMENT_CONTROL_MESSAGES.ar,
  ...COLLECTION_CONTROL_MESSAGES.ar,
  ...CATALOG_CONTROL_MESSAGES.ar,
  ...STORY_UNLOCK_MESSAGES.ar,
} as const;
export type MessageKey = keyof typeof arabic;
export type UiLanguage = 'ar' | 'en';
const english = {
  encyclopediaUnavailable: "The library couldn’t be opened. Check your connection and try again.",
  encyclopediaRetry: "Retry",
  encyclopediaRetrying: "Retrying…",
  ...HOME_NAVIGATION_MESSAGES.en,
  language: 'Interface language', arabic: 'العربية', english: 'English — preview',
  scope: 'Preview: navigation, status labels and stat popovers, reread controls and achievement text, tab and detail controls, plus available authored English story-card and collection titles and summaries, with selected-collection statistics, reading controls and library search/filter controls, story-card labels and generated unlock labels. Other Profile tabs, interfaces and story content remain in Arabic.',
  ...READING_REVIEW_MESSAGES.en,
  hearts: 'Hearts', nextHeart: 'Next heart in', dinars: 'Dinars', experience: 'Experience', streak: 'Streak', notifications: 'Notifications',
  ...HEART_CONTROL_MESSAGES.en,
  ...STAT_EXPLANATION_MESSAGES.en,
  pointsRemaining: "{amount} points remaining",
  hoursShort: "h",
  minutesShort: "m",
  daysUnit: "days",
  ...ACHIEVEMENT_TAXONOMY_MESSAGES.en,
  ...ACHIEVEMENT_CONTROL_MESSAGES.en,
  ...COLLECTION_CONTROL_MESSAGES.en,
  ...CATALOG_CONTROL_MESSAGES.en,
  ...STORY_UNLOCK_MESSAGES.en,
} satisfies Record<MessageKey, string>;
export const UI_MESSAGES: Readonly<Record<UiLanguage, Readonly<Record<MessageKey, string>>>> = { ar: arabic, en: english };
export const uiDirection = (language: UiLanguage) => LOCALE_META[language].direction;

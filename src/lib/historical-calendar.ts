// ============================================================
// Historical Calendar Engine v1
// ------------------------------------------------------------
// Reusable calendar of dated historical events. Supports:
//   - multiple events per day
//   - Gregorian + (optional) Hijri date fields
//   - typed filters (state/battle/figure/scholar/city/event)
//   - importance levels for ranking
//   - related entity ids (deep links into the encyclopedia)
// Designed to scale to 365 days and many packs without
// architectural changes.
// ============================================================

import { getPackEntity } from "@/lib/packs/registry";
import { entityHref } from "@/components/EncyclopediaCard";
import type { PackEntity } from "@/lib/packs/types";

export type CalendarType =
  | "state" | "battle" | "figure" | "scholar" | "city" | "event" | "landmark";

export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  state:    "الدول",
  battle:   "المعارك",
  figure:   "الشخصيات",
  scholar:  "العلماء",
  city:     "المدن",
  event:    "الأحداث",
  landmark: "المعالم",
};

export const CALENDAR_TYPE_GLYPHS: Record<CalendarType, string> = {
  state: "🏛️", battle: "⚔️", figure: "🪶", scholar: "📚",
  city: "🏙️", event: "📜", landmark: "🕌",
};

export type Importance = 1 | 2 | 3;

export interface CalendarEvent {
  id: string;
  month: number;
  day: number;
  year: string;
  era: string;
  type: CalendarType;
  title: string;
  description: string;
  importance: Importance;
  hijriDay?: number;
  hijriMonth?: number;
  hijriMonthName?: string;
  relatedEntityIds?: string[];
  source?: string;
  imagePlaceholder?: string;
}

export const HIJRI_MONTHS = [
  "محرّم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة",
  "رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة",
];

const MONTHS_AR = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

export function gregorianLabel(e: Pick<CalendarEvent, "month" | "day">): string {
  return `${e.day} ${MONTHS_AR[e.month - 1]}`;
}

export function hijriLabel(e: Pick<CalendarEvent, "hijriDay" | "hijriMonth" | "hijriMonthName">): string | null {
  if (!e.hijriDay) return null;
  const name = e.hijriMonthName ?? (e.hijriMonth ? HIJRI_MONTHS[e.hijriMonth - 1] : null);
  if (!name) return null;
  return `${e.hijriDay} ${name}`;
}

export const MONTH_NAMES = MONTHS_AR;

// ============================================================
// Dataset — 50+ high-value starter entries.
// Prioritised: Prophetic → Rashidun → Umayyad → Abbasid → Ayyubid.
// ============================================================

const E = (e: CalendarEvent): CalendarEvent => e;

export const CALENDAR_EVENTS: CalendarEvent[] = [
  // Prophetic era
  E({ id:"c-001", month:3, day:12, year:"٦٢٤م/٢هـ", era:"seerah", type:"battle",
      title:"غزوة بدر الكبرى",
      description:"أول معركة فاصلة في تاريخ الإسلام، انتصر فيها ٣١٣ مسلمًا على ١٠٠٠ مشرك.",
      importance:3, hijriDay:17, hijriMonth:9,
      source:"السيرة النبوية لابن هشام" }),
  E({ id:"c-002", month:3, day:23, year:"٦٢٥م/٣هـ", era:"seerah", type:"battle",
      title:"غزوة أُحد",
      description:"معركةٌ بين قريش والمسلمين عند جبل أحد، ثبّتت دروس النصر والصبر.",
      importance:3, hijriDay:15, hijriMonth:10, source:"السيرة النبوية لابن هشام" }),
  E({ id:"c-003", month:9, day:24, year:"٦٢٢م/١هـ", era:"seerah", type:"event",
      title:"وصول النبي ﷺ إلى المدينة",
      description:"نزل النبي ﷺ في قُباء وأسّس أول مسجدٍ في الإسلام، وبدأ تاريخ المدينة.",
      importance:3, hijriDay:12, hijriMonth:3, source:"دلائل النبوة · البيهقي" }),
  E({ id:"c-004", month:7, day:16, year:"٦٢٢م/١هـ", era:"seerah", type:"event",
      title:"بداية التقويم الهجري",
      description:"اعتمد عمر بن الخطاب الهجرة النبوية بدايةً للتقويم الإسلامي.",
      importance:3, hijriDay:1, hijriMonth:1, source:"تاريخ الطبري" }),
  E({ id:"c-005", month:1, day:11, year:"٦٣٠م/٨هـ", era:"seerah", type:"event",
      title:"فتح مكة",
      description:"دخل النبي ﷺ مكة فاتحًا فطهّر الكعبة وأعلن العفو العام.",
      importance:3, hijriDay:20, hijriMonth:9, source:"السيرة النبوية لابن هشام" }),
  E({ id:"c-006", month:6, day:8, year:"٦٣٢م/١١هـ", era:"seerah", type:"event",
      title:"وفاة النبي ﷺ",
      description:"انتقل النبي محمد ﷺ إلى الرفيق الأعلى في المدينة المنورة.",
      importance:3, hijriDay:12, hijriMonth:3, source:"صحيح البخاري" }),
  E({ id:"c-007", month:3, day:6, year:"٦٢٧م/٥هـ", era:"seerah", type:"battle",
      title:"غزوة الخندق",
      description:"حصار المدينة من الأحزاب، وحفر الخندق بمشورة سلمان الفارسي.",
      importance:2, hijriDay:1, hijriMonth:10, source:"زاد المعاد · ابن القيم" }),

  // Rashidun era
  E({ id:"c-010", month:8, day:23, year:"٦٣٢م/١١هـ", era:"rashidun", type:"figure",
      title:"بيعة أبي بكر الصدّيق",
      description:"بُويع أبو بكر بعد سقيفة بني ساعدة فصار أوّل الخلفاء الراشدين.",
      importance:3, source:"تاريخ الطبري" }),
  E({ id:"c-011", month:12, day:1, year:"٦٣٤م/١٣هـ", era:"rashidun", type:"figure",
      title:"وفاة أبي بكر الصدّيق",
      description:"توفّي أوّل الخلفاء الراشدين بعد خلافةٍ دامت سنتين وثلاثة أشهر.",
      importance:2, source:"تاريخ الطبري" }),
  E({ id:"c-012", month:8, day:20, year:"٦٣٦م/١٥هـ", era:"rashidun", type:"battle",
      title:"معركة اليرموك",
      description:"ستة أيامٍ من القتال انتهت بهزيمة الروم وفتح الشام بقيادة خالد بن الوليد.",
      importance:3, hijriDay:5, hijriMonth:7, source:"فتوح البلدان · البلاذري" }),
  E({ id:"c-013", month:11, day:16, year:"٦٣٦م/١٥هـ", era:"rashidun", type:"battle",
      title:"معركة القادسية",
      description:"هزم سعد بن أبي وقاص جيش الفرس بقيادة رستم، ففُتحت أبواب العراق.",
      importance:3, source:"تاريخ الطبري" }),
  E({ id:"c-014", month:4, day:15, year:"٦٣٧م/١٦هـ", era:"rashidun", type:"event",
      title:"فتح بيت المقدس",
      description:"دخل عمر بن الخطاب القدس وكتب العهدة العمرية لأهلها.",
      importance:3, source:"تاريخ الطبري" }),
  E({ id:"c-015", month:12, day:26, year:"٦٤٤م/٢٣هـ", era:"rashidun", type:"event",
      title:"استشهاد عمر بن الخطاب",
      description:"طعنه أبو لؤلؤة المجوسي في صلاة الفجر بالمدينة المنورة.",
      importance:3, hijriDay:26, hijriMonth:12, source:"تاريخ الطبري" }),
  E({ id:"c-016", month:6, day:17, year:"٦٥٦م/٣٥هـ", era:"rashidun", type:"event",
      title:"استشهاد عثمان بن عفّان",
      description:"قُتل الخليفة الثالث في بيته بالمدينة، فاهتزّت دولة الإسلام.",
      importance:3, hijriDay:18, hijriMonth:12, source:"تاريخ الطبري" }),
  E({ id:"c-017", month:1, day:27, year:"٦٦١م/٤٠هـ", era:"rashidun", type:"event",
      title:"استشهاد علي بن أبي طالب",
      description:"اغتاله ابن ملجم في الكوفة، فانتهى عصر الراشدين الكبار.",
      importance:3, hijriDay:21, hijriMonth:9, source:"تاريخ الطبري" }),
  E({ id:"c-018", month:7, day:7, year:"٦٥٧م/٣٧هـ", era:"rashidun", type:"battle",
      title:"معركة صفّين",
      description:"اشتباك علي ومعاوية على ضفاف الفرات، انتهى بقضية التحكيم.",
      importance:2, source:"تاريخ الطبري" }),

  // Umayyad era
  E({ id:"c-020", month:7, day:18, year:"٦٦١م/٤١هـ", era:"umayyad", type:"state",
      title:"تأسيس الدولة الأموية",
      description:"تنازل الحسن بن علي لمعاوية في عام الجماعة، فقامت دولة بني أمية بدمشق.",
      importance:3, relatedEntityIds:["umayyad.state.umayyad"], source:"تاريخ الطبري" }),
  E({ id:"c-021", month:10, day:10, year:"٦٨٠م/٦١هـ", era:"umayyad", type:"event",
      title:"معركة كربلاء",
      description:"استُشهد الحسين بن علي ومن معه في كربلاء، فكانت أعمق جروح الأمة.",
      importance:3, hijriDay:10, hijriMonth:1, source:"تاريخ الطبري" }),
  E({ id:"c-022", month:4, day:26, year:"٧١١م/٩٢هـ", era:"andalus", type:"battle",
      title:"معركة وادي لكّة",
      description:"هزم طارق بن زياد القوط بقيادة لذريق، ففُتحت الأندلس.",
      importance:3, source:"نفح الطيب · المقرّي" }),
  E({ id:"c-023", month:7, day:10, year:"٧٣٢م/١١٤هـ", era:"umayyad", type:"battle",
      title:"معركة بلاط الشهداء",
      description:"استشهد عبد الرحمن الغافقي في معركةٍ غيّرت مصير أوروبا.",
      importance:2, source:"البيان المغرب · ابن عذاري" }),
  E({ id:"c-024", month:1, day:25, year:"٧٥٠م/١٣٢هـ", era:"abbasid", type:"battle",
      title:"معركة الزاب الكبرى",
      description:"انتصر العباسيون على آخر خلفاء بني أمية مروان بن محمد، فسقطت الدولة الأموية.",
      importance:3, relatedEntityIds:["abbasid.battle.zab","abbasid.event.fall-umayyad"],
      source:"تاريخ الطبري" }),
  E({ id:"c-025", month:8, day:6, year:"٧٥٠م/١٣٢هـ", era:"umayyad", type:"event",
      title:"سقوط الدولة الأموية",
      description:"مقتل مروان بن محمد في بوصير بمصر، فانتقلت الخلافة إلى بني العباس.",
      importance:3, relatedEntityIds:["abbasid.event.fall-umayyad"], source:"تاريخ الطبري" }),
  E({ id:"c-026", month:5, day:14, year:"٧٥٦م/١٣٨هـ", era:"andalus", type:"state",
      title:"تأسيس إمارة الأندلس الأموية",
      description:"دخل عبد الرحمن الداخل قرطبة وأسّس الدولة الأموية في الأندلس.",
      importance:3, source:"البيان المغرب · ابن عذاري" }),

  // Abbasid era
  E({ id:"c-030", month:11, day:28, year:"٧٤٩م/١٣٢هـ", era:"abbasid", type:"figure",
      title:"بيعة أبي العباس السفّاح",
      description:"بُويع السفّاح بالخلافة في الكوفة، فأُعلنت قيام الدولة العباسية.",
      importance:3, relatedEntityIds:["abbasid.figure.as-saffah","abbasid.event.found-abbasid","abbasid.state.abbasid"],
      source:"تاريخ الطبري" }),
  E({ id:"c-031", month:7, day:30, year:"٧٦٢م/١٤٥هـ", era:"abbasid", type:"city",
      title:"تأسيس بغداد",
      description:"وضع المنصور حجر الأساس لمدينة السلام، فصارت عاصمة العالم القديم.",
      importance:3, relatedEntityIds:["abbasid.city.baghdad","abbasid.event.build-baghdad","abbasid.figure.al-mansur","abbasid.landmark.round-city"],
      source:"تاريخ بغداد · الخطيب البغدادي" }),
  E({ id:"c-032", month:9, day:14, year:"٧٨٦م/١٧٠هـ", era:"abbasid", type:"figure",
      title:"تولية هارون الرشيد",
      description:"تولّى الخلافة في ليلةٍ شهدت مولد ابنه المأمون ووفاة أخيه الهادي.",
      importance:3, relatedEntityIds:["abbasid.figure.harun-al-rashid","abbasid.event.golden-age"],
      source:"تاريخ الطبري" }),
  E({ id:"c-033", month:3, day:24, year:"٨٠٩م/١٩٣هـ", era:"abbasid", type:"figure",
      title:"وفاة هارون الرشيد",
      description:"توفّي في طوس وهو في طريقه لإخماد ثورة خراسان، فبدأ صراع أبنائه.",
      importance:2, relatedEntityIds:["abbasid.figure.harun-al-rashid","abbasid.event.amin-mamun-war"],
      source:"تاريخ الطبري" }),
  E({ id:"c-034", month:9, day:27, year:"٨١٣م/١٩٨هـ", era:"abbasid", type:"event",
      title:"دخول المأمون بغداد",
      description:"انتهت حرب الأمين والمأمون بدخول الأخير بغداد وتثبيت خلافته.",
      importance:2, relatedEntityIds:["abbasid.figure.al-mamun","abbasid.event.amin-mamun-war"],
      source:"تاريخ الطبري" }),
  E({ id:"c-035", month:8, day:13, year:"٨٣٨م/٢٢٣هـ", era:"abbasid", type:"battle",
      title:"فتح عمّورية",
      description:"اقتحم المعتصم عمّورية في الأناضول استجابةً لنداء «وامعتصماه».",
      importance:3, relatedEntityIds:["abbasid.battle.amorium","abbasid.figure.al-mutasim"],
      source:"تاريخ الطبري" }),
  E({ id:"c-036", month:7, day:1, year:"٨٣٦م/٢٢١هـ", era:"abbasid", type:"city",
      title:"تأسيس سامراء",
      description:"نقل المعتصم عاصمة الخلافة من بغداد إلى سامراء.",
      importance:2, relatedEntityIds:["abbasid.city.samarra","abbasid.event.found-samarra","abbasid.figure.al-mutasim"],
      source:"البلدان · اليعقوبي" }),
  E({ id:"c-037", month:7, day:15, year:"٧٥١م/١٣٣هـ", era:"abbasid", type:"battle",
      title:"معركة طلاس",
      description:"هزم العباسيون الجيش الصيني على نهر طلاس، فدخلت آسيا الوسطى دار الإسلام.",
      importance:2, relatedEntityIds:["abbasid.battle.talas"],
      source:"الكامل في التاريخ · يومٌ تقريبيّ" }),
  E({ id:"c-038", month:8, day:31, year:"٨٧٠م/٢٥٦هـ", era:"abbasid", type:"scholar",
      title:"وفاة الإمام البخاري",
      description:"توفّي صاحب الجامع الصحيح في خرتنك قرب سمرقند بعد أن نُفي من بخارى.",
      importance:3, relatedEntityIds:["abbasid.figure.al-bukhari"],
      source:"سير أعلام النبلاء · الذهبي" }),
  E({ id:"c-039", month:5, day:6, year:"٨٧٥م/٢٦١هـ", era:"abbasid", type:"scholar",
      title:"وفاة الإمام مسلم",
      description:"توفّي صاحب الصحيح في نيسابور، أحد أعلام الحديث في القرن الثالث.",
      importance:2, relatedEntityIds:["abbasid.figure.muslim"],
      source:"تذكرة الحفاظ · الذهبي" }),
  E({ id:"c-040", month:1, day:20, year:"٨٢٠م/٢٠٤هـ", era:"abbasid", type:"scholar",
      title:"وفاة الإمام الشافعي",
      description:"توفّي مؤسّس المذهب الشافعي بمصر، صاحب الرسالة في أصول الفقه.",
      importance:3, relatedEntityIds:["abbasid.figure.al-shafii"],
      source:"سير أعلام النبلاء · الذهبي" }),
  E({ id:"c-041", month:7, day:31, year:"٨٥٥م/٢٤١هـ", era:"abbasid", type:"scholar",
      title:"وفاة الإمام أحمد بن حنبل",
      description:"إمام أهل السنّة في محنة خلق القرآن، توفّي ببغداد عن نحو ٧٧ عامًا.",
      importance:3, relatedEntityIds:["abbasid.figure.ibn-hanbal","abbasid.event.mihna"],
      source:"تاريخ بغداد" }),
  E({ id:"c-042", month:2, day:10, year:"١٢٥٨م/٦٥٦هـ", era:"abbasid", type:"event",
      title:"سقوط بغداد على يد هولاكو",
      description:"اقتحم المغول بغداد وأنهَوا الخلافة العباسية، وأُلقيت كتب بيت الحكمة في دجلة.",
      importance:3, relatedEntityIds:["abbasid.event.fall-baghdad","abbasid.battle.siege-baghdad","abbasid.figure.hulagu","abbasid.figure.al-mustasim"],
      source:"البداية والنهاية · ابن كثير" }),
  E({ id:"c-043", month:10, day:14, year:"٨٣٣م/٢١٨هـ", era:"abbasid", type:"event",
      title:"وفاة المأمون",
      description:"توفّي راعي الترجمة وبيت الحكمة في طرسوس وهو يقاتل الروم.",
      importance:2, relatedEntityIds:["abbasid.figure.al-mamun","abbasid.event.house-of-wisdom"],
      source:"تاريخ الطبري" }),

  // Ayyubid era
  E({ id:"c-050", month:1, day:1, year:"١١٣٨م/٥٣٢هـ", era:"ayyubid", type:"figure",
      title:"مولد صلاح الدين الأيوبي",
      description:"وُلد يوسف بن أيوب في قلعة تكريت قبل أن يصير سلطان مصر والشام.",
      importance:2, relatedEntityIds:["ayyubid.figure.salahuddin","ayyubid.event.salahuddin-birth","ayyubid.city.tikrit"],
      source:"النوادر السلطانية · ابن شدّاد · يومٌ تقريبيّ" }),
  E({ id:"c-051", month:9, day:13, year:"١١٧١م/٥٦٧هـ", era:"ayyubid", type:"state",
      title:"إنهاء الدولة الفاطمية",
      description:"خطب صلاح الدين بمصر للعباسيين، فانتهى عصر الفاطميين وأُسّست الدولة الأيوبية.",
      importance:3, relatedEntityIds:["ayyubid.state.ayyubid","ayyubid.event.end-fatimid","ayyubid.event.found-ayyubid","ayyubid.figure.salahuddin"],
      source:"الكامل في التاريخ · ابن الأثير" }),
  E({ id:"c-052", month:7, day:4, year:"١١٨٧م/٥٨٣هـ", era:"ayyubid", type:"battle",
      title:"معركة حِطّين",
      description:"هزم صلاح الدين الصليبيين هزيمةً ساحقة، ففُتح الطريق لتحرير القدس.",
      importance:3, hijriDay:25, hijriMonth:5,
      relatedEntityIds:["ayyubid.battle.hattin","ayyubid.figure.salahuddin"],
      source:"النوادر السلطانية · ابن شدّاد" }),
  E({ id:"c-053", month:10, day:2, year:"١١٨٧م/٥٨٣هـ", era:"ayyubid", type:"event",
      title:"تحرير القدس",
      description:"دخل صلاح الدين القدس صلحًا، وأُعيد الأذان إلى المسجد الأقصى.",
      importance:3, hijriDay:27, hijriMonth:7,
      relatedEntityIds:["ayyubid.event.liberate-jerusalem","ayyubid.city.jerusalem","ayyubid.landmark.al-aqsa","ayyubid.figure.salahuddin"],
      source:"النوادر السلطانية · ابن شدّاد" }),
  E({ id:"c-054", month:9, day:7, year:"١١٩١م/٥٨٧هـ", era:"ayyubid", type:"battle",
      title:"معركة أرسوف",
      description:"اشتباك ضارٍ بين صلاح الدين وريتشارد قلب الأسد على ساحل فلسطين.",
      importance:2, relatedEntityIds:["ayyubid.battle.arsuf","ayyubid.figure.richard-lionheart"],
      source:"النوادر السلطانية · ابن شدّاد" }),
  E({ id:"c-055", month:9, day:2, year:"١١٩٢م/٥٨٨هـ", era:"ayyubid", type:"event",
      title:"صلح الرملة",
      description:"عُقدت هدنة بين صلاح الدين وريتشارد أنهت الحملة الصليبية الثالثة.",
      importance:2, relatedEntityIds:["ayyubid.event.ramla-treaty","ayyubid.battle.ramla"],
      source:"النوادر السلطانية · ابن شدّاد" }),
  E({ id:"c-056", month:3, day:4, year:"١١٩٣م/٥٨٩هـ", era:"ayyubid", type:"figure",
      title:"وفاة صلاح الدين الأيوبي",
      description:"توفّي السلطان في دمشق بعد حياةٍ كرّسها لتوحيد المسلمين وتحرير القدس.",
      importance:3, hijriDay:27, hijriMonth:2,
      relatedEntityIds:["ayyubid.figure.salahuddin","ayyubid.event.salahuddin-death","ayyubid.city.damascus"],
      source:"الروضتين · أبو شامة" }),
  E({ id:"c-057", month:11, day:5, year:"١١٧٤م/٥٧٠هـ", era:"ayyubid", type:"event",
      title:"دخول صلاح الدين دمشق",
      description:"دخل صلاح الدين دمشق بعد وفاة نور الدين، فبدأ توحيد الشام تحت رايته.",
      importance:2, relatedEntityIds:["ayyubid.event.move-to-damascus","ayyubid.city.damascus","ayyubid.figure.nuruddin"],
      source:"الكامل في التاريخ · ابن الأثير" }),
  E({ id:"c-058", month:2, day:8, year:"١٢٥٠م/٦٤٧هـ", era:"ayyubid", type:"battle",
      title:"معركة المنصورة",
      description:"هُزمت الحملة الصليبية السابعة في مصر وأُسر الملك لويس التاسع.",
      importance:3, relatedEntityIds:["ayyubid.battle.mansurah","ayyubid.figure.shajar-al-durr","ayyubid.figure.turanshah"],
      source:"السلوك · المقريزي" }),
  E({ id:"c-059", month:5, day:2, year:"١٢٥٠م/٦٤٨هـ", era:"ayyubid", type:"figure",
      title:"تولّي شجر الدر",
      description:"تولّت شجر الدر حكم مصر بعد مقتل توران شاه، فبدأ عصر المماليك.",
      importance:2, relatedEntityIds:["ayyubid.figure.shajar-al-durr","ayyubid.event.shajar-rule","ayyubid.event.end-ayyubid"],
      source:"السلوك · المقريزي" }),

  // Late-era anchors
  E({ id:"c-070", month:9, day:3, year:"١٢٦٠م/٦٥٨هـ", era:"mamluk", type:"battle",
      title:"معركة عين جالوت",
      description:"هزم قطز وبيبرس المغول لأول مرة، فحُفظت مصر والشام.",
      importance:3, source:"السلوك · المقريزي" }),
  E({ id:"c-071", month:5, day:29, year:"١٤٥٣م/٨٥٧هـ", era:"ottoman", type:"event",
      title:"فتح القسطنطينية",
      description:"دخل محمد الفاتح المدينة وصلّى في آيا صوفيا، فتحقّقت بشارة النبي ﷺ.",
      importance:3, source:"تاج التواريخ · سعد الدين" }),
  E({ id:"c-072", month:1, day:2, year:"١٤٩٢م/٨٩٧هـ", era:"andalus", type:"city",
      title:"سقوط غرناطة",
      description:"سلّم أبو عبد الله الصغير مفاتيح غرناطة، فانتهت ثمانية قرون من حكم المسلمين في الأندلس.",
      importance:3, source:"أزهار الرياض · المقري" }),
  E({ id:"c-073", month:8, day:24, year:"١٥١٦م/٩٢٢هـ", era:"ottoman", type:"battle",
      title:"معركة مرج دابق",
      description:"هزم سليم الأول المماليك في حلب، فضُمّت الشام للدولة العثمانية.",
      importance:2, source:"بدائع الزهور · ابن إياس" }),
  E({ id:"c-074", month:11, day:22, year:"١٠٧١م/٤٦٣هـ", era:"seljuk", type:"battle",
      title:"معركة ملاذكرد",
      description:"أسر السلطان ألب أرسلان إمبراطور الروم، وفُتح باب الأناضول للمسلمين.",
      importance:3, source:"الكامل في التاريخ · ابن الأثير" }),
  E({ id:"c-075", month:3, day:3, year:"١٩٢٤م/١٣٤٢هـ", era:"modern", type:"event",
      title:"إلغاء الخلافة العثمانية",
      description:"أعلن مصطفى كمال إلغاء الخلافة، فانتهت بذلك ثلاثة عشر قرنًا من حكم الخلفاء.",
      importance:3, source:"الوثائق العثمانية" }),
];

// ============================================================
// Query helpers
// ============================================================

export function eventsForDay(month: number, day: number): CalendarEvent[] {
  return CALENDAR_EVENTS
    .filter(e => e.month === month && e.day === day)
    .sort(byImportance);
}

export function eventsForMonth(month: number): CalendarEvent[] {
  return CALENDAR_EVENTS
    .filter(e => e.month === month)
    .sort((a, b) => a.day - b.day || byImportance(a, b));
}

export function eventsForYear(): CalendarEvent[] {
  return CALENDAR_EVENTS
    .slice()
    .sort((a, b) => a.month - b.month || a.day - b.day || byImportance(a, b));
}

export function filterByTypes(events: CalendarEvent[], types: CalendarType[] | null): CalendarEvent[] {
  if (!types || types.length === 0) return events;
  const set = new Set(types);
  return events.filter(e => set.has(e.type));
}

export function todayEvents(): CalendarEvent[] {
  const now = new Date();
  const exact = eventsForDay(now.getMonth() + 1, now.getDate());
  if (exact.length) return exact;
  const idx = now.getMonth() * 31 + now.getDate();
  const sorted = CALENDAR_EVENTS
    .map(e => ({ e, delta: ((e.month - 1) * 31 + e.day - idx + 372) % 372 }))
    .sort((a, b) => a.delta - b.delta || byImportance(a.e, b.e));
  const nearest = sorted[0]?.e;
  return nearest ? [nearest] : [];
}

export function calendarStats() {
  const covered = new Set(CALENDAR_EVENTS.map(e => `${e.month}-${e.day}`));
  return {
    total: CALENDAR_EVENTS.length,
    daysCovered: covered.size,
    months: new Set(CALENDAR_EVENTS.map(e => e.month)).size,
    withHijri: CALENDAR_EVENTS.filter(e => !!e.hijriDay).length,
    withRelations: CALENDAR_EVENTS.filter(e => (e.relatedEntityIds?.length ?? 0) > 0).length,
  };
}

function byImportance(a: CalendarEvent, b: CalendarEvent): number {
  return b.importance - a.importance;
}

// ============================================================
// Encyclopedia integration
// ============================================================

export function resolveEntities(event: CalendarEvent): PackEntity[] {
  const ids = event.relatedEntityIds ?? [];
  const out: PackEntity[] = [];
  for (const id of ids) {
    const ent = getPackEntity(id);
    if (ent) out.push(ent);
  }
  return out;
}

export function primaryHref(event: CalendarEvent): string | null {
  const ents = resolveEntities(event);
  if (ents.length === 0) return null;
  return entityHref(ents[0]);
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  3: "حدث محوري",
  2: "حدث رئيسي",
  1: "حدث ملحوظ",
};

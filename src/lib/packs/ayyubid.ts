import type { ContentPack, PackEntity } from "./types";

// ============================================================
// Content Pack 001 — الدولة الأيوبية (The Ayyubid State)
// ------------------------------------------------------------
// All ids follow the convention: ayyubid.<type>.<slug>
// `bridges` link pack entities to legacy data in src/lib/data.ts
// and src/lib/cities.ts so existing routes (figure, battle, city,
// campaigns, world map, museum, timeline) continue to work.
// ============================================================

const E = (e: PackEntity): PackEntity => e;

const entities: PackEntity[] = [
  // ---------- STATE ----------
  E({
    id: "ayyubid.state.ayyubid",
    title: "الدولة الأيوبية",
    latin: "Ayyubid State",
    type: "state",
    description:
      "دولةٌ سُنّيّة أسّسها صلاح الدين الأيوبي عام ١١٧١م بعد إنهاء الدولة الفاطمية في مصر، فامتدّ سلطانها على مصر والشام والحجاز واليمن، وبلغت ذروتها بتحرير القدس عام ١١٨٧م، وانتهت رسميًّا عام ١٢٥٠م على يد المماليك.",
    period: { label: "١١٧١ – ١٢٥٠ م", startYear: 1171, endYear: 1250 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.figure.nuruddin",
      "ayyubid.figure.al-adil",
      "ayyubid.figure.al-kamil",
      "ayyubid.city.cairo",
      "ayyubid.city.damascus",
      "ayyubid.city.jerusalem",
      "ayyubid.city.aleppo",
      "ayyubid.battle.hattin",
      "ayyubid.battle.arsuf",
      "ayyubid.event.end-fatimid",
      "ayyubid.event.liberate-jerusalem",
    ],
    unlockables: [
      { kind: "campaign", refId: "ayyubid", label: "حملة صلاح الدين الكبرى" },
    ],
    image: { alt: "راية الدولة الأيوبية", glyph: "🦅", tone: "from-amber-700/40 to-zinc-900" },
    timelinePosition: 1171,
    rarity: "legendary",
    meta: {
      founder: "صلاح الدين الأيوبي",
      capital: "القاهرة",
      majorCities: ["القاهرة", "دمشق", "القدس", "حلب"],
      majorFigures: ["صلاح الدين الأيوبي", "نور الدين زنكي", "الملك العادل", "الملك الكامل"],
      majorBattles: ["حطين", "أرسوف"],
      majorEvents: ["إنهاء الدولة الفاطمية", "تحرير القدس"],
    },
    bridges: { era: "ayyubid" },
  }),

  // ---------- FIGURES ----------
  E({
    id: "ayyubid.figure.salahuddin",
    title: "صلاح الدين الأيوبي",
    latin: "Salah ad-Din al-Ayyubi",
    type: "figure",
    description:
      "السلطان الناصر صلاح الدين يوسف بن أيوب، مؤسس الدولة الأيوبية ومحرّر القدس بعد ٨٨ عامًا من الاحتلال الصليبي، أنموذج القائد الفارس في التاريخ الإسلامي.",
    period: { label: "١١٣٧ – ١١٩٣ م", startYear: 1137, endYear: 1193 },
    relatedEntities: [
      "ayyubid.state.ayyubid",
      "ayyubid.city.jerusalem",
      "ayyubid.city.damascus",
      "ayyubid.city.cairo",
      "ayyubid.battle.hattin",
      "ayyubid.battle.arsuf",
      "ayyubid.event.liberate-jerusalem",
      "ayyubid.figure.nuruddin",
    ],
    unlockables: [
      { kind: "campaign", refId: "ayyubid", label: "حملة صلاح الدين" },
      { kind: "artifact", refId: "ayyubid.artifact.sword-salahuddin", label: "سيف صلاح الدين" },
      { kind: "event", refId: "ayyubid.event.liberate-jerusalem", label: "تحرير القدس" },
    ],
    image: { alt: "صورة رمزية لصلاح الدين الأيوبي", glyph: "🗡️", tone: "from-amber-600/40 to-slate-900" },
    timelinePosition: 1137,
    rarity: "legendary",
    meta: {
      titles: ["الناصر", "السلطان صلاح الدين", "محرّر القدس"],
      tags: ["الحملات الصليبية"],
    },
    bridges: { characterId: "salahuddin", era: "ayyubid" },
  }),

  E({
    id: "ayyubid.figure.nuruddin",
    title: "نور الدين زنكي",
    latin: "Nur ad-Din Zangi",
    type: "figure",
    description:
      "الملك العادل نور الدين محمود بن زنكي، موحّد الشام في مواجهة الصليبيين، ومُعدّ الأرض السياسية والعسكرية التي قام عليها مشروع صلاح الدين.",
    period: { label: "١١١٨ – ١١٧٤ م", startYear: 1118, endYear: 1174 },
    relatedEntities: [
      "ayyubid.city.damascus",
      "ayyubid.city.aleppo",
      "ayyubid.figure.salahuddin",
      "ayyubid.state.ayyubid",
    ],
    unlockables: [
      { kind: "campaign", refId: "nuruddin", label: "حملة نور الدين" },
      { kind: "lore", refId: "nuruddin", label: "دمشق الزنكية" },
    ],
    image: { alt: "رمز نور الدين زنكي", glyph: "🕌", tone: "from-emerald-700/40 to-slate-900" },
    timelinePosition: 1118,
    rarity: "epic",
    meta: { titles: ["الملك العادل", "شيخ المجاهدين"] },
    bridges: { storyId: "nuruddin", era: "ayyubid" },
  }),

  E({
    id: "ayyubid.figure.al-adil",
    title: "الملك العادل",
    latin: "Al-Adil I",
    type: "figure",
    description:
      "السلطان سيف الدين أبو بكر بن أيوب، شقيق صلاح الدين وأحد أعمدة الدولة الأيوبية، تولّى السلطنة وأعاد توحيد البيت الأيوبي بعد وفاة أخيه.",
    period: { label: "١١٤٥ – ١٢١٨ م", startYear: 1145, endYear: 1218 },
    relatedEntities: [
      "ayyubid.state.ayyubid",
      "ayyubid.figure.salahuddin",
      "ayyubid.figure.al-kamil",
      "ayyubid.city.cairo",
      "ayyubid.city.damascus",
    ],
    unlockables: [],
    image: { alt: "رمز الملك العادل", glyph: "⚖️", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1145,
    rarity: "rare",
    bridges: { era: "ayyubid" },
  }),

  E({
    id: "ayyubid.figure.al-kamil",
    title: "الملك الكامل",
    latin: "Al-Kamil",
    type: "figure",
    description:
      "السلطان ناصر الدين محمد بن العادل، السلطان الأيوبي الذي ردّ الحملة الصليبية الخامسة عن مصر عند المنصورة، وعقد معاهدة يافا الشهيرة مع فردريك الثاني.",
    period: { label: "١١٧٧ – ١٢٣٨ م", startYear: 1177, endYear: 1238 },
    relatedEntities: [
      "ayyubid.state.ayyubid",
      "ayyubid.figure.al-adil",
      "ayyubid.city.cairo",
      "ayyubid.city.jerusalem",
    ],
    unlockables: [],
    image: { alt: "رمز الملك الكامل", glyph: "👑", tone: "from-amber-600/30 to-slate-900" },
    timelinePosition: 1177,
    rarity: "rare",
    bridges: { era: "ayyubid" },
  }),

  // ---------- CITIES ----------
  E({
    id: "ayyubid.city.jerusalem",
    title: "القدس",
    latin: "Jerusalem",
    type: "city",
    description:
      "أولى القبلتين وثالث الحرمين، حرّرها عمر بن الخطاب صلحًا ثم استعادها صلاح الدين سنة ٥٨٣هـ بعد معركة حطين.",
    period: { label: "حاضرة منذ القدم", startYear: 638, endYear: 2025 },
    relatedEntities: [
      "ayyubid.landmark.al-aqsa",
      "ayyubid.battle.hattin",
      "ayyubid.figure.salahuddin",
      "ayyubid.event.liberate-jerusalem",
    ],
    unlockables: [],
    image: { alt: "أسوار القدس", glyph: "🕍", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1187,
    rarity: "legendary",
    meta: { region: "الشام", landmarks: ["المسجد الأقصى", "قبة الصخرة"], tags: ["الفتح العمري", "الحملات الصليبية"] },
    bridges: { cityId: "jerusalem", regionId: "shaam" },
  }),

  E({
    id: "ayyubid.city.damascus",
    title: "دمشق",
    latin: "Damascus",
    type: "city",
    description:
      "حاضرة الشام الكبرى وعاصمة الدولة الأموية، صارت في زمن نور الدين والأيوبيين قلب الجهاد ومركز توحيد المسلمين.",
    period: { label: "حاضرة منذ القدم", startYear: 661, endYear: 2025 },
    relatedEntities: [
      "ayyubid.landmark.umayyad-mosque",
      "ayyubid.figure.nuruddin",
      "ayyubid.figure.salahuddin",
      "ayyubid.state.ayyubid",
    ],
    unlockables: [],
    image: { alt: "مآذن دمشق", glyph: "🕌", tone: "from-emerald-700/30 to-slate-900" },
    timelinePosition: 1154,
    rarity: "epic",
    meta: { region: "الشام", landmarks: ["المسجد الأموي"], tags: ["الدولة الأموية", "الدولة الأيوبية"] },
    bridges: { cityId: "damascus", regionId: "shaam" },
  }),

  E({
    id: "ayyubid.city.cairo",
    title: "القاهرة",
    latin: "Cairo",
    type: "city",
    description:
      "قاهرة المعزّ، عاصمة الفاطميين ثم الأيوبيين، ومنارة العلم بجامع الأزهر، حصّنها صلاح الدين بقلعته الشهيرة على المقطّم.",
    period: { label: "تأسست ٩٦٩م", startYear: 969, endYear: 2025 },
    relatedEntities: [
      "ayyubid.landmark.al-azhar",
      "ayyubid.landmark.citadel-salahuddin",
      "ayyubid.figure.salahuddin",
      "ayyubid.state.ayyubid",
      "ayyubid.event.end-fatimid",
    ],
    unlockables: [],
    image: { alt: "قلعة القاهرة", glyph: "🏯", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1171,
    rarity: "legendary",
    meta: { region: "مصر", landmarks: ["الأزهر", "قلعة صلاح الدين"], tags: ["الدولة الفاطمية", "الدولة الأيوبية"] },
    bridges: { cityId: "cairo", regionId: "egypt" },
  }),

  E({
    id: "ayyubid.city.aleppo",
    title: "حلب",
    latin: "Aleppo",
    type: "city",
    description:
      "مدينة الشمال الشاميّ وقلعتها الشامخة، قاعدةُ الزنكيين ثم الأيوبيين في مواجهة الصليبيين والممالك الصغيرة.",
    period: { label: "حاضرة منذ القدم", startYear: 1128, endYear: 2025 },
    relatedEntities: [
      "ayyubid.figure.nuruddin",
      "ayyubid.state.ayyubid",
    ],
    unlockables: [],
    image: { alt: "قلعة حلب", glyph: "🏰", tone: "from-stone-700/40 to-slate-900" },
    timelinePosition: 1146,
    rarity: "epic",
    meta: { region: "الشام", landmarks: ["قلعة حلب"], tags: ["الدولة الزنكية", "الدولة الأيوبية"] },
    bridges: { regionId: "shaam" },
  }),

  // ---------- BATTLES ----------
  E({
    id: "ayyubid.battle.hattin",
    title: "معركة حطين",
    latin: "Battle of Hattin",
    type: "battle",
    description:
      "معركةٌ فاصلة في الجليل أوقع فيها صلاح الدين بجيش مملكة بيت المقدس الصليبية بكاملها، فانفتح بها طريق تحرير القدس.",
    period: { label: "٤ يوليو ١١٨٧ م", startYear: 1187, endYear: 1187 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.city.jerusalem",
      "ayyubid.state.ayyubid",
      "ayyubid.event.liberate-jerusalem",
    ],
    unlockables: [
      { kind: "event", refId: "ayyubid.event.liberate-jerusalem", label: "تحرير القدس" },
      { kind: "artifact", refId: "ayyubid.artifact.sword-salahuddin", label: "سيف صلاح الدين" },
      { kind: "achievement", refId: "ayyubid.achievement.liberator", label: "إنجاز محرّر القدس" },
    ],
    image: { alt: "ساحة حطين", glyph: "⚔️", tone: "from-rose-800/40 to-slate-900" },
    timelinePosition: 1187,
    rarity: "legendary",
    meta: {
      commanders: ["صلاح الدين الأيوبي"],
      result: "نصرٌ مؤزَّر للمسلمين",
      tags: ["الحملات الصليبية"],
    },
    bridges: { battleId: "hattin", storyId: "hattin", era: "ayyubid" },
  }),

  E({
    id: "ayyubid.battle.arsuf",
    title: "معركة أرسوف",
    latin: "Battle of Arsuf",
    type: "battle",
    description:
      "اشتباكٌ كبير على الساحل الفلسطيني بين صلاح الدين وريتشارد قلب الأسد ضمن الحملة الصليبية الثالثة، أعاد تشكيل موازين الصراع دون أن يقلب ميزان السلطة.",
    period: { label: "٧ سبتمبر ١١٩١ م", startYear: 1191, endYear: 1191 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.state.ayyubid",
    ],
    unlockables: [],
    image: { alt: "ساحل أرسوف", glyph: "🛡️", tone: "from-sky-800/40 to-slate-900" },
    timelinePosition: 1191,
    rarity: "epic",
    meta: {
      commanders: ["صلاح الدين الأيوبي", "ريتشارد قلب الأسد"],
      tags: ["الحملات الصليبية"],
    },
    bridges: { era: "ayyubid" },
  }),

  // ---------- EVENTS ----------
  E({
    id: "ayyubid.event.end-fatimid",
    title: "إنهاء الدولة الفاطمية",
    type: "event",
    description:
      "أعلن صلاح الدين الخطبة للخليفة العباسي في القاهرة عام ١١٧١م، فطُويت صفحة الدولة الفاطمية وقامت الدولة الأيوبية السنّيّة على أنقاضها.",
    period: { label: "١١٧١ م", startYear: 1171, endYear: 1171 },
    relatedEntities: [
      "ayyubid.state.ayyubid",
      "ayyubid.figure.salahuddin",
      "ayyubid.city.cairo",
    ],
    unlockables: [],
    image: { alt: "إعلان الدولة الأيوبية", glyph: "📜", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1171,
    rarity: "epic",
    bridges: { era: "ayyubid" },
  }),

  E({
    id: "ayyubid.event.liberate-jerusalem",
    title: "تحرير القدس",
    type: "event",
    description:
      "في رجب ٥٨٣هـ / أكتوبر ١١٨٧م دخل صلاح الدين القدس صلحًا، فأُعيد الأذان إلى المسجد الأقصى بعد ٨٨ عامًا من الاحتلال الصليبي.",
    period: { label: "٢ أكتوبر ١١٨٧ م", startYear: 1187, endYear: 1187 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.battle.hattin",
      "ayyubid.city.jerusalem",
      "ayyubid.state.ayyubid",
      "ayyubid.landmark.al-aqsa",
    ],
    unlockables: [
      { kind: "achievement", refId: "ayyubid.achievement.liberator", label: "لقب محرّر القدس" },
      { kind: "artifact", refId: "ayyubid.artifact.victory-manuscript", label: "مخطوط النصر" },
      { kind: "card", refId: "ayyubid.city.jerusalem", label: "بطاقة القدس التاريخية" },
    ],
    image: { alt: "دخول صلاح الدين القدس", glyph: "🕊️", tone: "from-emerald-700/40 to-slate-900" },
    timelinePosition: 1187,
    rarity: "legendary",
    bridges: { storyId: "jerusalem-liberation", era: "ayyubid" },
  }),

  // ---------- LANDMARKS ----------
  E({
    id: "ayyubid.landmark.al-aqsa",
    title: "المسجد الأقصى",
    type: "landmark",
    description:
      "أولى القبلتين وثالث الحرمين، مسرى النبي ﷺ وموضع الإسراء، عاد إلى المسلمين بتحرير صلاح الدين للقدس.",
    period: { label: "أُسّس قديمًا", startYear: 638, endYear: 2025 },
    relatedEntities: [
      "ayyubid.city.jerusalem",
      "ayyubid.figure.salahuddin",
      "ayyubid.event.liberate-jerusalem",
    ],
    unlockables: [],
    image: { alt: "قبة المسجد الأقصى", glyph: "🕌", tone: "from-emerald-700/40 to-slate-900" },
    timelinePosition: 638,
    rarity: "legendary",
    meta: { city: "القدس", tags: ["الفتح العمري", "الحملات الصليبية"] },
  }),

  E({
    id: "ayyubid.landmark.citadel-salahuddin",
    title: "قلعة صلاح الدين",
    type: "landmark",
    description:
      "قلعةٌ شامخة على جبل المقطّم بناها صلاح الدين لتكون مقرّ الحكم وحصنًا منيعًا للقاهرة في وجه الحملات الصليبية.",
    period: { label: "بدأ بناؤها ١١٧٦ م", startYear: 1176, endYear: 2025 },
    relatedEntities: [
      "ayyubid.city.cairo",
      "ayyubid.figure.salahuddin",
      "ayyubid.state.ayyubid",
    ],
    unlockables: [],
    image: { alt: "قلعة صلاح الدين بالقاهرة", glyph: "🏯", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1176,
    rarity: "epic",
    meta: { city: "القاهرة" },
  }),

  // ---------- ARTIFACTS ----------
  E({
    id: "ayyubid.artifact.sword-salahuddin",
    title: "سيف صلاح الدين",
    type: "artifact",
    description:
      "سيفٌ أسطوريّ يُنسب إلى السلطان صلاح الدين، رمزٌ للنخوة والفروسية في الذاكرة الإسلامية.",
    period: { label: "القرن ١٢ م", startYear: 1180, endYear: 1193 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.battle.hattin",
    ],
    unlockables: [
      { kind: "achievement", refId: "ayyubid.achievement.liberator", label: "محرّر القدس" },
    ],
    image: { alt: "سيف صلاح الدين", glyph: "🗡️", tone: "from-amber-600/40 to-slate-900" },
    timelinePosition: 1187,
    rarity: "legendary",
    meta: { unlockRule: "إكمال حملة صلاح الدين" },
    bridges: { era: "ayyubid" },
  }),

  E({
    id: "ayyubid.artifact.victory-manuscript",
    title: "مخطوط النصر",
    type: "artifact",
    description:
      "مخطوطةٌ تُخلِّد دخول صلاح الدين القدس وعودة الأذان إلى الأقصى، تُعرض في خزانة المتحف.",
    period: { label: "القرن ١٢ م", startYear: 1187, endYear: 1187 },
    relatedEntities: [
      "ayyubid.event.liberate-jerusalem",
      "ayyubid.city.jerusalem",
    ],
    unlockables: [],
    image: { alt: "مخطوط تاريخي", glyph: "📜", tone: "from-amber-700/30 to-slate-900" },
    timelinePosition: 1187,
    rarity: "epic",
    bridges: { era: "ayyubid" },
  }),

  // ---------- ACHIEVEMENT ----------
  E({
    id: "ayyubid.achievement.liberator",
    title: "محرّر القدس",
    type: "achievement",
    description:
      "لقبٌ فخريّ يُمنح لمن يُكمل حملة صلاح الدين الكبرى وحدث تحرير القدس داخل المتحف.",
    period: { label: "إنجاز", startYear: 1187, endYear: 1187 },
    relatedEntities: [
      "ayyubid.figure.salahuddin",
      "ayyubid.event.liberate-jerusalem",
      "ayyubid.battle.hattin",
    ],
    unlockables: [
      { kind: "xp", refId: "xp-500", label: "٥٠٠ نقطة خبرة" },
      { kind: "frame", refId: "frame-liberator", label: "إطار شخصي خاص" },
      { kind: "badge", refId: "badge-legendary-liberator", label: "وسام أسطوري" },
    ],
    image: { alt: "وسام محرّر القدس", glyph: "🏅", tone: "from-amber-600/50 to-slate-900" },
    timelinePosition: 1187,
    rarity: "legendary",
    meta: {
      unlockRules: [
        "إكمال حملة صلاح الدين",
        "إكمال حدث تحرير القدس",
      ],
    },
  }),
];

export const AYYUBID_PACK: ContentPack = {
  id: "pack-001-ayyubid",
  order: 1,
  title: "الدولة الأيوبية",
  subtitle: "المجموعة ١ · صلاح الدين وتحرير القدس",
  summary:
    "أوّل حزمة محتوى تاريخية في إرث: دولةٌ سنّية أعادت الجهاد إلى الشام ومصر وحرّرت القدس.",
  era: "ayyubid",
  period: { label: "١١٧١ – ١٢٥٠ م", startYear: 1171, endYear: 1250 },
  cover: { alt: "غلاف الدولة الأيوبية", glyph: "🦅", tone: "from-amber-700/40 to-slate-900" },
  entities,
};
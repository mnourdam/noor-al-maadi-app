import type { CampaignDefinition } from "../types";

// ============================================================
// حملة صلاح الدين الأيوبي — من توحيد الأمة إلى تحرير القدس
// ------------------------------------------------------------
// First playable campaign authored on the new Campaign Engine.
// Bridges into Content Pack 001 (Ayyubid) entity ids where they
// exist; falls back to legacy data ids elsewhere.
// ============================================================

export const SALAHUDDIN_LIBERATOR_CAMPAIGN: CampaignDefinition = {
  id: "salahuddin-liberator",
  title: "حملة صلاح الدين الأيوبي",
  subtitle: "من توحيد الأمة إلى تحرير القدس",
  intro:
    "ارحل في سبعة فصولٍ مع يوسف بن أيوب من تكريت إلى أسوار القدس، شاهدًا على ميلاد دولةٍ ووحدة أمةٍ وتحرير مدينةٍ غيّر مصيرها وجه التاريخ.",
  difficulty: "medium",
  estimatedMinutes: [45, 60],
  packId: "ayyubid",
  flagship: true,
  order: 10,
  related: [
    { kind: "state",    id: "ayyubid-state",  label: "الدولة الأيوبية" },
    { kind: "city",     id: "jerusalem",      label: "القدس" },
    { kind: "battle",   id: "hattin",         label: "حطين" },
    { kind: "event",    id: "crusades",       label: "الحملات الصليبية" },
  ],
  chapters: [
    {
      id: "c1",
      index: 1,
      title: "من تكريت إلى دمشق",
      subtitle: "ميلاد القائد",
      hero: "/images/chapters/c1-tikrit.jpg",
      intro:
        "في ليلةٍ من ليالي تكريت، وُلِد يوسف بن أيوب لأسرةٍ كرديةٍ في خدمة السلاجقة. ستحمله الأقدار من ضفاف دجلة إلى دمشق، حيث تتشكّل ملامح القائد قبل أن يعرف العالم اسمه.",
      body: [
        "تكريت كانت محطّةً عابرةً في رحلةٍ أطول؛ فقد رحل آل أيوب إلى الموصل ثم إلى دمشق في كنف القوّة الزنكية.",
        "في بلاط دمشق، يلتقي الفتى بالعلماء والفقهاء والقادة، ويتعلّم أن السياسة فقهٌ، والحرب صبر.",
      ],
      figures: [
        { kind: "character", id: "salahuddin",   label: "صلاح الدين" },
        { kind: "character", id: "najmuddin",    label: "نجم الدين أيوب" },
      ],
      locations: [
        { kind: "city", id: "tikrit",   label: "تكريت" },
        { kind: "city", id: "damascus", label: "دمشق" },
      ],
      knowledgeCards: [
        {
          id: "k1-1", icon: "🏯",
          title: "بيت أيّوب",
          body: "كان نجم الدين أيوب واليًا لتكريت، ثم انتقل في خدمة الزنكيين، وعنده تشكّل وعي ابنه يوسف منذ الطفولة.",
        },
      ],
      unlocks: { characters: ["salahuddin"] },
      readingGate: true,
      xp: 100,
    },
    {
      id: "c2",
      index: 2,
      title: "في مدرسة نور الدين",
      subtitle: "صناعة قائدٍ على يد قائد",
      hero: "/images/chapters/c2-aleppo.jpg",
      intro:
        "في كنف نور الدين زنكي، يكتشف يوسف معنى الدولة: عدلٌ يجمع الناس، ومدارسُ توحّد العقول، وثغورٌ تحرس الأرض. هنا تُصاغ مدرسته القيادية.",
      body: [
        "بنى نور الدين المدارس والمستشفيات وأقام الجبهة الموحّدة بين حلب ودمشق، وزرع في تلميذه يقينَ أن تحرير القدس يبدأ بإصلاح الداخل.",
      ],
      figures: [
        { kind: "character", id: "nuruddin",   label: "نور الدين زنكي" },
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
      ],
      locations: [
        { kind: "city", id: "damascus", label: "دمشق" },
        { kind: "city", id: "aleppo",   label: "حلب" },
      ],
      knowledgeCards: [
        {
          id: "k2-1", icon: "🕌",
          title: "منبر الأقصى",
          body: "أمر نور الدين بصنع منبرٍ في حلب وأقسم ألا يُنصب إلا في الأقصى يوم التحرير؛ سيحقّق تلميذه القَسَم بعد عقود.",
        },
      ],
      unlocks: { characters: ["nuruddin"] },
      xp: 100,
    },
    {
      id: "c3",
      index: 3,
      title: "مصر وسقوط الفاطميين",
      subtitle: "نهاية عصرٍ ومولد دولة",
      hero: "/images/chapters/c3-cairo.jpg",
      intro:
        "في القاهرة، يدخل يوسفُ بلاطًا مرهقًا تتنازع فيه الأهواء. حين يُولّى الوزارة، يُسدل الستار على الخلافة الفاطمية بهدوءٍ سياسيٍّ نادر، وتُولد الدولة الأيوبية.",
      body: [
        "أُرسل عمّه أسد الدين شيركوه إلى مصر لردّ الصليبيين، ومات هناك. فاختار العاضد ابن أخيه وزيرًا.",
        "خطب صلاح الدين للخليفة العباسي على منابر مصر سنة ٥٦٧هـ، فطُويت دولةٌ امتدت قرنين.",
      ],
      figures: [
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
        { kind: "character", id: "shirkuh",    label: "شيركوه" },
      ],
      locations: [
        { kind: "city", id: "cairo", label: "القاهرة" },
      ],
      knowledgeCards: [
        {
          id: "k3-1", icon: "🏛️",
          title: "نهاية الفاطميين",
          body: "أُنهيت الخلافة الفاطمية دون قطرة دم، عبر تحوّلٍ تدريجيّ في الخطبة والنقد والإدارة.",
        },
      ],
      unlocks: { states: ["ayyubid-state"], cities: ["cairo"] },
      xp: 150,
    },
    {
      id: "c4",
      index: 4,
      title: "توحيد مصر والشام",
      subtitle: "ركائز قبل المعركة",
      hero: "/images/chapters/c4-unification.jpg",
      intro:
        "بين القاهرة ودمشق، يبني صلاح الدين دولةً لا جيشًا: قلعةٌ تحرس النيل، أساطيلٌ في الإسكندرية، عدلٌ في الإقطاع، ومدارسُ تُخرِّج القضاة والقادة معًا.",
      body: [
        "وحّد مصر والشام تحت رايةٍ واحدةٍ، فصارت الأمة كتلةً واحدةً في وجه الإمارات الصليبية.",
      ],
      figures: [
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
      ],
      locations: [
        { kind: "city", id: "cairo",    label: "القاهرة" },
        { kind: "city", id: "damascus", label: "دمشق" },
      ],
      knowledgeCards: [
        {
          id: "k4-1", icon: "🏰",
          title: "قلعة الجبل",
          body: "بدأ صلاح الدين ببناء قلعة القاهرة فوق جبل المقطّم لتكون مركز الحكم وحصن العاصمة.",
        },
      ],
      unlocks: { cities: ["damascus"] },
      xp: 150,
    },
    {
      id: "c5",
      index: 5,
      title: "معركة حطين",
      subtitle: "اليوم الذي تغيّر فيه الميزان",
      hero: "/images/chapters/c5-hattin.jpg",
      intro:
        "في تموز ٥٨٣هـ، تستدرج الجيوش الصليبية إلى سفح قرني حطين تحت شمسٍ حارقة بلا ماء. تنتهي المعركة قبل أن تبدأ؛ ويسقط الصليب الذي حمله الفرنج.",
      body: [
        "أُسر ملك بيت المقدس وأمراء الفرنج، وانكسرت شوكتهم في الشام في يومٍ واحد.",
      ],
      figures: [
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
      ],
      locations: [
        { kind: "city", id: "hattin", label: "حطين" },
      ],
      events: [
        { kind: "battle", id: "hattin", label: "معركة حطين" },
      ],
      knowledgeCards: [
        {
          id: "k5-1", icon: "⚔️",
          title: "خدعة العطش",
          body: "قطع صلاح الدين الماء عن جيش الفرنج، فجاءوا إلى ساحة المعركة منهكين قبل ضربة السيف الأولى.",
        },
      ],
      unlocks: { battles: ["hattin"] },
      xp: 200,
    },
    {
      id: "c6",
      index: 6,
      title: "تحرير القدس",
      subtitle: "المنبر يعود إلى الأقصى",
      hero: "/images/chapters/c6-jerusalem.jpg",
      intro:
        "في ٢٧ رجب ٥٨٣هـ، تُفتح أبواب القدس صلحًا. يدخل صلاح الدين المسجد الأقصى ويُنصب فيه المنبر الذي وعد به نور الدين قبل اثنين وعشرين عامًا.",
      body: [
        "حفظ صلاح الدين أمان المسيحيين في المدينة، فتعجّب المؤرخون الأوروبيون من رحمة المنتصر.",
      ],
      figures: [
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
      ],
      locations: [
        { kind: "city", id: "jerusalem", label: "القدس" },
      ],
      events: [
        { kind: "event", id: "liberation-jerusalem", label: "تحرير القدس" },
      ],
      knowledgeCards: [
        {
          id: "k6-1", icon: "🕋",
          title: "بطاقة القدس التاريخية",
          body: "أقدم مدنٍ الأرض المقدّسة؛ مرّت بأيدٍ كثيرة لكنّها في ذاكرة المسلمين تبقى أولى القبلتين وثالث الحرمين.",
        },
      ],
      unlocks: {
        events: ["liberation-jerusalem"],
        cities: ["jerusalem"],
      },
      readingGate: true,
      xp: 300,
    },
    {
      id: "c7",
      index: 7,
      title: "الحملة الصليبية الثالثة",
      subtitle: "مواجهة الأسود",
      hero: "/images/chapters/c7-arsuf.jpg",
      intro:
        "تستنفر أوروبا ملوكها لاستعادة القدس. يصل ريتشارد قلب الأسد من الإنجليز، وفيليب من فرنسا، والإمبراطور من ألمانيا. بين أرسوف ويافا تدور المواجهة الكبرى، وتنتهي بصلحٍ يحفظ القدس بيد المسلمين.",
      figures: [
        { kind: "character", id: "salahuddin", label: "صلاح الدين" },
        { kind: "character", id: "richard",    label: "ريتشارد قلب الأسد" },
      ],
      locations: [
        { kind: "city", id: "arsuf", label: "أرسوف" },
      ],
      events: [
        { kind: "battle", id: "arsuf", label: "معركة أرسوف" },
      ],
      knowledgeCards: [
        {
          id: "k7-1", icon: "🤝",
          title: "صلح الرملة",
          body: "أنهى الصلح الحملة الثالثة بإبقاء القدس بيد المسلمين، مع السماح بزيارة الحجاج المسيحيين.",
        },
      ],
      unlocks: { battles: ["arsuf"] },
      xp: 200,
    },
  ],
  finalReward: {
    title: "محرر القدس",
    artifactId: "salahuddin-sword",
    badgeId: "legendary-liberator",
    characterIds: ["salahuddin"],
    xp: 500,
    legendary: true,
  },
};
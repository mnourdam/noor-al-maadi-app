import type { Era } from "./data";

export interface CityLandmark {
  id: string;
  name: string;
  icon: string;
  blurb: string;
}

export interface CityEraNote {
  eraId: Era;
  title: string;
  note: string;
}

export interface CityProfile {
  id: string;
  name: string;
  romanized: string;
  honorific?: string;
  regionId: string;
  era: Era;
  eras: Era[];
  founded: string;
  population?: string;
  glyph: string;
  toneClass: string;
  tagline: string;
  identity: string[];
  significance: string[];
  civilization: { name: string; eraId: Era; blurb: string };
  landmarks: CityLandmark[];
  eraNotes: CityEraNote[];
  characterIds: string[];
  battleIds: string[];
  artifactIds: string[];
  storyIds: string[];
  campaignEras: Era[];
  coords?: { x: number; y: number };
  fogClue: string;
}

export const CITIES: CityProfile[] = [
  {
    id: "mecca",
    name: "مكّة المكرّمة",
    romanized: "Makkah",
    honorific: "أمّ القرى",
    regionId: "hijaz",
    era: "seerah",
    eras: ["seerah", "rashidun", "umayyad", "abbasid", "ottoman"],
    founded: "ما قبل الإسلام",
    glyph: "🕋",
    toneClass: "from-amber-500/40 via-gold/15 to-transparent",
    tagline: "قلب الأمة، ومهبط الوحي، ومنتهى أشواق القلوب.",
    identity: [
      "بلدُ الله الحرام وقِبلة المسلمين",
      "مهبط الوحي ومولد النبي ﷺ",
      "ملتقى الحجّاج من أطراف الدنيا",
    ],
    significance: [
      "في وادٍ غير ذي زرعٍ أسكن إبراهيمُ ذرّيّته، فجعل الله البيتَ مثابةً للناس وأمنًا.",
      "في غارها نزل أوّل الوحي، ومن جبالها انطلقت الرسالة لتغيّر وجه التاريخ.",
      "ظلّت — رغم كلّ الانكسارات السياسية — قلبًا روحيًّا لا يتوقّف عن النبض.",
    ],
    civilization: { name: "فجر النبوّة", eraId: "seerah", blurb: "حضارةٌ ولدت من حِراء وانتشرت في الأرض." },
    landmarks: [
      { id: "kaaba", name: "الكعبة المشرّفة", icon: "🕋", blurb: "أوّل بيتٍ وُضع للناس." },
      { id: "haram-mecca", name: "المسجد الحرام", icon: "🕌", blurb: "أعظم مسجدٍ على الأرض." },
      { id: "hira", name: "غار حِراء", icon: "⛰️", blurb: "حيث نزل أوّل الوحي." },
      { id: "safa-marwa", name: "الصفا والمروة", icon: "🌿", blurb: "مسعى هاجر وذكرى التوحيد." },
    ],
    eraNotes: [
      { eraId: "seerah", title: "مولد الرسالة", note: "نزول الوحي، الدعوة السرّيّة، ثمّ الهجرة." },
      { eraId: "rashidun", title: "بلدُ الحجّ المنظّم", note: "وُسِّع الحرم في عهد عمر وعثمان." },
      { eraId: "ottoman", title: "حماية الحرمين", note: "تكفّل العثمانيون بصيانة الحرم وكسوة الكعبة." },
    ],
    characterIds: ["omar"],
    battleIds: ["b-badr"],
    artifactIds: ["kaaba-kiswa"],
    storyIds: ["hijra"],
    campaignEras: ["seerah"],
    coords: { x: 62, y: 46 },
    fogClue: "مدينةٌ في وادٍ غير ذي زرع، تتّجه إليها القلوب خمس مرّات في اليوم.",
  },
  {
    id: "medina",
    name: "المدينة المنوّرة",
    romanized: "Madinah",
    honorific: "طيبة الطيّبة",
    regionId: "hijaz",
    era: "seerah",
    eras: ["seerah", "rashidun"],
    founded: "يثرب — ما قبل الإسلام",
    glyph: "🌙",
    toneClass: "from-emerald-400/30 via-gold/10 to-transparent",
    tagline: "أرضُ الهجرة وعاصمة أوّل دولةٍ في الإسلام.",
    identity: [
      "دار الهجرة وأوّل عاصمة للمسلمين",
      "مدفنُ النبي ﷺ وخلفائه الأوائل",
      "مهد التشريع وميلاد الدولة",
    ],
    significance: [
      "استقبل أهلُها النبيَّ بفرحٍ لم تشهد له يثرب مثيلًا، فصار اسمها «المدينة».",
      "في مسجدها صِيغت أوّل وثيقة دستورية في الإسلام: صحيفة المدينة.",
      "منها انطلقت كتائب بدرٍ وأحد والخندق، ومنها امتدّت دولة الراشدين.",
    ],
    civilization: { name: "دولة المدينة", eraId: "rashidun", blurb: "نموذجٌ سياسيٌّ جديدٌ في الأرض." },
    landmarks: [
      { id: "masjid-nabawi", name: "المسجد النبوي", icon: "🕌", blurb: "بناه النبي ﷺ بيده." },
      { id: "quba", name: "مسجد قُباء", icon: "🕋", blurb: "أوّل مسجدٍ في الإسلام." },
      { id: "uhud", name: "جبل أُحد", icon: "⛰️", blurb: "جبلٌ يحبّنا ونحبّه." },
      { id: "baqi", name: "بقيع الغرقد", icon: "🌿", blurb: "مقبرة الصحابة." },
    ],
    eraNotes: [
      { eraId: "seerah", title: "العاصمة الأولى", note: "تشكّل النواة السياسية والاجتماعية للدولة." },
      { eraId: "rashidun", title: "منبر الخلافة", note: "منها صدرت أوامر فتح الشام والعراق ومصر." },
    ],
    characterIds: ["omar"],
    battleIds: ["b-badr"],
    artifactIds: [],
    storyIds: ["hijra"],
    campaignEras: ["seerah", "rashidun"],
    coords: { x: 60, y: 40 },
    fogClue: "مدينةٌ استقبلت قافلتين عظيمتين: قافلة الوحي، وقافلة الفتح.",
  },
  {
    id: "jerusalem",
    name: "القُدس",
    romanized: "Al-Quds",
    honorific: "أُولى القبلتين",
    regionId: "sham",
    era: "rashidun",
    eras: ["rashidun", "umayyad", "ayyubid", "ottoman"],
    founded: "آلاف السنين قبل الإسلام",
    glyph: "🕍",
    toneClass: "from-sky-400/30 via-gold/10 to-transparent",
    tagline: "أرضٌ بارك الله حولها، ومسرى نبيٍّ في ليلةٍ واحدة.",
    identity: [
      "أولى القبلتين وثالث الحرمين",
      "مدينة الأنبياء عبر العصور",
      "بوصلة الأمّة وموضع شَوقها الدائم",
    ],
    significance: [
      "فتحها عمر بن الخطاب صلحًا، فدخلها ماشيًا متواضعًا في عهدة عُمرية خالدة.",
      "حرّرها صلاح الدين بعد حطّين، فأعاد الأذان إلى أقصاها بعد ٨٨ عامًا من الانقطاع.",
      "ظلّت مدينةً يلتقي عليها الحجّ والسياسة والروح في آنٍ واحد.",
    ],
    civilization: { name: "ميراث الأنبياء", eraId: "ayyubid", blurb: "حضارةٌ روحيّة عابرة للحضارات." },
    landmarks: [
      { id: "aqsa", name: "المسجد الأقصى", icon: "🕌", blurb: "ثالث المساجد المباركة." },
      { id: "sakhrah", name: "قبّة الصخرة", icon: "🌌", blurb: "تحفة العمارة الأموية." },
      { id: "wall-omar", name: "محراب عمر", icon: "📜", blurb: "ذكرى الفتح الراشدي." },
      { id: "nuruddin-minbar", name: "منبر نور الدين", icon: "📿", blurb: "نُحت قبل التحرير بعقود." },
    ],
    eraNotes: [
      { eraId: "rashidun", title: "العهدة العُمريّة", note: "أمانٌ شاملٌ لأهل المدينة على دمائهم وكنائسهم." },
      { eraId: "umayyad", title: "قبّة عبد الملك", note: "بُنيت قبّة الصخرة فصارت أيقونة المدينة." },
      { eraId: "ayyubid", title: "تحرير حطّين", note: "صلاح الدين يستردّ القدس بعد قرنٍ من الصليبيين." },
    ],
    characterIds: ["salahuddin"],
    battleIds: ["b-hattin"],
    artifactIds: ["nuruddin-minbar"],
    storyIds: ["hattin"],
    campaignEras: ["ayyubid"],
    coords: { x: 52, y: 30 },
    fogClue: "مدينةٌ تَطلّعت إليها الأمم، ولا تزال تنتظر عودة الفجر.",
  },
  {
    id: "damascus",
    name: "دمشق",
    romanized: "Dimashq",
    honorific: "الفيحاء",
    regionId: "sham",
    era: "umayyad",
    eras: ["rashidun", "umayyad", "ayyubid", "ottoman"],
    founded: "أقدم العواصم المأهولة",
    glyph: "🛡️",
    toneClass: "from-emerald-500/30 via-gold/15 to-transparent",
    tagline: "عاصمة بني أميّة، حيث امتدّت الراية من الأطلسي إلى السند.",
    identity: [
      "أوّل عاصمة لخلافةٍ إسلامية كبرى",
      "مدينةٌ يلتقي فيها الجامع الأموي بسوق الحميديّة",
      "حاضنة العلماء وملاذ صلاح الدين",
    ],
    significance: [
      "من قصرها الأخضر حكم معاوية وعبد الملك ومروان، فأصبحت محورًا للعالم.",
      "بنى فيها الوليد بن عبد الملك جامعًا أذهل الرحّالة والمؤرّخين قرونًا.",
      "اتّخذها نور الدين وصلاح الدين مركزًا لتوحيد الجبهة الإسلامية أمام الصليبيّين.",
    ],
    civilization: { name: "الخلافة الأموية", eraId: "umayyad", blurb: "أوّل إمبراطورية إسلامية بمعنى الكلمة." },
    landmarks: [
      { id: "umayyad-mosque", name: "الجامع الأموي", icon: "🕌", blurb: "تحفة الوليد بن عبد الملك." },
      { id: "qasioun", name: "جبل قاسيون", icon: "⛰️", blurb: "إطلالةٌ على غوطتي دمشق." },
      { id: "salahuddin-tomb", name: "ضريح صلاح الدين", icon: "📿", blurb: "بجانب الجامع الأموي." },
      { id: "azm-palace", name: "قصر العظم", icon: "🏛️", blurb: "عمارةٌ شامية أصيلة." },
    ],
    eraNotes: [
      { eraId: "umayyad", title: "عاصمة العالم", note: "من دمشق إلى أطراف الأرض في أقلّ من قرن." },
      { eraId: "ayyubid", title: "قاعدة التحرير", note: "منها انطلقت جيوش حطّين والقدس." },
    ],
    characterIds: ["muawiya", "salahuddin"],
    battleIds: ["b-yarmouk", "b-hattin"],
    artifactIds: ["umayyad-dinar"],
    storyIds: ["yarmouk", "hattin"],
    campaignEras: ["umayyad", "ayyubid"],
    coords: { x: 54, y: 25 },
    fogClue: "عاصمةُ خلافةٍ امتدّت من المحيط الأطلسي إلى نهر السند.",
  },
  {
    id: "baghdad",
    name: "بغداد",
    romanized: "Baghdad",
    honorific: "مدينة السلام",
    regionId: "iraq",
    era: "abbasid",
    eras: ["abbasid", "seljuk"],
    founded: "١٤٥ هـ · المنصور",
    population: "أكثر من مليون في القرن الرابع الهجري",
    glyph: "📜",
    toneClass: "from-purple-500/30 via-gold/15 to-transparent",
    tagline: "عاصمةُ العقل في العالم القديم، حيث تُرجمت كتب الأمم.",
    identity: [
      "المدينة المدوّرة التي صمّمها المنصور بنفسه",
      "موطن بيت الحكمة وعصر الترجمة الذهبي",
      "ملتقى الفلاسفة والفقهاء والشعراء",
    ],
    significance: [
      "اختار المنصور موقعها بعد دراسةٍ طويلة بين دجلة والفرات، فصارت قلب العالم.",
      "في عهد المأمون وُلِد بيت الحكمة، فترجم العالم القديم إلى لغةٍ واحدة.",
      "ظلّت قبلة العلم حتى احترقت كتبها في نهر دجلة سنة ٦٥٦ هـ.",
    ],
    civilization: { name: "الخلافة العباسية", eraId: "abbasid", blurb: "ذروة الحضارة الإسلامية." },
    landmarks: [
      { id: "bait-hikma", name: "بيت الحكمة", icon: "📚", blurb: "مكتبة العالم القديم." },
      { id: "round-city", name: "المدينة المدوّرة", icon: "🏛️", blurb: "تصميم المنصور الشهير." },
      { id: "mustansiriyya", name: "المدرسة المستنصرية", icon: "🎓", blurb: "أقدم جامعةٍ بقيت قائمة." },
      { id: "tigris", name: "ضفاف دجلة", icon: "🌊", blurb: "شريان المدينة وروحها." },
    ],
    eraNotes: [
      { eraId: "abbasid", title: "ذروة العلم", note: "الخوارزمي، الكِندي، ابن قُتيبة، والجاحظ كلّهم هنا." },
      { eraId: "abbasid", title: "السقوط الكبير", note: "اجتياح هولاكو ٦٥٦ هـ وحرق المكتبات." },
    ],
    characterIds: ["harun", "khwarizmi"],
    battleIds: [],
    artifactIds: ["baghdad-manuscript", "khwarizmi-jabr"],
    storyIds: ["baghdad-house-of-wisdom"],
    campaignEras: ["abbasid"],
    coords: { x: 65, y: 26 },
    fogClue: "مدينةٌ مدوّرةٌ على نهرٍ عظيم، تُرجم فيها العالم القديم.",
  },
  {
    id: "cairo",
    name: "القاهرة",
    romanized: "Al-Qahirah",
    honorific: "قاهرة المعزّ",
    regionId: "egypt",
    era: "ayyubid",
    eras: ["abbasid", "ayyubid", "mamluk", "ottoman"],
    founded: "٣٥٨ هـ · جوهر الصقلي",
    glyph: "🏯",
    toneClass: "from-orange-500/30 via-gold/15 to-transparent",
    tagline: "حصنُ الأمّة الذي كسر المغول وأنقذ الحضارة.",
    identity: [
      "عاصمة الفاطميّين ثم الأيوبيّين والمماليك",
      "مهد الأزهر الشريف وأقدم جامعات العالم",
      "المدينة التي صدّت المغول في عين جالوت",
    ],
    significance: [
      "بناها جوهر الصقلي للمعزّ لدين الله، فصارت في قرنين قلب العالم الإسلامي.",
      "أسّس فيها صلاح الدين القلعة، وانطلق منها لتحرير القدس.",
      "من بواباتها خرج قطز وبيبرس ليكسرا أسطورة المغول التي لا تُهزم.",
    ],
    civilization: { name: "الأيوبيون والمماليك", eraId: "mamluk", blurb: "حماة الإسلام في أحلك أوقاته." },
    landmarks: [
      { id: "azhar", name: "الأزهر الشريف", icon: "🕌", blurb: "منارة العلم منذ ألف عام." },
      { id: "citadel", name: "قلعة صلاح الدين", icon: "🏰", blurb: "حصن القاهرة الأبدي." },
      { id: "ibn-tulun", name: "جامع ابن طولون", icon: "🕌", blurb: "أقدم جامعٍ بقي على حاله." },
      { id: "khan-khalili", name: "خان الخليلي", icon: "🛍️", blurb: "سوق العالم القديم." },
    ],
    eraNotes: [
      { eraId: "ayyubid", title: "قاعدة صلاح الدين", note: "منها انطلق إلى حطّين والقدس." },
      { eraId: "mamluk", title: "كاسرو المغول", note: "بيبرس وقطز يحمونها من شرقٍ ومن غرب." },
    ],
    characterIds: ["baybars", "salahuddin"],
    battleIds: ["b-ain-jalut"],
    artifactIds: [],
    storyIds: ["ain-jalut"],
    campaignEras: ["ayyubid", "mamluk"],
    coords: { x: 47, y: 36 },
    fogClue: "حصنٌ على ضفّة النيل، صدّ المغول ثمّ حرّر القدس.",
  },
  {
    id: "cordoba",
    name: "قُرطبة",
    romanized: "Qurtubah",
    honorific: "زهرة الغرب",
    regionId: "andalus",
    era: "andalus",
    eras: ["umayyad", "andalus"],
    founded: "فتحت ٩٢ هـ",
    population: "نحو نصف مليون في القرن الرابع الهجري",
    glyph: "🏛️",
    toneClass: "from-rose-400/30 via-gold/15 to-transparent",
    tagline: "حاضرةُ الأندلس حين كانت أوروبا غارقةً في الظلام.",
    identity: [
      "عاصمة الخلافة الأموية بالأندلس",
      "أكبر مدن أوروبا في عصرها",
      "مهد ابن رشد وابن حزم والزهراوي",
    ],
    significance: [
      "أضاء عبد الرحمن الناصر شوارعها بالقناديل عشرة أميال، وأوروبا تتحسّس النور.",
      "احتوت مكتبتها على أكثر من ٤٠٠ ألف مجلّد حين كانت أكبر مكتبة أوروبية تضمّ المئات.",
      "في جامعها الكبير صلّى الخلفاء، وفي حلقاته درّس ابن رشد فيلسوف العالم.",
    ],
    civilization: { name: "الأندلس الأمويّة", eraId: "andalus", blurb: "حضارةٌ جمعت الشرق والغرب." },
    landmarks: [
      { id: "great-mosque-cordoba", name: "جامع قرطبة الكبير", icon: "🕌", blurb: "أعمدةٌ من رخامٍ بلا نهاية." },
      { id: "zahra", name: "مدينة الزهراء", icon: "🏰", blurb: "مدينةٌ من المرايا والذهب." },
      { id: "cordoba-bridge", name: "القنطرة الرومانية", icon: "🌉", blurb: "جسرٌ يعبر الوادي الكبير." },
      { id: "library-hakam", name: "مكتبة الحكم", icon: "📚", blurb: "أعظم مكتبة في زمنها." },
    ],
    eraNotes: [
      { eraId: "umayyad", title: "إمارة الداخل", note: "عبد الرحمن الداخل يؤسّس دولةً جديدة." },
      { eraId: "andalus", title: "الخلافة الذهبية", note: "عبد الرحمن الناصر يعلن الخلافة." },
    ],
    characterIds: ["abdurrahman", "ibn-rushd"],
    battleIds: [],
    artifactIds: ["cordoba-key"],
    storyIds: ["cordoba"],
    campaignEras: ["andalus"],
    coords: { x: 9, y: 22 },
    fogClue: "مدينةٌ أضاءت شوارعها قبل أن تعرف باريس مصباحًا.",
  },
  {
    id: "granada",
    name: "غرناطة",
    romanized: "Gharnatah",
    honorific: "آخر الأنوار",
    regionId: "andalus",
    era: "andalus",
    eras: ["andalus"],
    founded: "ازدهرت في القرن ٦ هـ",
    glyph: "🏰",
    toneClass: "from-red-500/30 via-gold/15 to-transparent",
    tagline: "آخر معاقل الإسلام في الأندلس، وقصرٌ على تلٍّ أحمر.",
    identity: [
      "عاصمة بني الأحمر آخر دول الأندلس",
      "موطن قصر الحمراء، أعجوبة العمارة",
      "نهاية حقبةٍ وبداية حنينٍ لا ينقطع",
    ],
    significance: [
      "ازدهرت بعد سقوط قرطبة، فاحتضنت لاجئي الأندلس قرنين وأكثر.",
      "في قصورها الحمراء كُتبت أرقّ القصائد، وعلى أسوارها رُسمت آخر معارك الأندلس.",
      "سقطت سنة ١٤٩٢ م، فبكى أبو عبد الله الصغير حيث لم ينفع البكاء.",
    ],
    civilization: { name: "مملكة بني الأحمر", eraId: "andalus", blurb: "آخر ضوءٍ في الغرب الإسلامي." },
    landmarks: [
      { id: "alhambra", name: "قصر الحمراء", icon: "🏰", blurb: "آخر ما بقي من زهرة الغرب." },
      { id: "generalife", name: "جنّة العريف", icon: "🌿", blurb: "حدائق ملوك بني الأحمر." },
      { id: "albayzin", name: "حيّ البيازين", icon: "🏘️", blurb: "أحياء الأندلس الباقية." },
      { id: "elvira-gate", name: "باب إلبيرة", icon: "🚪", blurb: "بوابة المدينة القديمة." },
    ],
    eraNotes: [
      { eraId: "andalus", title: "المملكة الأخيرة", note: "بنو الأحمر يصمدون قرنين بعد سقوط الموحّدين." },
      { eraId: "andalus", title: "السقوط", note: "تسليم المفاتيح ١٤٩٢ م، ونهاية ثمانية قرون." },
    ],
    characterIds: [],
    battleIds: [],
    artifactIds: [],
    storyIds: ["cordoba"],
    campaignEras: ["andalus"],
    coords: { x: 13, y: 27 },
    fogClue: "قصرٌ أحمر على تلٍّ، آخر ما بقي من حضارةٍ عظيمة.",
  },
  {
    id: "constantinople",
    name: "القسطنطينيّة",
    romanized: "Constantinople",
    honorific: "إسلامبول",
    regionId: "anatolia",
    era: "ottoman",
    eras: ["ottoman"],
    founded: "بُنيت ٣٣٠ م · فُتحت ٨٥٧ هـ",
    glyph: "🕌",
    toneClass: "from-indigo-500/30 via-gold/15 to-transparent",
    tagline: "حلمٌ نبويٌّ تحقّق على يد فاتحٍ شاب.",
    identity: [
      "عاصمة الروم لألفِ سنة",
      "ثمّ عاصمة الدولة العثمانية ستة قرون",
      "ملتقى البحار والبرّ والقارّات",
    ],
    significance: [
      "بشّر النبي ﷺ بفتحها فظلّ المسلمون يحاولون ثمانية قرون.",
      "فتحها محمد الفاتح وهو في الحادية والعشرين بعد حصارٍ مذهلٍ نقل فيه السفن على البرّ.",
      "تحوّلت آيا صوفيا إلى جامع، وصلّى الفاتح فيها أوّل جمعة.",
    ],
    civilization: { name: "الدولة العثمانية", eraId: "ottoman", blurb: "خلافةٌ امتدّت ستة قرون." },
    landmarks: [
      { id: "ayasofya", name: "آيا صوفيا", icon: "🕌", blurb: "قبّةٌ شهدت ثلاث ديانات." },
      { id: "topkapi", name: "قصر طوب قابي", icon: "🏯", blurb: "مقرّ السلاطين العثمانيّين." },
      { id: "sultan-ahmed", name: "الجامع الأزرق", icon: "🕌", blurb: "ستّ مآذن تحرس البوسفور." },
      { id: "fatih-mosque", name: "جامع الفاتح", icon: "🕌", blurb: "بناه الفاتح بعد سنواتٍ من الفتح." },
    ],
    eraNotes: [
      { eraId: "ottoman", title: "الفتح", note: "٢٩ مايو ١٤٥٣ م يدخل الفاتح المدينة." },
      { eraId: "ottoman", title: "العاصمة الجديدة", note: "تنقل العاصمة من أدرنة إلى إسلامبول." },
    ],
    characterIds: ["fatih"],
    battleIds: ["b-constantinople"],
    artifactIds: ["fatih-cannon"],
    storyIds: [],
    campaignEras: ["ottoman"],
    coords: { x: 46, y: 13 },
    fogClue: "مدينةٌ على مضيقٍ، بشّر بفتحها نبيٌّ قبل ثمانية قرون.",
  },
  {
    id: "samarkand",
    name: "سمرقند",
    romanized: "Samarqand",
    honorific: "جوهرة طريق الحرير",
    regionId: "transoxiana",
    era: "abbasid",
    eras: ["umayyad", "abbasid"],
    founded: "قبل الإسلام بآلاف السنين",
    glyph: "🌌",
    toneClass: "from-cyan-500/30 via-gold/15 to-transparent",
    tagline: "قبابٌ فيروزيّة على طريق الحرير.",
    identity: [
      "ملتقى طريق الحرير الشرقي والغربي",
      "موطن البخاري وابن سينا والبيروني",
      "تحفة العمارة التيمورية بقبابها الفيروزية",
    ],
    significance: [
      "فتحها قُتيبة بن مسلم سنة ٩٣ هـ، فصارت بوّابة الإسلام إلى أعماق آسيا.",
      "أنجبت أئمّة الحديث: البخاري ومسلم والترمذي، وعلماء الفلك والطبّ.",
      "في عهد التيموريّين بُنيت ساحة ريجستان بمدارسها الثلاث.",
    ],
    civilization: { name: "حضارة ما وراء النهر", eraId: "abbasid", blurb: "ملتقى الحضارات الكبرى." },
    landmarks: [
      { id: "registan", name: "ساحة ريجستان", icon: "🕌", blurb: "ثلاث مدارس تتقابل." },
      { id: "bibi-khanym", name: "جامع بيبي خانم", icon: "🕌", blurb: "أعظم مشاريع تيمور." },
      { id: "shah-zinda", name: "شاه زنده", icon: "📿", blurb: "مقابر الأمراء والعلماء." },
      { id: "ulugh-beg", name: "مرصد أُلُغ بيك", icon: "🌌", blurb: "أعظم مرصدٍ في القرون الوسطى." },
    ],
    eraNotes: [
      { eraId: "umayyad", title: "الفتح", note: "قتيبة بن مسلم يفتح المدينة." },
      { eraId: "abbasid", title: "ذروة العلم", note: "البخاري ومسلم ينتجان أصحّ كتابين بعد القرآن." },
    ],
    characterIds: [],
    battleIds: [],
    artifactIds: [],
    storyIds: [],
    campaignEras: ["abbasid"],
    coords: { x: 87, y: 12 },
    fogClue: "مدينةٌ بقبابٍ فيروزيّةٍ على طريقٍ يعبر القارّات.",
  },
];

export function getCity(id: string): CityProfile | undefined {
  return CITIES.find((c) => c.id === id);
}

export function citiesInRegion(regionId: string): CityProfile[] {
  return CITIES.filter((c) => c.regionId === regionId);
}

export function citiesForCharacter(characterId: string): CityProfile[] {
  return CITIES.filter((c) => c.characterIds.includes(characterId));
}

export function citiesForBattle(battleId: string): CityProfile[] {
  return CITIES.filter((c) => c.battleIds.includes(battleId));
}

export function citiesForArtifact(artifactId: string): CityProfile[] {
  return CITIES.filter((c) => c.artifactIds.includes(artifactId));
}

export function citiesForStory(storyId: string): CityProfile[] {
  return CITIES.filter((c) => c.storyIds.includes(storyId));
}

export function citiesForEra(era: Era): CityProfile[] {
  return CITIES.filter((c) => c.eras.includes(era));
}

export function cityFogHint(id: string): { title: string; clue: string } {
  const c = getCity(id);
  if (!c) return { title: "مدينةٌ في الضباب", clue: "اكشف ضباب التاريخ لتعرفها." };
  return { title: c.honorific ?? "مدينةٌ خفيّة", clue: c.fogClue };
}

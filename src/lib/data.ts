export type Era =
  | "seerah"
  | "rashidun"
  | "umayyad"
  | "abbasid"
  | "andalus"
  | "seljuk"
  | "ayyubid"
  | "mamluk"
  | "ottoman"
  | "modern";

export const ERAS: { id: Era; name: string; years: string; tagline: string }[] = [
  { id: "seerah", name: "السيرة النبوية", years: "٥٧٠ – ٦٣٢ م", tagline: "نور النبوّة وميلاد أمّة" },
  { id: "rashidun", name: "الخلافة الراشدة", years: "٦٣٢ – ٦٦١ م", tagline: "عدلٌ وفتوحٌ ومجدٌ تأسيسي" },
  { id: "umayyad", name: "الدولة الأموية", years: "٦٦١ – ٧٥٠ م", tagline: "من دمشق إلى أطراف الأرض" },
  { id: "abbasid", name: "الدولة العباسية", years: "٧٥٠ – ١٢٥٨ م", tagline: "بغداد عاصمة الحضارة" },
  { id: "andalus", name: "الأندلس", years: "٧١١ – ١٤٩٢ م", tagline: "زهرة الغرب الإسلامي" },
  { id: "seljuk", name: "السلاجقة", years: "١٠٣٧ – ١١٩٤ م", tagline: "حماة المشرق الإسلامي" },
  { id: "ayyubid", name: "الأيوبيون", years: "١١٧١ – ١٢٦٠ م", tagline: "صلاح الدين وتحرير القدس" },
  { id: "mamluk", name: "المماليك", years: "١٢٥٠ – ١٥١٧ م", tagline: "كاسرو المغول وحماة الحرمين" },
  { id: "ottoman", name: "الدولة العثمانية", years: "١٢٩٩ – ١٩٢٤ م", tagline: "خلافة امتدّت ستة قرون" },
  { id: "modern", name: "التاريخ العربي الحديث", years: "١٧٩٨ – اليوم", tagline: "نهضة، استقلال، وتحوّلات" },
];

export interface Story {
  id: string;
  title: string;
  era: Era;
  readMinutes: number;
  excerpt: string;
  body: string[];
}

export const STORIES: Story[] = [
  {
    id: "hijra",
    title: "ليلة الهجرة",
    era: "seerah",
    readMinutes: 4,
    excerpt: "ليلةٌ غيّرت وجه التاريخ، حين خرج النبي ﷺ من مكة إلى المدينة.",
    body: [
      "في ليلةٍ مظلمةٍ من ليالي مكة، اجتمع زعماء قريش يدبّرون أمرهم لاغتيال النبي ﷺ.",
      "ولكن السماء كانت قد كتبت غير ما أرادوا؛ فخرج النبي ﷺ ومعه صاحبه أبو بكر الصدّيق، تاركًا عليّ بن أبي طالب نائمًا في فراشه.",
      "اتّجها إلى غار ثور، فمكثا فيه ثلاث ليالٍ، حتى نسجت العنكبوت على بابه، وعشّش الحمام، فظنّ المطاردون أن لا أحد دخله.",
      "ثم انطلقا في طريقٍ غير مألوف نحو يثرب، حيث استقبلهما الأنصار بفرحٍ لم تشهد المدينة مثله: طلع البدر علينا...",
      "بهذه الهجرة بدأ تقويم أمّةٍ، وقامت دولةٌ ستغيّر مجرى التاريخ.",
    ],
  },
  {
    id: "yarmouk",
    title: "اليرموك: يوم انكسر الروم",
    era: "rashidun",
    readMinutes: 5,
    excerpt: "ستة أيامٍ من القتال غيّرت خريطة الشام إلى الأبد.",
    body: [
      "في عام ١٥هـ، التقى جيش المسلمين بقيادة خالد بن الوليد بجيش الروم الضخم على ضفاف نهر اليرموك.",
      "كان الروم يفوقون المسلمين عددًا بأضعاف، فأعاد خالد ترتيب الصفوف وقسّم الجيش إلى كراديس صغيرة سريعة الحركة.",
      "اشتدّ القتال ستة أيام، حتى هبّت ريحٌ شديدة في وجوه الروم في اليوم الأخير، فاستغلّها المسلمون بهجومٍ كاسح.",
      "انهار الجيش الرومي، وفُتحت أبواب الشام، وانتهت سيطرة بيزنطة على بلاد العرب إلى الأبد.",
    ],
  },
  {
    id: "qadisiyyah",
    title: "القادسية وسقوط الأكاسرة",
    era: "rashidun",
    readMinutes: 4,
    excerpt: "حين هزّ سعد بن أبي وقاص عرش فارس.",
    body: [
      "في عام ١٥هـ أيضًا، تقدّم سعد بن أبي وقاص بجيش المسلمين لمواجهة الفرس بقيادة رستم في سهل القادسية.",
      "دامت المعركة أربعة أيام، عُرفت بأيام أرماث وأغواث والعِماس وليلة الهرير.",
      "في النهاية قُتل رستم وانهار الجيش الفارسي، وفُتحت المدائن، وآلت إمبراطورية الساسانيين إلى الزوال.",
    ],
  },
  {
    id: "baghdad-house-of-wisdom",
    title: "بيت الحكمة: حين ترجمت بغداد العالم",
    era: "abbasid",
    readMinutes: 5,
    excerpt: "كيف تحوّلت بغداد إلى عاصمة العقل في العالم القديم.",
    body: [
      "أسّس الخليفة هارون الرشيد بيت الحكمة، وازدهر في عهد ابنه المأمون ليصبح أعظم مركز علمي في العالم.",
      "اجتمع فيه المسلمون والنصارى والصابئة، يترجمون كتب اليونان والفرس والهند إلى العربية.",
      "فيه برز الخوارزمي بعلم الجبر، والكِندي بالفلسفة، وحُنين بن إسحاق بالطب.",
      "ومن هذا البيت انطلقت شرارة الحضارة الإسلامية لتنير أوروبا قرونًا بعد ذلك.",
    ],
  },
  {
    id: "cordoba",
    title: "قرطبة: جوهرة العالم",
    era: "andalus",
    readMinutes: 4,
    excerpt: "حين كانت شوارع قرطبة مضاءة بالمصابيح وأوروبا غارقة في الظلام.",
    body: [
      "في القرن العاشر الميلادي، كانت قرطبة عاصمة الخلافة الأموية في الأندلس وأكبر مدن العالم.",
      "ضمّت نصف مليون نسمة، وفيها سبعون مكتبة، أكبرها مكتبة الحَكَم المستنصر بأربعمئة ألف مجلد.",
      "كانت شوارعها مرصوفة ومضاءة، بينما كانت عواصم أوروبا قرى طينيّة.",
      "تخرّج منها ابن رشد وابن حزم والزهراوي، وأشعّت علومها على أوروبا قرونًا.",
    ],
  },
  {
    id: "hattin",
    title: "حِطّين: يوم تحرير القدس",
    era: "ayyubid",
    readMinutes: 5,
    excerpt: "كيف أعاد صلاح الدين الأيوبي القدس بعد قرنٍ من الاحتلال الصليبي.",
    body: [
      "في الرابع من تموز ١١٨٧م، استدرج صلاح الدين الجيش الصليبي إلى سهل حِطّين القاحل.",
      "حاصرهم في حرّ تموز بلا ماء، وأشعل النيران في الأعشاب اليابسة حولهم.",
      "انهار الصليبيون وأُسر ملكهم غاي دي لوزنيان، وسقطت سلسلة قلاعهم تباعًا.",
      "وبعد أشهر، دخل صلاح الدين القدس صلحًا، فعفا عن أهلها، وأعاد الأذان إلى المسجد الأقصى بعد ٨٨ عامًا.",
    ],
  },
  {
    id: "ain-jalut",
    title: "عين جالوت: نهاية أسطورة المغول",
    era: "mamluk",
    readMinutes: 4,
    excerpt: "حين كسر قطز وبيبرس جيش هولاكو الذي لم يُهزم.",
    body: [
      "بعد سقوط بغداد عام ١٢٥٨م، زحف المغول نحو الشام، وبدا أن لا شيء يوقفهم.",
      "جمع السلطان قطز جيشه ومعه قائده بيبرس، والتقى المغول في عين جالوت بفلسطين عام ١٢٦٠م.",
      "استدرج بيبرس مقدّمة المغول إلى كمين، وانقضّ المسلمون على الجيش الرئيسي.",
      "قُتل قائدهم كتبغا، وانكسرت لأول مرة أسطورة جيشٍ لم يُهزم. فحُفظت مصر والشام والإسلام.",
    ],
  },
  {
    id: "constantinople",
    title: "محمد الفاتح وفتح القسطنطينية",
    era: "ottoman",
    readMinutes: 5,
    excerpt: "بشارة النبي ﷺ التي تحقّقت بعد ثمانية قرون.",
    body: [
      "في الحادي والعشرين من عمره، قاد السلطان محمد الثاني جيشه لحصار القسطنطينية عام ١٤٥٣م.",
      "بنى مدافع ضخمة لم يعرف العالم مثلها، وحفر سفنه فوق التلال ليُنزلها في القرن الذهبي.",
      "بعد ٥٣ يومًا من الحصار، اقتحم المسلمون أسوار المدينة في الفجر.",
      "صلّى محمد الفاتح في آيا صوفيا، وسُمّي «الفاتح»، وتحقّقت بشارة النبي ﷺ: «لتفتحنّ القسطنطينية فلَنعم الأمير أميرها ولَنعم الجيش ذلك الجيش».",
    ],
  },
  {
    id: "ibn-battuta",
    title: "ابن بطوطة: رحّالة الإسلام",
    era: "mamluk",
    readMinutes: 4,
    excerpt: "ثلاثون عامًا في الأسفار، و٧٥ ألف ميلٍ قطعها قبل أن يخترع المحرّك.",
    body: [
      "خرج محمد بن عبد الله بن بطوطة من طنجة عام ١٣٢٥م حاجًّا، فلم يعد إلا بعد ٢٩ عامًا.",
      "زار مصر والشام والحجاز والعراق وفارس واليمن وشرق أفريقيا والهند والصين وجزر المالديف ومالي.",
      "قطع نحو ٧٥ ألف ميل، ودوّن مشاهداته في كتابه «تحفة النظّار» الذي بقي أعظم رحلةٍ في تاريخ البشرية.",
    ],
  },
  {
    id: "nahda",
    title: "النهضة العربية: فجرٌ جديد",
    era: "modern",
    readMinutes: 4,
    excerpt: "كيف أطلق رفاعة الطهطاوي وجيله شرارة اليقظة في القرن التاسع عشر.",
    body: [
      "في القرن التاسع عشر، أرسلت مصر بعثاتها العلمية إلى أوروبا، وكان رفاعة الطهطاوي إمامها في باريس.",
      "عاد محمّلًا بالعلوم والترجمات، فأسّس مدرسة الألسن، وترجم مئات الكتب.",
      "ثم تتابع روّاد النهضة: الكواكبي، محمد عبده، الأفغاني، شوقي، وسواهم.",
      "أيقظوا الأمة من سباتها، ومهّدوا لاستقلالها في القرن العشرين.",
    ],
  },
];

export interface Puzzle {
  id: string;
  question: string;
  era: Era;
  options: string[];
  answerIndex: number;
  hint: string;
  explanation: string;
}

export const PUZZLES: Puzzle[] = [
  { id: "p1", era: "seerah", question: "في أي عامٍ ميلادي وُلد النبي محمد ﷺ؟", options: ["٥٥٠ م", "٥٧٠ م", "٥٩٠ م", "٦١٠ م"], answerIndex: 1, hint: "عام الفيل.", explanation: "وُلد ﷺ في عام الفيل الموافق ٥٧٠م تقريبًا." },
  { id: "p2", era: "seerah", question: "ما اسم الغار الذي اختبأ فيه النبي ﷺ وأبو بكر أثناء الهجرة؟", options: ["حراء", "ثور", "الكهف", "السدير"], answerIndex: 1, hint: "جنوب مكة.", explanation: "غار ثور جنوب مكة، ومكثا فيه ثلاث ليال." },
  { id: "p3", era: "rashidun", question: "من أول من جمع القرآن في مصحفٍ واحد؟", options: ["عمر بن الخطاب", "عثمان بن عفان", "أبو بكر الصدّيق", "علي بن أبي طالب"], answerIndex: 2, hint: "في خلافته بعد حروب الردة.", explanation: "أبو بكر الصدّيق بمشورة عمر، وكتبه زيد بن ثابت." },
  { id: "p4", era: "rashidun", question: "أين وقعت معركة القادسية؟", options: ["العراق", "الشام", "مصر", "خراسان"], answerIndex: 0, hint: "قرب الكوفة.", explanation: "وقعت في العراق سنة ١٥هـ بقيادة سعد بن أبي وقاص." },
  { id: "p5", era: "umayyad", question: "من مؤسس الدولة الأموية؟", options: ["مروان بن الحكم", "معاوية بن أبي سفيان", "عبد الملك بن مروان", "الوليد بن عبد الملك"], answerIndex: 1, hint: "والي الشام.", explanation: "معاوية بن أبي سفيان أسّسها عام ٤١هـ واتّخذ دمشق عاصمة." },
  { id: "p6", era: "umayyad", question: "من فتح الأندلس؟", options: ["موسى بن نصير", "طارق بن زياد", "عبد الرحمن الغافقي", "عقبة بن نافع"], answerIndex: 1, hint: "أحرق السفن.", explanation: "طارق بن زياد عام ٧١١م، وسُمّي جبل طارق باسمه." },
  { id: "p7", era: "abbasid", question: "من بنى مدينة بغداد؟", options: ["السفاح", "المنصور", "الرشيد", "المأمون"], answerIndex: 1, hint: "الخليفة الثاني.", explanation: "أبو جعفر المنصور عام ١٤٥هـ، وسمّاها مدينة السلام." },
  { id: "p8", era: "abbasid", question: "في عهد أي خليفة ازدهر بيت الحكمة أشدّ ازدهاره؟", options: ["الرشيد", "المأمون", "المعتصم", "المتوكل"], answerIndex: 1, hint: "ابن هارون الرشيد المعتزلي.", explanation: "المأمون ابن هارون الرشيد جعله أعظم مؤسسة علمية في زمنه." },
  { id: "p9", era: "andalus", question: "ما عاصمة الخلافة الأموية في الأندلس؟", options: ["إشبيلية", "غرناطة", "قرطبة", "طليطلة"], answerIndex: 2, hint: "مكتبتها كانت الأكبر في عصرها.", explanation: "قرطبة عاصمة الأمويين في الأندلس وأكبر مدن العالم آنذاك." },
  { id: "p10", era: "andalus", question: "من أشهر فلاسفة قرطبة وشارح أرسطو؟", options: ["ابن سينا", "ابن رشد", "ابن حزم", "ابن طفيل"], answerIndex: 1, hint: "عُرف في أوروبا باسم Averroes.", explanation: "ابن رشد القرطبي، شارح أرسطو وفقيه مالكي." },
  { id: "p11", era: "seljuk", question: "من أبرز وزراء السلاجقة ومؤسس النظامية ببغداد؟", options: ["نظام الملك", "ابن العميد", "البساسيري", "ألب أرسلان"], answerIndex: 0, hint: "اغتاله الحشّاشون.", explanation: "نظام الملك الطوسي وزير ألب أرسلان وملك شاه." },
  { id: "p12", era: "ayyubid", question: "في أي عامٍ هجري حرّر صلاح الدين القدس؟", options: ["٥٧٣ هـ", "٥٨٣ هـ", "٥٩٣ هـ", "٦٠٣ هـ"], answerIndex: 1, hint: "بعد حِطّين بأشهر.", explanation: "حرّرها في رجب ٥٨٣هـ الموافق ١١٨٧م." },
  { id: "p13", era: "mamluk", question: "أي سلطانٍ مملوكي قاد معركة عين جالوت؟", options: ["بيبرس", "قطز", "قلاوون", "الناصر محمد"], answerIndex: 1, hint: "قُتل بعدها بقليل.", explanation: "السلطان سيف الدين قطز، وقاد المقدمة معه بيبرس." },
  { id: "p14", era: "mamluk", question: "ما اسم الرحّالة الطنجي الشهير؟", options: ["ابن جبير", "ابن بطوطة", "ابن فضلان", "البيروني"], answerIndex: 1, hint: "كتابه «تحفة النظّار».", explanation: "محمد بن بطوطة الطنجي، طاف ٧٥ ألف ميل في ٢٩ سنة." },
  { id: "p15", era: "ottoman", question: "كم كان عمر محمد الفاتح حين فتح القسطنطينية؟", options: ["١٩", "٢١", "٢٥", "٣٠"], answerIndex: 1, hint: "في ربيع شبابه.", explanation: "كان عمره ٢١ سنة حين فتحها عام ١٤٥٣م." },
  { id: "p16", era: "ottoman", question: "من أعظم سلاطين العثمانيين الذي بلغت الدولة في عهده ذروتها؟", options: ["سليم الأول", "سليمان القانوني", "محمد الفاتح", "بايزيد الثاني"], answerIndex: 1, hint: "عُرف عند الأوروبيين بالعظيم.", explanation: "سليمان القانوني، حكم ٤٦ سنة وامتدّت الدولة في عهده إلى أقصاها." },
  { id: "p17", era: "abbasid", question: "في أي سنةٍ سقطت بغداد على يد هولاكو؟", options: ["٦٤٨ هـ", "٦٥٦ هـ", "٦٦٠ هـ", "٦٧٢ هـ"], answerIndex: 1, hint: "بعدها بعامين كانت عين جالوت.", explanation: "سقطت في صفر ٦٥٦هـ الموافق ١٢٥٨م." },
  { id: "p18", era: "modern", question: "من رائد النهضة العربية ومدير مدرسة الألسن؟", options: ["محمد عبده", "رفاعة الطهطاوي", "جمال الدين الأفغاني", "أحمد شوقي"], answerIndex: 1, hint: "إمام بعثة باريس.", explanation: "رفاعة رافع الطهطاوي، صاحب «تخليص الإبريز»." },
  { id: "p19", era: "umayyad", question: "من أول من ضرب الدينار الإسلامي الخالص؟", options: ["معاوية", "عبد الملك بن مروان", "هشام بن عبد الملك", "عمر بن عبد العزيز"], answerIndex: 1, hint: "عرّب الدواوين أيضًا.", explanation: "عبد الملك بن مروان عام ٧٧هـ." },
  { id: "p20", era: "seerah", question: "في أي عامٍ هجري كانت غزوة بدر الكبرى؟", options: ["١ هـ", "٢ هـ", "٣ هـ", "٥ هـ"], answerIndex: 1, hint: "أول معركة فاصلة.", explanation: "في رمضان من السنة الثانية للهجرة." },
];

export interface WhoAmI {
  id: string;
  era: Era;
  clues: string[];
  answer: string;
  aliases?: string[];
}

export const WHO_AM_I: WhoAmI[] = [
  { id: "w1", era: "seerah", answer: "خالد بن الوليد", aliases: ["خالد", "سيف الله"], clues: ["لُقّبتُ بسيف الله المسلول.", "هزمتُ الفرس والروم في عشرات المعارك.", "قدتُ المسلمين يوم اليرموك."] },
  { id: "w2", era: "rashidun", answer: "عمر بن الخطاب", aliases: ["الفاروق", "عمر"], clues: ["لُقّبتُ بالفاروق.", "في عهدي فُتحت بيت المقدس.", "أنا أوّل من أرّخ بالهجرة."] },
  { id: "w3", era: "abbasid", answer: "هارون الرشيد", aliases: ["الرشيد"], clues: ["خليفةٌ عباسي عظيم.", "راسلني شارلمان ملك الفرنجة.", "في عهدي بلغت بغداد أوج مجدها."] },
  { id: "w4", era: "ayyubid", answer: "صلاح الدين الأيوبي", aliases: ["صلاح الدين", "الناصر صلاح الدين"], clues: ["كرديّ الأصل سلطانٌ على مصر والشام.", "هزمتُ الصليبيين في حِطّين.", "حرّرتُ القدس بعد ٨٨ عامًا من الاحتلال."] },
  { id: "w5", era: "andalus", answer: "عبد الرحمن الداخل", aliases: ["صقر قريش", "الداخل"], clues: ["لُقّبتُ بصقر قريش.", "هربتُ من المشرق وأسّستُ دولةً في الغرب.", "أنا أول أمراء بني أمية في الأندلس."] },
  { id: "w6", era: "ottoman", answer: "محمد الفاتح", aliases: ["الفاتح", "محمد الثاني"], clues: ["تحقّقت بشارة النبي ﷺ على يدي.", "نقلتُ السفن فوق التلال.", "فتحتُ القسطنطينية وعمري ٢١ سنة."] },
  { id: "w7", era: "mamluk", answer: "الظاهر بيبرس", aliases: ["بيبرس", "الظاهر"], clues: ["كنتُ مملوكًا فصرتُ سلطانًا.", "أعدتُ الخلافة العباسية إلى القاهرة.", "قاتلتُ المغول والصليبيين معًا."] },
  { id: "w8", era: "abbasid", answer: "الخوارزمي", aliases: ["محمد بن موسى الخوارزمي"], clues: ["عشتُ في بيت الحكمة ببغداد.", "كتابي «الجبر والمقابلة».", "اسمي صار اسمًا للخوارزميّات في كل اللغات."] },
  { id: "w9", era: "andalus", answer: "ابن رشد", aliases: ["أبو الوليد", "ابن رشد القرطبي"], clues: ["فيلسوف وقاضٍ قرطبي.", "شرحتُ كتب أرسطو.", "عرفتني أوروبا باسم Averroes."] },
  { id: "w10", era: "modern", answer: "عمر المختار", aliases: ["شيخ الشهداء", "أسد الصحراء"], clues: ["شيخٌ ليبيّ قاد المقاومة عشرين عامًا.", "أعدمني الطليان وأنا في السبعين.", "لُقّبتُ بأسد الصحراء."] },
];

export interface OnThisDay {
  id: string;
  monthDay: string; // MM-DD
  year: string;
  era: Era;
  title: string;
  detail: string;
  /** Optional pack entity id (e.g. "ayyubid.battle.hattin") to deep-link from the home discovery & on-this-day pages. */
  relatedEntityId?: string;
  /** Optional human-readable source note shown beneath the entry. */
  source?: string;
}

export const ON_THIS_DAY: OnThisDay[] = [
  { id: "d1", monthDay: "01-15", year: "٧٥٦م", era: "andalus", title: "تأسيس إمارة الأندلس الأموية", detail: "دخل عبد الرحمن الداخل قرطبة وأسّس الدولة الأموية في الأندلس.", source: "ابن الأثير · الكامل في التاريخ" },
  { id: "d2", monthDay: "02-10", year: "٦٥٦هـ/١٢٥٨م", era: "abbasid", title: "سقوط بغداد على يد هولاكو", detail: "اقتحم المغول بغداد وأنهَوا الخلافة العباسية، وأُلقيت كتب بيت الحكمة في دجلة.", source: "ابن كثير · البداية والنهاية" },
  { id: "d3", monthDay: "03-12", year: "٦٢٤م", era: "seerah", title: "غزوة بدر الكبرى", detail: "أول معركة فاصلة في تاريخ الإسلام، انتصر فيها ٣١٣ مسلمًا على ١٠٠٠ مشرك.", source: "السيرة النبوية لابن هشام" },
  { id: "d4", monthDay: "04-06", year: "١٤٥٣م", era: "ottoman", title: "بداية حصار القسطنطينية", detail: "بدأ السلطان محمد الفاتح حصار المدينة الذي استمر ٥٣ يومًا حتى فتحها.", source: "تاج التواريخ · سعد الدين" },
  { id: "d5", monthDay: "04-26", year: "٧١١م", era: "andalus", title: "معركة وادي لكّة", detail: "هزم طارق بن زياد القوط بقيادة لذريق، ففُتحت الأندلس.", source: "نفح الطيب · المقري" },
  { id: "d6", monthDay: "05-29", year: "١٤٥٣م", era: "ottoman", title: "فتح القسطنطينية", detail: "دخل محمد الفاتح المدينة وصلّى في آيا صوفيا، فتحقّقت بشارة النبي ﷺ.", source: "كرتسولاس · مؤرخ بيزنطي" },
  { id: "d7", monthDay: "06-08", year: "٦٣٢م", era: "seerah", title: "وفاة النبي ﷺ", detail: "انتقل النبي محمد ﷺ إلى الرفيق الأعلى في المدينة المنورة.", source: "صحيح البخاري" },
  { id: "d8", monthDay: "07-04", year: "١١٨٧م", era: "ayyubid", title: "معركة حِطّين", detail: "هزم صلاح الدين الصليبيين هزيمةً ساحقة، فُتح الطريق لتحرير القدس.", relatedEntityId: "ayyubid.battle.hattin", source: "النوادر السلطانية · ابن شداد" },
  { id: "d9", monthDay: "08-10", year: "٦٣٦م", era: "rashidun", title: "بداية معركة اليرموك", detail: "ستة أيامٍ من القتال انتهت بهزيمة الروم وفتح الشام.", source: "فتوح البلدان · البلاذري" },
  { id: "d10", monthDay: "09-03", year: "١٢٦٠م", era: "mamluk", title: "معركة عين جالوت", detail: "هزم قطز وبيبرس المغول لأول مرة، فحُفظت مصر والشام.", source: "السلوك · المقريزي" },
  { id: "d11", monthDay: "10-02", year: "١١٨٧م", era: "ayyubid", title: "تحرير القدس", detail: "دخل صلاح الدين القدس صلحًا، وأُعيد الأذان إلى المسجد الأقصى.", relatedEntityId: "ayyubid.event.liberate-jerusalem", source: "ابن شداد · النوادر السلطانية" },
  { id: "d12", monthDay: "11-16", year: "٦٣٦م", era: "rashidun", title: "معركة القادسية", detail: "هزم سعد بن أبي وقاص جيش الفرس بقيادة رستم." },
  { id: "d13", monthDay: "12-18", year: "١٢٧١م", era: "mamluk", title: "فتح بيبرس قلعة الحصن", detail: "حصن الصليبيين الأمنع في الشام سقط بيد المماليك." },
  { id: "d14", monthDay: "01-27", year: "٧٣٢م", era: "umayyad", title: "معركة بلاط الشهداء", detail: "استشهد عبد الرحمن الغافقي في معركةٍ غيّرت مصير أوروبا." },
  { id: "d15", monthDay: "02-19", year: "١٤٧٣م", era: "ottoman", title: "تأسيس مكتبة محمد الفاتح", detail: "أسّس الفاتح مكتبةً ضخمة جمع فيها مخطوطات الشرق والغرب." },
  { id: "d16", monthDay: "03-09", year: "٧٨٦م", era: "abbasid", title: "تولية هارون الرشيد", detail: "تولّى الخلافة في ليلةٍ شهدت مولد ابنه المأمون ووفاة أخيه الهادي." },
  { id: "d17", monthDay: "03-30", year: "١٤٩٢م", era: "andalus", title: "سقوط غرناطة", detail: "سلّم أبو عبد الله الصغير مفاتيح غرناطة، فانتهت ثمانية قرون من حكم المسلمين." },
  { id: "d18", monthDay: "04-21", year: "٧٦٢م", era: "abbasid", title: "تأسيس بغداد", detail: "وضع المنصور حجر الأساس لمدينة السلام، فصارت عاصمة العالم القديم." },
  { id: "d19", monthDay: "05-04", year: "١٢٧٧م", era: "mamluk", title: "وفاة الظاهر بيبرس", detail: "توفّي السلطان الذي وحّد مصر والشام ودكّ الصليبيين والمغول." },
  { id: "d20", monthDay: "06-15", year: "١٢١٥م", era: "ayyubid", title: "ولادة الملك الكامل", detail: "السلطان الأيوبي الذي ردّ الحملة الصليبية الخامسة عن مصر." },
  { id: "d21", monthDay: "07-15", year: "٦٢٢م", era: "seerah", title: "الهجرة النبوية", detail: "بدأ النبي ﷺ هجرته من مكة إلى المدينة، وبدأ التقويم الهجري." },
  { id: "d22", monthDay: "08-25", year: "٧٥٠م", era: "umayyad", title: "سقوط الدولة الأموية", detail: "هُزم مروان بن محمد في الزاب وانتقلت الخلافة إلى العباسيين." },
  { id: "d23", monthDay: "09-11", year: "١٦٨٣م", era: "ottoman", title: "حصار فيينا الثاني", detail: "آخر زحف عثماني كبير على أوروبا، انتهى بانكسار العثمانيين." },
  { id: "d24", monthDay: "10-17", year: "١٩١١م", era: "modern", title: "بداية المقاومة الليبية", detail: "بدأ عمر المختار جهاده ضد الاحتلال الإيطالي." },
  { id: "d25", monthDay: "11-04", year: "١٠٤٠م", era: "seljuk", title: "معركة دندانقان", detail: "هزم السلاجقة الغزنويين فأسّسوا دولتهم في خراسان." },
  { id: "d26", monthDay: "11-22", year: "١٠٧١م", era: "seljuk", title: "معركة ملاذكرد", detail: "أسر السلطان ألب أرسلان إمبراطور الروم، وفُتح باب الأناضول للمسلمين." },
  { id: "d27", monthDay: "12-01", year: "٦٣٤م", era: "rashidun", title: "وفاة أبي بكر الصدّيق", detail: "توفّي أول الخلفاء الراشدين بعد خلافةٍ دامت سنتين وثلاثة أشهر." },
  { id: "d28", monthDay: "12-26", year: "٦٤٤م", era: "rashidun", title: "استشهاد عمر بن الخطاب", detail: "طعنه أبو لؤلؤة المجوسي في صلاة الفجر." },
  { id: "d29", monthDay: "01-20", year: "٧٥٠م", era: "abbasid", title: "معركة الزاب الكبرى", detail: "انتصر العباسيون نهائيًا على الأمويين، وقامت الدولة العباسية." },
  { id: "d30", monthDay: "03-03", year: "١٩٢٤م", era: "modern", title: "إلغاء الخلافة العثمانية", detail: "أعلن مصطفى كمال إلغاء الخلافة، فانتهت بذلك ١٣ قرنًا من حكم الخلفاء." },
];

export const BADGES = [
  { id: "first_story", name: "أول قصة", icon: "📖", desc: "اقرأ أول قصة." },
  { id: "five_stories", name: "قارئ نهم", icon: "📚", desc: "اقرأ خمس قصص." },
  { id: "first_puzzle", name: "حلّال", icon: "🧩", desc: "حلّ أول لغز." },
  { id: "ten_puzzles", name: "عقلٌ متقد", icon: "🧠", desc: "حلّ عشرة ألغاز." },
  { id: "streak_3", name: "ثلاثة أيام", icon: "🔥", desc: "حافظ على ٣ أيام متتالية." },
  { id: "streak_7", name: "أسبوع كامل", icon: "🏅", desc: "حافظ على ٧ أيام متتالية." },
  { id: "who_am_i", name: "عرّاف التاريخ", icon: "🔍", desc: "اكتشف ٥ شخصيات." },
  { id: "all_eras", name: "رحّالة الحقب", icon: "🗺️", desc: "افتح كل الحقب." },
];

export function todayOnThisDay(): OnThisDay {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const key = `${mm}-${dd}`;
  const exact = ON_THIS_DAY.find((e) => e.monthDay === key);
  if (exact) return exact;
  // Nearest upcoming entry by month/day (wrap-around end of year).
  const todayIdx = d.getMonth() * 31 + d.getDate();
  const withDelta = ON_THIS_DAY.map((e) => {
    const [em, ed] = e.monthDay.split("-").map(Number);
    const idx = (em - 1) * 31 + ed;
    const delta = (idx - todayIdx + 372) % 372;
    return { e, delta };
  }).sort((a, b) => a.delta - b.delta);
  return withDelta[0]?.e ?? ON_THIS_DAY[0];
}

export function dailyStory(): Story {
  const d = new Date();
  const day = Math.floor(d.getTime() / 86400000);
  return STORIES[day % STORIES.length];
}

// ============================================================
// GAMEPLAY SYSTEMS
// ============================================================

// 1) Historical Investigation — progressive clues + 4-option answer
export interface Investigation {
  id: string;
  era: Era;
  category: "person" | "battle" | "city" | "era";
  categoryLabel: string;
  clues: string[]; // revealed one by one; each costs hint points
  options: string[];
  answerIndex: number;
  reward: number;
  unlocks?: { character?: string; artifact?: string };
}

export const INVESTIGATIONS: Investigation[] = [
  {
    id: "inv-khalid", era: "rashidun", category: "person", categoryLabel: "شخصية",
    clues: ["قائد عسكري لم يُهزم في معركة قط.", "أسلم بعد صلح الحديبية.", "لقّبه النبي ﷺ بسيف الله المسلول.", "قاد المسلمين يوم اليرموك ضد الروم."],
    options: ["سعد بن أبي وقاص", "أبو عبيدة بن الجراح", "خالد بن الوليد", "عمرو بن العاص"],
    answerIndex: 2, reward: 60, unlocks: { character: "khalid" },
  },
  {
    id: "inv-yarmouk", era: "rashidun", category: "battle", categoryLabel: "معركة",
    clues: ["وقعت قرب نهرٍ في بلاد الشام.", "استمرّت ستة أيام.", "هبّت في يومها الأخير ريحٌ على وجوه العدو.", "أنهت السيطرة البيزنطية على الشام."],
    options: ["معركة بدر", "معركة اليرموك", "معركة القادسية", "معركة حِطّين"],
    answerIndex: 1, reward: 50, unlocks: { artifact: "yarmouk-sword" },
  },
  {
    id: "inv-cordoba", era: "andalus", category: "city", categoryLabel: "مدينة",
    clues: ["كانت في القرن العاشر أكبر مدن العالم.", "ضمّت سبعين مكتبة وشوارع مرصوفة.", "فيها وُلد ابن رشد.", "عاصمة الخلافة الأموية في الغرب."],
    options: ["إشبيلية", "غرناطة", "قرطبة", "طليطلة"],
    answerIndex: 2, reward: 50, unlocks: { artifact: "cordoba-key" },
  },
  {
    id: "inv-salahuddin", era: "ayyubid", category: "person", categoryLabel: "شخصية",
    clues: ["كرديّ الأصل، سلطانٌ على مصر والشام.", "أسّس الدولة الأيوبية.", "هزم الصليبيين في حِطّين.", "حرّر القدس بعد ٨٨ سنة من الاحتلال."],
    options: ["نور الدين زنكي", "صلاح الدين الأيوبي", "الظاهر بيبرس", "قطز"],
    answerIndex: 1, reward: 70, unlocks: { character: "salahuddin", artifact: "hattin-banner" },
  },
  {
    id: "inv-abbasid-era", era: "abbasid", category: "era", categoryLabel: "حقبة",
    clues: ["دامت أكثر من خمسة قرون.", "عاصمتها مدينة السلام.", "فيها ازدهر بيت الحكمة.", "سقطت أمام المغول عام ١٢٥٨م."],
    options: ["الأموية", "العباسية", "الفاطمية", "السلجوقية"],
    answerIndex: 1, reward: 50,
  },
  {
    id: "inv-ain-jalut", era: "mamluk", category: "battle", categoryLabel: "معركة",
    clues: ["وقعت في فلسطين عام ١٢٦٠م.", "قادها سلطانٌ مملوكي.", "كسرت أسطورة جيشٍ لم يُهزم.", "كان كمين بيبرس مفتاحها."],
    options: ["حِطّين", "عين جالوت", "وادي لكّة", "ملاذكرد"],
    answerIndex: 1, reward: 60, unlocks: { artifact: "ain-jalut-arrow" },
  },
  {
    id: "inv-fatih", era: "ottoman", category: "person", categoryLabel: "شخصية",
    clues: ["سلطانٌ عثماني تولّى وهو في العشرين.", "نقل السفن فوق التلال.", "تحقّقت بشارة النبي ﷺ على يده.", "صلّى في آيا صوفيا فاتحًا."],
    options: ["سليم الأول", "سليمان القانوني", "محمد الفاتح", "بايزيد الثاني"],
    answerIndex: 2, reward: 70, unlocks: { character: "fatih", artifact: "fatih-cannon" },
  },
  {
    id: "inv-baghdad", era: "abbasid", category: "city", categoryLabel: "مدينة",
    clues: ["بُنيت دائرية الشكل.", "أسّسها أبو جعفر المنصور.", "فيها قام بيت الحكمة.", "أحرقها هولاكو عام ١٢٥٨م."],
    options: ["دمشق", "سامراء", "بغداد", "البصرة"],
    answerIndex: 2, reward: 50, unlocks: { artifact: "baghdad-manuscript" },
  },
];

// 2) Timeline Challenge — order events chronologically
export interface TimelineChallenge {
  id: string;
  title: string;
  era?: Era;
  events: { id: string; label: string; year: number }[]; // year used for sorting
  reward: number;
}

export const TIMELINES: TimelineChallenge[] = [
  {
    id: "tl-rise", title: "ميلاد الإسلام وفتوحه", reward: 60,
    events: [
      { id: "e1", label: "بعثة النبي ﷺ", year: 610 },
      { id: "e2", label: "الهجرة إلى المدينة", year: 622 },
      { id: "e3", label: "غزوة بدر", year: 624 },
      { id: "e4", label: "فتح مكة", year: 630 },
      { id: "e5", label: "معركة اليرموك", year: 636 },
    ],
  },
  {
    id: "tl-states", title: "تعاقب الدول الإسلامية", reward: 70,
    events: [
      { id: "e1", label: "قيام الدولة الأموية", year: 661 },
      { id: "e2", label: "قيام الدولة العباسية", year: 750 },
      { id: "e3", label: "قيام الدولة الفاطمية", year: 909 },
      { id: "e4", label: "قيام الدولة الأيوبية", year: 1171 },
      { id: "e5", label: "قيام الدولة العثمانية", year: 1299 },
    ],
  },
  {
    id: "tl-battles", title: "معارك غيّرت التاريخ", reward: 70,
    events: [
      { id: "e1", label: "القادسية", year: 636 },
      { id: "e2", label: "بلاط الشهداء", year: 732 },
      { id: "e3", label: "ملاذكرد", year: 1071 },
      { id: "e4", label: "حِطّين", year: 1187 },
      { id: "e5", label: "عين جالوت", year: 1260 },
    ],
  },
  {
    id: "tl-andalus", title: "صعود وسقوط الأندلس", reward: 60,
    events: [
      { id: "e1", label: "فتح طارق للأندلس", year: 711 },
      { id: "e2", label: "تأسيس إمارة قرطبة", year: 756 },
      { id: "e3", label: "إعلان الخلافة الأموية", year: 929 },
      { id: "e4", label: "سقوط طليطلة", year: 1085 },
      { id: "e5", label: "سقوط غرناطة", year: 1492 },
    ],
  },
  {
    id: "tl-ottoman", title: "ذروة العثمانيين وأفولهم", reward: 70,
    events: [
      { id: "e1", label: "تأسيس الدولة العثمانية", year: 1299 },
      { id: "e2", label: "فتح القسطنطينية", year: 1453 },
      { id: "e3", label: "ذروة سليمان القانوني", year: 1566 },
      { id: "e4", label: "حصار فيينا الثاني", year: 1683 },
      { id: "e5", label: "إلغاء الخلافة", year: 1924 },
    ],
  },
];

// 3) Historical Decisions — branching scenes
export interface Decision {
  id: string;
  era: Era;
  scene: string;
  setting: string;
  choices: { label: string; outcome: string; historical: boolean }[];
  historicalNote: string;
  reward: number;
}

export const DECISIONS: Decision[] = [
  {
    id: "dec-hijra", era: "seerah", setting: "مكة · العام ١ هـ",
    scene: "قريش تحاصر بيتك لاغتيالك الليلة. ما خطّتك؟",
    choices: [
      { label: "أواجههم وأقاتل", outcome: "كنت ستفقد رسالتك في معركةٍ خاسرة قبل أوانها.", historical: false },
      { label: "أُنيم عليًّا في فراشي وأخرج سرًّا إلى ثور", outcome: "خطوة عبقرية أبقت الرسالة حيّة.", historical: true },
      { label: "أستسلم وأطلب الهدنة", outcome: "قريش لم تكن لتُبقي على حياتك.", historical: false },
    ],
    historicalNote: "خرج النبي ﷺ ومعه أبو بكر إلى غار ثور، فمكثا ثلاث ليال ثم انطلقا إلى المدينة.",
    reward: 40,
  },
  {
    id: "dec-yarmouk", era: "rashidun", setting: "اليرموك · ١٥ هـ",
    scene: "أنت خالد بن الوليد. جيش الروم يفوقك خمسة أضعاف. كيف تنظّم جيشك؟",
    choices: [
      { label: "صفّ واحد طويل للدفاع", outcome: "كنت ستُطوّق من الأجناب.", historical: false },
      { label: "كراديس صغيرة سريعة الحركة", outcome: "خطّة كسرت ثقل الروم.", historical: true },
      { label: "الانسحاب إلى الجبل", outcome: "كنت ستفقد سهل الشام كلّه.", historical: false },
    ],
    historicalNote: "قسّم خالد الجيش إلى ٣٦ كردوسًا، فأرهق الروم ستة أيام حتى انهاروا.",
    reward: 50,
  },
  {
    id: "dec-hattin", era: "ayyubid", setting: "الجليل · ١١٨٧م",
    scene: "أنت صلاح الدين. الصليبيون يتقدّمون في حرّ تموز. ما خطوتك؟",
    choices: [
      { label: "أهاجمهم وهم مستريحون قرب الماء", outcome: "كنت ستخسر ميزتك الحاسمة.", historical: false },
      { label: "أستدرجهم إلى سهل قاحل بلا ماء وأشعل العشب", outcome: "كمين انتهى بأكبر هزيمة صليبية.", historical: true },
      { label: "أتفاوض على هدنة", outcome: "ضاعت فرصة تحرير القدس.", historical: false },
    ],
    historicalNote: "أحرق صلاح الدين الأعشاب حول الجيش الصليبي العطشان في حِطّين، فانهار بالكامل.",
    reward: 60,
  },
  {
    id: "dec-fatih", era: "ottoman", setting: "أمام أسوار القسطنطينية · ١٤٥٣م",
    scene: "أنت محمد الثاني. السلسلة تمنع أسطولك من دخول القرن الذهبي.",
    choices: [
      { label: "أكسر السلسلة بالقوة", outcome: "خسائر فادحة بلا نتيجة.", historical: false },
      { label: "أنقل السفن برّيًّا فوق التلال", outcome: "حركة أسطورية فاجأت المدينة من الخلف.", historical: true },
      { label: "أرفع الحصار", outcome: "ضاعت بشارة النبي ﷺ.", historical: false },
    ],
    historicalNote: "نقل الفاتح ٧٠ سفينة برّيًّا في ليلة واحدة على ألواحٍ مدهونة بالشحم.",
    reward: 60,
  },
  {
    id: "dec-mansour", era: "abbasid", setting: "ضفاف دجلة · ١٤٥ هـ",
    scene: "أنت الخليفة المنصور. تبحث عن مكانٍ لعاصمتك الجديدة.",
    choices: [
      { label: "أبنيها في الكوفة", outcome: "بقيت في ظلّ المدائن القديمة.", historical: false },
      { label: "أبنيها مدوّرة على ضفاف دجلة", outcome: "ستصبح مدينة السلام وعاصمة العالم.", historical: true },
      { label: "أبقيها في الأنبار", outcome: "ستبقى ثكنة لا حاضرة.", historical: false },
    ],
    historicalNote: "اختار المنصور موقع بغداد لتجارة دجلة، وبناها دائرية فريدة من نوعها.",
    reward: 50,
  },
  {
    id: "dec-qutuz", era: "mamluk", setting: "القاهرة · ١٢٦٠م",
    scene: "وصل رسول هولاكو يطلب الاستسلام. ماذا تفعل يا قطز؟",
    choices: [
      { label: "أرسل الجزية وأكسب الوقت", outcome: "كان المغول سيقتحمون مصر تاليًا.", historical: false },
      { label: "أقتل الرسل وأخرج للقاء المغول", outcome: "إعلان حربٍ غيّر مصير الأمة.", historical: true },
      { label: "أتحصّن في القاهرة وأنتظر", outcome: "كانت ستُحاصر كما بغداد.", historical: false },
    ],
    historicalNote: "قتل قطز رسل المغول وخرج إلى عين جالوت، فكسر أسطورتهم لأول مرة.",
    reward: 60,
  },
];

// 4) Map Exploration
export interface RegionLandmark {
  id: string;
  name: string;
  x: number;
  y: number;
  icon: string;
}
export interface MapRegion {
  id: string;
  name: string;
  era: Era;
  // Approximate percent coordinates on an abstract map (0-100)
  x: number; y: number;
  capital: string;
  blurb: string;
  cost: number;
  unlocksArtifact?: string;
  // === Illustrated world-map extensions ===
  theme?: string;            // visual identity tagline
  glyph?: string;            // emoji icon for the region
  polygon?: string;          // SVG path d in a 100x60 viewBox
  labelX?: number;           // label position (SVG coords)
  labelY?: number;
  landmarks?: RegionLandmark[];
  characterIds?: string[];
  storyIds?: string[];
  campaignEra?: Era;         // which campaign opens from this region
  silhouette?: string;       // simple SVG hint shown under fog when locked
}

export const MAP_REGIONS: MapRegion[] = [
  {
    id: "hijaz", name: "الحجاز", era: "seerah", x: 62, y: 46,
    capital: "مكة والمدينة", blurb: "صحراءٌ ولدت فيها الرسالة وانطلقت منها القوافل إلى أطراف الأرض.",
    cost: 0, unlocksArtifact: "kaaba-kiswa",
    theme: "صحراء، قوافل، الحرمان الشريفان",
    glyph: "🕋",
    polygon: "M54,32 L70,30 L72,42 L66,52 L58,50 L54,42 Z",
    labelX: 62, labelY: 42,
    landmarks: [
      { id: "mecca",  name: "مكّة المكرّمة", x: 62, y: 46, icon: "🕋" },
      { id: "medina", name: "المدينة المنوّرة", x: 60, y: 40, icon: "🕌" },
      { id: "taif",   name: "الطائف",        x: 64, y: 44, icon: "🌿" },
    ],
    characterIds: ["omar"],
    storyIds: ["hijra"],
    campaignEra: "seerah",
  },
  {
    id: "sham", name: "الشام", era: "rashidun", x: 54, y: 26,
    capital: "دمشق", blurb: "أرض الفتوح وبوابة القدس، حيث رُفعت رايات الخلافة الأموية.",
    cost: 30,
    theme: "قِلاع، أسوار قدسيّة، أسواق دمشق",
    glyph: "🛡️",
    polygon: "M50,22 L60,21 L62,30 L54,33 L49,28 Z",
    labelX: 55, labelY: 27,
    landmarks: [
      { id: "damascus",  name: "دمشق",     x: 54, y: 25, icon: "🕌" },
      { id: "jerusalem", name: "القدس",    x: 52, y: 30, icon: "🕍" },
      { id: "aleppo",    name: "حلب",      x: 56, y: 22, icon: "🏯" },
    ],
    characterIds: ["salahuddin", "muawiya"],
    storyIds: ["hattin", "yarmouk"],
    campaignEra: "ayyubid",
  },
  {
    id: "iraq", name: "العراق", era: "abbasid", x: 65, y: 28,
    capital: "بغداد", blurb: "عاصمة العقل في العالم القديم، حيث تُرجمت كتب الأمم وأُسّس علم الجبر.",
    cost: 40, unlocksArtifact: "baghdad-manuscript",
    theme: "بيت الحكمة، مدينة مدوّرة، نهرَا الحضارة",
    glyph: "📜",
    polygon: "M60,22 L70,21 L71,30 L62,31 L60,27 Z",
    labelX: 65, labelY: 26,
    landmarks: [
      { id: "baghdad",  name: "بغداد",   x: 65, y: 26, icon: "🌙" },
      { id: "basra",    name: "البصرة",  x: 68, y: 30, icon: "⚓" },
      { id: "kufa",     name: "الكوفة",  x: 63, y: 28, icon: "✒️" },
    ],
    characterIds: ["harun", "khwarizmi"],
    storyIds: ["baghdad-house-of-wisdom"],
    campaignEra: "abbasid",
  },
  {
    id: "egypt", name: "مصر", era: "ayyubid", x: 46, y: 36,
    capital: "القاهرة", blurb: "أرض النيل وقاهرة المعزّ، حصن الأمة في وجه الصليبيين والمغول.",
    cost: 40,
    theme: "النيل، القلاع، قاهرة المعزّ",
    glyph: "🏯",
    polygon: "M40,32 L52,31 L54,40 L46,46 L40,42 Z",
    labelX: 47, labelY: 37,
    landmarks: [
      { id: "cairo",       name: "القاهرة",   x: 47, y: 36, icon: "🕌" },
      { id: "alexandria",  name: "الإسكندرية", x: 45, y: 32, icon: "🗼" },
      { id: "fustat",      name: "الفسطاط",   x: 47, y: 38, icon: "🏛️" },
    ],
    characterIds: ["baybars"],
    storyIds: ["ain-jalut"],
    campaignEra: "mamluk",
  },
  {
    id: "andalus", name: "الأندلس", era: "andalus", x: 11, y: 22,
    capital: "قرطبة", blurb: "قصورٌ وحدائق وقناطر، حيث أُضيئت شوارع قرطبة وأوروبا غارقة في الظلام.",
    cost: 60, unlocksArtifact: "cordoba-key",
    theme: "قصور، حدائق، عمارة موحّدة",
    glyph: "🏛️",
    polygon: "M3,16 L18,14 L22,22 L19,30 L8,31 L2,24 Z",
    labelX: 11, labelY: 23,
    landmarks: [
      { id: "cordoba",  name: "قرطبة",   x: 9,  y: 22, icon: "🕌" },
      { id: "granada",  name: "غرناطة",  x: 13, y: 27, icon: "🏰" },
      { id: "seville",  name: "إشبيلية", x: 7,  y: 26, icon: "🗼" },
      { id: "toledo",   name: "طُليطلة", x: 12, y: 18, icon: "📚" },
    ],
    characterIds: ["abdurrahman", "ibn-rushd"],
    storyIds: ["cordoba"],
    campaignEra: "andalus",
  },
  {
    id: "anatolia", name: "الأناضول", era: "ottoman", x: 52, y: 16,
    capital: "إسطنبول", blurb: "قِلاعٌ وجبالٌ، وهنا تحقّقت بشارة فتح القسطنطينية على يد محمد الفاتح.",
    cost: 70, unlocksArtifact: "fatih-cannon",
    theme: "قِلاع، مضائق، مساجد عثمانية",
    glyph: "🏰",
    polygon: "M42,10 L62,8 L66,18 L60,22 L46,21 L40,15 Z",
    labelX: 53, labelY: 16,
    landmarks: [
      { id: "constantinople", name: "القسطنطينية", x: 46, y: 13, icon: "🕌" },
      { id: "konya",          name: "قونية",       x: 56, y: 18, icon: "🌹" },
      { id: "manzikert",      name: "ملاذكرد",     x: 62, y: 16, icon: "🏹" },
    ],
    characterIds: ["fatih", "alp-arslan"],
    storyIds: [],
    campaignEra: "ottoman",
  },
  {
    id: "maghrib", name: "المغرب", era: "andalus", x: 18, y: 36,
    capital: "فاس", blurb: "جسر العبور إلى الأندلس، وموطن المرابطين والموحّدين وأسواق فاس.",
    cost: 50,
    theme: "صحراء، قوافل ذهب، مدن طينيّة",
    glyph: "🐪",
    polygon: "M4,30 L28,30 L32,38 L26,44 L8,44 L3,38 Z",
    labelX: 17, labelY: 37,
    landmarks: [
      { id: "fez",        name: "فاس",        x: 15, y: 34, icon: "🕌" },
      { id: "marrakech",  name: "مراكش",      x: 12, y: 40, icon: "🌴" },
      { id: "kairouan",   name: "القيروان",   x: 26, y: 33, icon: "🌙" },
    ],
    characterIds: ["tariq"],
    storyIds: [],
    campaignEra: "umayyad",
  },
  {
    id: "khorasan", name: "خراسان وفارس", era: "seljuk", x: 78, y: 24,
    capital: "نيسابور", blurb: "موطن السلاجقة والعلماء، ومنها انطلقت موجات الفتح والعلم نحو الشرق.",
    cost: 60,
    theme: "جبالٌ، مدارس، شعرٌ وحكمة",
    glyph: "🏹",
    polygon: "M71,20 L86,19 L88,30 L74,32 L70,26 Z",
    labelX: 79, labelY: 25,
    landmarks: [
      { id: "nishapur",  name: "نيسابور", x: 76, y: 24, icon: "📖" },
      { id: "isfahan",   name: "أصفهان",  x: 73, y: 28, icon: "🕌" },
      { id: "merv",      name: "مَرو",     x: 82, y: 22, icon: "🌌" },
    ],
    characterIds: ["alp-arslan"],
    storyIds: [],
    campaignEra: "seljuk",
  },
  {
    id: "transoxiana", name: "ما وراء النهر", era: "abbasid", x: 86, y: 14,
    capital: "سمرقند", blurb: "أرض البخاري وابن سينا، حيث التقت طرق الحرير بقباب سمرقند الفيروزية.",
    cost: 80,
    theme: "طريق الحرير، قباب فيروزيّة، علماء",
    glyph: "🌌",
    polygon: "M76,6 L96,5 L98,16 L82,18 L75,12 Z",
    labelX: 87, labelY: 11,
    landmarks: [
      { id: "samarkand", name: "سمرقند",  x: 87, y: 12, icon: "🕌" },
      { id: "bukhara",   name: "بخارى",   x: 83, y: 15, icon: "📚" },
      { id: "balkh",     name: "بَلْخ",    x: 92, y: 16, icon: "🏔️" },
    ],
    characterIds: [],
    storyIds: [],
    campaignEra: "abbasid",
  },
  {
    id: "hind", name: "الهند والسند", era: "umayyad", x: 92, y: 32,
    capital: "دلهي", blurb: "أقصى مشرق الفتوحات، حيث أُسّست سلطنات إسلامية كبرى تركت إرثًا معماريًّا فذًّا.",
    cost: 90,
    theme: "أنهار، فيلة، عمارة هندية إسلامية",
    glyph: "🐘",
    polygon: "M86,24 L100,22 L100,42 L92,46 L86,38 Z",
    labelX: 93, labelY: 32,
    landmarks: [
      { id: "delhi",   name: "دلهي",   x: 92, y: 28, icon: "🏯" },
      { id: "lahore",  name: "لاهور",  x: 90, y: 32, icon: "🌹" },
      { id: "multan",  name: "مُلتان",  x: 88, y: 36, icon: "📿" },
    ],
    characterIds: [],
    storyIds: [],
    campaignEra: "umayyad",
  },
];

// 5) Artifact Discovery
export interface Artifact {
  id: string;
  name: string;
  type: "manuscript" | "weapon" | "coin" | "landmark" | "relic";
  typeLabel: string;
  era: Era;
  icon: string;
  description: string;
}

export const ARTIFACTS: Artifact[] = [
  { id: "kaaba-kiswa", name: "كسوة الكعبة", type: "relic", typeLabel: "أثر", era: "seerah", icon: "🕋", description: "قطعةٌ من كسوة الكعبة المشرّفة." },
  { id: "yarmouk-sword", name: "سيف اليرموك", type: "weapon", typeLabel: "سلاح", era: "rashidun", icon: "⚔️", description: "سيفٌ من معركة اليرموك الفاصلة." },
  { id: "rashidun-dinar", name: "دينار راشدي", type: "coin", typeLabel: "عملة", era: "rashidun", icon: "🪙", description: "أول الدنانير في الإسلام." },
  { id: "umayyad-dinar", name: "دينار عبد الملك", type: "coin", typeLabel: "عملة", era: "umayyad", icon: "🪙", description: "أوّل دينارٍ إسلاميٍّ خالص." },
  { id: "baghdad-manuscript", name: "مخطوطة بيت الحكمة", type: "manuscript", typeLabel: "مخطوط", era: "abbasid", icon: "📜", description: "ترجمة عربية لعلوم اليونان." },
  { id: "khwarizmi-jabr", name: "كتاب الجبر", type: "manuscript", typeLabel: "مخطوط", era: "abbasid", icon: "📖", description: "كتاب الخوارزمي الذي أسّس علم الجبر." },
  { id: "cordoba-key", name: "مفتاح قرطبة", type: "relic", typeLabel: "أثر", era: "andalus", icon: "🗝️", description: "مفتاحٌ نحاسي من قصر الزهراء." },
  { id: "alhambra-tile", name: "بلاطة الحمراء", type: "landmark", typeLabel: "معلم", era: "andalus", icon: "🟦", description: "نقشٌ هندسي من قصر الحمراء." },
  { id: "seljuk-helmet", name: "خوذة سلجوقية", type: "weapon", typeLabel: "سلاح", era: "seljuk", icon: "🪖", description: "خوذة فارسٍ سلجوقي من ملاذكرد." },
  { id: "hattin-banner", name: "راية حِطّين", type: "relic", typeLabel: "أثر", era: "ayyubid", icon: "🚩", description: "رايةٌ رُفعت يوم تحرير القدس." },
  { id: "ain-jalut-arrow", name: "سهم عين جالوت", type: "weapon", typeLabel: "سلاح", era: "mamluk", icon: "🏹", description: "سهمٌ من كمين بيبرس." },
  { id: "mamluk-quran", name: "مصحف مملوكي", type: "manuscript", typeLabel: "مخطوط", era: "mamluk", icon: "📕", description: "مصحفٌ مذهّب من القاهرة." },
  { id: "fatih-cannon", name: "مدفع الفاتح", type: "weapon", typeLabel: "سلاح", era: "ottoman", icon: "💣", description: "نسخة مصغّرة من مدفع أورپان." },
  { id: "ottoman-tughra", name: "طُغراء عثمانية", type: "relic", typeLabel: "أثر", era: "ottoman", icon: "✒️", description: "توقيع السلطان الخطّي." },
  { id: "aqsa-stone", name: "حجرٌ من الأقصى", type: "landmark", typeLabel: "معلم", era: "ayyubid", icon: "🕌", description: "حجرٌ من ترميمات الأيوبيين." },
  { id: "nahda-pen", name: "قلم النهضة", type: "relic", typeLabel: "أثر", era: "modern", icon: "🖋️", description: "قلمٌ خطّ به روّاد النهضة." },
];

// 6) Character Collection — collectible cards
export interface CharacterCard {
  id: string;
  name: string;
  title: string;
  era: Era;
  rarity: "common" | "rare" | "legendary";
  avatar: string; // emoji placeholder
  bio: string;
  power: string; // mythic-style stat caption
}

export const CHARACTERS: CharacterCard[] = [
  { id: "khalid", name: "خالد بن الوليد", title: "سيف الله المسلول", era: "rashidun", rarity: "legendary", avatar: "🗡️", bio: "قائدٌ لم يُهزم في معركة، فاتح الشام والعراق.", power: "قيادة عسكرية ١٠٠" },
  { id: "omar", name: "عمر بن الخطاب", title: "الفاروق", era: "rashidun", rarity: "legendary", avatar: "⚖️", bio: "أمير المؤمنين، فاتح بيت المقدس ومؤسّس الديوان.", power: "عدل وحكمة ١٠٠" },
  { id: "muawiya", name: "معاوية بن أبي سفيان", title: "مؤسّس الأمويين", era: "umayyad", rarity: "rare", avatar: "👑", bio: "أنشأ أوّل أسطول إسلامي ونقل العاصمة إلى دمشق.", power: "سياسة ٩٢" },
  { id: "tariq", name: "طارق بن زياد", title: "فاتح الأندلس", era: "umayyad", rarity: "rare", avatar: "🌊", bio: "أحرق السفن وفتح أبواب الأندلس.", power: "إقدام ٩٥" },
  { id: "harun", name: "هارون الرشيد", title: "خليفة بغداد", era: "abbasid", rarity: "legendary", avatar: "🌙", bio: "في عهده بلغت بغداد ذروة مجدها.", power: "حضارة ٩٨" },
  { id: "khwarizmi", name: "الخوارزمي", title: "أبو الجبر", era: "abbasid", rarity: "rare", avatar: "🔢", bio: "مؤسّس علم الجبر ومنه اشتُقّ اسم الخوارزميات.", power: "علم ٩٧" },
  { id: "ibn-rushd", name: "ابن رشد", title: "شارح أرسطو", era: "andalus", rarity: "rare", avatar: "📚", bio: "فيلسوف قرطبة، عرفته أوروبا باسم Averroes.", power: "فلسفة ٩٥" },
  { id: "abdurrahman", name: "عبد الرحمن الداخل", title: "صقر قريش", era: "andalus", rarity: "legendary", avatar: "🦅", bio: "أسّس الدولة الأموية في الأندلس بعد رحلة هرب أسطورية.", power: "إصرار ٩٦" },
  { id: "alp-arslan", name: "ألب أرسلان", title: "بطل ملاذكرد", era: "seljuk", rarity: "rare", avatar: "🏹", bio: "أسر إمبراطور الروم وفتح باب الأناضول.", power: "بأس ٩٣" },
  { id: "salahuddin", name: "صلاح الدين الأيوبي", title: "محرّر القدس", era: "ayyubid", rarity: "legendary", avatar: "🕌", bio: "هزم الصليبيين في حِطّين وأعاد الأذان للأقصى.", power: "نُبل ١٠٠" },
  { id: "baybars", name: "الظاهر بيبرس", title: "أسد المماليك", era: "mamluk", rarity: "legendary", avatar: "🦁", bio: "كسر المغول والصليبيين معًا وأعاد الخلافة للقاهرة.", power: "قوة ٩٩" },
  { id: "fatih", name: "محمد الفاتح", title: "فاتح القسطنطينية", era: "ottoman", rarity: "legendary", avatar: "🏰", bio: "تحقّقت على يديه بشارة النبي ﷺ.", power: "عبقرية ١٠٠" },
];

// 7) Era Campaigns — missions per era
export type MissionType = "story" | "investigation" | "timeline" | "decision";
export interface Mission {
  id: string;
  type: MissionType;
  refId: string; // id within the corresponding collection
  title: string;
  reward: number;
  chapter?: string;
}
export interface Campaign {
  eraId: Era;
  title: string;
  intro: string;
  missions: Mission[];
  finalReward: { artifact?: string; character?: string; points: number };
  flagship?: boolean;
}

export const CAMPAIGNS: Campaign[] = [
  {
    eraId: "seerah", title: "حملة السيرة النبوية", intro: "عش قصة الرسالة من المولد إلى الفتح.",
    missions: [
      { id: "s-m1", type: "story", refId: "hijra", title: "اقرأ: ليلة الهجرة", reward: 10 },
      { id: "s-m2", type: "decision", refId: "dec-hijra", title: "قرار: ليلة الاغتيال", reward: 40 },
      { id: "s-m3", type: "timeline", refId: "tl-rise", title: "رتّب: ميلاد الأمة", reward: 60 },
    ],
    finalReward: { artifact: "kaaba-kiswa", points: 50 },
  },
  {
    eraId: "rashidun", title: "حملة الخلافة الراشدة", intro: "افتح الشام والعراق مع الصحابة.",
    missions: [
      { id: "r-m1", type: "story", refId: "yarmouk", title: "اقرأ: اليرموك", reward: 10 },
      { id: "r-m2", type: "investigation", refId: "inv-yarmouk", title: "حقّق: المعركة المجهولة", reward: 50 },
      { id: "r-m3", type: "investigation", refId: "inv-khalid", title: "حقّق: من هذا القائد؟", reward: 60 },
      { id: "r-m4", type: "decision", refId: "dec-yarmouk", title: "قرار: تنظيم الكراديس", reward: 50 },
    ],
    finalReward: { character: "khalid", points: 80 },
  },
  {
    eraId: "umayyad", title: "حملة الدولة الأموية", intro: "من دمشق إلى أطراف الأندلس.",
    missions: [
      { id: "u-m1", type: "timeline", refId: "tl-states", title: "رتّب: تعاقب الدول", reward: 70 },
    ],
    finalReward: { character: "tariq", points: 60 },
  },
  {
    eraId: "abbasid", title: "حملة بغداد", intro: "مدينة السلام وعصر بيت الحكمة.",
    missions: [
      { id: "a-m1", type: "story", refId: "baghdad-house-of-wisdom", title: "اقرأ: بيت الحكمة", reward: 10 },
      { id: "a-m2", type: "decision", refId: "dec-mansour", title: "قرار: أين تبني العاصمة؟", reward: 50 },
      { id: "a-m3", type: "investigation", refId: "inv-baghdad", title: "حقّق: المدينة المدوّرة", reward: 50 },
      { id: "a-m4", type: "investigation", refId: "inv-abbasid-era", title: "حقّق: ما هذه الحقبة؟", reward: 50 },
    ],
    finalReward: { character: "harun", artifact: "khwarizmi-jabr", points: 80 },
  },
  {
    eraId: "andalus", title: "حملة الأندلس", intro: "زهرة الغرب من الفتح إلى السقوط.",
    missions: [
      { id: "n-m1", type: "story", refId: "cordoba", title: "اقرأ: قرطبة جوهرة العالم", reward: 10 },
      { id: "n-m2", type: "investigation", refId: "inv-cordoba", title: "حقّق: المدينة المنوّرة بالغرب", reward: 50 },
      { id: "n-m3", type: "timeline", refId: "tl-andalus", title: "رتّب: صعود وسقوط الأندلس", reward: 60 },
    ],
    finalReward: { character: "abdurrahman", points: 70 },
  },
  {
    eraId: "seljuk", title: "حملة السلاجقة", intro: "حماة المشرق وفاتحو الأناضول.",
    missions: [
      { id: "k-m1", type: "timeline", refId: "tl-battles", title: "رتّب: معارك غيّرت التاريخ", reward: 70 },
    ],
    finalReward: { character: "alp-arslan", points: 60 },
  },
  {
    eraId: "ayyubid", title: "حملة صلاح الدين الكبرى",
    intro: "ثماني فصول من رحلة محرّر القدس: من نور الدين زنكي إلى تحرير بيت المقدس.",
    flagship: true,
    missions: [
      { id: "y-m1", type: "story", refId: "nuruddin", title: "اقرأ: نور الدين والوحدة", reward: 10, chapter: "الفصل الأول · شيخ المجاهدين" },
      { id: "y-m2", type: "story", refId: "salah-rise", title: "اقرأ: صعود صلاح الدين", reward: 10, chapter: "الفصل الثاني · من وزيرٍ إلى سلطان" },
      { id: "y-m3", type: "investigation", refId: "inv-salahuddin", title: "حقّق: من هذا السلطان؟", reward: 70, chapter: "الفصل الثالث · ملامح القائد" },
      { id: "y-m4", type: "decision", refId: "dec-hattin", title: "قرار: استدراج الصليبيين", reward: 60, chapter: "الفصل الرابع · ليلة الكمين" },
      { id: "y-m5", type: "story", refId: "hattin", title: "اقرأ: حِطّين", reward: 10, chapter: "الفصل الخامس · يوم النصر" },
      { id: "y-m6", type: "story", refId: "jerusalem-liberation", title: "اقرأ: تحرير القدس", reward: 10, chapter: "الفصل السادس · عودة الأذان" },
      { id: "y-m7", type: "timeline", refId: "tl-crusades", title: "رتّب: حروب الفرنجة", reward: 70, chapter: "الفصل السابع · مسيرة قرنين" },
      { id: "y-m8", type: "story", refId: "salah-legacy", title: "اقرأ: ما بعد صلاح الدين", reward: 10, chapter: "الفصل الثامن · ميراث الفاتح" },
    ],
    finalReward: { character: "salahuddin", artifact: "aqsa-stone", points: 200 },
  },
  {
    eraId: "mamluk", title: "حملة المماليك", intro: "كاسرو المغول وحماة الحرمين.",
    missions: [
      { id: "m-m1", type: "story", refId: "ain-jalut", title: "اقرأ: عين جالوت", reward: 10 },
      { id: "m-m2", type: "decision", refId: "dec-qutuz", title: "قرار: ردّ على المغول", reward: 60 },
      { id: "m-m3", type: "investigation", refId: "inv-ain-jalut", title: "حقّق: المعركة الفاصلة", reward: 60 },
    ],
    finalReward: { character: "baybars", points: 80 },
  },
  {
    eraId: "ottoman", title: "حملة العثمانيين", intro: "ستة قرون من الخلافة.",
    missions: [
      { id: "o-m1", type: "story", refId: "constantinople", title: "اقرأ: فتح القسطنطينية", reward: 10 },
      { id: "o-m2", type: "decision", refId: "dec-fatih", title: "قرار: نقل السفن", reward: 60 },
      { id: "o-m3", type: "investigation", refId: "inv-fatih", title: "حقّق: من هذا السلطان؟", reward: 70 },
      { id: "o-m4", type: "timeline", refId: "tl-ottoman", title: "رتّب: ذروة العثمانيين", reward: 70 },
    ],
    finalReward: { character: "fatih", artifact: "ottoman-tughra", points: 100 },
  },
  {
    eraId: "modern", title: "حملة النهضة", intro: "يقظة الأمة في العصر الحديث.",
    missions: [
      { id: "z-m1", type: "story", refId: "nahda", title: "اقرأ: فجر النهضة", reward: 10 },
    ],
    finalReward: { artifact: "nahda-pen", points: 40 },
  },
];
// ============================================================
// FLAGSHIP STORIES — extra chapters for the Salah ad-Din campaign
// ============================================================
STORIES.push(
  {
    id: "nuruddin", title: "نور الدين زنكي: شيخ المجاهدين", era: "ayyubid", readMinutes: 5,
    excerpt: "الأمير الذي وحّد الشام وزرع بذرة تحرير القدس قبل أن يقطفها صلاح الدين.",
    body: [
      "في زمنٍ تفرّقت فيه إمارات الشام بين الحكّام، نهض الأمير محمود بن زنكي، الملقّب بنور الدين، ليجمع الكلمة من حلب إلى دمشق.",
      "كان عابدًا زاهدًا، يلبس الخشن ويأكل من كسب يده، حتى قال عنه ابن الأثير: «لم أرَ في سير المتقدّمين بعد الخلفاء الراشدين أحسن من سيرته».",
      "أعدّ نور الدين منبر القدس على يد نجّاري حلب، وأقسم أن يضعه في المسجد الأقصى يوم التحرير.",
      "أرسل قائده أسد الدين شيركوه إلى مصر لردّ الفاطميين والصليبيين، وكان مع شيركوه ابن أخيه: فتى كرديّ اسمه يوسف… هو صلاح الدين.",
      "توفي نور الدين قبل أن يرى القدس محرّرة، لكن منبره ظلّ ينتظر… حتى جاء تلميذه.",
    ],
  },
  {
    id: "salah-rise", title: "صعود صلاح الدين: من وزيرٍ إلى سلطان", era: "ayyubid", readMinutes: 5,
    excerpt: "كيف تحوّل فتى كرديّ من خادمٍ في بلاط الفاطميين إلى سلطان مصر والشام.",
    body: [
      "دخل صلاح الدين مصر مع عمّه شيركوه ضمن جيش نور الدين، فعُيّن وزيرًا للخليفة الفاطمي العاضد سنة ٥٦٤هـ.",
      "كان شابًّا في الثلاثين، لا يطمع في مُلك، لكنّه أمسك بزمام الأمور بحكمة، ووحّد الجيش، وأعاد الخطبة للخليفة العباسي.",
      "أنهى الدولة الفاطمية بلا قطرة دم، وأسّس الدولة الأيوبية، وبدأ يهيّئ مصر لتكون قاعدة لتحرير القدس.",
      "بنى قلعة الجبل في القاهرة، وأصلح أسوارها، ووحّد جيوش مصر والشام بعد وفاة نور الدين تحت رايةٍ واحدة.",
      "وحين اكتملت الأدوات، التفت بصره إلى الغرب: نحو الصليبيين الذين احتلّوا القدس منذ ٨٨ سنة.",
    ],
  },
  {
    id: "jerusalem-liberation", title: "عودة الأذان إلى الأقصى", era: "ayyubid", readMinutes: 6,
    excerpt: "في يوم الجمعة ٢٧ رجب ٥٨٣هـ، عاد الأذان إلى القدس بعد ٨٨ عامًا من الصمت.",
    body: [
      "بعد حِطّين، انهارت الممالك الصليبية واحدة تلو الأخرى: عكا، نابلس، يافا، بيروت… وأخيرًا اتّجه صلاح الدين إلى القدس.",
      "حاصرها أيامًا، فطلب أهلها الأمان، فأعطاهم ما لم يعطِه الصليبيون لأهل القدس حين دخلوها قبل قرن: لا قتل، لا سبي، فديةٌ يسيرة، ومن لم يستطع تركه السلطان حرًّا.",
      "دخل صلاح الدين القدس في رجب ٥٨٣هـ، فأعاد الصليب المعلّق على قبة الصخرة إلى موضعه الأول، وغسل المسجد بماء الورد.",
      "نُصب منبر نور الدين الذي حُمل من حلب، وارتقى الخطيب محيي الدين بن الزكي ليلقي خطبة الجمعة الأولى بعد ٨٨ عامًا.",
      "بكى الناس بكاءً لم تشهد له المدينة مثيلًا، ورُفع الأذان من المآذن، فاهتزّ التاريخ.",
    ],
  },
  {
    id: "salah-legacy", title: "ميراث صلاح الدين", era: "ayyubid", readMinutes: 4,
    excerpt: "ماذا ترك صلاح الدين بعده غير سيفه ومنبره؟ أخلاقٌ صارت أسطورة عند الصديق والعدوّ.",
    body: [
      "عاش صلاح الدين بعد تحرير القدس ست سنواتٍ فقط، صرفها في صدّ الحملة الصليبية الثالثة بقيادة ريتشارد قلب الأسد.",
      "حين توفّي عام ٥٨٩هـ، لم يُخلّف ذهبًا ولا فضة. لم يُجد أهله ثمن كفنه.",
      "أوصى ولده الظاهر بالعدل، وكتب إليه: «إيّاك والدماء، فإنها لا تنام».",
      "تركَ دولة أيوبية امتدّت من اليمن إلى الموصل، ودولة أخلاقٍ بقيت في كتب أعدائه قبل أصدقائه: قال عنه دانتي في «الكوميديا الإلهية» إنه في برزخ النبلاء.",
      "وبقي اسمه — كلما ضاعت القدس — رمزًا للأمل بأن المحرّر سيأتي.",
    ],
  },
);

// Extra flagship timeline
TIMELINES.push({
  id: "tl-crusades", title: "حروب الفرنجة من البداية إلى التحرير", reward: 80,
  events: [
    { id: "e1", label: "إعلان البابا أوربان الحرب", year: 1095 },
    { id: "e2", label: "سقوط القدس بيد الصليبيين", year: 1099 },
    { id: "e3", label: "وحدة الشام تحت نور الدين", year: 1154 },
    { id: "e4", label: "تأسيس الدولة الأيوبية", year: 1171 },
    { id: "e5", label: "معركة حِطّين", year: 1187 },
    { id: "e6", label: "تحرير القدس", year: 1187 },
  ],
});

// ============================================================
// LEVELS · RANKS · TITLES
// ============================================================
export interface LevelInfo { level: number; min: number; title: string; rank: string }
export const LEVELS: LevelInfo[] = [
  { level: 1, min: 0,    title: "رحّالة مبتدئ",  rank: "برونزي" },
  { level: 2, min: 120,  title: "مستكشف",        rank: "برونزي" },
  { level: 3, min: 280,  title: "راوي إرث",    rank: "فضّي"   },
  { level: 4, min: 500,  title: "مؤرّخ",          rank: "فضّي"   },
  { level: 5, min: 800,  title: "عالم تاريخ",     rank: "ذهبي"   },
  { level: 6, min: 1200, title: "شيخ المؤرّخين", rank: "ذهبي"   },
  { level: 7, min: 1700, title: "حكيم الأمّة",   rank: "بلاتيني" },
  { level: 8, min: 2400, title: "إمام التاريخ",   rank: "بلاتيني" },
  { level: 9, min: 3200, title: "سيّد إرث",   rank: "أسطوري" },
  { level: 10, min: 4500, title: "أسطورة التاريخ", rank: "أسطوري" },
];

export function levelFor(points: number) {
  let current = LEVELS[0];
  let next: LevelInfo | null = LEVELS[1] ?? null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    }
  }
  const progress = next ? Math.min(1, (points - current.min) / (next.min - current.min)) : 1;
  return { ...current, next, progress, toNext: next ? Math.max(0, next.min - points) : 0 };
}

// ============================================================
// ACHIEVEMENTS — long-term goals (rendered with derived state)
// ============================================================
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  goal: number;
  secret?: boolean;
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "ach_read_5",     name: "قارئ التاريخ",        desc: "أنهِ قراءة ٥ قصص.",            icon: "📖", goal: 5 },
  { id: "ach_read_15",    name: "راوي الأمّة",         desc: "أنهِ قراءة ١٥ قصة.",           icon: "📚", goal: 15 },
  { id: "ach_inv_5",      name: "محقّق ماهر",          desc: "حلّ ٥ قضايا تحقيق.",           icon: "🔍", goal: 5 },
  { id: "ach_decisions_5",name: "صانع القرار",         desc: "اتّخذ ٥ قراراتٍ تاريخية.",      icon: "🧭", goal: 5 },
  { id: "ach_timeline_5", name: "حافظ التواريخ",        desc: "رتّب ٥ خطوطٍ زمنية.",          icon: "🗓️", goal: 5 },
  { id: "ach_artifact_10",name: "جامع الآثار",          desc: "اكتشف ١٠ آثار.",               icon: "🏺", goal: 10 },
  { id: "ach_artifact_all",name: "أمين المتحف",         desc: "اجمع كل الآثار.",              icon: "🗿", goal: 16 },
  { id: "ach_char_6",     name: "كاتب السير",           desc: "افتح ٦ شخصيات.",              icon: "🎴", goal: 6 },
  { id: "ach_region_5",   name: "فاتح الأقاليم",        desc: "افتح ٥ مناطق على الخارطة.",    icon: "🗺️", goal: 5 },
  { id: "ach_streak_7",   name: "أسبوعٌ من النور",       desc: "حافظ على ٧ أيام متتالية.",     icon: "🔥", goal: 7 },
  { id: "ach_streak_30",  name: "شهرٌ من الإصرار",       desc: "حافظ على ٣٠ يومًا متتالية.",   icon: "🌙", goal: 30 },
  { id: "ach_campaign_3", name: "قائد الحملات",          desc: "أتمم ٣ حملات تاريخية.",        icon: "⚔️", goal: 3 },
  { id: "ach_flagship",   name: "محرّر القدس",           desc: "أتمم حملة صلاح الدين الكبرى.", icon: "🕌", goal: 1 },
  { id: "ach_level_5",    name: "عالم التاريخ",         desc: "ابلغ المستوى الخامس.",         icon: "⭐", goal: 5 },
  { id: "ach_explore_50", name: "نصف العالم",           desc: "أكمل ٥٠٪ من خارطة العالم.",    icon: "🧭", goal: 50 },
  { id: "ach_secret_dawn",name: "ساعة الفجر",            desc: "سرٌّ من أسرار التاريخ…",        icon: "🌅", goal: 1, secret: true },
];

export interface AchievementProgress { id: string; current: number; earned: boolean }
export function evaluateAchievements(p: {
  storiesRead: string[]; investigationsCompleted: string[]; decisionsCompleted: string[];
  timelinesCompleted: string[]; artifactsFound: string[]; charactersUnlocked: string[];
  regionsUnlocked: string[]; streak: number; campaignsCompleted: string[]; points: number;
}): AchievementProgress[] {
  const lvl = levelFor(p.points).level;
  const explorePct = Math.round((p.regionsUnlocked.length / MAP_REGIONS.length) * 100);
  const flagshipDone = p.campaignsCompleted.includes("ayyubid") ? 1 : 0;
  const map: Record<string, number> = {
    ach_read_5: p.storiesRead.length,
    ach_read_15: p.storiesRead.length,
    ach_inv_5: p.investigationsCompleted.length,
    ach_decisions_5: p.decisionsCompleted.length,
    ach_timeline_5: p.timelinesCompleted.length,
    ach_artifact_10: p.artifactsFound.length,
    ach_artifact_all: p.artifactsFound.length,
    ach_char_6: p.charactersUnlocked.length,
    ach_region_5: p.regionsUnlocked.length,
    ach_streak_7: p.streak,
    ach_streak_30: p.streak,
    ach_campaign_3: p.campaignsCompleted.length,
    ach_flagship: flagshipDone,
    ach_level_5: lvl,
    ach_explore_50: explorePct,
    ach_secret_dawn: 0,
  };
  return ACHIEVEMENTS.map((a) => {
    const cur = map[a.id] ?? 0;
    return { id: a.id, current: Math.min(cur, a.goal), earned: cur >= a.goal };
  });
}

// ============================================================
// DAILY MISSIONS — rotate deterministically by date
// ============================================================
export interface DailyMission {
  id: string;
  title: string;
  desc: string;
  reward: number;
  icon: "story" | "puzzle" | "investigate" | "timeline" | "decision" | "map" | "collect";
  link: { to: string };
}
const DAILY_POOL: DailyMission[] = [
  { id: "d_story",    title: "قصة اليوم",        desc: "اقرأ قصة اليوم حتى نهايتها.",  reward: 25, icon: "story",      link: { to: "/" } },
  { id: "d_invest",   title: "قضية تحقيق",       desc: "حلّ قضيةً تاريخية واحدة.",       reward: 35, icon: "investigate",link: { to: "/play/investigate" } },
  { id: "d_decide",   title: "قرار تاريخي",      desc: "اتّخذ قرارًا في مشهدٍ تاريخي.",  reward: 30, icon: "decision",   link: { to: "/play/decisions" } },
  { id: "d_timeline", title: "ترتيب الأحداث",    desc: "رتّب خطًّا زمنيًّا واحدًا.",       reward: 30, icon: "timeline",   link: { to: "/play/timeline" } },
  { id: "d_explore",  title: "استكشاف الخارطة",  desc: "افتح منطقة جديدة على الخارطة.", reward: 40, icon: "map",        link: { to: "/map" } },
  { id: "d_collect",  title: "زيارة المجموعة",   desc: "اطّلع على مجموعتك من الآثار.",   reward: 15, icon: "collect",    link: { to: "/collection" } },
];

export function todayKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dailyMissionsForDate(d: Date = new Date()): DailyMission[] {
  const dayIndex = Math.floor(d.getTime() / 86400000);
  const start = dayIndex % DAILY_POOL.length;
  return [0, 1, 2].map((i) => DAILY_POOL[(start + i) % DAILY_POOL.length]);
}

// ============================================================
// SEASONAL CHALLENGE — long-term goal across ~30 days
// ============================================================
export interface Season {
  id: string;
  name: string;
  tagline: string;
  goalPoints: number;
  endsAt: string; // ISO date label
  reward: { points: number; artifact?: string; title?: string };
  /** 1..12 — Gregorian month this season runs. */
  month?: number;
  /** Short theme tag used in UI. */
  theme?: string;
  /** Optional badge id awarded on completion. */
  badge?: string;
}

/**
 * 12 monthly season definitions. The active season is picked automatically
 * from the current Gregorian month — past seasons appear archived and future
 * seasons appear locked in the seasons archive.
 */
export const SEASONS: Season[] = [
  { id: "season_seerah",     month: 1,  name: "موسم السيرة النبوية", tagline: "عش شهرًا في نور النبوّة وأخلاق صاحب الرسالة ﷺ.", theme: "نور النبوّة",      goalPoints: 600, endsAt: "نهاية يناير",   reward: { points: 200, title: "صاحب الرسالة" },     badge: "season_seerah" },
  { id: "season_rashidun",   month: 2,  name: "موسم الراشدين",        tagline: "ارفع رايتك مع الخلفاء الأربعة من خلال مهمّات هذا الشهر.", theme: "عدلٌ وفتوح",      goalPoints: 650, endsAt: "نهاية فبراير",  reward: { points: 220, title: "ابن الفاروق" },       badge: "season_rashidun" },
  { id: "season_andalus",    month: 3,  name: "موسم الأندلس",         tagline: "من جبل طارق إلى قرطبة، اجمع نقاطك في موسم الأندلس.", theme: "زهرة الغرب",      goalPoints: 700, endsAt: "نهاية مارس",    reward: { points: 240, title: "فارس قرطبة" },        badge: "season_andalus" },
  { id: "season_baghdad",    month: 4,  name: "موسم بغداد",           tagline: "ادخل بيت الحكمة وكن من علماء العصر الذهبي.", theme: "بيت الحكمة",      goalPoints: 720, endsAt: "نهاية أبريل",   reward: { points: 240, artifact: "khwarizmi-jabr", title: "عالم العصر الذهبي" }, badge: "season_baghdad" },
  { id: "season_constantinople", month: 5, name: "موسم الفتح",         tagline: "قف على أسوار القسطنطينية مع محمد الفاتح.", theme: "أسوار القسطنطينية", goalPoints: 750, endsAt: "نهاية مايو",  reward: { points: 260, title: "من جند الفاتح" },      badge: "season_constantinople" },
  { id: "season_seerah_late",month: 6,  name: "موسم المدينة",         tagline: "اقتفِ أثر الأنصار في دار الهجرة.", theme: "دارُ الهجرة",     goalPoints: 700, endsAt: "نهاية يونيو",   reward: { points: 240, title: "أنصاريٌّ صادق" },     badge: "season_madina" },
  { id: "season_jerusalem",  month: 7,  name: "موسم القدس",           tagline: "اجمع ٧٥٠ نقطة هذا الموسم لتنال لقب «من حُماة الأقصى».", theme: "عودة الأذان",     goalPoints: 750, endsAt: "نهاية يوليو",  reward: { points: 250, artifact: "aqsa-stone", title: "من حُماة الأقصى" }, badge: "season_jerusalem" },
  { id: "season_yarmouk",    month: 8,  name: "موسم اليرموك",         tagline: "كن من فرسان خالد في كسرة الروم.", theme: "كاسرو الروم",     goalPoints: 700, endsAt: "نهاية أغسطس",   reward: { points: 240, title: "من فرسان خالد" },     badge: "season_yarmouk" },
  { id: "season_ain_jalut",  month: 9,  name: "موسم عين جالوت",       tagline: "احفظ مصر والشام مع قطز وبيبرس.", theme: "كاسرو المغول",   goalPoints: 750, endsAt: "نهاية سبتمبر",  reward: { points: 260, title: "من جند قطز" },         badge: "season_ain_jalut" },
  { id: "season_andalus_fall",month:10, name: "موسم الأندلس الأخيرة", tagline: "احفظ ذاكرة غرناطة قبل سقوط الراية.", theme: "ذاكرة لا تموت",   goalPoints: 700, endsAt: "نهاية أكتوبر",  reward: { points: 240, title: "حافظ الأندلس" },       badge: "season_andalus_fall" },
  { id: "season_seljuk",     month: 11, name: "موسم السلاجقة",        tagline: "ادخل الأناضول من بوابة ملاذكرد.", theme: "بوابة الأناضول",  goalPoints: 720, endsAt: "نهاية نوفمبر",  reward: { points: 250, title: "من فرسان ألب أرسلان" }, badge: "season_seljuk" },
  { id: "season_baghdad_fall",month: 12,name: "موسم بغداد الحزينة",   tagline: "احمل قبسًا من ضوء بيت الحكمة قبل دجلة.", theme: "ذكرى السقوط",     goalPoints: 700, endsAt: "نهاية ديسمبر",  reward: { points: 240, title: "حافظ بيت الحكمة" },   badge: "season_baghdad_fall" },
];

export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth() + 1;
  return SEASONS.find((s) => s.month === m) ?? SEASONS[0];
}

export function seasonStatus(s: Season, d: Date = new Date()): "active" | "archived" | "locked" {
  const m = d.getMonth() + 1;
  if (!s.month || s.month === m) return "active";
  return s.month < m ? "archived" : "locked";
}

/** Back-compat: the active season for the current month. */
export const CURRENT_SEASON: Season = currentSeason();

// ============================================================
// COMING-SOON TEASERS — make the world feel infinite
// ============================================================
export interface UpcomingCampaign { id: string; era: Era | "future"; name: string; teaser: string; eta: string }
export const UPCOMING_CAMPAIGNS: UpcomingCampaign[] = [
  { id: "u-cordoba",   era: "andalus",  name: "حملة قرطبة الذهبية", teaser: "عش عصر الخلافة في الأندلس وأسرار قصر الزهراء.", eta: "قريبًا" },
  { id: "u-baybars",   era: "mamluk",   name: "حملة الظاهر بيبرس",  teaser: "من مملوكٍ في القاهرة إلى سلطانٍ كسر المغول والصليبيين.", eta: "قريبًا" },
  { id: "u-fatih",     era: "ottoman",  name: "حملة الفاتح الكبرى", teaser: "خمسة فصول من فجر الدولة العثمانية إلى أسوار القسطنطينية.", eta: "قريبًا" },
  { id: "u-nahda",     era: "modern",   name: "حملة النهضة العربية", teaser: "روّاد اليقظة من الطهطاوي إلى محمد عبده.", eta: "قريبًا" },
  { id: "u-science",   era: "abbasid",  name: "حملة بيت الحكمة",     teaser: "العلوم التي صنعت حضارةً ونقلتها أوروبا قرونًا.", eta: "قريبًا" },
  { id: "u-mystery",   era: "future",   name: "؟؟؟",                  teaser: "حملة سرّية تُكشف عند بلوغك المستوى العاشر.", eta: "مخفية" },
];

export interface UpcomingRegion { id: string; name: string; teaser: string; era: Era }
export const UPCOMING_REGIONS: UpcomingRegion[] = [
  { id: "u-yemen",   name: "اليمن",        teaser: "موطن الأنصار الأوائل.", era: "seerah" },
  { id: "u-sind",    name: "السند",        teaser: "أقصى مشرق الفتوحات الأموية.", era: "umayyad" },
  { id: "u-sicily",  name: "صقلية",        teaser: "الجزيرة التي حكمها المسلمون قرنين.", era: "andalus" },
  { id: "u-bukhara", name: "بخارى",        teaser: "مدينة البخاري ومركز خراسان العلمي.", era: "abbasid" },
  { id: "u-mali",    name: "إمبراطورية مالي", teaser: "مملكة منسى موسى وأغنى رجلٍ في التاريخ.", era: "mamluk" },
];

export interface MysteryCharacter { id: string; era: Era; hint: string }
export const MYSTERY_CHARACTERS: MysteryCharacter[] = [
  { id: "myst1", era: "andalus",  hint: "فيلسوفٌ كتب قصة «حيّ بن يقظان» قبل ديكارت بقرون." },
  { id: "myst2", era: "abbasid",  hint: "طبيبٌ ألّف «الحاوي» وكان أوّل من ميّز بين الجدري والحصبة." },
  { id: "myst3", era: "ottoman",  hint: "معماريّ بنى ٣٠٠ مسجد، أعظمها السليمانية." },
  { id: "myst4", era: "ayyubid",  hint: "فقيهٌ كرديّ كان قاضي قضاة صلاح الدين." },
];

// ============================================================
// SETTINGS — placeholders for future ambient audio (no autoplay)
// ============================================================
export interface AmbienceTrack { id: string; name: string; mood: string; era?: Era }
export const AMBIENCE_TRACKS: AmbienceTrack[] = [
  { id: "amb_desert",   name: "صحراء الحجاز",   mood: "هدوء وعمق",       era: "seerah" },
  { id: "amb_baghdad",  name: "ليل بغداد",      mood: "نهضة وحضارة",     era: "abbasid" },
  { id: "amb_andalus",  name: "نسيم الأندلس",   mood: "شجن وجمال",       era: "andalus" },
  { id: "amb_jerusalem",name: "أسوار القدس",    mood: "جلال وعزّ",       era: "ayyubid" },
  { id: "amb_istanbul", name: "ميناء إسطنبول",  mood: "مهابة وفتوح",     era: "ottoman" },
];

// ============================================================
// HELPERS
// ============================================================
export function explorationPercent(regionsUnlocked: string[]) {
  return Math.round((regionsUnlocked.length / MAP_REGIONS.length) * 100);
}

export function campaignProgress(eraId: Era, missionsCompleted: string[]) {
  const c = CAMPAIGNS.find((x) => x.eraId === eraId);
  if (!c) return { done: 0, total: 0, pct: 0 };
  const done = c.missions.filter((m) => missionsCompleted.includes(m.id)).length;
  return { done, total: c.missions.length, pct: Math.round((done / c.missions.length) * 100) };
}

export function overallCampaignPercent(missionsCompleted: string[]) {
  const totalMissions = CAMPAIGNS.reduce((s, c) => s + c.missions.length, 0);
  const done = CAMPAIGNS.reduce((s, c) => s + c.missions.filter((m) => missionsCompleted.includes(m.id)).length, 0);
  return Math.round((done / totalMissions) * 100);
}

/**
 * Returns the campaign the Adventure hero should feature right now.
 *  - Prefer the flagship campaign if it isn't fully complete.
 *  - Otherwise pick the first campaign with remaining missions, in ERAS order.
 *  - Returns `null` if every campaign is finished — caller should show a
 *    "قريبًا" upcoming card instead of repeating a finished campaign.
 */
export function nextActiveCampaign(missionsCompleted: string[]): Campaign | null {
  const isDone = (c: Campaign) =>
    c.missions.length > 0 && c.missions.every((m) => missionsCompleted.includes(m.id));
  const flagship = CAMPAIGNS.find((c) => c.flagship);
  if (flagship && !isDone(flagship)) return flagship;
  const order = ERAS.map((e) => e.id);
  const sorted = [...CAMPAIGNS].sort(
    (a, b) => order.indexOf(a.eraId) - order.indexOf(b.eraId),
  );
  return sorted.find((c) => !isDone(c)) ?? null;
}

// ============================================================
// FLAGSHIP CINEMATIC LORE — chapter intros + atmosphere for the
// Salah ad-Din campaign. Keyed by mission id so the experience
// can grow per chapter without touching mission objects.
// ============================================================
export interface ChapterLore {
  era: string;       // e.g. "صفر ٥٤١ هـ"
  setting: string;   // e.g. "حلب · بلاد الشام"
  hook: string;      // 1-line cinematic line
  quote?: string;    // optional historical quote
  quoteBy?: string;
  reward?: string;   // narrative description of what this chapter grants
}

export const CHAPTER_LORE: Record<string, ChapterLore> = {
  "y-m1": {
    era: "منتصف القرن ٦ هـ",
    setting: "حلب · بلاد الشام",
    hook: "قبل أن يولد المحرّر، كان لا بُدّ من أن يولد المعلّم.",
    quote: "لا أستحي من اللهِ أن يراني أضحك والمسلمون محاصرون.",
    quoteBy: "نور الدين زنكي",
    reward: "تفتح صفحة «شيخ المجاهدين» في الأرشيف.",
  },
  "y-m2": {
    era: "٥٦٤ هـ",
    setting: "القاهرة · قصر الفاطميين",
    hook: "فتىً كرديّ يدخل بلاطًا لا يعرفه… ويخرج منه سلطانًا.",
    quote: "إنما هي ساعةٌ ثم نموت.",
    quoteBy: "صلاح الدين الأيوبي",
    reward: "تفتح فصل تأسيس الدولة الأيوبية.",
  },
  "y-m3": {
    era: "ملامح القائد",
    setting: "أرشيف السلاطين",
    hook: "ثلاثة أدلّة فقط… أتعرف القائد قبل أن تذكره الكتب؟",
    reward: "تكشف عن بطاقة السلطان وتفتح راية حِطّين.",
  },
  "y-m4": {
    era: "ربيع الثاني ٥٨٣ هـ",
    setting: "سفوح الجليل · ليلًا",
    hook: "الجيوش متقابلة. الماء بعيد. والقرار قرارك.",
    quote: "إن الحرب خدعة.",
    quoteBy: "حديث نبوي",
    reward: "يفتح طريق الكمين نحو حِطّين.",
  },
  "y-m5": {
    era: "٢٥ ربيع الآخر ٥٨٣ هـ",
    setting: "قرون حطّين · شمال طبريّة",
    hook: "ستّ ساعات في حرّ تموز كسرت قرنًا من الاحتلال.",
    quote: "ما النصرُ إلا من عند الله.",
    quoteBy: "صلاح الدين بعد حِطّين",
    reward: "تفتح صفحة النصر في الأرشيف.",
  },
  "y-m6": {
    era: "٢٧ رجب ٥٨٣ هـ",
    setting: "القدس · باب الرحمة",
    hook: "ثمانية وثمانون عامًا من الصمت… انكسرت بأذانٍ واحد.",
    quote: "اللّهم تقبّل، فإنّ المسلمين قد أعادوا بيتك.",
    quoteBy: "محيي الدين بن الزكي · أول خطبة",
    reward: "يفتح «حجرٌ من الأقصى» في خزانة الآثار.",
  },
  "y-m7": {
    era: "قرنان من المواجهة",
    setting: "خارطة المشرق",
    hook: "رتّب فصول الحرب الطويلة كما جرت تحت سماء الشام.",
    reward: "يفتح مخطوطة «الحروب الصليبية».",
  },
  "y-m8": {
    era: "٥٨٩ هـ – ما بعد",
    setting: "دمشق · القلعة",
    hook: "لم يُخلّف ذهبًا، لكنّه ترك أمّةً تعرف كيف تُحرّر.",
    quote: "إيّاك والدماء، فإنّها لا تنام.",
    quoteBy: "وصيّة صلاح الدين لولده",
    reward: "تختم الحملة وتنال المكافأة الكبرى.",
  },
};

// Flagship campaign hero artwork map
export const CAMPAIGN_HERO: Record<string, { src: string; alt: string }> = {};

// ============================================================
// FLAGSHIP CAMPAIGN — multi-stage chapter player data
// Each chapter ties to an existing mission id (y-m1..y-m8) so
// completing the chapter marks that mission as done.
// ============================================================

// New collectibles introduced by the flagship chapter player
ARTIFACTS.push(
  { id: "nuruddin-minbar", name: "منبر نور الدين", type: "relic",      typeLabel: "أثر",   era: "ayyubid", icon: "🕋", description: "منبرٌ صنعه نجّارو حلب لينُصب في الأقصى يوم التحرير." },
  { id: "hattin-map",      name: "خارطة حِطّين",   type: "manuscript", typeLabel: "خارطة", era: "ayyubid", icon: "🗺️", description: "خارطةٌ تُظهر طريق الكمين وموقع المعركة." },
  { id: "salah-letter",    name: "وصية صلاح الدين", type: "manuscript", typeLabel: "وثيقة", era: "ayyubid", icon: "📜", description: "وصيّته لولده الظاهر: «إيّاك والدماء…»." },
  { id: "doc-crusades",    name: "مخطوطة الحروب الصليبية", type: "manuscript", typeLabel: "مخطوط", era: "ayyubid", icon: "📚", description: "موجزٌ من قرنين من الحروب بين الفرنجة والمسلمين." },
  { id: "doc-jerusalem-khutba", name: "خطبة الجمعة الأولى", type: "manuscript", typeLabel: "وثيقة", era: "ayyubid", icon: "📖", description: "مقتطف من خطبة محيي الدين بن الزكي عند تحرير القدس." },
);

CHARACTERS.push(
  { id: "nuruddin", name: "نور الدين زنكي", title: "شيخ المجاهدين", era: "ayyubid", rarity: "rare", avatar: "🌙", bio: "وحّد الشام وزرع بذرة تحرير القدس قبل صلاح الدين.", power: "تقوى ٩٦" },
);

export type FlagshipStage =
  | { kind: "scene"; title: string; body: string[] }
  | { kind: "investigation"; title: string; question: string; clues: string[]; options: string[]; answerIndex: number; explanation: string }
  | { kind: "decision"; title: string; setting: string; scene: string; choices: { label: string; outcome: string; correct: boolean }[]; note: string }
  | { kind: "timeline"; title: string; instruction: string; events: { id: string; label: string; year: number }[] }
  | { kind: "discovery"; subtype: "artifact" | "character" | "document"; refId?: string; title: string; subtitle: string; icon: string; body?: string };

export interface FlagshipChapter {
  id: string;
  index: number;
  missionId: string;
  title: string;
  era: string;
  setting: string;
  hook: string;
  quote?: string;
  quoteBy?: string;
  stages: FlagshipStage[];
  finaleTitle: string;
  finaleLine: string;
  rewards: { points: number; artifactIds?: string[]; characterIds?: string[] };
}

export const FLAGSHIP_CHAPTERS: FlagshipChapter[] = [
  {
    id: "ch1", index: 1, missionId: "y-m1",
    title: "شيخ المجاهدين",
    era: "منتصف القرن السادس الهجري",
    setting: "حلب · بلاد الشام",
    hook: "قبل أن يولد المحرّر، كان لا بُدّ من أن يولد المعلّم.",
    quote: "لا أستحي من اللهِ أن يراني أضحك والمسلمون محاصرون.",
    quoteBy: "نور الدين زنكي",
    stages: [
      { kind: "scene", title: "مشهد · بلاد ممزّقة",
        body: [
          "تفرّقت إمارات الشام بين الحكّام، والقدس بيد الفرنجة منذ ٥٠ عامًا.",
          "نهض في حلب أميرٌ زاهد اسمه محمود بن زنكي، يُلقّب بنور الدين. جمع الكلمة من حلب إلى دمشق، وبنى المدارس والمستشفيات، ووحّد الجبهة.",
        ],
      },
      { kind: "decision", title: "قرار · كيف ندخل دمشق؟",
        setting: "حلب · ٥٤٩ هـ",
        scene: "دمشق منقسمة وأمراؤها ضعفاء. كيف تضمّها إلى وحدة الشام؟",
        choices: [
          { label: "بالسيف وفرض الأمر", outcome: "كنت ستُفرّق المسلمين قبل وحدتهم.", correct: false },
          { label: "بالعدل والخطبة وكسب القلوب", outcome: "هكذا فعل نور الدين، فدخلها أهلها يهتفون باسمه.", correct: true },
          { label: "أتركها وأتجه للقدس مباشرة", outcome: "كانت ستُضرب من خلف.", correct: false },
        ],
        note: "دخل نور الدين دمشق سنة ٥٤٩ هـ صلحًا، فاكتملت وحدة الشام تحت رايةٍ واحدة.",
      },
      { kind: "discovery", subtype: "artifact", refId: "nuruddin-minbar",
        title: "اكتشاف · منبر الأقصى",
        subtitle: "أمر نور الدين نجّاري حلب أن يصنعوا منبرًا، وأقسم أن يضعه في الأقصى يوم التحرير.",
        icon: "🕋",
        body: "بقي المنبر في حلب ٢٢ عامًا، حتى حمله صلاح الدين إلى القدس بعد التحرير.",
      },
    ],
    finaleTitle: "اكتمل الفصل الأول",
    finaleLine: "زُرعت البذرة. ينتظر المنبر يدًا تحمله إلى الأقصى…",
    rewards: { points: 40, artifactIds: ["nuruddin-minbar"], characterIds: ["nuruddin"] },
  },
  {
    id: "ch2", index: 2, missionId: "y-m2",
    title: "صعود صلاح الدين",
    era: "٥٦٤ هـ",
    setting: "القاهرة · قصر الفاطميين",
    hook: "فتىً كرديّ يدخل بلاطًا لا يعرفه… ويخرج منه سلطانًا.",
    stages: [
      { kind: "scene", title: "مشهد · إلى مصر",
        body: [
          "أرسل نور الدين قائده شيركوه إلى مصر لردّ الصليبيين. ومعه ابن أخيه: فتى في الثلاثين اسمه يوسف بن أيوب.",
          "مات شيركوه فجأة، فاختار الخليفة الفاطمي العاضد ابن أخيه ليكون وزيرًا. كان أصغر المرشّحين وأقلّهم طموحًا، لكنّه كان أحكمهم.",
        ],
      },
      { kind: "investigation", title: "تحقيق · من هذا الوزير؟",
        question: "ادرس الأدلة، ثم اختر هويّة هذا الوزير.",
        clues: [
          "كرديّ الأصل من تكريت.",
          "دخل مصر مع عمّه ضمن جيش نور الدين.",
          "عيّنه الفاطميون وزيرًا وهو شاب.",
          "أنهى الخلافة الفاطمية بلا قطرة دم.",
        ],
        options: ["شيركوه", "صلاح الدين", "الكامل", "نور الدين"],
        answerIndex: 1,
        explanation: "هو يوسف بن أيوب الملقّب بصلاح الدين، أنهى الخلافة الفاطمية سنة ٥٦٧ هـ وأسّس الدولة الأيوبية.",
      },
      { kind: "decision", title: "قرار · كيف تنهي الفاطميين؟",
        setting: "القاهرة · ٥٦٧ هـ",
        scene: "الخليفة العاضد في فراش الموت، والدولة بلا قيادة. ما خطوتك؟",
        choices: [
          { label: "أعتقل أمراءهم وأفرض السنّة بالقوة", outcome: "كنت ستُشعل ثورة داخلية وأنت تستعد لمواجهة الصليبيين.", correct: false },
          { label: "أعيد الخطبة للخليفة العباسي بهدوء، وأحفظ هيبة البيت الفاطمي", outcome: "هكذا فعل صلاح الدين، فانتقلت الدولة بسلام.", correct: true },
          { label: "أحتفظ بالخلافة الفاطمية اسميًّا", outcome: "كانت ستبقى الانقسامات تُعيق التحرير.", correct: false },
        ],
        note: "أمر صلاح الدين بالخطبة باسم الخليفة العباسي، فانطوت صفحة قرنين من الخلافة الفاطمية بلا دم.",
      },
    ],
    finaleTitle: "اكتمل الفصل الثاني",
    finaleLine: "وُلدت الدولة الأيوبية. مصر والشام تحت رايةٍ واحدة، والقدس على بُعد عامٍ من القرار.",
    rewards: { points: 45 },
  },
  {
    id: "ch3", index: 3, missionId: "y-m3",
    title: "ملامح القائد",
    era: "أرشيف السلاطين",
    setting: "وثائق المؤرّخين",
    hook: "ثلاثة أدلّة فقط… أتعرف القائد قبل أن تذكره الكتب؟",
    stages: [
      { kind: "scene", title: "مشهد · صورة لم تكتمل",
        body: [
          "كتب عنه ابن شدّاد وأبو شامة وابن الأثير. كتب عنه أعداؤه قبل أصدقائه. لكن من هو حقًّا؟",
          "أمامك أدلّة من شهادات معاصريه. اقرأ بتأنٍّ ثم اختر.",
        ],
      },
      { kind: "investigation", title: "تحقيق · من هذا السلطان؟",
        question: "من القائد الذي تصفه هذه الشهادات؟",
        clues: [
          "وحّد جيوش مصر والشام تحت راية واحدة.",
          "أعاد الأذان إلى الأقصى بعد ٨٨ عامًا.",
          "حين توفّي لم يُخلّف ثمن كفنه.",
          "قال عنه دانتي إنه في برزخ النبلاء.",
        ],
        options: ["نور الدين زنكي", "صلاح الدين الأيوبي", "الظاهر بيبرس", "الكامل الأيوبي"],
        answerIndex: 1,
        explanation: "صلاح الدين يوسف بن أيوب، عرفه المسلمون والمسيحيون معًا بنُبله قبل سيفه.",
      },
      { kind: "discovery", subtype: "character", refId: "salahuddin",
        title: "كشف · بطاقة السلطان",
        subtitle: "اكتملت ملامح القائد. أُضيفت بطاقته الأسطورية إلى مجموعتك.",
        icon: "🕌",
        body: "صلاح الدين الأيوبي · محرّر القدس · ندرة أسطورية.",
      },
    ],
    finaleTitle: "اكتمل الفصل الثالث",
    finaleLine: "عرفتَ القائد. حان وقت معرفة قراراته.",
    rewards: { points: 55, characterIds: ["salahuddin"] },
  },
  {
    id: "ch4", index: 4, missionId: "y-m4",
    title: "ليلة الكمين",
    era: "ربيع الآخر ٥٨٣ هـ",
    setting: "سفوح الجليل · ليلًا",
    hook: "الجيوش متقابلة. الماء بعيد. والقرار قرارك.",
    quote: "إنّ الحرب خدعة.",
    quoteBy: "حديث نبوي",
    stages: [
      { kind: "scene", title: "مشهد · ليلٌ بلا نوم",
        body: [
          "ريموند الثالث، حاكم طبريّة، نصح الصليبيين بالبقاء قرب الماء. لكن الملك غاي دي لوزنيان أبى، وأمر بالتقدّم في حرّ تموز نحو طبريّة.",
          "أمامك جيش يضمّ ٢٠ ألف فارس صليبي. ما خطّتك؟",
        ],
      },
      { kind: "decision", title: "قرار · أين نلتقي بهم؟",
        setting: "وادي طبريّة",
        scene: "تستطيع مهاجمتهم وهم قرب الماء، أو استدراجهم إلى سهلٍ قاحل.",
        choices: [
          { label: "أهاجمهم قرب الماء وأُنهي الأمر سريعًا", outcome: "كنت ستفقد ميزتك الحاسمة وتدخل معركة متكافئة.", correct: false },
          { label: "أستدرجهم بعيدًا عن الماء وأشعل العشب اليابس", outcome: "كمينٌ غيّر مسار التاريخ.", correct: true },
          { label: "أتفاوض على هدنة", outcome: "ضاعت فرصة تحرير القدس.", correct: false },
        ],
        note: "قاد صلاح الدين الصليبيين إلى سهل حِطّين القاحل في حرّ تموز، وأشعل الأعشاب حولهم. بدأت المعركة وهم عطشى.",
      },
      { kind: "discovery", subtype: "artifact", refId: "hattin-map",
        title: "اكتشاف · خارطة الكمين",
        subtitle: "أُضيفت خارطة حِطّين إلى أرشيفك.",
        icon: "🗺️",
        body: "تُظهر طريق الجيش الصليبي من صفّوريّة إلى قرون حطّين، وموقع البحيرة الذي حال صلاح الدين دون وصولهم إليه.",
      },
    ],
    finaleTitle: "اكتمل الفصل الرابع",
    finaleLine: "نُصب الكمين. يبقى أن يطلع فجر حِطّين.",
    rewards: { points: 45, artifactIds: ["hattin-map"] },
  },
  {
    id: "ch5", index: 5, missionId: "y-m5",
    title: "يوم النصر",
    era: "٢٥ ربيع الآخر ٥٨٣ هـ",
    setting: "قرون حطّين",
    hook: "ستّ ساعات في حرّ تموز كسرت قرنًا من الاحتلال.",
    quote: "ما النصرُ إلا من عند الله.",
    quoteBy: "صلاح الدين بعد حِطّين",
    stages: [
      { kind: "scene", title: "مشهد · صباح المعركة",
        body: [
          "أصبح الصليبيون بلا ماء، يحترقون تحت الشمس وريح الدخان. حاولوا الفرار نحو البحيرة، فوجدوها مغلقة.",
          "انكسر جناحهم الأيمن، ثم الأيسر، ثم القلب. أُسر الملك غاي ومعه أسطورة فرسانهم.",
        ],
      },
      { kind: "timeline", title: "ترتيب · أحداث الكمين",
        instruction: "رتّب أحداث يوم حِطّين بالترتيب الذي وقعت به.",
        events: [
          { id: "e1", label: "تقدّم الجيش الصليبي من صفّوريّة", year: 1 },
          { id: "e2", label: "صلاح الدين يحرق العشب اليابس", year: 2 },
          { id: "e3", label: "محاولة الوصول إلى البحيرة", year: 3 },
          { id: "e4", label: "انكسار جناح الصليبيين الأيمن", year: 4 },
          { id: "e5", label: "أسر الملك غاي دي لوزنيان", year: 5 },
        ],
      },
      { kind: "discovery", subtype: "artifact", refId: "hattin-banner",
        title: "اكتشاف · راية حِطّين",
        subtitle: "رُفعت فوق المعسكر يوم المعركة.",
        icon: "🚩",
        body: "كانت رايةً صفراء بهلال، حُفظت بعدها في خزانة سلاطين الأيوبيين.",
      },
    ],
    finaleTitle: "اكتمل الفصل الخامس",
    finaleLine: "انكسرت ممالك الفرنجة. القدس بلا حام.",
    rewards: { points: 60, artifactIds: ["hattin-banner"] },
  },
  {
    id: "ch6", index: 6, missionId: "y-m6",
    title: "عودة الأذان",
    era: "٢٧ رجب ٥٨٣ هـ",
    setting: "أسوار القدس",
    hook: "ثمانية وثمانون عامًا من الصمت… انكسرت بأذانٍ واحد.",
    quote: "اللّهم تقبّل، فإنّ المسلمين قد أعادوا بيتك.",
    quoteBy: "محيي الدين بن الزكي · أول خطبة",
    stages: [
      { kind: "scene", title: "مشهد · حصار المدينة المقدّسة",
        body: [
          "بعد حِطّين، سقطت عكا ونابلس ويافا وبيروت. ثم اقترب صلاح الدين من القدس.",
          "خرج إليه باليان من إبيلين يفاوضه. هدّد أن يهدم الصخرة ويُحرق كل مسلمٍ في المدينة إن لم يُمنحوا الأمان.",
        ],
      },
      { kind: "decision", title: "قرار · كيف نعامل أهل القدس؟",
        setting: "خيمة السلطان · ٢١ رجب",
        scene: "أمامك خيارات. الصليبيون قتلوا أهل القدس قبل ٨٨ عامًا حتى ركبت الخيول في الدماء.",
        choices: [
          { label: "أنتقم لما فعلوه قبل ٨٨ عامًا", outcome: "كنت ستفقد المعنى الكبير الذي قاتلت من أجله.", correct: false },
          { label: "أمنحهم الأمان بفديةٍ يسيرة، ومن لم يستطع تركته حرًّا", outcome: "هكذا فعل صلاح الدين، فحفظ مجده عند العدو والصديق.", correct: true },
          { label: "أطردهم بلا شيء", outcome: "كنت ستضع بذرة حروبٍ جديدة.", correct: false },
        ],
        note: "دخل صلاح الدين القدس صلحًا، ودفعت الفدية، ومن عجز عفا عنه. أعاد المنبر الذي صنعه نور الدين إلى مكانه.",
      },
      { kind: "discovery", subtype: "document", refId: "doc-jerusalem-khutba",
        title: "اكتشاف · خطبة الجمعة الأولى",
        subtitle: "بعد ٨٨ عامًا، يرتقي محيي الدين بن الزكي منبر نور الدين.",
        icon: "📖",
        body: "«الحمدُ لله الذي أعزّ الإسلام بنصره، وأذلّ الشرك بقهره… ردّ هذه المدينة إلى حوزة الإسلام بعد أن خرجت من أيدي الكفر».",
      },
    ],
    finaleTitle: "اكتمل الفصل السادس",
    finaleLine: "عاد الأذان إلى الأقصى. التاريخ يتنفّس من جديد.",
    rewards: { points: 70, artifactIds: ["doc-jerusalem-khutba"] },
  },
  {
    id: "ch7", index: 7, missionId: "y-m7",
    title: "مسيرة قرنين",
    era: "قرنان من المواجهة",
    setting: "أرشيف الفرنجة",
    hook: "رتّب فصول الحرب الطويلة كما جرت تحت سماء الشام.",
    stages: [
      { kind: "scene", title: "مشهد · من خطبةٍ في كليرمونت إلى أذانٍ في القدس",
        body: [
          "بدأت القصة سنة ١٠٩٥م بخطبةٍ للبابا أوربان الثاني في كليرمونت. وانتهت سنة ١١٨٧م بأذانٍ في الأقصى.",
          "بينهما قرنان من القلاع والمعارك والوحدات والانكسارات.",
        ],
      },
      { kind: "timeline", title: "ترتيب · من البداية إلى التحرير",
        instruction: "رتّب أحداث الحروب الصليبية بحسب تواريخها.",
        events: [
          { id: "e1", label: "خطبة البابا أوربان", year: 1095 },
          { id: "e2", label: "سقوط القدس بيد الصليبيين", year: 1099 },
          { id: "e3", label: "وحدة الشام تحت نور الدين", year: 1154 },
          { id: "e4", label: "تأسيس الدولة الأيوبية", year: 1171 },
          { id: "e5", label: "معركة حِطّين", year: 1187 },
          { id: "e6", label: "تحرير القدس", year: 1187 },
        ],
      },
      { kind: "discovery", subtype: "document", refId: "doc-crusades",
        title: "اكتشاف · مخطوطة الحروب الصليبية",
        subtitle: "موجزٌ كامل من قرنين من المواجهة، أُضيف إلى مكتبتك.",
        icon: "📚",
      },
    ],
    finaleTitle: "اكتمل الفصل السابع",
    finaleLine: "اكتمل خطّ الزمن. يبقى أن يُكتب الفصل الأخير.",
    rewards: { points: 60, artifactIds: ["doc-crusades"] },
  },
  {
    id: "ch8", index: 8, missionId: "y-m8",
    title: "ميراث الفاتح",
    era: "صفر ٥٨٩ هـ",
    setting: "دمشق · القلعة",
    hook: "لم يُخلّف ذهبًا، لكنّه ترك أمّةً تعرف كيف تُحرّر.",
    quote: "إيّاك والدماء، فإنّها لا تنام.",
    quoteBy: "وصيّة صلاح الدين لولده الظاهر",
    stages: [
      { kind: "scene", title: "مشهد · آخر سنوات السلطان",
        body: [
          "عاش بعد التحرير ست سنواتٍ فقط، صرفها في صدّ الحملة الصليبية الثالثة بقيادة ريتشارد قلب الأسد.",
          "حين توفّي لم يكن في خزانته ما يكفي ثمن كفنه. لم يُخلّف ذهبًا ولا ضياعًا.",
        ],
      },
      { kind: "investigation", title: "تحقيق · شهادة عدوّه",
        question: "أيُّ كاتبٍ غربي وضع صلاح الدين في مرتبة النبلاء في مؤلَّفه الشهير؟",
        clues: [
          "كاتبٌ إيطالي من القرن ١٤م.",
          "ذكر صلاح الدين في عملٍ شعريٍّ خالد.",
          "وضعه في «برزخ النبلاء» إلى جانب فلاسفة اليونان.",
          "اشتُهر بـ«الكوميديا الإلهية».",
        ],
        options: ["شكسبير", "دانتي", "غوته", "بترارك"],
        answerIndex: 1,
        explanation: "دانتي أليغييري في «الكوميديا الإلهية» جعل صلاح الدين في برزخ النبلاء، اعترافًا بشهامته عند أعدائه.",
      },
      { kind: "discovery", subtype: "document", refId: "salah-letter",
        title: "اكتشاف · وصية السلطان",
        subtitle: "خمس وصايا تركها لولده الظاهر.",
        icon: "📜",
        body: "«إيّاك والدماء، فإنّها لا تنام. واتّقِ الله، فإنّ تقواه أمانٌ من كلّ خوف. واحفظ قلوب الناس، فإنّك لن تَدوم لهم إلا بالعدل…»",
      },
      { kind: "discovery", subtype: "artifact", refId: "aqsa-stone",
        title: "اكتشاف · حجرٌ من الأقصى",
        subtitle: "آخر هدية من الحملة قبل ختامها.",
        icon: "🕌",
        body: "حجرٌ من ترميمات الأيوبيين لقبّة الصخرة، يحمل رمز اكتمال الرحلة.",
      },
    ],
    finaleTitle: "اكتمل الفصل الثامن",
    finaleLine: "اكتملت الحملة. عُد إلى صفحة الحملة لاستلام المكافأة الكبرى.",
    rewards: { points: 80, artifactIds: ["salah-letter", "aqsa-stone"] },
  },
];

export function getFlagshipChapter(id: string) {
  return FLAGSHIP_CHAPTERS.find((c) => c.id === id);
}

// ============================================================
// CHARACTER PROFILES — rich legendary-hero pages
// ============================================================
export interface ProfileTimelineEntry { year: string; event: string }
export interface ProfileBattle { name: string; year: string; place: string; outcome: string; storyId?: string }
export interface ProfileQuote { text: string; context?: string }
export interface CharacterProfile {
  id: string;
  fullName: string;
  epithet: string;
  lifespan: string;
  birthplace?: string;
  resting?: string;
  heroGradient: string;     // tailwind gradient classes for hero panel
  accentToken: string;      // semantic accent color hint
  tagline: string;
  bioLong: string[];
  timeline: ProfileTimelineEntry[];
  achievements: string[];
  campaignEras: Era[];
  battles: ProfileBattle[];
  artifactIds: string[];
  regionIds: string[];
  relatedCharacterIds: string[];
  quotes: ProfileQuote[];
}

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  salahuddin: {
    id: "salahuddin",
    fullName: "صلاح الدين يوسف بن أيوب",
    epithet: "محرّر القدس · سلطان مصر والشام",
    lifespan: "٥٣٢ – ٥٨٩ هـ / ١١٣٧ – ١١٩٣ م",
    birthplace: "تكريت · العراق",
    resting: "الجامع الأموي · دمشق",
    heroGradient: "from-amber-900/70 via-amber-700/40 to-transparent",
    accentToken: "gold",
    tagline: "من فتى كرديٍّ في تكريت إلى السلطان الذي أعاد الأذان للأقصى بعد ٨٨ عامًا.",
    bioLong: [
      "وُلد يوسف بن أيوب في قلعة تكريت ليلة رحيل أبيه نحو الموصل، فكان مولده فألًا في طريقٍ جديد.",
      "تربّى في كنف عمّه أسد الدين شيركوه، تحت راية نور الدين زنكي الذي علّمه أن الجهاد ليس سيفًا فقط، بل عدلًا وتقوى.",
      "دخل مصر وزيرًا للفاطميين، فأنهى دولتهم بلا قطرة دم، ووحّد مصر والشام تحت راية الخلافة العباسية.",
      "في الرابع من تموز ١١٨٧م التقى الصليبيين في حِطّين، فهزمهم في يومٍ واحد، ثم دخل القدس صلحًا فعفا عن أهلها.",
      "مات فقيرًا لا يملك ما يُكفَّن به، فقد وزّع ماله كلّه على الفقراء والمجاهدين. ودُفن في دمشق بجوار الجامع الأموي.",
    ],
    timeline: [
      { year: "٥٣٢ هـ", event: "وُلد في قلعة تكريت." },
      { year: "٥٥٩ هـ", event: "دخل مصر مع عمّه شيركوه في جيش نور الدين." },
      { year: "٥٦٤ هـ", event: "تولّى وزارة مصر بعد وفاة عمّه." },
      { year: "٥٦٧ هـ", event: "أنهى الخلافة الفاطمية وأعاد الخطبة للعباسيين." },
      { year: "٥٦٩ هـ", event: "تأسّست الدولة الأيوبية بعد وفاة نور الدين." },
      { year: "٥٨٣ هـ", event: "هزيمة الصليبيين في حِطّين وتحرير القدس." },
      { year: "٥٨٨ هـ", event: "صلح الرملة مع ريتشارد قلب الأسد." },
      { year: "٥٨٩ هـ", event: "توفّي في دمشق." },
    ],
    achievements: [
      "توحيد مصر والشام تحت رايةٍ واحدة بعد قرنين من التشرذم.",
      "تحرير القدس بعد ٨٨ سنة من الاحتلال الصليبي.",
      "تأسيس الدولة الأيوبية في مصر والشام واليمن والحجاز.",
      "بناء قلعة الجبل في القاهرة وتحصين أسوار القدس ودمشق.",
      "إقامة المدارس والمستشفيات ودور الأيتام في كل مدنه.",
    ],
    campaignEras: ["ayyubid"],
    battles: [
      { name: "حِطّين", year: "٥٨٣ هـ", place: "سهل حِطّين · فلسطين", outcome: "نصرٌ ساحق", storyId: "hattin" },
      { name: "تحرير القدس", year: "٥٨٣ هـ", place: "بيت المقدس", outcome: "فتحٌ صلحًا", storyId: "jerusalem-liberation" },
      { name: "حصار عكّا", year: "٥٨٥ هـ", place: "عكّا · فلسطين", outcome: "صمودٌ طويل" },
      { name: "أرسوف", year: "٥٨٧ هـ", place: "ساحل فلسطين", outcome: "معركة شرسة مع ريتشارد" },
    ],
    artifactIds: ["hattin-banner", "salah-letter", "aqsa-stone", "nuruddin-minbar"],
    regionIds: ["sham", "egypt", "hijaz"],
    relatedCharacterIds: ["omar", "baybars", "khalid"],
    quotes: [
      { text: "كيف يطيب لي ضحكٌ والمسجد الأقصى في الأسر؟", context: "قبل تحرير القدس" },
      { text: "أرى البحر يحرس ساحلنا، وأرى البرّ سيُحرَّر بسيوفنا.", context: "في إعداد جيش حِطّين" },
      { text: "الدنيا كلّها لا تساوي إراقة قطرة دمٍ من مسلم بلا حقٍّ.", context: "وصيّة لابنه الظاهر" },
    ],
  },

  omar: {
    id: "omar",
    fullName: "عمر بن الخطّاب العَدَوي القرشي",
    epithet: "الفاروق · أمير المؤمنين",
    lifespan: "٤٠ ق.هـ – ٢٣ هـ / ٥٨٤ – ٦٤٤ م",
    birthplace: "مكّة المكرّمة",
    resting: "الحجرة النبويّة · المدينة المنوّرة",
    heroGradient: "from-emerald-900/70 via-emerald-700/30 to-transparent",
    accentToken: "emerald",
    tagline: "الخليفة الذي فرّق به الله بين الحقّ والباطل، وفتح في عهده ثلث الأرض المعمورة.",
    bioLong: [
      "وُلد في مكّة في بيتٍ من أشراف قريش، وكان قارئًا للشعر، مصارعًا في عكاظ، تاجرًا إلى الشام واليمن.",
      "أسلم في السنة السادسة من البعثة، فعزّ الإسلام بإسلامه، وصلّى المسلمون لأوّل مرّة عند الكعبة جهارًا.",
      "تولّى الخلافة بعد أبي بكر، ففتح في عهده الشام والعراق ومصر وفارس، ووضع الدواوين والتاريخ الهجري.",
      "دخل القدس على راحلته، يقود غلامه بالحبل، فكان يومٌ يضرب به المثل في عدل الحكّام.",
      "استُشهد في المحراب على يد أبي لؤلؤة المجوسي، وهو يصلّي الفجر بالناس.",
    ],
    timeline: [
      { year: "بعثة ٦", event: "إسلامه في مكّة." },
      { year: "١ هـ", event: "الهجرة إلى المدينة." },
      { year: "١٣ هـ", event: "بداية خلافته بعد أبي بكر." },
      { year: "١٥ هـ", event: "اليرموك والقادسية." },
      { year: "١٦ هـ", event: "فتح بيت المقدس صلحًا." },
      { year: "٢٠ هـ", event: "فتح مصر على يد عمرو بن العاص." },
      { year: "٢٣ هـ", event: "استشهاده في المحراب." },
    ],
    achievements: [
      "تأسيس الديوان والتاريخ الهجري ونظام البريد.",
      "فتح الشام والعراق ومصر وفارس في عشر سنوات.",
      "إرساء قواعد العدل الإداري في الأمصار.",
      "تنظيم الجيش وبناء الكوفة والبصرة والفسطاط.",
    ],
    campaignEras: ["rashidun", "seerah"],
    battles: [
      { name: "اليرموك", year: "١٥ هـ", place: "الشام", outcome: "فتح الشام", storyId: "yarmouk" },
      { name: "القادسية", year: "١٥ هـ", place: "العراق", outcome: "نهاية الساسانيين", storyId: "qadisiyyah" },
      { name: "نهاوند", year: "٢١ هـ", place: "فارس", outcome: "فتح الفتوح" },
    ],
    artifactIds: ["yarmouk-sword", "rashidun-dinar", "aqsa-stone"],
    regionIds: ["hijaz", "sham", "iraq", "egypt"],
    relatedCharacterIds: ["khalid", "salahuddin"],
    quotes: [
      { text: "متى استعبدتم الناس وقد ولدتهم أمهاتهم أحرارًا؟", context: "خطاب لعمرو بن العاص" },
      { text: "اللهمّ ارزقني شهادةً في سبيلك، وموتًا في بلد رسولك." },
      { text: "لو عثرت بغلةٌ في العراق لخشيتُ أن يسألني الله: لمَ لم تُسوِّ لها الطريق؟" },
    ],
  },

  khalid: {
    id: "khalid",
    fullName: "خالد بن الوليد المخزومي",
    epithet: "سيف الله المسلول",
    lifespan: "٣٠ ق.هـ – ٢١ هـ / ٥٩٢ – ٦٤٢ م",
    birthplace: "مكّة المكرّمة",
    resting: "حمص · الشام",
    heroGradient: "from-rose-900/70 via-rose-700/30 to-transparent",
    accentToken: "rose",
    tagline: "القائد الذي لم يُهزم في معركة، فاتح العراق والشام وكاسر إمبراطوريّتين.",
    bioLong: [
      "فارسٌ من بني مخزوم، تربّى على الخيل والسيف منذ صغره، وكان من أمهر فرسان قريش.",
      "قاد فرسان قريش يوم أُحد، فحوّل الهزيمة إلى نصر، ثم أسلم بعدها بسنوات.",
      "في حروب الردّة كان السيف الذي به ثبّت الله الإسلام، وفي اليرموك كان العقل الذي به كُسر الروم.",
      "عزله عمر عن قيادة الجيش، فقال كلمته الخالدة: «ما عملتُ لعمر، إنّما عملتُ لله».",
      "مات على فراشه بحسرة الشهيد، فقال: «ما في جسدي موضع شبر إلا وفيه طعنة أو ضربة، وها أنا أموت على فراشي».",
    ],
    timeline: [
      { year: "٣ هـ", event: "قاد فرسان قريش يوم أُحد." },
      { year: "٨ هـ", event: "إسلامه." },
      { year: "٨ هـ", event: "مؤتة · لُقّب بسيف الله." },
      { year: "١١ هـ", event: "قيادة حروب الردّة." },
      { year: "١٢ هـ", event: "فتح العراق والمسيرة الأسطورية إلى الشام." },
      { year: "١٥ هـ", event: "قيادة اليرموك وكسر الروم." },
      { year: "٢١ هـ", event: "وفاته في حمص." },
    ],
    achievements: [
      "لم يُهزم في أكثر من مئة معركة قادها.",
      "ابتكر تكتيك الكراديس وتنظيم الكمائن.",
      "قطع الصحراء من العراق إلى الشام في خمسة أيام لمساعدة الجيش.",
      "تحطيم جيش الفرس في أوّل مواجهة كبرى.",
    ],
    campaignEras: ["rashidun"],
    battles: [
      { name: "أُحد", year: "٣ هـ", place: "المدينة", outcome: "قبل إسلامه" },
      { name: "مؤتة", year: "٨ هـ", place: "جنوب الشام", outcome: "انسحابٌ منظّم" },
      { name: "اليمامة", year: "١٢ هـ", place: "نجد", outcome: "نهاية مسيلمة" },
      { name: "اليرموك", year: "١٥ هـ", place: "نهر اليرموك", outcome: "كسر الروم", storyId: "yarmouk" },
    ],
    artifactIds: ["yarmouk-sword"],
    regionIds: ["hijaz", "sham", "iraq"],
    relatedCharacterIds: ["omar"],
    quotes: [
      { text: "ما ليلةٌ يُهدى إليّ فيها عروسٌ، أحبّ إليّ من ليلةٍ شديدة البرد في سريّةٍ من المسلمين أصبّح بها العدوّ." },
      { text: "إن كان عمر عزلني فإنّ الله لم يعزلني." },
    ],
  },

  fatih: {
    id: "fatih",
    fullName: "محمد بن مراد الثاني العثماني",
    epithet: "الفاتح · صاحب البشارة",
    lifespan: "٨٣٣ – ٨٨٦ هـ / ١٤٣٢ – ١٤٨١ م",
    birthplace: "أدرنة · الأناضول",
    resting: "جامع الفاتح · إسطنبول",
    heroGradient: "from-indigo-900/70 via-indigo-700/30 to-transparent",
    accentToken: "indigo",
    tagline: "الفتى الذي حقّق بشارة النبي ﷺ بعد ثمانية قرون، وفتح أعظم حصون الأرض.",
    bioLong: [
      "تربّى في بلاط أدرنة على يد كبار العلماء، وأتقن سبع لغات قبل بلوغه العشرين.",
      "تولّى السلطنة وهو في الحادية والعشرين، وعينه على القسطنطينية منذ أوّل يوم.",
      "أعدّ جيشًا قوامه ١٥٠ ألفًا، وبنى مدافع أورپان الضخمة، وحفر سفنه فوق التلال لينقلها إلى القرن الذهبي.",
      "بعد ٥٣ يومًا من الحصار، اقتحم أسوار المدينة عند الفجر في ٢٠ جمادى الأولى ٨٥٧هـ، وصلّى في آيا صوفيا أوّل جمعة.",
      "حكم ٣٠ سنة، فتح فيها بلادًا واسعة وأرسى نظامًا قضائيًّا وتعليميًّا بقي قرونًا.",
    ],
    timeline: [
      { year: "٨٣٣ هـ", event: "وُلد في أدرنة." },
      { year: "٨٤٨ هـ", event: "تولّى السلطنة لأوّل مرّة وعمره ١٢." },
      { year: "٨٥٥ هـ", event: "تولّى السلطنة الثانية وبدأ التحضير للفتح." },
      { year: "٨٥٧ هـ", event: "فتح القسطنطينية." },
      { year: "٨٦٧ هـ", event: "ضمّ القرم والبوسنة." },
      { year: "٨٨٦ هـ", event: "وفاته على رأس جيشٍ متوجّه إلى إيطاليا." },
    ],
    achievements: [
      "فتح القسطنطينية وإسقاط الإمبراطورية البيزنطية.",
      "بناء جامع الفاتح وقصر طوب قابي ومجمع الفاتح العلمي.",
      "تقنين القوانين العثمانية في «قانون نامه».",
      "فتح أكثر من ٢٠ ولاية أوروبية وآسيوية.",
    ],
    campaignEras: ["ottoman"],
    battles: [
      { name: "فتح القسطنطينية", year: "٨٥٧ هـ", place: "القسطنطينية", outcome: "فتحٌ تاريخي", storyId: "constantinople" },
      { name: "بلغراد", year: "٨٦٠ هـ", place: "صربيا", outcome: "حصار صعب" },
      { name: "أوترانتو", year: "٨٨٥ هـ", place: "جنوب إيطاليا", outcome: "موطئ قدمٍ في أوروبا" },
    ],
    artifactIds: ["fatih-cannon", "ottoman-tughra"],
    regionIds: ["anatolia", "sham"],
    relatedCharacterIds: ["salahuddin"],
    quotes: [
      { text: "إمّا أن آخذ القسطنطينية، أو تأخذني." },
      { text: "الراحة للأمّة لا للحاكم." },
    ],
  },

  baybars: {
    id: "baybars",
    fullName: "الظاهر ركن الدين بيبرس البندقداري",
    epithet: "أسد المماليك · كاسر المغول",
    lifespan: "٦٢٠ – ٦٧٦ هـ / ١٢٢٣ – ١٢٧٧ م",
    birthplace: "سهوب القفجاق",
    resting: "المكتبة الظاهرية · دمشق",
    heroGradient: "from-yellow-900/70 via-amber-700/30 to-transparent",
    accentToken: "amber",
    tagline: "العبدُ الذي صار سلطانًا، وكسر المغول والصليبيين معًا، وأعاد الخلافة إلى القاهرة.",
    bioLong: [
      "بِيع غلامًا في أسواق سيواس، ثم انتقل إلى مصر فالتحق بالحرس المملوكي للسلطان الصالح أيوب.",
      "قاد مقدّمة الجيش في عين جالوت، فأنزل بالمغول أوّل هزيمةٍ كبرى في تاريخهم.",
      "تولّى السلطنة بعد قطز، فبنى دولةً مهيبة امتدّت من برقة إلى الفرات.",
      "أحيا الخلافة العباسية في القاهرة بعد سقوط بغداد، فبايع الخليفة المستنصر بالله.",
      "بنى الأسطول، ورمّم الجوامع، وأنشأ البريد السريع بين القاهرة ودمشق في ٤ أيام.",
    ],
    timeline: [
      { year: "٦٤٧ هـ", event: "المنصورة · كسر حملة لويس التاسع." },
      { year: "٦٥٨ هـ", event: "عين جالوت · هزيمة المغول." },
      { year: "٦٥٨ هـ", event: "توليه السلطنة بعد قطز." },
      { year: "٦٥٩ هـ", event: "إحياء الخلافة العباسية في القاهرة." },
      { year: "٦٦٦ هـ", event: "فتح أنطاكية من الصليبيين." },
      { year: "٦٧٦ هـ", event: "وفاته في دمشق." },
    ],
    achievements: [
      "أوّل هزيمة كبرى للمغول في عين جالوت.",
      "إعادة الخلافة العباسية إلى مصر.",
      "تحرير ٢٧ مدينة وقلعة من الصليبيين.",
      "تأسيس البريد السريع وإصلاح القلاع والموانئ.",
    ],
    campaignEras: ["mamluk"],
    battles: [
      { name: "المنصورة", year: "٦٤٧ هـ", place: "دلتا النيل", outcome: "أسرُ ملك فرنسا" },
      { name: "عين جالوت", year: "٦٥٨ هـ", place: "فلسطين", outcome: "كسر المغول", storyId: "ain-jalut" },
      { name: "أنطاكية", year: "٦٦٦ هـ", place: "شمال الشام", outcome: "تحريرها من الصليبيين" },
    ],
    artifactIds: ["ain-jalut-arrow", "mamluk-quran"],
    regionIds: ["egypt", "sham"],
    relatedCharacterIds: ["salahuddin", "khalid"],
    quotes: [
      { text: "السلطان عبدٌ لرعيّته، يسهر ليناموا، ويجوع ليشبعوا." },
      { text: "لن ينام لي جفنٌ ما دام صليبيٌّ على ساحلٍ من سواحل المسلمين." },
    ],
  },

  harun: {
    id: "harun",
    fullName: "هارون بن محمد المهدي العبّاسي",
    epithet: "الرشيد · خليفة بغداد الذهبيّة",
    lifespan: "١٤٩ – ١٩٣ هـ / ٧٦٦ – ٨٠٩ م",
    birthplace: "الري · فارس",
    resting: "طوس · خراسان",
    heroGradient: "from-violet-900/70 via-violet-700/30 to-transparent",
    accentToken: "violet",
    tagline: "خليفةٌ يخاطب السحابة: «أمطري حيث شئت، فخراجك إليّ راجع».",
    bioLong: [
      "تربّى في كنف أبيه المهدي، ودرس على يد الكسائي وأبي يوسف ومالك بن أنس.",
      "تولّى الخلافة في الثانية والعشرين، فبلغت الدولة العبّاسية ذروتها مساحةً وثروة.",
      "في عهده ازدهر بيت الحكمة، وتُرجمت كتب اليونان والفرس، وبرز البرامكة في الوزارة.",
      "كان يحجّ عامًا ويغزو عامًا، وله مع شارلمان مراسلاتٌ وهداياه شملت أوّل ساعة مائيّة رآها الغرب.",
      "مات في طوس وهو في طريقه لإخماد ثورة، فدُفن هناك.",
    ],
    timeline: [
      { year: "١٧٠ هـ", event: "توليه الخلافة." },
      { year: "١٧٦ هـ", event: "غزو الروم وفتح هرقلة." },
      { year: "١٨٧ هـ", event: "نكبة البرامكة." },
      { year: "١٩٣ هـ", event: "وفاته في طوس." },
    ],
    achievements: [
      "ازدهار بيت الحكمة في عهده وعهد ولده المأمون.",
      "بناء المستشفيات والمكتبات في بغداد والبصرة.",
      "إقامة نظام بريدٍ منتظم من الصين إلى المغرب.",
      "إرساء التبادل الدبلوماسي مع شارلمان والصين.",
    ],
    campaignEras: ["abbasid"],
    battles: [
      { name: "هرقلة", year: "١٨٧ هـ", place: "الأناضول", outcome: "فتحٌ وغنائم" },
    ],
    artifactIds: ["baghdad-manuscript", "khwarizmi-jabr"],
    regionIds: ["iraq", "khorasan", "transoxiana"],
    relatedCharacterIds: ["khwarizmi"],
    quotes: [
      { text: "اللهمّ إنّك تعلم أنّي أحبّ من العلم أصوله، ومن الأخلاق أكرمها." },
      { text: "أمطري حيث شئتِ، فخراجكِ إليّ راجع.", context: "مخاطبًا سحابة" },
    ],
  },

  khwarizmi: {
    id: "khwarizmi",
    fullName: "محمد بن موسى الخوارزمي",
    epithet: "أبو الجبر · مهندس الأرقام",
    lifespan: "١٦٤ – ٢٣٢ هـ / ٧٨٠ – ٨٤٧ م",
    birthplace: "خوارزم · ما وراء النهر",
    resting: "بغداد",
    heroGradient: "from-sky-900/70 via-sky-700/30 to-transparent",
    accentToken: "sky",
    tagline: "من اسمه اشتُقّت الخوارزمية، ومن كتابه تعلّمت أوروبا الجبر.",
    bioLong: [
      "وُلد في إقليم خوارزم، وانتقل إلى بغداد حيث صار من أبرز علماء بيت الحكمة.",
      "كتب «الجبر والمقابلة» فأسّس علمًا جديدًا، ونقل الأرقام الهنديّة إلى العربيّة ثم إلى أوروبا.",
      "وضع جداول الزيج، ورسم خرائط للأرض في «صورة الأرض»، وحدّد طول النهار وعرض البلاد.",
      "ظلّت كتبه مرجعًا في جامعات أوروبا حتى القرن السادس عشر، وسُمّيت الخوارزميات باسمه.",
    ],
    timeline: [
      { year: "٢٠٠ هـ", event: "انتقاله إلى بغداد." },
      { year: "٢١٢ هـ", event: "تأليف «الجبر والمقابلة»." },
      { year: "٢٢٠ هـ", event: "كتاب «صورة الأرض»." },
    ],
    achievements: [
      "تأسيس علم الجبر.",
      "إدخال الأرقام الهنديّة (الصفر) إلى العالم.",
      "وضع أُسس الخوارزميات الحاسوبية.",
      "صياغة جداول فلكية اعتُمدت قرونًا.",
    ],
    campaignEras: ["abbasid"],
    battles: [],
    artifactIds: ["khwarizmi-jabr", "baghdad-manuscript"],
    regionIds: ["iraq", "transoxiana"],
    relatedCharacterIds: ["harun", "ibn-rushd"],
    quotes: [
      { text: "إنّ القياس والمقابلة طريقٌ يُوصل إلى المجهول من المعلوم." },
    ],
  },

  abdurrahman: {
    id: "abdurrahman",
    fullName: "عبد الرحمن بن معاوية بن هشام",
    epithet: "صقر قريش · مؤسّس أمويّ الأندلس",
    lifespan: "١١٣ – ١٧٢ هـ / ٧٣١ – ٧٨٨ م",
    birthplace: "دير حنّا · الشام",
    resting: "قرطبة",
    heroGradient: "from-orange-900/70 via-orange-700/30 to-transparent",
    accentToken: "orange",
    tagline: "الأمير الهارب الذي عبر صحراء وبحرًا ليؤسّس دولةً في أقصى الغرب.",
    bioLong: [
      "نجا من مذبحة الأمويين على يد العباسيين، فسبح بنفسه في الفرات، وتبعه طفلٌ غريق هو أخوه.",
      "قطع الصحراء من الشام إلى المغرب، فمصر فبرقة، تطارده العيون كلّ ليلة.",
      "عبر إلى الأندلس، فاستقبله مواليه، ودخل قرطبة فاتحًا عام ١٣٨ هـ.",
      "أسّس الدولة الأموية في الأندلس، فبنى قرطبة وجامعها، وحكم ٣٣ سنة حتى مماته.",
    ],
    timeline: [
      { year: "١٣٢ هـ", event: "مذبحة بني أميّة · بدء الفرار." },
      { year: "١٣٨ هـ", event: "دخوله قرطبة وتأسيس الإمارة." },
      { year: "١٧٠ هـ", event: "بدء بناء جامع قرطبة." },
      { year: "١٧٢ هـ", event: "وفاته." },
    ],
    achievements: [
      "تأسيس دولة الأمويين في الأندلس بعد سقوطها في الشرق.",
      "بناء جامع قرطبة الكبير.",
      "إرساء نظامٍ إداريّ استمرّ ٣٠٠ سنة.",
    ],
    campaignEras: ["andalus", "umayyad"],
    battles: [
      { name: "المصارة", year: "١٣٨ هـ", place: "قرب قرطبة", outcome: "نصر دخل به العاصمة" },
    ],
    artifactIds: ["cordoba-key", "alhambra-tile"],
    regionIds: ["andalus", "maghrib", "sham"],
    relatedCharacterIds: ["tariq", "ibn-rushd"],
    quotes: [
      { text: "أيّها النخلةُ في أرضٍ غريبة، أنا وأنت سواء." },
    ],
  },

  tariq: {
    id: "tariq",
    fullName: "طارق بن زياد الليثي",
    epithet: "فاتح الأندلس",
    lifespan: "٥٠ – ١٠٢ هـ / ٦٧٠ – ٧٢٠ م",
    birthplace: "شمال أفريقيا",
    resting: "دمشق",
    heroGradient: "from-teal-900/70 via-teal-700/30 to-transparent",
    accentToken: "teal",
    tagline: "القائد الذي أحرق السفن وفتح أبواب أوروبا.",
    bioLong: [
      "قائدٌ من البربر، ولّاه موسى بن نصير على طنجة.",
      "عبر بسبعة آلاف مقاتل إلى الأندلس عام ٩٢ هـ، فرسا عند جبلٍ سُمّي باسمه.",
      "أحرق سفنه ليقطع التراجع، وألقى خطبته الشهيرة: «أين المفرّ؟».",
      "هزم لذريق ملك القوط في وادي لكّة، وفتح طليطلة عاصمتهم.",
    ],
    timeline: [
      { year: "٩٢ هـ", event: "العبور إلى الأندلس." },
      { year: "٩٢ هـ", event: "معركة وادي لكّة." },
      { year: "٩٣ هـ", event: "فتح طليطلة." },
    ],
    achievements: [
      "فتح الأندلس وتغيير وجه أوروبا.",
      "صياغة أوّل خطّة عسكرية بحرية واسعة في غرب المتوسط.",
    ],
    campaignEras: ["umayyad", "andalus"],
    battles: [
      { name: "وادي لكّة", year: "٩٢ هـ", place: "جنوب الأندلس", outcome: "نهاية القوط" },
    ],
    artifactIds: ["cordoba-key"],
    regionIds: ["andalus", "maghrib"],
    relatedCharacterIds: ["abdurrahman", "muawiya"],
    quotes: [
      { text: "أيّها الناس، أين المفرّ؟ البحر من ورائكم، والعدوّ أمامكم." },
    ],
  },

  ibn_rushd: {
    id: "ibn-rushd",
    fullName: "أبو الوليد محمد بن أحمد بن رشد",
    epithet: "شارح أرسطو · قاضي قرطبة",
    lifespan: "٥٢٠ – ٥٩٥ هـ / ١١٢٦ – ١١٩٨ م",
    birthplace: "قرطبة",
    resting: "مرّاكش ثم نُقل إلى قرطبة",
    heroGradient: "from-purple-900/70 via-purple-700/30 to-transparent",
    accentToken: "purple",
    tagline: "الفيلسوف الذي علّم أوروبا أرسطو، وقال: «الجهل بالشيء يولّد الخوف منه».",
    bioLong: [
      "وُلد في بيت علمٍ وقضاء، فجمع بين الفقه والطبّ والفلسفة.",
      "تولّى قضاء إشبيلية ثمّ قرطبة، وألّف «بداية المجتهد» و«تهافت التهافت».",
      "شرح كتب أرسطو شرحًا غيّر الفكر الأوروبي، فعُرف هناك باسم Averroes.",
      "نُفي في آخر حياته بسبب الفلسفة، ثمّ ردّ إليه اعتباره قبل وفاته.",
    ],
    timeline: [
      { year: "٥٦٥ هـ", event: "قاضي إشبيلية." },
      { year: "٥٧٨ هـ", event: "تأليف «تهافت التهافت»." },
      { year: "٥٩٢ هـ", event: "نفيه إلى ليسانة." },
      { year: "٥٩٥ هـ", event: "وفاته في مرّاكش." },
    ],
    achievements: [
      "شرح أرسطو بثلاثة مستويات لا تزال مرجعًا.",
      "تأليف «بداية المجتهد» في الفقه المقارن.",
      "تأسيس مدرسة الرشدية في أوروبا اللاتينية.",
    ],
    campaignEras: ["andalus"],
    battles: [],
    artifactIds: ["khwarizmi-jabr", "alhambra-tile"],
    regionIds: ["andalus", "maghrib"],
    relatedCharacterIds: ["abdurrahman", "khwarizmi"],
    quotes: [
      { text: "الجهل بالشيء يولّد الخوف منه." },
      { text: "الحكمة صديقةٌ للشريعة، وهما رضيعتا لبان." },
    ],
  },

  alp_arslan: {
    id: "alp-arslan",
    fullName: "محمد بن داود السلجوقي · ألب أرسلان",
    epithet: "البطل الأسد · فاتح الأناضول",
    lifespan: "٤٢٠ – ٤٦٥ هـ / ١٠٢٩ – ١٠٧٢ م",
    birthplace: "خراسان",
    resting: "مَرو",
    heroGradient: "from-stone-900/70 via-stone-700/30 to-transparent",
    accentToken: "stone",
    tagline: "السلطان الذي أَسَر إمبراطور الروم وفتح أبواب الأناضول للأبد.",
    bioLong: [
      "ابن الأسرة السلجوقية، تولّى السلطنة بعد عمّه طغرلبك عام ٤٥٥ هـ.",
      "اتّخذ نظام الملك وزيرًا له، فأسّسا معًا أعظم نهضة سلجوقية.",
      "في ملاذكرد عام ٤٦٣ هـ هزم جيش الإمبراطور رومانوس ديوجين وأسره.",
      "اغتاله أسيرٌ أحضِر بين يديه، فمات قائلًا: «ما رفعت رأسي يومًا متكبّرًا إلّا اليوم».",
    ],
    timeline: [
      { year: "٤٥٥ هـ", event: "توليه السلطنة." },
      { year: "٤٦٣ هـ", event: "معركة ملاذكرد." },
      { year: "٤٦٥ هـ", event: "اغتياله." },
    ],
    achievements: [
      "فتح الأناضول وفتح أبوابها لأتراك السلاجقة ثمّ العثمانيين.",
      "تأسيس المدارس النظامية مع نظام الملك.",
      "أسر إمبراطور بيزنطة في معركة واحدة.",
    ],
    campaignEras: ["seljuk"],
    battles: [
      { name: "ملاذكرد", year: "٤٦٣ هـ", place: "شرق الأناضول", outcome: "أسر الإمبراطور" },
    ],
    artifactIds: ["seljuk-helmet"],
    regionIds: ["khorasan", "anatolia"],
    relatedCharacterIds: ["fatih", "salahuddin"],
    quotes: [
      { text: "ما رفعتُ رأسي يومًا متكبّرًا إلّا اليوم، فأذلّني الله بحجّامٍ أسير." },
    ],
  },

  muawiya: {
    id: "muawiya",
    fullName: "معاوية بن أبي سفيان الأموي",
    epithet: "مؤسّس الأمويين · أمير البحر",
    lifespan: "٢٠ ق.هـ – ٦٠ هـ / ٦٠٢ – ٦٨٠ م",
    birthplace: "مكّة",
    resting: "دمشق",
    heroGradient: "from-cyan-900/70 via-cyan-700/30 to-transparent",
    accentToken: "cyan",
    tagline: "السياسيّ الذي نقل العاصمة إلى دمشق وبنى أوّل أسطول في الإسلام.",
    bioLong: [
      "كاتبٌ لرسول الله ﷺ، ووالٍ على الشام عشرين سنة قبل الخلافة.",
      "أسّس الدولة الأموية عام ٤١ هـ بعد عام الجماعة، واتّخذ دمشق عاصمة.",
      "أنشأ أوّل أسطولٍ بحري إسلامي، ففتح قبرص ورودس وعبر إلى القسطنطينية.",
      "نظّم الديوان والبريد والحرس، وأرسى نظام الولاية المستقرّ.",
    ],
    timeline: [
      { year: "١٨ هـ", event: "ولاية الشام." },
      { year: "٢٨ هـ", event: "فتح قبرص ببحريّته." },
      { year: "٤١ هـ", event: "عام الجماعة وتأسيس الدولة الأموية." },
      { year: "٦٠ هـ", event: "وفاته." },
    ],
    achievements: [
      "تأسيس أوّل دولة وراثيّة في الإسلام.",
      "إنشاء البحرية الإسلامية.",
      "تنظيم الإدارة والبريد والحرس.",
    ],
    campaignEras: ["umayyad"],
    battles: [
      { name: "ذات الصواري", year: "٣٤ هـ", place: "شرق المتوسط", outcome: "نصرٌ بحري ساحق" },
    ],
    artifactIds: ["umayyad-dinar"],
    regionIds: ["sham", "hijaz", "anatolia"],
    relatedCharacterIds: ["tariq", "omar"],
    quotes: [
      { text: "لو أنّ بيني وبين الناس شعرةً ما انقطعت: إذا مدّوها أرخيتها، وإذا أرخوها مددتها." },
    ],
  },
};

// alias-friendly id helper
export function getCharacterProfile(id: string): CharacterProfile | undefined {
  return CHARACTER_PROFILES[id] ?? CHARACTER_PROFILES[id.replace(/-/g, "_")];
}

// ============================================================
// FOG OF HISTORY — mysterious clues shown for locked content
// ============================================================
export interface FogHint { title: string; clue: string }
export const FOG_HINTS: Record<string, FogHint> = {
  // Characters
  khalid:       { title: "قائدٌ لم يُهزم",         clue: "سيفٌ سُلَّ من غمده فلم يُكسر، وغيّر مصير إمبراطوريّتين." },
  omar:         { title: "خليفةٌ من حديد",          clue: "تحت عدله فُتحت أعظم المدن، ومنه ابتدأ تقويم أمّة." },
  muawiya:      { title: "مؤسّسٌ في الظلّ",         clue: "نقل عاصمة الإسلام، وأطلق أوّل أسطولٍ في تاريخه." },
  tariq:        { title: "فاتحٌ أحرق سفنه",         clue: "عبر بحرًا فسُمّي على اسمه إلى الأبد." },
  harun:        { title: "خليفة الذهب والعلم",      clue: "في بلاطه التقى الشعر والترجمة وملوك الغرب." },
  khwarizmi:    { title: "أبو علمٍ صار اسمًا",       clue: "اسمه يُهمَس كلّ يومٍ في كلّ حاسوبٍ على الأرض." },
  "ibn-rushd":  { title: "فيلسوفٌ في الغرب",         clue: "أعاد أرسطو إلى أوروبا من بوّابة قرطبة." },
  abdurrahman:  { title: "أميرٌ هاربٌ مؤسّسٌ",       clue: "نجا من المذبحة وأقام دولةً في أقصى الأرض." },
  "alp-arslan": { title: "بطلٌ من السهوب",           clue: "أسر إمبراطورًا وفتح بابًا لم يُغلق بعدها." },
  salahuddin:   { title: "محرّر الحرم الثالث",      clue: "أعاد الأذان إلى مسجدٍ صمت ٨٨ عامًا." },
  baybars:      { title: "أسدٌ من الرقيق",          clue: "كان عبدًا فصار سلطانًا، وكسر المغول والصليبيين معًا." },
  fatih:        { title: "الفاتح الموعود",          clue: "تحقّقت على يديه بشارةٌ نبويّة عمرها ٨ قرون." },

  // Artifacts & manuscripts
  "kaaba-kiswa":         { title: "نسيجٌ مقدّس",        clue: "قطعةٌ تُكسى بها أقدس بقعةٍ على وجه الأرض." },
  "yarmouk-sword":       { title: "سيفٌ من معركة فاصلة", clue: "ارتوى من ماء نهرٍ كسر ظهر الروم." },
  "rashidun-dinar":      { title: "أوّل العملة",        clue: "ذهبٌ ضُرب فجر الخلافة." },
  "umayyad-dinar":       { title: "ذهبٌ سياديّ",         clue: "أوّل دينارٍ كتب عليه اسم الله بدل صور الملوك." },
  "baghdad-manuscript":  { title: "مخطوطٌ من بيتٍ ضائع", clue: "نجا حين أُلقيت الكتب في النهر فاسودّ ماؤه." },
  "khwarizmi-jabr":      { title: "كتابٌ أسّس علمًا",    clue: "من جذره نبت اسمٌ يحمله نصف الرياضيات." },
  "cordoba-key":         { title: "مفتاحٌ من قصرٍ سحيق", clue: "فُتح به بابٌ في مدينةٍ كانت ضوء أوروبا." },
  "alhambra-tile":       { title: "نقشٌ هندسيّ",         clue: "آخر همسةٍ من جمال الأندلس الزائل." },
  "seljuk-helmet":       { title: "خوذة فارسٍ من السهوب", clue: "حملها فارسٌ يوم أُسر إمبراطور الروم." },
  "hattin-banner":       { title: "رايةٌ رُفعت فوق القدس", clue: "خفقت في أوّل يوم عاد فيه الأذان للأقصى." },
  "ain-jalut-arrow":     { title: "سهمٌ كسر أسطورة",     clue: "أُطلق في كمينٍ أوقف زحف نارٍ لم يوقفها أحد." },
  "mamluk-quran":        { title: "مصحفٌ مذهّب",         clue: "خُطّ بأيدٍ مملوكيّةٍ في عاصمةٍ على النيل." },
  "fatih-cannon":        { title: "مدفعٌ هدّ أسوارًا",    clue: "كسر جدارًا ظنّ العالم أنّه أبدي." },
  "ottoman-tughra":      { title: "توقيعٌ سلطاني",        clue: "خطٌّ واحدٌ كان يحرّك ثلاث قارّات." },
  "aqsa-stone":          { title: "حجرٌ من حرمٍ شريف",    clue: "شَهِد ترميمًا بعد قرنٍ من الاحتلال." },
  "nahda-pen":           { title: "قلمٌ أيقظ أمّة",      clue: "بمداده وُلدت يقظةٌ عربيّة في زمن السبات." },
  "salah-letter":        { title: "رسالةٌ من سلطان",     clue: "خُتمت بختمٍ غيّر مصير معركة." },
  "nuruddin-minbar":     { title: "منبرٌ ينتظر القدس",    clue: "نُحت قبل التحرير بعقود، فوُضع يوم الفتح." },
  "hattin-map":          { title: "خريطة سهلٍ قاحل",     clue: "رسمها قائدٌ ليستدرج جيشًا إلى عطشه." },
  "doc-jerusalem-khutba": { title: "خطبةٌ من على منبر",   clue: "ألقاها قاضٍ في مسجدٍ غاب عنه الأذان طويلًا." },
  "doc-crusades":        { title: "وثيقةٌ من زمن الحملات", clue: "تروي وجهًا آخر للحرب المقدّسة." },

  // Battles
  "b-badr":          { title: "معركةٌ تنزّل فيها النصر", clue: "ثلاثمئةٍ هزموا ألفًا في وادٍ بين جبلين." },
  "b-yarmouk":       { title: "ستّة أيّامٍ كسرت إمبراطوريّة", clue: "ريحٌ هبّت في الوقت الصحيح فحسمت قارّة." },
  "b-qadisiyyah":    { title: "معركة أنهت عرشًا",         clue: "أربعة أيّامٍ أسقطت تاجًا عمره أربعة قرون." },
  "b-manzikert":     { title: "بوّابةٌ فُتحت إلى الأبد",   clue: "أُسر فيها إمبراطورٌ، ومنها دخل قومٌ جدد إلى أرضٍ قديمة." },
  "b-hattin":        { title: "يومٌ عاد فيه الأذان",      clue: "عطشٌ ونارٌ في سهلٍ قاحلٍ غيّرا مصير مدينةٍ مقدّسة." },
  "b-ain-jalut":     { title: "نهاية أسطورة",             clue: "أوّل مرّةٍ يُهزم فيها جيشٌ ظنّ العالم أنّه لا يُقهر." },
  "b-constantinople":{ title: "حلمٌ نبويّ تحقّق",          clue: "سفنٌ مشت فوق التلال، وأسوارٌ سقطت بعد ٨ قرون." },

  // Landmarks
  "l-kaaba":     { title: "بيتٌ عتيق",          clue: "أوّل بيتٍ وُضع للناس، تتّجه إليه قلوب الأمّة." },
  "l-aqsa":      { title: "حرمٌ مباركٌ",         clue: "أولى القبلتين، ومسرى نبيٍّ في ليلةٍ واحدة." },
  "l-umayyad":   { title: "جامعٌ في عاصمةٍ قديمة", clue: "تحفةُ خليفةٍ بناها على أنقاض كنيسةٍ ومعبد." },
  "l-bait-hikma":{ title: "بيتٌ لا تطفأ مصابيحه",   clue: "ترجم فيه العالم القديم إلى لغةٍ واحدة." },
  "l-zahra":     { title: "مدينةٌ من المرايا",     clue: "بناها خليفةٌ لمحبوبته، فأشعّت ثمّ احترقت." },
  "l-alhambra":  { title: "قصرٌ على تلٍّ أحمر",     clue: "آخر ما بقي من زهرة الغرب الإسلامي." },
  "l-ayasofya":  { title: "قبّةٌ شهدت تحوّلًا",     clue: "صلّى فيها فاتحٌ شابٌّ أوّل جمعة بعد الفتح." },
  "l-samarkand": { title: "ساحةٌ على طريق الحرير",  clue: "مدارسٌ ثلاث تنظر بعضها بعضًا منذ قرون." },
};

export function fogHint(id: string): FogHint {
  return FOG_HINTS[id] ?? { title: "أثرٌ في الضباب", clue: "اكشف ضباب التاريخ لتعرف هويّته." };
}

// ============================================================
// LEGENDARY BATTLE PROFILES
// ============================================================
export interface BattleSide { name: string; commander: string; strength: string; flag: string }
export interface BattlePhase { phase: string; detail: string }
export interface BattleDecision { question: string; chose: string; impact: string }
export interface BattleProfile {
  id: string;
  name: string;
  subtitle: string;
  era: Era;
  year: string;
  hijri: string;
  location: string;
  coords?: { x: number; y: number };
  heroGradient: string;
  hero: string; // emoji glyph
  overview: string[];
  sides: BattleSide[];
  timeline: BattlePhase[];
  decisions: BattleDecision[];
  outcome: string[];
  impact: string[];
  relatedCharacterIds: string[];
  relatedRegionIds: string[];
  relatedArtifactIds: string[];
  campaignEras: Era[];
  storyId?: string;
}

export const BATTLE_PROFILES: Record<string, BattleProfile> = {
  "b-badr": {
    id: "b-badr", name: "بدر الكبرى", subtitle: "يوم الفرقان",
    era: "seerah", year: "٦٢٤ م", hijri: "١٧ رمضان ٢ هـ",
    location: "وادي بدر · الحجاز", coords: { x: 50, y: 60 },
    heroGradient: "from-amber-500/40 via-gold/20 to-transparent", hero: "🌟",
    overview: [
      "أوّل معركةٍ فاصلة في تاريخ الإسلام، التقى فيها ٣١٣ من المسلمين بـ ١٠٠٠ من قريش.",
      "نزل المسلمون عند الماء، وحُرم العدوّ منه، فكانت الأرض والسماء معهم.",
    ],
    sides: [
      { name: "المسلمون", commander: "النبي محمد ﷺ", strength: "٣١٣ مقاتلًا · ٧٠ بعيرًا · فرسان", flag: "🟢" },
      { name: "قريش",     commander: "أبو جهل بن هشام", strength: "نحو ١٠٠٠ مقاتل · ١٠٠ فرس · ٧٠٠ بعير", flag: "⚫" },
    ],
    timeline: [
      { phase: "قبل المعركة", detail: "خرج المسلمون لاعتراض قافلة أبي سفيان، فنجت القافلة وأقبل جيش قريش." },
      { phase: "اختيار الموقع", detail: "أشار الحُباب بن المنذر بالنزول عند أدنى ماءٍ من بدر وتغوير الآبار." },
      { phase: "المبارزة", detail: "برز حمزة وعليّ وعبيدة، فقتلوا ثلاثة من فرسان قريش." },
      { phase: "الالتحام", detail: "اشتدّ القتال وأمدّ الله المؤمنين بألفٍ من الملائكة." },
      { phase: "الحسم",     detail: "قُتل أبو جهل، وانهارت قريش، وأُسر سبعون من زعمائها." },
    ],
    decisions: [
      { question: "أين ننزل؟", chose: "عند أدنى ماء بدر مع تغوير ما سواه", impact: "حرم العدوّ من الماء في يومٍ شديد الحرّ." },
      { question: "كيف نواجه الفارق العددي؟", chose: "صفوفٌ مرصوصة ودعاءٌ في العريش", impact: "حافظ على الانضباط حتى نزل النصر." },
    ],
    outcome: [
      "نصرٌ ساحق رغم الفارق العددي ٣ إلى ١.",
      "قُتل صناديد قريش وأُسر سبعون، فُودي بعضهم بتعليم أبناء المسلمين.",
    ],
    impact: [
      "تحوّل ميزان القوى في الجزيرة لصالح المدينة.",
      "أُنزل في شأنها سورة الأنفال.",
      "صارت ميزانًا للتمييز بين أهل بدرٍ وغيرهم في الفضل.",
    ],
    relatedCharacterIds: ["omar"], relatedRegionIds: ["hijaz"], relatedArtifactIds: ["kaaba-kiswa"],
    campaignEras: ["seerah"],
  },

  "b-yarmouk": {
    id: "b-yarmouk", name: "اليرموك", subtitle: "اليوم الذي كُسر فيه الروم",
    era: "rashidun", year: "٦٣٦ م", hijri: "رجب ١٥ هـ",
    location: "ضفاف نهر اليرموك · حوران", coords: { x: 56, y: 52 },
    heroGradient: "from-rose-500/30 via-gold/20 to-transparent", hero: "⚔️",
    overview: [
      "ستّة أيّامٍ من القتال على ضفاف نهر اليرموك، حسمت مصير الشام.",
      "أعاد خالد بن الوليد تنظيم الجيش إلى كراديس صغيرة سريعة الحركة، وكسر جيشًا أضعافه.",
    ],
    sides: [
      { name: "المسلمون", commander: "خالد بن الوليد", strength: "نحو ٣٦ ألفًا", flag: "🟢" },
      { name: "بيزنطة",  commander: "ماهان الأرمني",    strength: "بين ١٠٠ و٢٠٠ ألف", flag: "🟡" },
    ],
    timeline: [
      { phase: "اليوم الأول", detail: "اشتباكاتٌ تمهيدية لاختبار خطوط العدوّ." },
      { phase: "أيام أرماث وأغواث",  detail: "هجماتٌ بيزنطيّة متتالية يصدّها خالد بكراديسه." },
      { phase: "ليلة الهرير",  detail: "قتالٌ ليليّ مرير في الظلام." },
      { phase: "اليوم الأخير", detail: "هبّت ريحٌ في وجوه الروم، فهجم خالد هجومًا كاسحًا." },
      { phase: "الانكسار",     detail: "انهار الروم في الوديان وغرق كثيرٌ منهم في نهر الرقاد." },
    ],
    decisions: [
      { question: "هل ننسحب أمام جيشٍ أضعاف؟", chose: "نقاتل ونعيد تنظيم الكراديس", impact: "حافظ على روح الجيش وضرب العدوّ بسرعةٍ ومرونة." },
      { question: "هل ننتظر النجدة من المدينة؟", chose: "نحسم الأمر هنا والآن", impact: "استثمر الريح والتفوّق المعنويّ في اليوم السادس." },
    ],
    outcome: [
      "هزيمةٌ ساحقة للروم وانهيار جيشهم في الشام.",
      "فُتحت دمشق وبيت المقدس وحمص وأنطاكية تباعًا.",
    ],
    impact: [
      "انتهت سيطرة بيزنطة على بلاد الشام إلى الأبد.",
      "تحوّلت الشام إلى قلب الخلافة الراشدة ثم الأمويّة.",
      "تُدرَّس اليوم في الأكاديميات العسكرية حول العالم.",
    ],
    relatedCharacterIds: ["khalid", "omar"], relatedRegionIds: ["sham"], relatedArtifactIds: ["yarmouk-sword"],
    campaignEras: ["rashidun"], storyId: "yarmouk",
  },

  "b-qadisiyyah": {
    id: "b-qadisiyyah", name: "القادسية", subtitle: "نهاية الأكاسرة",
    era: "rashidun", year: "٦٣٦ م", hijri: "١٥ هـ",
    location: "سهل القادسية · جنوب الكوفة", coords: { x: 60, y: 54 },
    heroGradient: "from-fuchsia-500/30 via-gold/20 to-transparent", hero: "🏹",
    overview: [
      "أربعة أيّامٍ من القتال أنهت إمبراطوريّة دامت أربعة قرون.",
      "قاد سعد بن أبي وقّاص الجيش من فوق فراشه مريضًا، وكتب النصر للمسلمين.",
    ],
    sides: [
      { name: "المسلمون", commander: "سعد بن أبي وقّاص", strength: "نحو ٣٠ ألفًا", flag: "🟢" },
      { name: "الفرس",   commander: "رستم فرّخزاد",       strength: "نحو ١٢٠ ألفًا · فيلة", flag: "🔴" },
    ],
    timeline: [
      { phase: "يوم أرماث", detail: "هجوم الفيلة الفارسيّة يربك خيل المسلمين." },
      { phase: "يوم أغواث", detail: "وصلت إمدادات الشام، فهاجم المسلمون الفيلة بالنبال." },
      { phase: "يوم عِماس", detail: "اشتدّ القتال، وقُتلت أعداد كبيرة من الطرفين." },
      { phase: "ليلة الهرير", detail: "قتالٌ متواصلٌ بلا توقّفٍ طوال الليل." },
      { phase: "الحسم", detail: "هبّت ريحٌ على خيمة رستم فسقطت، فقُتل وانهار جيشه." },
    ],
    decisions: [
      { question: "كيف نواجه الفيلة؟", chose: "قطع خراطيمها واستهداف عيونها", impact: "أبطل أخطر أسلحة الفرس." },
      { question: "هل نمنح الجيش راحة؟", chose: "ندفع بالقتال طوال الليل", impact: "أنهك العدوّ وكسر مقاومته في الصباح." },
    ],
    outcome: [
      "مقتل القائد رستم وانهيار الجيش الفارسي.",
      "فُتحت المدائن عاصمة الساسانيين بعد أشهر.",
    ],
    impact: [
      "زوال الإمبراطوريّة الساسانيّة بعد قرونٍ من الحكم.",
      "دخول العراق وفارس في حضارة الإسلام.",
      "ميلاد مدنٍ جديدة كالكوفة والبصرة.",
    ],
    relatedCharacterIds: ["omar"], relatedRegionIds: ["iraq", "persia"], relatedArtifactIds: ["rashidun-dinar"],
    campaignEras: ["rashidun"], storyId: "qadisiyyah",
  },

  "b-manzikert": {
    id: "b-manzikert", name: "ملاذكرد", subtitle: "بوّابة الأناضول تُفتح",
    era: "seljuk", year: "١٠٧١ م", hijri: "٤٦٣ هـ",
    location: "ملاذكرد · شرق الأناضول", coords: { x: 58, y: 46 },
    heroGradient: "from-emerald-500/30 via-gold/20 to-transparent", hero: "🛡️",
    overview: [
      "معركةٌ غيّرت وجه الشرق إلى الأبد، حين أسر ألب أرسلان إمبراطور الروم رومانوس الرابع.",
      "فُتح بعدها باب الأناضول للترك المسلمين، ومهّدت الطريق لقيام الدولة العثمانيّة لاحقًا.",
    ],
    sides: [
      { name: "السلاجقة", commander: "ألب أرسلان", strength: "نحو ٤٠ ألف فارس", flag: "🟢" },
      { name: "بيزنطة",  commander: "رومانوس الرابع ديوجين", strength: "نحو ٧٠ ألفًا", flag: "🟡" },
    ],
    timeline: [
      { phase: "قبل المعركة", detail: "خرج رومانوس بحملةٍ ضخمة لاستعادة الأناضول." },
      { phase: "العرض",  detail: "عرض ألب أرسلان الصلح فرفض الإمبراطور بكبرياء." },
      { phase: "الكمين", detail: "تظاهر السلاجقة بالانسحاب، فطاردهم الروم إلى أرضٍ مكشوفة." },
      { phase: "الهجوم", detail: "انقضّت الفرسان السلجوقيّة من كلّ جهة على الجيش المتعب." },
      { phase: "الأسر", detail: "أُسر الإمبراطور وقُدّم لألب أرسلان فعفا عنه." },
    ],
    decisions: [
      { question: "هل نعرض الصلح؟", chose: "نعم، صلحًا مشرّفًا قبل القتال", impact: "حفظ مكانة السلطان ومنح ذريعة شرعيّة للقتال." },
      { question: "كيف نواجه التفوّق العددي؟", chose: "الانسحاب التكتيكيّ والكمين", impact: "استدرج العدوّ إلى أرض المعركة المختارة." },
    ],
    outcome: [
      "أسر إمبراطور الروم لأوّل مرّة في التاريخ.",
      "انهيار الجيش البيزنطي في الأناضول.",
    ],
    impact: [
      "بدأت هجرة القبائل التركيّة إلى الأناضول.",
      "تأسّست لاحقًا سلطنة سلاجقة الروم.",
      "تمهيدٌ لقيام الدولة العثمانيّة بعد قرنين.",
    ],
    relatedCharacterIds: ["alp-arslan"], relatedRegionIds: ["anatolia"], relatedArtifactIds: ["seljuk-helmet"],
    campaignEras: ["seljuk"],
  },

  "b-hattin": {
    id: "b-hattin", name: "حِطّين", subtitle: "اليوم الذي عاد فيه الأذان",
    era: "ayyubid", year: "١١٨٧ م", hijri: "٢٤ ربيع الآخر ٥٨٣ هـ",
    location: "سهل حِطّين · شمال طبريّة", coords: { x: 56, y: 50 },
    heroGradient: "from-gold/40 via-amber-500/20 to-transparent", hero: "🕌",
    overview: [
      "استدرج صلاح الدين الجيش الصليبي إلى سهلٍ قاحلٍ في حرّ تموز بلا ماء.",
      "أحرق الأعشاب اليابسة حول العدوّ، فاختنق وانهار، ومُهّد الطريق لتحرير القدس بعد أشهر.",
    ],
    sides: [
      { name: "الأيوبيون", commander: "السلطان صلاح الدين الأيوبي", strength: "نحو ٣٠ ألفًا · فرسان وخيّالة سريعة", flag: "🟢" },
      { name: "مملكة بيت المقدس الصليبيّة", commander: "غاي دي لوزنيان · ريموند الثالث", strength: "نحو ٢٠ ألفًا · ١٢٠٠ فارس مدرّع", flag: "✝️" },
    ],
    timeline: [
      { phase: "الاستفزاز",  detail: "حاصر صلاح الدين طبرية ليجرّ الجيش الصليبي بعيدًا عن مياهه." },
      { phase: "الزحف",     detail: "زحف الصليبيون في يومٍ شديد الحرّ بلا ماءٍ كافٍ." },
      { phase: "الحصار",    detail: "أحاطت الفرسان المسلمة بهم وأشعلت النار في الأعشاب." },
      { phase: "الانهيار", detail: "تفكّك الجيش الصليبي عند قرني حِطّين وسقطت رايتهم." },
      { phase: "الأسر",    detail: "أُسر الملك غاي ورينو دي شاتيون، وأُعدم رينو لنقضه العهود." },
    ],
    decisions: [
      { question: "أين نختار أرض المعركة؟", chose: "سهلٌ قاحلٌ بلا ماء", impact: "حرم الصليبيين من المياه والمأوى." },
      { question: "ماذا نفعل بأسرى النبلاء؟", chose: "العفو عن الملك وإعدام ناقضي العهود", impact: "أرسى صورة الفروسيّة الإسلاميّة في الذاكرة الأوروبيّة." },
    ],
    outcome: [
      "سحقٌ تامٌّ للجيش الصليبي وأسر ملكهم.",
      "سقطت قلاع الصليبيين تباعًا: عكّا، صيدا، بيروت، عسقلان.",
    ],
    impact: [
      "تحرير القدس بعد ٨٨ عامًا من الاحتلال الصليبي.",
      "إعادة الأذان والصلاة إلى المسجد الأقصى.",
      "إطلاق الحملة الصليبيّة الثالثة بقيادة ريتشارد قلب الأسد.",
    ],
    relatedCharacterIds: ["salahuddin"], relatedRegionIds: ["sham", "egypt"], relatedArtifactIds: ["hattin-banner", "hattin-map", "salah-letter", "nuruddin-minbar"],
    campaignEras: ["ayyubid"], storyId: "hattin",
  },

  "b-ain-jalut": {
    id: "b-ain-jalut", name: "عين جالوت", subtitle: "نهاية أسطورة المغول",
    era: "mamluk", year: "١٢٦٠ م", hijri: "٢٥ رمضان ٦٥٨ هـ",
    location: "عين جالوت · شمال فلسطين", coords: { x: 56, y: 52 },
    heroGradient: "from-amber-600/40 via-gold/20 to-transparent", hero: "🦁",
    overview: [
      "بعد سقوط بغداد بعامين، زحف المغول نحو مصر، فلم يقف في وجههم سوى المماليك.",
      "استدرج بيبرس مقدّمة المغول إلى كمين، وحقّق قطز أوّل هزيمةٍ كبرى لجيشٍ ظنّ العالم أنّه لا يُقهر.",
    ],
    sides: [
      { name: "المماليك",  commander: "السلطان قطز · الظاهر بيبرس", strength: "نحو ٢٠ ألفًا", flag: "🟢" },
      { name: "المغول",    commander: "كتبغا نوين",                  strength: "نحو ١٠–٢٠ ألفًا", flag: "⚪" },
    ],
    timeline: [
      { phase: "الإنذار",   detail: "وصل رسل هولاكو يهدّدون قطز، فأعدمهم وعلّق رؤوسهم على أبواب القاهرة." },
      { phase: "التحالف",   detail: "حصل المماليك على ممرٍّ من الصليبيين عبر الساحل." },
      { phase: "الكمين",    detail: "تظاهر بيبرس بالانسحاب فطاردته فرقة كتبغا إلى الكمين." },
      { phase: "الالتحام", detail: "هجم قطز نازلًا عن فرسه صائحًا «وا إسلاماه»." },
      { phase: "الحسم",     detail: "قُتل كتبغا، وانهار الجيش المغولي، ولم يعد ليجمع شتاته." },
    ],
    decisions: [
      { question: "هل نواجه المغول أم ننسحب جنوبًا؟", chose: "نتقدّم إلى فلسطين ونلتقيهم هناك", impact: "أوقف الزحف قبل أن يصل إلى مصر." },
      { question: "كيف نواجه فرسان السهوب؟", chose: "كمينٌ يستدرجهم إلى تضاريس مغلقة", impact: "ألغى تفوّقهم في المناورة." },
    ],
    outcome: [
      "أوّل هزيمةٍ كبرى للمغول في تاريخهم.",
      "تحرير الشام بعد أسابيع من المعركة.",
    ],
    impact: [
      "حُفظت مصر والشام والإسلام من المصير الذي لقيته بغداد.",
      "تحوّل المماليك إلى القوّة العظمى في المنطقة لقرنين ونصف.",
      "كُسرت هيبة المغول العسكريّة في وعي العالم.",
    ],
    relatedCharacterIds: ["baybars"], relatedRegionIds: ["egypt", "sham"], relatedArtifactIds: ["ain-jalut-arrow", "mamluk-quran"],
    campaignEras: ["mamluk"], storyId: "ain-jalut",
  },

  "b-constantinople": {
    id: "b-constantinople", name: "فتح القسطنطينية", subtitle: "بشارة النبي ﷺ تتحقّق",
    era: "ottoman", year: "١٤٥٣ م", hijri: "٢٠ جمادى الأولى ٨٥٧ هـ",
    location: "القسطنطينية · مضيق البوسفور", coords: { x: 55, y: 47 },
    heroGradient: "from-rose-600/30 via-gold/30 to-transparent", hero: "🏰",
    overview: [
      "حاصر السلطان محمد الثاني المدينة وعمره ٢١ سنة، بعد أن جهّز أعظم مدافع عصره.",
      "نقل أسطوله فوق التلال إلى القرن الذهبي، واقتحم أسوارًا صمدت ١١٠٠ عامٍ في فجر الثلاثاء ٢٩ مايو.",
    ],
    sides: [
      { name: "العثمانيون", commander: "السلطان محمد الثاني الفاتح", strength: "نحو ٨٠ ألفًا · مدفع أورپان · أسطول ١٢٦ سفينة", flag: "🟢" },
      { name: "بيزنطة",    commander: "قسطنطين الحادي عشر",         strength: "نحو ٧٠٠٠ مدافع · ٢٦ سفينة", flag: "🟡" },
    ],
    timeline: [
      { phase: "التحضير",  detail: "بناء قلعة روملي حصار للسيطرة على البوسفور." },
      { phase: "بدء الحصار", detail: "في ٦ أبريل ١٤٥٣ بدأ القصف بمدفع أورپان الضخم." },
      { phase: "نقل السفن", detail: "ليلًا، جُرّت ٧٠ سفينة فوق التلال إلى القرن الذهبي." },
      { phase: "الاقتحام النهائي", detail: "فجر ٢٩ مايو، اقتحم الإنكشاريّة الثغرات بقيادة أولوباطلي حسن." },
      { phase: "السقوط", detail: "سقطت المدينة، ودخلها الفاتح يوم الثلاثاء فصلّى في آيا صوفيا." },
    ],
    decisions: [
      { question: "كيف نتجاوز سلسلة القرن الذهبي؟", chose: "ننقل السفن برًّا فوق التلال", impact: "أحدث صدمةً نفسيّة كسرت روح المدافعين." },
      { question: "ماذا نفعل بأهل المدينة بعد الفتح؟", chose: "أمانٌ للسكان وحرّيةٌ للأديان", impact: "حفظ المدينة وحوّلها إلى عاصمةٍ متعدّدة الثقافات." },
    ],
    outcome: [
      "سقوط الإمبراطوريّة البيزنطيّة بعد ١١٠٠ سنة.",
      "تحوّلت القسطنطينية إلى إسطنبول عاصمة الدولة العثمانيّة.",
    ],
    impact: [
      "تحقّقت بشارة النبي ﷺ: «لتفتحنّ القسطنطينية فلَنعم الأمير أميرها».",
      "انتقلت العديد من المخطوطات إلى أوروبا، فسرّعت عصر النهضة.",
      "صار البحر المتوسّط بحيرةً عثمانيّة لقرون.",
    ],
    relatedCharacterIds: ["fatih"], relatedRegionIds: ["anatolia"], relatedArtifactIds: ["fatih-cannon", "ottoman-tughra"],
    campaignEras: ["ottoman"], storyId: "constantinople",
  },
};

export function getBattleProfile(id: string): BattleProfile | undefined {
  return BATTLE_PROFILES[id];
}

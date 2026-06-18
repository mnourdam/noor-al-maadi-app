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
}

export const ON_THIS_DAY: OnThisDay[] = [
  { id: "d1", monthDay: "01-15", year: "٧٥٦م", era: "andalus", title: "تأسيس إمارة الأندلس الأموية", detail: "دخل عبد الرحمن الداخل قرطبة وأسّس الدولة الأموية في الأندلس." },
  { id: "d2", monthDay: "02-10", year: "٦٥٦هـ/١٢٥٨م", era: "abbasid", title: "سقوط بغداد على يد هولاكو", detail: "اقتحم المغول بغداد وأنهَوا الخلافة العباسية، وأُلقيت كتب بيت الحكمة في دجلة." },
  { id: "d3", monthDay: "03-12", year: "٦٢٤م", era: "seerah", title: "غزوة بدر الكبرى", detail: "أول معركة فاصلة في تاريخ الإسلام، انتصر فيها ٣١٣ مسلمًا على ١٠٠٠ مشرك." },
  { id: "d4", monthDay: "04-06", year: "١٤٥٣م", era: "ottoman", title: "بداية حصار القسطنطينية", detail: "بدأ السلطان محمد الفاتح حصار المدينة الذي استمر ٥٣ يومًا حتى فتحها." },
  { id: "d5", monthDay: "04-26", year: "٧١١م", era: "andalus", title: "معركة وادي لكّة", detail: "هزم طارق بن زياد القوط بقيادة لذريق، ففُتحت الأندلس." },
  { id: "d6", monthDay: "05-29", year: "١٤٥٣م", era: "ottoman", title: "فتح القسطنطينية", detail: "دخل محمد الفاتح المدينة وصلّى في آيا صوفيا، فتحقّقت بشارة النبي ﷺ." },
  { id: "d7", monthDay: "06-08", year: "٦٣٢م", era: "seerah", title: "وفاة النبي ﷺ", detail: "انتقل النبي محمد ﷺ إلى الرفيق الأعلى في المدينة المنورة." },
  { id: "d8", monthDay: "07-04", year: "١١٨٧م", era: "ayyubid", title: "معركة حِطّين", detail: "هزم صلاح الدين الصليبيين هزيمةً ساحقة، فُتح الطريق لتحرير القدس." },
  { id: "d9", monthDay: "08-10", year: "٦٣٦م", era: "rashidun", title: "بداية معركة اليرموك", detail: "ستة أيامٍ من القتال انتهت بهزيمة الروم وفتح الشام." },
  { id: "d10", monthDay: "09-03", year: "١٢٦٠م", era: "mamluk", title: "معركة عين جالوت", detail: "هزم قطز وبيبرس المغول لأول مرة، فحُفظت مصر والشام." },
  { id: "d11", monthDay: "10-02", year: "١١٨٧م", era: "ayyubid", title: "تحرير القدس", detail: "دخل صلاح الدين القدس صلحًا، وأُعيد الأذان إلى المسجد الأقصى." },
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
  return ON_THIS_DAY.find((e) => e.monthDay === key) ?? ON_THIS_DAY[(d.getDate() - 1) % ON_THIS_DAY.length];
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
}

export const MAP_REGIONS: MapRegion[] = [
  { id: "hijaz", name: "الحجاز", era: "seerah", x: 62, y: 58, capital: "مكة والمدينة", blurb: "مهد الإسلام.", cost: 0, unlocksArtifact: "kaaba-kiswa" },
  { id: "sham", name: "الشام", era: "rashidun", x: 58, y: 40, capital: "دمشق", blurb: "بوابة الفتوح الكبرى.", cost: 30 },
  { id: "iraq", name: "العراق", era: "abbasid", x: 65, y: 42, capital: "بغداد", blurb: "عاصمة الحضارة العباسية.", cost: 40, unlocksArtifact: "baghdad-manuscript" },
  { id: "egypt", name: "مصر", era: "ayyubid", x: 52, y: 50, capital: "القاهرة", blurb: "حامية الحرمين وقاهرة المغول.", cost: 40 },
  { id: "andalus", name: "الأندلس", era: "andalus", x: 18, y: 36, capital: "قرطبة", blurb: "زهرة الغرب الإسلامي.", cost: 60, unlocksArtifact: "cordoba-key" },
  { id: "anatolia", name: "الأناضول", era: "ottoman", x: 50, y: 28, capital: "إسطنبول", blurb: "عرش الخلافة العثمانية.", cost: 70, unlocksArtifact: "fatih-cannon" },
  { id: "khorasan", name: "خراسان", era: "seljuk", x: 80, y: 36, capital: "نيسابور", blurb: "موطن السلاجقة والعلماء.", cost: 60 },
  { id: "maghrib", name: "المغرب", era: "andalus", x: 30, y: 50, capital: "فاس", blurb: "جسر العبور إلى الأندلس.", cost: 50 },
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
  { level: 3, min: 280,  title: "راوي حكايا",    rank: "فضّي"   },
  { level: 4, min: 500,  title: "مؤرّخ",          rank: "فضّي"   },
  { level: 5, min: 800,  title: "عالم تاريخ",     rank: "ذهبي"   },
  { level: 6, min: 1200, title: "شيخ المؤرّخين", rank: "ذهبي"   },
  { level: 7, min: 1700, title: "حكيم الأمّة",   rank: "بلاتيني" },
  { level: 8, min: 2400, title: "إمام التاريخ",   rank: "بلاتيني" },
  { level: 9, min: 3200, title: "سيّد الحكايا",   rank: "أسطوري" },
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
}
export const CURRENT_SEASON: Season = {
  id: "season_jerusalem",
  name: "موسم القدس",
  tagline: "اجمع ٧٥٠ نقطة هذا الموسم لتنال لقب «من حُماة الأقصى».",
  goalPoints: 750,
  endsAt: "نهاية الشهر",
  reward: { points: 250, artifact: "aqsa-stone", title: "من حُماة الأقصى" },
};

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

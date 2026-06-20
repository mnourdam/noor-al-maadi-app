import type { CampaignDefinition } from "../types";

// ============================================================
// حملة عمر بن الخطاب — من الجزيرة إلى إمبراطورية العدل
// ------------------------------------------------------------
// Flagship Rashidun-era campaign. Bridges into Content Pack 007
// (Rashidun) entity ids where they exist; falls back to legacy
// data ids elsewhere. Replaces the placeholder Rashidun campaign.
// ============================================================

export const UMAR_FARUQ_CAMPAIGN: CampaignDefinition = {
  id: "umar-faruq",
  title: "حملة عمر بن الخطاب",
  subtitle: "من الجزيرة إلى إمبراطورية العدل",
  intro:
    "في عشر سنواتٍ، يقفز عمر بن الخطاب بدولةٍ ناشئةٍ في المدينة إلى إمبراطوريةٍ تمتدّ من برقة إلى خراسان، ويصوغ مفهوم العدلِ في الحكم لقرونٍ بعده. عشرة فصول تُلخّص أعظم خلافةٍ في تنظيم الدولة وفتح الأمصار.",
  difficulty: "hard",
  estimatedMinutes: [55, 75],
  packId: "pack-007-rashidun",
  flagship: true,
  order: 5,
  related: [
    { kind: "state",  id: "rashidun.state.rashidun", label: "الخلافة الراشدة" },
    { kind: "city",   id: "rashidun.city.jerusalem", label: "بيت المقدس" },
    { kind: "battle", id: "rashidun.battle.yarmouk", label: "اليرموك" },
    { kind: "battle", id: "rashidun.battle.qadisiyya", label: "القادسية" },
    { kind: "event",  id: "rashidun.event.umar-martyrdom", label: "استشهاد عمر" },
  ],
  chapters: [
    {
      id: "c1",
      index: 1,
      title: "سقيفة بني ساعدة",
      subtitle: "اليوم الذي حُفظت فيه الأمّة",
      intro:
        "في ظهيرة الإثنين الثاني عشر من ربيع الأوّل سنة 11هـ، تنتقل روح النبي ﷺ إلى الرفيق الأعلى. تضطرب المدينة، ويهرع الأنصار إلى سقيفة بني ساعدة. هناك يحسم عمرُ المشهدَ ببيعته لأبي بكر، فتُحفظ الدولة قبل أن تنهار.",
      body: [
        "وقف عمر مذهولًا أمام نبأ الوفاة، حتى صعد أبو بكر فقرأ: \"وما محمدٌ إلا رسول قد خلت من قبله الرسل\"، فثاب الناس إلى رشدهم.",
        "في السقيفة طُرح اسم سعد بن عبادة من الأنصار، فقام عمر فأخذ بيد أبي بكر وبايعه، فتتابع الناس على بيعته.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar",     label: "عمر بن الخطاب" },
        { kind: "character", id: "rashidun.figure.abu-bakr", label: "أبو بكر الصدّيق" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.medina", label: "المدينة" },
      ],
      events: [
        { kind: "event", id: "rashidun.event.prophet-death",  label: "وفاة النبي ﷺ" },
        { kind: "event", id: "rashidun.event.bayah-abu-bakr", label: "بيعة أبي بكر" },
      ],
      knowledgeCards: [
        {
          id: "k1-1", icon: "🕊️",
          title: "ثبات الفاروق",
          body: "حين أعلن أبو بكر: \"من كان يعبد محمدًا فإنّ محمدًا قد مات\"، انكسر سيف عمر، وبكى وأذعن. كان موقفًا حفظ الإيمانَ من أوّل اهتزاز.",
        },
      ],
      unlocks: { characters: ["omar"], packEntities: ["rashidun.event.bayah-abu-bakr"] },
      readingGate: true,
      xp: 120,
      quiz: {
        id: "q1", required: true, title: "اختبار سقيفة بني ساعدة",
        questions: [{
          id: "q1-1",
          question: "في أيِّ مكانٍ بايع الأنصار أبا بكر بعد وفاة النبي ﷺ؟",
          choices: ["المسجد النبوي", "سقيفة بني ساعدة", "بيت أبي بكر", "قباء"],
          correctIndex: 1,
          explanation: "اجتمع الأنصار في سقيفة بني ساعدة، فجاءهم عمر وأبو بكر وأبو عبيدة فحُسمت البيعة لأبي بكر.",
          xp: 25,
        }],
      },
    },
    {
      id: "c2",
      index: 2,
      title: "حروب الردة",
      subtitle: "أخطر لحظة بعد وفاة النبي ﷺ",
      intro:
        "ما إن تُويّج أبو بكر بالخلافة حتى ارتدّت قبائلُ العرب ومنعت الزكاة. يُجمع المسلمون على ترك القتال، ويقف أبو بكر وحده يقول: \"والله لو منعوني عقالًا كانوا يؤدّونه إلى رسول الله ﷺ لقاتلتُهم عليه\". وعمر شاهدُ هذه العزيمة.",
      body: [
        "أمّر أبو بكر أحد عشر لواءً، أعظمها لخالد بن الوليد لمواجهة طليحة الأسدي ومسيلمة الكذّاب.",
        "في يوم اليمامة قُتل من حفاظ القرآن سبعون، فاقترح عمر على أبي بكر جمع القرآن خشية أن يضيع.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.abu-bakr", label: "أبو بكر" },
        { kind: "character", id: "rashidun.figure.khalid",   label: "خالد بن الوليد" },
      ],
      events: [
        { kind: "event", id: "rashidun.event.ridda-wars",    label: "حروب الردة" },
        { kind: "event", id: "rashidun.event.collect-quran", label: "جمع القرآن" },
      ],
      knowledgeCards: [
        {
          id: "k2-1", icon: "⚔️",
          title: "يوم اليمامة",
          body: "أعنف معارك الردة. واجه خالدٌ مسيلمةَ الكذّاب في حديقة الموت، فقتله وحشيٌّ بنفس الرمح الذي قتل به حمزة، وعاد المسلمون منتصرين.",
        },
      ],
      unlocks: { characters: ["khalid"], packEntities: ["rashidun.event.ridda-wars"] },
      xp: 150,
      quiz: {
        id: "q2", required: true, title: "اختبار حروب الردة",
        questions: [{
          id: "q2-1",
          question: "مَن أعظم قادةِ حروب الردة الذي قضى على مسيلمة الكذّاب؟",
          choices: ["أبو عبيدة بن الجراح", "سعد بن أبي وقاص", "خالد بن الوليد", "عمرو بن العاص"],
          correctIndex: 2,
          explanation: "قاد خالد بن الوليد معركة اليمامة، فقُتل مسيلمة الكذّاب وانتهت حروب الردة.",
          xp: 30,
        }],
      },
    },
    {
      id: "c3",
      index: 3,
      title: "الخلافة الثانية",
      subtitle: "بداية عهد جديد",
      intro:
        "في جمادى الآخرة سنة 13هـ يُتوفّى أبو بكر، فيوصي بالخلافة لعمر بعد مشاورةٍ مع كبار الصحابة. يقف الفاروق على المنبر مُرتبكًا من ثقل الأمانة: \"إنّي أُعفيت من أمرين: الفيء، والقَسَم… ولا قوّة إلا بالله\".",
      body: [
        "اختار عمر لقب \"أمير المؤمنين\" بدلًا من \"خليفة خليفة رسول الله\"، فكان أوّل من تسمّى به.",
        "أرسى مبدأ المساءلة العلنيّة، حتى قال له رجلٌ على ملأ الناس: \"اتّقِ الله يا عمر\"، فقال: \"دعوه يقولها، لا خير فيكم إن لم تقولوها\".",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar",     label: "عمر" },
        { kind: "character", id: "rashidun.figure.abu-bakr", label: "أبو بكر" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.medina", label: "المدينة" },
      ],
      knowledgeCards: [
        {
          id: "k3-1", icon: "👑",
          title: "أمير المؤمنين",
          body: "أوّل من سُمّي بأمير المؤمنين عمر بن الخطاب، فصار اللقب علامة الخلافة من بعده إلى آخر دولة العثمانيين.",
        },
      ],
      unlocks: { packEntities: ["rashidun.figure.umar"] },
      readingGate: true,
      xp: 130,
      quiz: {
        id: "q3", required: true, title: "اختبار الخلافة الثانية",
        questions: [{
          id: "q3-1",
          question: "مَن أوّل من تسمّى بأمير المؤمنين؟",
          choices: ["أبو بكر الصدّيق", "عمر بن الخطاب", "عثمان بن عفان", "علي بن أبي طالب"],
          correctIndex: 1,
          explanation: "اختار عمر هذا اللقب فصار سنّة الخلفاء من بعده.",
          xp: 30,
        }],
      },
    },
    {
      id: "c4",
      index: 4,
      title: "اليرموك",
      subtitle: "يومٌ غيّر الشام",
      intro:
        "في رجب سنة 15هـ، يلتقي أربعون ألفًا من المسلمين بقيادة خالد بن الوليد وأبي عبيدة بنحو مئتي ألفٍ من جيش هرقل على ضفاف اليرموك. ستة أيامٍ من القتال تحت رياح الصحراء تنتهي بانهيار الجيش البيزنطي، ويُنزع الشامُ من الروم إلى الأبد.",
      body: [
        "عزل عمر خالدًا عن القيادة وولّى أبا عبيدة، فأخفى أبو عبيدة الكتاب حتى وضعت الحرب أوزارها كي لا تنكسر الهمم.",
        "حين بلغ هرقل خبر الهزيمة قال كلمته المشهورة: \"سلامٌ عليكِ يا سورية سلامًا لا لقاء بعده\".",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.khalid",      label: "خالد بن الوليد" },
        { kind: "character", id: "rashidun.figure.abu-ubaidah", label: "أبو عبيدة" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.damascus", label: "دمشق" },
        { kind: "city", id: "rashidun.city.homs",     label: "حمص" },
      ],
      events: [
        { kind: "battle", id: "rashidun.battle.yarmouk",       label: "معركة اليرموك" },
        { kind: "event",  id: "rashidun.event.conquest-sham",  label: "فتح الشام" },
      ],
      knowledgeCards: [
        {
          id: "k4-1", icon: "🗡️",
          title: "خدعة العاصفة",
          body: "في اليوم السادس هبّت ريحٌ شديدة في وجوه الروم، فاستثمرها خالد بهجومٍ من الكراديس أنهى المعركة.",
        },
      ],
      unlocks: {
        battles: ["yarmouk"],
        artifacts: ["faruq-armor"],
        packEntities: ["rashidun.battle.yarmouk", "rashidun.artifact.manuscript-yarmouk"],
      },
      xp: 200,
      quiz: {
        id: "q4", required: true, title: "اختبار اليرموك",
        questions: [{
          id: "q4-1",
          question: "أيُّ معركةٍ حسمت سقوط الشام في يد المسلمين؟",
          choices: ["أجنادين", "اليرموك", "القادسية", "نهاوند"],
          correctIndex: 1,
          explanation: "حسمت اليرموك سنة 15هـ سقوط الشام بعد ستة أيام من القتال.",
          xp: 40,
        }],
      },
    },
    {
      id: "c5",
      index: 5,
      title: "القادسية",
      subtitle: "نهاية إمبراطورية الفرس",
      intro:
        "أرسل عمر سعد بن أبي وقاص على رأس ثلاثين ألفًا لمواجهة رستم قائد الفرس في مئة وعشرين ألفًا. أربعة أيامٍ من القتال — أرماث وأغواث وعماس وليلة الهرير — تنتهي بمصرع رستم وانهيار جيش كسرى وفتح طريق المدائن.",
      body: [
        "كان سعدٌ مريضًا بعرق النَّسا، فقاد المعركة من فوق سطح القصر إشارةً وكتابةً، وأمر عمر أن يكون فيها المثنى ومن نجا من الجسر.",
        "هتف المسلمون \"يا منصور أمت\" حتى انكسر فيل رستم وفرّ جنده.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.sad-ibn-abi-waqqas", label: "سعد بن أبي وقاص" },
        { kind: "character", id: "rashidun.figure.muthanna",           label: "المثنى بن حارثة" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.kufa",  label: "الكوفة" },
        { kind: "city", id: "rashidun.city.basra", label: "البصرة" },
      ],
      events: [
        { kind: "battle", id: "rashidun.battle.qadisiyya",   label: "القادسية" },
        { kind: "event",  id: "rashidun.event.conquest-iraq", label: "فتح العراق" },
      ],
      knowledgeCards: [
        {
          id: "k5-1", icon: "🐘",
          title: "كسر الفِيَلَة",
          body: "خاف عربُ سعد من الفيلة، فعلّمهم كيف يصيبون عيونها وخراطيمها، فولّت ووطئت جند رستم.",
        },
      ],
      unlocks: {
        battles: ["qadisiyya"],
        artifacts: ["qadisiyya-banner"],
        packEntities: ["rashidun.battle.qadisiyya", "rashidun.artifact.manuscript-qadisiyya"],
      },
      xp: 200,
      quiz: {
        id: "q5", required: true, title: "اختبار القادسية",
        questions: [{
          id: "q5-1",
          question: "مَن قاد جيش المسلمين في معركة القادسية؟",
          choices: ["خالد بن الوليد", "سعد بن أبي وقاص", "أبو عبيدة", "عمرو بن العاص"],
          correctIndex: 1,
          explanation: "قاد سعد بن أبي وقاص معركة القادسية بأمر عمر بن الخطاب.",
          xp: 40,
        }],
      },
    },
    {
      id: "c6",
      index: 6,
      title: "فتح المدائن",
      subtitle: "كنوز كسرى في يد الفاروق",
      intro:
        "بعد القادسية يزحف سعدٌ على المدائن عاصمة الفرس. يجتاز جيشه دجلة سباحةً في مشهدٍ لم تشهد له العسكرية القديمة مثيلًا، فيدخلون إيوان كسرى ويصلّون فيه ركعتي الفتح. تُجمع الكنوز وتُحمل إلى عمر في المدينة.",
      body: [
        "حين رأى عمر كنوز كسرى مكدّسةً في المسجد بكى، فقال له عبد الرحمن بن عوف: \"إنّ هذا اليومَ يومُ سرور\". قال عمر: \"ما أُعطي قومٌ هذا إلّا ألقي بينهم العداوة والبغضاء\".",
        "وزّع عمر الكنوز على المسلمين وأبقى تاج كسرى وسواره في بيت المال شاهدًا على نهاية إمبراطورية.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.sad-ibn-abi-waqqas", label: "سعد" },
        { kind: "character", id: "rashidun.figure.umar",               label: "عمر" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.madain", label: "المدائن" },
      ],
      events: [
        { kind: "event", id: "rashidun.event.conquest-iraq", label: "فتح العراق" },
      ],
      knowledgeCards: [
        {
          id: "k6-1", icon: "👑",
          title: "إيوان كسرى",
          body: "أعظم قاعةٍ في العالم القديم. صلّى فيها سعدُ صلاة الفتح ثمانيَ ركعات، وقرأ: \"كم تركوا من جنّاتٍ وعيون\".",
        },
      ],
      unlocks: {
        artifacts: ["umar-ring"],
        packEntities: ["rashidun.city.madain"],
      },
      xp: 180,
      quiz: {
        id: "q6", required: true, title: "اختبار فتح المدائن",
        questions: [{
          id: "q6-1",
          question: "ما اسم عاصمة الفرس التي فتحها سعد بعد القادسية؟",
          choices: ["نهاوند", "تستر", "المدائن", "إصطخر"],
          correctIndex: 2,
          explanation: "المدائن عاصمة كسرى الساساني، فتحها سعد سنة 16هـ.",
          xp: 40,
        }],
      },
    },
    {
      id: "c7",
      index: 7,
      title: "فتح القدس",
      subtitle: "العهدة العمريّة",
      intro:
        "حاصر أبو عبيدةُ بيت المقدس، فاشترط البطريرك صفرونيوس أن يُسلّم المفاتيح للخليفة بنفسه. يقطع عمر الصحراء من المدينة على راحلةٍ يتعاقب عليها وعلى غلامه، فيدخل القدس في ثوبٍ خَلِق، ويكتب العهدة العمريّة أمانًا لأهلها على دمائهم وأموالهم وكنائسهم.",
      body: [
        "حين دعاه البطريرك للصلاة في كنيسة القيامة رفض وقال: \"لو صلّيتُ فيها لأخذها المسلمون من بعدي\"، فصلّى خارجها في موضع الجامع العمري اليوم.",
        "كشف عمر الصخرة المشرّفة من التراب الذي طمّها به البيزنطيون، وأمر ببناء مصلًّى للمسلمين هو نواة المسجد الأقصى المعمّر لاحقًا.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar",         label: "عمر" },
        { kind: "character", id: "rashidun.figure.abu-ubaidah",  label: "أبو عبيدة" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.jerusalem",     label: "بيت المقدس" },
        { kind: "city", id: "rashidun.city.bayt-al-maqdis", label: "إيلياء" },
      ],
      events: [
        { kind: "battle", id: "rashidun.battle.jerusalem-conquest", label: "فتح بيت المقدس" },
        { kind: "event",  id: "rashidun.event.conquest-jerusalem",  label: "تسلّم المفاتيح" },
      ],
      knowledgeCards: [
        {
          id: "k7-1", icon: "📜",
          title: "العهدة العمريّة",
          body: "أمانٌ كتبه عمر لأهل إيلياء: \"هذا ما أعطى عبد الله عمر أمير المؤمنين أهل إيلياء من الأمان… لا تُسكن كنائسهم ولا تُهدم ولا يُكرهون على دينهم\". أوّل عهدٍ للتعايش في تاريخ الفتوحات.",
        },
      ],
      unlocks: {
        cities: ["jerusalem"],
        artifacts: ["umari-covenant"],
        packEntities: [
          "rashidun.event.conquest-jerusalem",
          "rashidun.city.jerusalem",
          "rashidun.landmark.umari-mosque",
          "rashidun.landmark.dome-rock",
        ],
      },
      readingGate: true,
      xp: 300,
      quiz: {
        id: "q7", required: true, title: "اختبار فتح القدس",
        questions: [{
          id: "q7-1",
          question: "ما اسم الوثيقة التي كتبها عمر لأهل بيت المقدس؟",
          choices: ["العهدة العمريّة", "صلح الحديبية", "كتاب المدينة", "وثيقة المدائن"],
          correctIndex: 0,
          explanation: "العهدة العمريّة أوّل وثيقة أمانٍ للأقليّات في تاريخ الفتوحات الإسلامية.",
          xp: 50,
        }],
      },
    },
    {
      id: "c8",
      index: 8,
      title: "بناء الدولة",
      subtitle: "الدواوين وبيت المال والقضاء",
      intro:
        "بينما يفتح جيشُه الأقاليم، يفتح عمرُ بابًا أعظم: تنظيم الدولة. يؤسّس الدواوين لتقسيم العطاء، ويُفصل القضاء عن السلطة التنفيذية، ويبني بيت المال خزانةً عامةً للمسلمين، ويكتب رسائله إلى الولاة في تأسيس فقه الإدارة العادلة.",
      body: [
        "ابتدع نظام البريد، وفرض حساب الولاة في الموسم، وحاسب أبا هريرة وعمرو بن العاص وسعد بن أبي وقاص جميعًا.",
        "كتب لأبي موسى الأشعري رسالةً صارت دستور القضاء في الإسلام: \"إنّ القضاء فريضةٌ محكمةٌ وسنّةٌ متّبعة، فافهم إذا أُدلي إليك\".",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar",          label: "عمر" },
        { kind: "character", id: "rashidun.figure.amr-ibn-al-as", label: "عمرو بن العاص" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.fustat",  label: "الفسطاط" },
        { kind: "city", id: "rashidun.city.medina",  label: "المدينة" },
      ],
      events: [
        { kind: "event", id: "rashidun.event.conquest-egypt", label: "فتح مصر" },
      ],
      knowledgeCards: [
        {
          id: "k8-1", icon: "📚",
          title: "ديوان الجند",
          body: "أوّل ديوانٍ في الإسلام، رتّب فيه عمر أسماء المقاتلين على القبائل وأنزلهم منازل القرابة من النبي ﷺ في العطاء.",
        },
      ],
      unlocks: {
        artifacts: ["diwan-register"],
        packEntities: [
          "rashidun.artifact.diwan-jund",
          "rashidun.artifact.umar-letter",
          "rashidun.landmark.bayt-al-mal",
          "rashidun.event.conquest-egypt",
        ],
      },
      xp: 180,
      quiz: {
        id: "q8", required: true, title: "اختبار بناء الدولة",
        questions: [{
          id: "q8-1",
          question: "أيُّ ديوانٍ أوّل ما أنشأه عمر بن الخطاب؟",
          choices: ["ديوان الخراج", "ديوان البريد", "ديوان الجند", "ديوان الإنشاء"],
          correctIndex: 2,
          explanation: "ديوان الجند أوّل دواوين عمر، رتّب فيه العطاء على القبائل.",
          xp: 40,
        }],
      },
    },
    {
      id: "c9",
      index: 9,
      title: "التقويم الهجري",
      subtitle: "تأسيس الزمن الإسلامي",
      intro:
        "حين كثرت المراسلات بين الأمصار التبست التواريخ، فاستشار عمرُ الصحابة في مبدأٍ للتاريخ. قال علي: \"نؤرّخ من هجرة النبي ﷺ، يوم فرّق بين الحقّ والباطل\". فأقرّ عمرُ التقويم الهجريّ سنة 17هـ، وبدأ زمنُ الإسلام رسميًّا.",
      body: [
        "اختار عمرُ المحرّم بدايةَ السنة لأنه أوّل شهرٍ بعد عزم النبي ﷺ على الهجرة في ذي الحجة.",
        "في العام نفسه مصّر عمرُ الكوفة والبصرة، وأمر بحفر الترعة بين النيل والبحر الأحمر لنقل الميرة من مصر إلى الحرمين.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar", label: "عمر" },
        { kind: "character", id: "rashidun.figure.ali",  label: "علي" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.kufa",  label: "الكوفة" },
        { kind: "city", id: "rashidun.city.basra", label: "البصرة" },
      ],
      knowledgeCards: [
        {
          id: "k9-1", icon: "🗓️",
          title: "ميلاد التقويم",
          body: "اعتُمدت السنة الأولى للهجرة بدايةً، فصار التقويم الهجريّ علامةَ الحضارة الإسلامية إلى اليوم.",
        },
      ],
      unlocks: { packEntities: ["rashidun.city.kufa", "rashidun.city.basra"] },
      xp: 160,
      quiz: {
        id: "q9", required: true, title: "اختبار التقويم الهجري",
        questions: [{
          id: "q9-1",
          question: "بأيِّ حدثٍ أرّخ عمرُ التقويم الإسلامي؟",
          choices: ["مولد النبي ﷺ", "بعثة النبي ﷺ", "هجرة النبي ﷺ", "وفاة النبي ﷺ"],
          correctIndex: 2,
          explanation: "أُرّخ التقويم بهجرة النبي ﷺ من مكة إلى المدينة بمشورة علي بن أبي طالب.",
          xp: 40,
        }],
      },
    },
    {
      id: "c10",
      index: 10,
      title: "استشهاد عمر",
      subtitle: "نهاية عهدٍ ومولد ميراث",
      intro:
        "في فجر الأربعاء السادس والعشرين من ذي الحجة سنة 23هـ، يطعن أبو لؤلؤة المجوسي عمرَ بخنجرٍ ذي رأسين وهو في محرابه. يُحمل إلى داره فيوصي بالخلافة شورى بين ستةٍ من العشرة، ويُدفن إلى جانب صاحبيه في الحجرة النبويّة. تنتهي عشر سنواتٍ هزّت العالم.",
      body: [
        "حين سُئل عمر عمّن قتله قال: \"الحمد لله الذي لم يجعل قاتلي يحاجّني عند الله بسجدةٍ سجدها له\".",
        "ترك خلفه إمبراطوريةً تمتدّ من برقة إلى خراسان، وعدلًا صار مضرب المثل في الشرق والغرب، وحضارةً ستمتدّ ألف عام.",
      ],
      figures: [
        { kind: "character", id: "rashidun.figure.umar",   label: "عمر" },
        { kind: "character", id: "rashidun.figure.uthman", label: "عثمان" },
      ],
      locations: [
        { kind: "city", id: "rashidun.city.medina", label: "المدينة" },
      ],
      events: [
        { kind: "event", id: "rashidun.event.umar-martyrdom", label: "استشهاد عمر" },
      ],
      knowledgeCards: [
        {
          id: "k10-1", icon: "🌿",
          title: "الشورى السداسية",
          body: "اختار عمر ستةً: عثمان وعلي وطلحة والزبير وسعد وعبد الرحمن بن عوف، فاجتمعوا حتى بايعوا عثمان، فكانت أوّل تجربة شورى منظّمة في تاريخ الإسلام.",
        },
      ],
      unlocks: {
        packEntities: [
          "rashidun.event.umar-martyrdom",
          "rashidun.landmark.prophet-mosque",
          "rashidun.figure.uthman",
        ],
      },
      readingGate: true,
      xp: 350,
      quiz: {
        id: "q10", required: true, title: "اختبار استشهاد عمر",
        questions: [
          {
            id: "q10-1",
            question: "مَن طعن عمرَ بن الخطاب في صلاة الفجر؟",
            choices: ["ابن ملجم", "أبو لؤلؤة المجوسي", "الغافقي", "كميل بن زياد"],
            correctIndex: 1,
            explanation: "طعنه أبو لؤلؤة المجوسي غلام المغيرة بن شعبة فجر يوم الأربعاء.",
            xp: 50,
          },
          {
            id: "q10-2",
            question: "كم سنةً امتدّت خلافة عمر بن الخطاب؟",
            choices: ["سنتان", "خمس سنين", "عشر سنين", "خمس عشرة سنة"],
            correctIndex: 2,
            explanation: "تولّى الخلافة سنة 13هـ واستُشهد سنة 23هـ.",
            xp: 50,
          },
        ],
      },
    },
  ],
  finalReward: {
    title: "الفاروق",
    artifactId: "umari-covenant",
    artifactName: "العهدة العمريّة",
    badgeId: "al-faruq",
    badgeName: "شارة الفاروق",
    characterIds: ["omar"],
    xp: 600,
    legendary: true,
    scholarBadgeId: "rashidun-scholar",
    scholarXp: 150,
  },
};
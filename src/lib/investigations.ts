// ============================================================
// Investigation Engine v1
// ------------------------------------------------------------
// Data-driven historical investigations. The engine renders any
// definition that follows this shape — future content packs can
// register new investigations with zero UI changes.
// ============================================================

export interface InvestigationClue {
  id: string;
  text: string;
}

export interface InvestigationHint {
  /** Dinar cost to reveal. */
  cost: number;
  text: string;
}

export interface InvestigationQuestion {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

export interface InvestigationReward {
  xp: number;
  dinars: number;
  badge?: string;
  artifact?: string;
  character?: string;
  title?: string;
}

export interface InvestigationEncyclopediaRef {
  id: string;      // encyclopedia entity id (e.g. "abbasid.city.baghdad")
  label: string;
}

export interface InvestigationDef {
  id: string;
  title: string;
  era?: string;
  intro: string;
  clues: InvestigationClue[];
  hints: InvestigationHint[];
  questions: InvestigationQuestion[];
  reward: InvestigationReward;
  encyclopediaRefs?: InvestigationEncyclopediaRef[];
}

/**
 * Sample investigation — رسالة مفقودة من بيت الحكمة.
 * The engine ships with this single case as proof of concept;
 * additional cases plug into INVESTIGATION_REGISTRY.
 */
export const INVESTIGATION_REGISTRY: InvestigationDef[] = [
  {
    id: "baghdad-lost-letter",
    title: "رسالة مفقودة من بيت الحكمة",
    era: "abbasid",
    intro:
      "في عهد الخليفة المأمون اختفت رسالةٌ من خزائن بيت الحكمة ببغداد. كانت تحتوي ترجمةً نادرة لأحد كتب الفلك اليونانية. مهمّتك أن تتتبّع القرائن وتحدّد مَن أخذها ولماذا.",
    clues: [
      { id: "c1", text: "وُجدت أوراقٌ مبعثرة قرب قاعة المترجمين، وعليها حبرٌ أزرقُ نادر يُجلب من بلاد فارس." },
      { id: "c2", text: "آخر مَن استعار الرسالة كان مترجمًا من أهل خراسان عاد لتوّه من رحلة إلى مرو." },
      { id: "c3", text: "ذكر أحد الحرّاس أن رجلًا حمل صندوقًا متجهًا نحو طريق القوافل الشمالي ليلًا." },
      { id: "c4", text: "في دفاتر بيت الحكمة إشارة إلى نسخةٍ أخرى من الكتاب طُلبت من مكتبة نيسابور قبل أسبوع." },
    ],
    hints: [
      { cost: 10, text: "ابحث عن وجهة المسافر لا عن هويته فحسب." },
      { cost: 20, text: "الحبر الأزرق الفارسي كان يُستخدم في نسخ المخطوطات للنقل لا للسرقة." },
      { cost: 30, text: "الإجابة الصحيحة تربط بين «خراسان» و«نسخ احتياطية للحفظ»." },
    ],
    questions: [
      {
        id: "q1",
        question: "ما الأرجح في مصير الرسالة؟",
        choices: [
          "سُرقت لبيعها في سوق الورّاقين ببغداد.",
          "نُقلت سرًّا إلى مكتبة في خراسان لحفظ نسخة احتياطية.",
          "أُحرقت في حادث ليلي بقاعة المترجمين.",
          "أخذها الخليفة لمكتبته الخاصة.",
        ],
        correctIndex: 1,
        explanation:
          "القرائن مجتمعةً — المترجم الخراساني، الحبر المخصّص للنسخ، الوجهة الشمالية، ووجود طلب سابق من نيسابور — تشير إلى نقلٍ منظّم لا إلى سرقة.",
      },
      {
        id: "q2",
        question: "في أي مدينة من الأرجح أن تظهر الرسالة لاحقًا؟",
        choices: ["قرطبة", "نيسابور", "القاهرة", "دمشق"],
        correctIndex: 1,
        explanation: "دفاتر بيت الحكمة أشارت صراحةً إلى نيسابور كوجهة للنسخة الموازية.",
      },
    ],
    reward: { xp: 120, dinars: 80, badge: "bayt_hikma_detective" },
    encyclopediaRefs: [
      { id: "abbasid.state.abbasid", label: "الدولة العباسية" },
      { id: "abbasid.city.baghdad", label: "بغداد" },
      { id: "abbasid.landmark.bayt-al-hikma", label: "بيت الحكمة" },
    ],
  },
];

export function getInvestigation(id: string): InvestigationDef | undefined {
  return INVESTIGATION_REGISTRY.find((i) => i.id === id);
}

export function investigationScopeKey(id: string): string {
  return `inv:${id}`;
}
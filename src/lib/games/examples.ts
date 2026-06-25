import type { GameMode } from "./types";

// Lightweight sample/demo content for validating the framework.
// Marked as draft on import so it never appears as published history.

export const EXAMPLE_GAMES: Record<GameMode, Record<string, unknown>> = {
  crossword: {
    slug: "sample-crossword-1",
    mode: "crossword",
    title: "كلمات متقاطعة — نموذج تجريبي",
    description: "نموذج مصغّر لشبكة كلمات متقاطعة حول رموز تاريخية مشهورة.",
    difficulty: 2,
    estimated_time: 5,
    xp: 60,
    coins: 25,
    hearts_penalty: 1,
    related_entities: [],
    metadata: { sample: true },
    stages: [
      {
        title: "المرحلة الأولى",
        rows: 5,
        cols: 5,
        clues: [
          {
            number: 1,
            direction: "across",
            row: 0,
            col: 0,
            answer: "بدر",
            hint: "أوّل معركة كبرى للمسلمين سنة 2هـ.",
          },
          {
            number: 2,
            direction: "down",
            row: 0,
            col: 0,
            answer: "بغداد",
            hint: "عاصمة الخلافة العباسية على دجلة.",
          },
        ],
      },
    ],
  },
  chronology: {
    slug: "sample-chronology-1",
    mode: "chronology",
    title: "ترتيب الأحداث — نموذج تجريبي",
    description: "رتّب أحداثًا من الفجر الإسلامي إلى الدولة العثمانية.",
    difficulty: 2,
    estimated_time: 4,
    xp: 50,
    coins: 20,
    hearts_penalty: 1,
    related_entities: [],
    metadata: { sample: true },
    stages: [
      {
        title: "محطّات كبرى",
        prompt: "رتّب الأحداث الآتية تصاعديًا من الأقدم إلى الأحدث.",
        events: [
          { label: "غزوة بدر", year: 624, era: "النبوي" },
          { label: "تأسيس بغداد", year: 762, era: "العباسي" },
          { label: "سقوط غرناطة", year: 1492, era: "الأندلسي" },
          { label: "فتح القسطنطينية", year: 1453, era: "العثماني" },
        ],
      },
    ],
  },
  who_am_i: {
    slug: "sample-who-am-i-1",
    mode: "who_am_i",
    title: "من أنا؟ — نموذج تجريبي",
    description: "ثلاث تلميحات للوصول إلى شخصية تاريخية.",
    difficulty: 1,
    estimated_time: 3,
    xp: 40,
    coins: 15,
    hearts_penalty: 1,
    related_entities: [],
    metadata: { sample: true },
    stages: [
      {
        title: "اللغز الأول",
        hints: [
          "وُلدتُ في القرن السادس الهجري في تكريت.",
          "حرّرتُ بيت المقدس من الصليبيين.",
          "أسستُ الدولة الأيوبية.",
        ],
        answer: "صلاح الدين الأيوبي",
        acceptable: ["صلاح الدين", "الناصر صلاح الدين"],
      },
    ],
  },
  connections: {
    slug: "sample-connections-1",
    mode: "connections",
    title: "الروابط التاريخية — نموذج تجريبي",
    description: "صِل بين كل شخصية أو معركة وما يرتبط بها.",
    difficulty: 2,
    estimated_time: 4,
    xp: 50,
    coins: 20,
    hearts_penalty: 1,
    related_entities: [],
    metadata: { sample: true },
    stages: [
      {
        title: "صلات متعدّدة",
        pairs: [
          { left: "خالد بن الوليد", right: "اليرموك", relation: "قائد المعركة" },
          { left: "المنصور", right: "بغداد", relation: "مؤسّس المدينة" },
          { left: "ابن خلدون", right: "المقدّمة", relation: "مؤلّف الكتاب" },
        ],
      },
    ],
  },
  memory: {
    slug: "sample-memory-1",
    mode: "memory",
    title: "ذاكرة التاريخ — نموذج تجريبي",
    description: "اعثر على كل زوج من البطاقات المتطابقة.",
    difficulty: 1,
    estimated_time: 3,
    xp: 40,
    coins: 15,
    hearts_penalty: 1,
    related_entities: [],
    metadata: { sample: true },
    stages: [
      {
        title: "أزواج تاريخية",
        pairs: [
          { a: "عمر بن الخطاب", b: "الفاروق", relation: "اللقب" },
          { a: "القاهرة", b: "الفاطميون", relation: "المؤسّسون" },
          { a: "حطّين", b: "1187م", relation: "التاريخ" },
        ],
      },
    ],
  },
};

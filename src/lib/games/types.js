// Shared TypeScript types for the Games framework.
// All gameplay content is driven by JSON — never hardcode stages here.
export const GAME_MODES = [
    "crossword",
    "chronology",
    "who_am_i",
    "connections",
    "memory",
];
export const MODE_LABELS_AR = {
    crossword: "الكلمات المتقاطعة التاريخية",
    chronology: "ترتيب الأحداث",
    who_am_i: "من أنا؟",
    connections: "الروابط التاريخية",
    memory: "ذاكرة التاريخ",
};
export const MODE_TAGLINES_AR = {
    crossword: "أكمل الشبكة بأسماء الشخصيات والمعارك والمدن.",
    chronology: "رتّب الأحداث وفق تسلسلها الزمني الصحيح.",
    who_am_i: "ثلاثة تلميحات متدرجة تقودك إلى الشخصية.",
    connections: "اكتشف العلاقة بين الأطراف التاريخية.",
    memory: "زاوج البطاقات في تحدٍّ سريع للذاكرة.",
};

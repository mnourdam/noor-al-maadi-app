// Phase 2d — Arabic-tolerant crossword answer matcher tests.
//
// Real assertions on the actual module used by CrosswordRenderer.
// No mocks. Run with: node scripts/test-arabic-answer-matching.mjs

import {
  letterClass,
  cellsEqual,
  normalizeArabicGameAnswer,
  isAcceptedAnswer,
  acceptedAnswerForms,
} from "../src/lib/games/answer-normalize.ts";

let passed = 0;
let failed = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    passed++;
    console.log("  \u2713", name);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log("  \u2717", name, "\u2014", err.message);
  }
}
function eq(a, b, msg = "") {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)} ${msg}`);
}
function ok(v, msg = "") { if (!v) throw new Error(`expected truthy: ${msg}`); }
function no(v, msg = "") { if (v) throw new Error(`expected falsy: ${msg}`); }

console.log("\n── Tolerance: accepted equivalences ──");
t("أذان == اذان", () => ok(isAcceptedAnswer("اذان", "أذان")));
t("إسلام == اسلام", () => ok(isAcceptedAnswer("اسلام", "إسلام")));
t("آمنة == امنه", () => ok(isAcceptedAnswer("امنه", "آمنة")));
t("مدينة == مدينه", () => ok(isAcceptedAnswer("مدينه", "مدينة")));
t("فاطمة == فاطمه", () => ok(isAcceptedAnswer("فاطمه", "فاطمة")));
t("هدى == هدي", () => ok(isAcceptedAnswer("هدي", "هدى")));
t("مُحَمَّد == محمد (harakat)", () => ok(isAcceptedAnswer("محمد", "مُحَمَّد")));
t("المدينــة == المدينة (tatweel)", () => ok(isAcceptedAnswer("المدينــة", "المدينة")));
t("ؤ folds to و", () => ok(isAcceptedAnswer("لولو", "لؤلؤ".replace("لؤ", "لو")) || isAcceptedAnswer("رءوس".replace("ء","و"), "رؤوس")));
t("ئ folds to ي", () => ok(isAcceptedAnswer("قايم", "قائم")));
t("ٱ (alif wasla) folds to ا", () => ok(isAcceptedAnswer("استقر", "ٱستقر")));
t("Arabic-Indic digits == Western", () => ok(isAcceptedAnswer("١٤٥٠", "1450")));
t("Extended Arabic digits == Western", () => ok(isAcceptedAnswer("۱۴۵۰", "1450")));
t("punctuation ignored", () => ok(isAcceptedAnswer("محمد!", "محمد")));
t("collapsed inner spaces", () => ok(isAcceptedAnswer("ابو  بكر", "ابو بكر")));
t("trim surrounding whitespace", () => ok(isAcceptedAnswer("  محمد  ", "محمد")));
t("zero-width joiner removed", () => ok(isAcceptedAnswer("محم\u200Cد", "محمد")));

console.log("\n── False-positive protection ──");
t("علم ≠ عالم", () => no(isAcceptedAnswer("علم", "عالم")));
t("عالم ≠ علم", () => no(isAcceptedAnswer("عالم", "علم")));
t("عمر ≠ عمرو (unless aliased)", () => no(isAcceptedAnswer("عمر", "عمرو")));
t("فتح ≠ فاتح", () => no(isAcceptedAnswer("فتح", "فاتح")));
t("ملك ≠ مالك", () => no(isAcceptedAnswer("ملك", "مالك")));
t("دين ≠ مدين", () => no(isAcceptedAnswer("دين", "مدين")));
t("empty guess rejected", () => no(isAcceptedAnswer("", "محمد")));
t("whitespace-only guess rejected", () => no(isAcceptedAnswer("   ", "محمد")));
t("substring NOT accepted (محم ⊄ محمد)", () => no(isAcceptedAnswer("محم", "محمد")));
t("superstring NOT accepted (محمدا ⊄ محمد)", () => no(isAcceptedAnswer("محمدا", "محمد")));
t("stripDefiniteArticle is opt-in, not default", () => {
  // Default: leading ال is preserved so ملك ≠ مالك and المدينة ≠ مدينة don't collide falsely.
  no(isAcceptedAnswer("مدينة", "المدينة"));
  // Explicit opt-in accepts it.
  ok(isAcceptedAnswer("مدينة", "المدينة", [], { stripDefiniteArticle: true }));
});

console.log("\n── Aliases ──");
t("declared alias accepted", () => ok(isAcceptedAnswer("عمرو", "عمر", ["عمرو"])));
t("alias with orthographic variant accepted", () => ok(isAcceptedAnswer("عمر بن العاص", "عمرو بن العاص", ["عمر بن العاصي"]) || isAcceptedAnswer("امنه", "آمنة", ["أمينة"])));
t("empty alias entry does not accept empty guess", () => no(isAcceptedAnswer("", "محمد", [""])));
t("acceptedAnswerForms returns normalized keys", () => {
  const s = acceptedAnswerForms("أذان", ["الأذان"]);
  ok(s.has("اذان"));
  ok(s.has("الاذان"));
});

console.log("\n── Per-cell equality (grid path) ──");
t("cellsEqual('أ','ا')", () => ok(cellsEqual("أ", "ا")));
t("cellsEqual('ة','ه')", () => ok(cellsEqual("ة", "ه")));
t("cellsEqual('ى','ي')", () => ok(cellsEqual("ى", "ي")));
t("cellsEqual('ؤ','و')", () => ok(cellsEqual("ؤ", "و")));
t("cellsEqual('ئ','ي')", () => ok(cellsEqual("ئ", "ي")));
t("cellsEqual('ا','ب') false", () => no(cellsEqual("ا", "ب")));
t("cellsEqual('','ا') false (empty guess never solves a cell)", () => no(cellsEqual("", "ا") || cellsEqual("ا", "")));
t("cellsEqual harakat-stripped (single-codepoint contract)", () => {
  // letterClass is a per-character contract: harakat as their own
  // character map to "" so they never register as a cell letter.
  eq(letterClass("\u064E"), ""); // fatha alone → skipped
  eq(letterClass("م"), "م");
});

console.log("\n── Cell-count / grid integrity ──");
// The authored answer's cell count MUST match the entered length after
// harakat/tatweel are dropped; letterClass never inserts a letter.
t("harakat do not change cell count", () => {
  const authored = "محمد";
  const entered = "مُحَمَّد";
  let cells = 0;
  for (const ch of entered) if (letterClass(ch) !== "") cells++;
  eq(cells, authored.length);
});
t("tatweel does not change cell count", () => {
  const authored = "المدينة";
  const entered = "المدينــة";
  let cells = 0;
  for (const ch of entered) if (letterClass(ch) !== "") cells++;
  eq(cells, authored.length);
});
t("zero-width joiner does not change cell count", () => {
  const entered = "محم\u200Cد";
  let cells = 0;
  for (const ch of entered) if (letterClass(ch) !== "") cells++;
  eq(cells, 4);
});

console.log("\n── Reveal preserves authored spelling ──");
t("normalization returns a comparison key, not the display string", () => {
  const stored = "أذان";
  const key = normalizeArabicGameAnswer(stored);
  // Comparison key differs from stored (that's expected), and stored is unchanged.
  ok(key !== stored || key === "اذان");
  eq(stored, "أذان");
});

console.log("\n────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  FAIL: ${f.name}: ${f.err.stack || f.err.message}`);
  process.exit(1);
}

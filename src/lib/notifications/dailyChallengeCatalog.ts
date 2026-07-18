// ============================================================
// Daily Challenge reminder — Arabic message catalog (Phase 2c).
// ------------------------------------------------------------
// Exactly 10 short, warm, motivating variants. Each variant has
// a distinct short TITLE and short BODY — the title is never
// reused as the body.
//
// Selection is deterministic:
//   idx = hash32(userKey || period) % 10
//   if idx === previousIdx → idx = (idx + 1) % 10   (no repeat)
//
// Never use Math.random. Never expose the array outside — always
// go through `pickCatalogEntry` so the no-repeat rule is applied.
// ============================================================

export interface DailyChallengeMessage {
  /** Short notification title. */
  title: string;
  /** Short notification body — never identical to the title. */
  body: string;
}

/**
 * Ten canonical Arabic reminder variants. Order is stable: it
 * is the address space the deterministic hash indexes into, so
 * do not reorder or remove — only add new entries at the end
 * (and bump `CATALOG_LENGTH`).
 */
export const DAILY_CHALLENGE_CATALOG: readonly DailyChallengeMessage[] = [
  { title: "تحديات اليوم بانتظارك", body: "خطوتان قصيرتان تكفيان لإكمال مهمة اليوم." },
  { title: "تابع رحلتك في إرث",     body: "منعطف جديد ينتظرك على درب التاريخ." },
  { title: "اكتشف شيئًا جديدًا",     body: "قصة صغيرة اليوم تفتح لك بابًا أوسع غدًا." },
  { title: "عالمك يخفي أسرارًا",    body: "ادخل إلى ركن لم تزره بعد وأزح الغبار عنه." },
  { title: "مهمة اليوم جاهزة",       body: "أكمل تحديّي اليوم واحصد الخبرة والدنانير." },
  { title: "لحظة صغيرة تكفي",        body: "دقائق معدودة تُبقيك على درب التقدّم." },
  { title: "عد إلى إرث",             body: "فصل جديد من تاريخنا يستحق نظرة منك." },
  { title: "خطوة أقرب إلى القمة",    body: "تحدٍّ خفيف الآن يقرّبك من مستواك التالي." },
  { title: "ذاكرتك تكبر معك",        body: "معلومة صغيرة اليوم تصنع فارقًا لاحقًا." },
  { title: "لا تدع سلسلتك تنطفئ",    body: "تحديّان سريعان يحفظان حماسك حيّة." },
];

/** Stable length; keep in sync if the catalog is ever extended. */
export const CATALOG_LENGTH = DAILY_CHALLENGE_CATALOG.length;

/**
 * 32-bit FNV-1a — deterministic, no Math.random, stable across
 * runtimes. Used for both time and message selection.
 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Multiply by FNV prime with 32-bit wraparound.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick a message for `(userKey, period)`. If the resulting index
 * collides with `previousIdx`, deterministically advance by +1
 * (mod CATALOG_LENGTH). Guarantees no two consecutive periods
 * repeat the same variant when alternatives exist.
 */
export function pickCatalogEntry(
  userKey: string,
  period: number,
  previousIdx: number | null,
): { idx: number; message: DailyChallengeMessage } {
  const raw = hash32(`${userKey}|msg|${period}`) % CATALOG_LENGTH;
  const idx =
    previousIdx != null && previousIdx === raw && CATALOG_LENGTH > 1
      ? (raw + 1) % CATALOG_LENGTH
      : raw;
  return { idx, message: DAILY_CHALLENGE_CATALOG[idx] };
}

/** Select existing authored metadata only; whitespace is checked, never rewritten. */
export function selectStoryMetadata(
  arabic: string | null | undefined,
  english: string | null | undefined,
  language: string,
): { text: string; lang: "ar" | "en"; dir: "rtl" | "ltr" } | null {
  if (language === "en" && typeof english === "string" && english.trim()) {
    return { text: english, lang: "en", dir: "ltr" };
  }
  if (typeof arabic === "string" && arabic.trim()) {
    return { text: arabic, lang: "ar", dir: "rtl" };
  }
  return null;
}

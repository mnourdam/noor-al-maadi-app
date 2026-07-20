/**
 * Arabic locale bundle for Achievement Engine v2.
 *
 * Keys are namespaced `ach.<category>.<id_slug>.<field>`. Adding a new
 * definition requires adding its keys here (or in the equivalent bundle
 * for another language). Registry validation checks that every key
 * referenced by a definition exists in the active bundle at boot.
 */
export const ar: Record<string, string> = {
  // ===== Sample definitions to prove the pipeline =====
  // Real port of the 57 existing definitions happens in the next slice.

  "ach.campaigns.first.title": "أوّل الحملات",
  "ach.campaigns.first.description": "أتمم أول حملة تاريخية.",

  "ach.investigations.first.title": "أول تحقيق",
  "ach.investigations.first.description": "حلّ أول قضية تحقيق.",

  "ach.level.5.title": "عالم التاريخ",
  "ach.level.5.description": "ابلغ المستوى الخامس.",
};

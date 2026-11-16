import { expect, it } from "vitest";
import { STAT_EXPLANATION_MESSAGES } from "@/lib/ui-language/stat-explanation-messages";
import { TARGET_LOCALES } from "@/lib/ui-language/locale-policy";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("covers all thirteen explanatory/status labels in six locales", () => {
  const keys = Object.keys(STAT_EXPLANATION_MESSAGES.ar).sort();
  expect(keys).toHaveLength(13);
  for (const locale of TARGET_LOCALES) {
    expect(Object.keys(STAT_EXPLANATION_MESSAGES[locale]).sort()).toEqual(keys);
    for (const value of Object.values(STAT_EXPLANATION_MESSAGES[locale])) {
      expect(value.trim()).toBeTruthy();
      expect(value).not.toMatch(/TODO|FIXME|undefined|[{}]/);
    }
  }
});
it("retains complete canonical Arabic and English values at the existing UI keys", () => {
  for (const locale of ["ar", "en"] as const)
    for (const [key, value] of Object.entries(STAT_EXPLANATION_MESSAGES[locale]))
      expect(UI_MESSAGES[locale][key as keyof typeof UI_MESSAGES.ar]).toBe(value);
  expect(UI_MESSAGES.ar.streakMaintain).toBe("أكمل فصلًا أو تحديًا اليوم للحفاظ على السلسلة.");
  expect(UI_MESSAGES.en.streakMaintain).toBe(
    "Complete a chapter or challenge today to maintain your streak.",
  );
  expect(UI_MESSAGES.en.streakBroken).toBe(
    "Your streak has ended. Complete a qualifying activity to start a new one.",
  );
  expect(UI_MESSAGES.en.dinarsExplanation).toContain("They will later be used");
});
it("does not activate target locales or replace numeric/time formatting labels", () => {
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
  expect(UI_MESSAGES.ar.pointsRemaining).toBe("متبقّي {amount} نقطة");
  expect(UI_MESSAGES.en.pointsRemaining).toBe("{amount} points remaining");
  expect(UI_MESSAGES.ar.daysUnit).toBe("يوم");
  expect(UI_MESSAGES.en.daysUnit).toBe("days");
});

// Frozen pre-extraction values: detect accidental canonical wording changes.
const original = {
  ar: {
    dinarsExplanation:
      "تكسب الدنانير من إكمال الفصول، التحديات، التحقيقات والإنجازات. ستُستخدم لاحقًا لفتح عناصر وتخصيصات داخل إرث.",
    currentBalance: "رصيدك الحالي",
    xpExplanation: "ترتفع خبرتك كلما تقدمت في الحملات والألعاب والتحقيقات.",
    currentXP: "الخبرة الحالية",
    levelLabel: "المستوى",
    nextLevelLabel: "التالي:",
    highestLevel: "أعلى مستوى",
    streakBroken: "انقطعت سلسلتك. أكمل نشاطًا مؤهلًا لبدء سلسلة جديدة.",
    streakSafe: "حماستك محفوظة اليوم.",
    streakMaintain: "أكمل فصلًا أو تحديًا اليوم للحفاظ على السلسلة.",
    currentStreak: "السلسلة الحالية",
    lastActiveDay: "آخر يوم نشاط",
    timeBeforeRisk: "الوقت قبل المخاطرة",
  },
  en: {
    dinarsExplanation:
      "Earn dinars by completing chapters, challenges, investigations and achievements. They will later be used to unlock items and customizations in Irth.",
    currentBalance: "Current balance",
    xpExplanation: "Gain experience as you progress through campaigns, games and investigations.",
    currentXP: "Current experience",
    levelLabel: "Level",
    nextLevelLabel: "Next:",
    highestLevel: "Highest level",
    streakBroken: "Your streak has ended. Complete a qualifying activity to start a new one.",
    streakSafe: "Your streak is safe today.",
    streakMaintain: "Complete a chapter or challenge today to maintain your streak.",
    currentStreak: "Current streak",
    lastActiveDay: "Last active day",
    timeBeforeRisk: "Time before your streak is at risk",
  },
};
it("preserves every original ar/en string byte-for-byte", () => {
  expect(STAT_EXPLANATION_MESSAGES.ar).toEqual(original.ar);
  expect(STAT_EXPLANATION_MESSAGES.en).toEqual(original.en);
});

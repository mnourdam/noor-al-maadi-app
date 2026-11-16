import { expect, it } from "vitest";
import {
  NOTIFICATION_CONTROL_MESSAGES as dictionaries,
  notificationRelativeTime,
} from "@/lib/ui-language/notification-control-messages";
import { TARGET_LOCALES, selectInitialLocale } from "@/lib/ui-language/locale-policy";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/categories";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("covers all 29 notification controls in all six locales with identical tokens", () => {
  const keys = Object.keys(dictionaries.ar).sort();
  expect(keys).toHaveLength(29);
  for (const locale of TARGET_LOCALES) {
    expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
    for (const key of keys as (keyof typeof dictionaries.ar)[]) {
      const value = dictionaries[locale][key];
      expect(value.trim()).toBeTruthy();
      expect(value.match(/\{\w+\}/g)).toEqual(dictionaries.ar[key].match(/\{\w+\}/g));
    }
  }
});
it("preserves Arabic category labels and does not activate dormant languages", () => {
  for (const category of Object.values(NOTIFICATION_CATEGORIES))
    expect(dictionaries.ar[category.key]).toBe(category.label);
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
  for (const locale of ["ur", "id", "tr", "fr"])
    expect(selectInitialLocale(locale, [locale], ["ar", "en"]).locale).toBe("ar");
});
it("retains relative-time thresholds, substitutes counts and localizes older dates", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  for (const locale of TARGET_LOCALES) {
    for (const [minutes, key, count] of [
      [0, "now", null],
      [1, "minutesAgo", 1],
      [59, "minutesAgo", 59],
      [60, "hoursAgo", 1],
      [1439, "hoursAgo", 23],
      [1440, "daysAgo", 1],
      [8640, "daysAgo", 6],
    ] as const) {
      const expected =
        locale === "ur" && key === "hoursAgo" && count === 1
          ? "1 گھنٹہ پہلے"
          : count === null
            ? dictionaries[locale][key]
            : dictionaries[locale][key].replace("{count}", String(count));
      expect(
        notificationRelativeTime(new Date(now - minutes * 60_000).toISOString(), locale, now),
      ).toBe(expected);
    }
    const older = new Date(now - 7 * 86400_000);
    expect(notificationRelativeTime(older.toISOString(), locale, now)).toBe(
      older.toLocaleDateString(locale, { month: "short", day: "numeric" }),
    );
  }
});

it("uses grammatical Urdu singular and plural hour forms", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  expect(notificationRelativeTime("2026-11-16T11:00:00Z", "ur", now)).toBe("1 گھنٹہ پہلے");
  expect(notificationRelativeTime("2026-11-16T10:00:00Z", "ur", now)).toBe("2 گھنٹے پہلے");
});

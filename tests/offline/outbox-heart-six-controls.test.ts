import { expect, it } from "vitest";
import { TARGET_LOCALES, selectInitialLocale } from "@/lib/ui-language/locale-policy";
import { HEART_CONTROL_MESSAGES } from "@/lib/ui-language/heart-control-messages";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("all six heart dictionaries cover exactly the 25 controls with no blank text", () => {
  const keys = Object.keys(HEART_CONTROL_MESSAGES.ar).sort();
  expect(keys).toHaveLength(25);
  for (const locale of TARGET_LOCALES) {
    const messages = HEART_CONTROL_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(keys);
    for (const value of Object.values(messages)) {
      expect(value.trim()).toBeTruthy();
      expect(value).not.toMatch(/TODO|FIXME|undefined/);
    }
  }
});
for (const locale of ["ar", "en"] as const) {
  it("integrates all existing heart controls: " + locale, () => {
    for (const [key, value] of Object.entries(HEART_CONTROL_MESSAGES[locale])) {
      expect(UI_MESSAGES[locale][key as keyof typeof UI_MESSAGES.ar]).toBe(value);
    }
  });
}
it("does not enable unfinished locales via dictionary presence or device choice", () => {
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
  for (const locale of ["ur", "id", "tr", "fr"]) {
    expect(selectInitialLocale(locale, [locale], ["ar", "en"]).locale).toBe("ar");
  }
});

it("preserves the amount/cost tokens and substitutes boundary values without leftovers", () => {
  const tokens = (s: string) => Array.from(s.matchAll(/\{([^}]+)\}/g), (m) => m[1]).sort();
  for (const locale of TARGET_LOCALES) {
    for (const key of Object.keys(
      HEART_CONTROL_MESSAGES.ar,
    ) as (keyof typeof HEART_CONTROL_MESSAGES.ar)[]) {
      expect(tokens(HEART_CONTROL_MESSAGES[locale][key])).toEqual(
        tokens(HEART_CONTROL_MESSAGES.ar[key]),
      );
    }
    for (const amount of [0, 1, 20, 10000]) {
      const text = HEART_CONTROL_MESSAGES[locale].currentBalanceToast.replace(
        "{amount}",
        String(amount),
      );
      expect(text).toContain(String(amount));
      expect(text).not.toMatch(/[{}]/);
    }
    const text = HEART_CONTROL_MESSAGES[locale].buyHeartLabel.replace("{cost}", "20");
    expect(text).toContain("20");
    expect(text).not.toMatch(/[{}]/);
  }
});

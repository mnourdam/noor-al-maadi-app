import { expect, it } from "vitest";
import { TARGET_LOCALES, selectInitialLocale } from "@/lib/ui-language/locale-policy";
import { STORY_UNLOCK_MESSAGES } from "@/lib/ui-language/story-unlock-messages";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("all six story unlock dictionaries cover exactly the 22 controls with no blank text", () => {
  const keys = Object.keys(STORY_UNLOCK_MESSAGES.ar).sort();
  expect(keys).toHaveLength(22);
  for (const locale of TARGET_LOCALES) {
    const messages = STORY_UNLOCK_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(keys);
    for (const value of Object.values(messages)) {
      expect(value.trim()).toBeTruthy();
      expect(value).not.toMatch(/TODO|FIXME|undefined|[{}]/);
    }
  }
});
for (const locale of ["ar", "en"] as const) {
  it("integrates all existing story unlock controls: " + locale, () => {
    for (const [key, value] of Object.entries(STORY_UNLOCK_MESSAGES[locale])) {
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

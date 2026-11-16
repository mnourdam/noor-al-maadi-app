import { expect, it } from "vitest";
import { TARGET_LOCALES, selectInitialLocale } from "@/lib/ui-language/locale-policy";
import { CATALOG_CONTROL_MESSAGES } from "@/lib/ui-language/catalog-control-messages";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("all six catalog dictionaries cover exactly the 17 controls with no blank text", () => {
  const keys = Object.keys(CATALOG_CONTROL_MESSAGES.ar).sort();
  expect(keys).toHaveLength(17);
  for (const locale of TARGET_LOCALES) {
    const messages = CATALOG_CONTROL_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(keys);
    for (const value of Object.values(messages)) {
      expect(value.trim()).toBeTruthy();
      expect(value).not.toMatch(/TODO|FIXME|undefined|[{}]/);
    }
  }
});
for (const locale of ["ar", "en"] as const) {
  it("integrates all existing catalog controls: " + locale, () => {
    for (const [key, value] of Object.entries(CATALOG_CONTROL_MESSAGES[locale])) {
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

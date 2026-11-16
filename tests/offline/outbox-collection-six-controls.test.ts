import { expect, it } from "vitest";
import { TARGET_LOCALES, selectInitialLocale } from "@/lib/ui-language/locale-policy";
import { COLLECTION_CONTROL_MESSAGES } from "@/lib/ui-language/collection-control-messages";
import { UI_MESSAGES } from "@/lib/ui-language/messages";

it("all six collection dictionaries cover exactly the 19 controls with no blank text", () => {
  const keys = Object.keys(COLLECTION_CONTROL_MESSAGES.ar).sort();
  expect(keys).toHaveLength(19);
  for (const locale of TARGET_LOCALES) {
    const messages = COLLECTION_CONTROL_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(keys);
    for (const value of Object.values(messages)) {
      expect(value.trim()).toBeTruthy();
      expect(value).not.toMatch(/TODO|FIXME|undefined|[{}]/);
    }
  }
});
for (const locale of ["ar", "en"] as const) {
  it("integrates all existing collection controls: " + locale, () => {
    for (const [key, value] of Object.entries(COLLECTION_CONTROL_MESSAGES[locale])) {
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

it("catalog count labels agree with zero, one and multiple items", async () => {
  const { collectionCountLabel } = await import("@/lib/ui-language/collection-control-messages");
  for (const kind of ["catalogCollections", "catalogStories"] as const) {
    const frSingle = kind === "catalogCollections" ? "collection" : "histoire";
    const urSingle = kind === "catalogCollections" ? "سلسلہ" : "کہانی";
    for (const count of [0, 1, 2, 12]) {
      expect(collectionCountLabel("fr", kind, count)).toBe(
        count < 2 ? frSingle : COLLECTION_CONTROL_MESSAGES.fr[kind],
      );
      expect(collectionCountLabel("ur", kind, count)).toBe(
        count === 1 ? urSingle : COLLECTION_CONTROL_MESSAGES.ur[kind],
      );
      for (const locale of ["ar", "en", "id", "tr"] as const)
        expect(collectionCountLabel(locale, kind, count)).toBe(
          COLLECTION_CONTROL_MESSAGES[locale][kind],
        );
    }
  }
});

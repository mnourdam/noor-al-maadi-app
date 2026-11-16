import { expect, it } from "vitest";
import { HOME_NAVIGATION_MESSAGES } from "@/lib/ui-language/home-navigation-messages";
import { TARGET_LOCALES, LOCALE_META } from "@/lib/ui-language/locale-policy";
import { UI_MESSAGES } from "@/lib/ui-language/messages";
import { readFileSync } from "node:fs";

it("covers exactly twelve home/navigation labels for all six locales", () => {
  const keys = Object.keys(HOME_NAVIGATION_MESSAGES.ar).sort();
  expect(keys).toHaveLength(12);
  for (const locale of TARGET_LOCALES) {
    expect(Object.keys(HOME_NAVIGATION_MESSAGES[locale]).sort()).toEqual(keys);
    for (const text of Object.values(HOME_NAVIGATION_MESSAGES[locale])) {
      expect(text.trim()).toBeTruthy();
      expect(text).not.toMatch(/TODO|FIXME|[{}]/);
    }
  }
});
it("wires only reviewed preview languages without expanding activation", () => {
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
  for (const locale of ["ar", "en"] as const) {
    for (const [key, value] of Object.entries(HOME_NAVIGATION_MESSAGES[locale]))
      expect(UI_MESSAGES[locale][key as keyof typeof UI_MESSAGES.ar]).toBe(value);
  }
});
it("preserves the original navigation wording and canonical routes", () => {
  expect(
    ["home", "campaigns", "encyclopedia", "atlas", "museum", "profile"].map(
      (k) => HOME_NAVIGATION_MESSAGES.ar[k as keyof typeof HOME_NAVIGATION_MESSAGES.ar],
    ),
  ).toEqual(["الرئيسية", "الحملات", "الموسوعة", "الأطلس", "المتحف", "حسابي"]);
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  for (const route of ["/", "/campaigns", "/encyclopedia", "/map", "/collection", "/profile"])
    expect(shell).toContain('to: "' + route + '"');
});
it("isolates translated summary labels rather than flipping Arabic content", () => {
  expect(LOCALE_META.ar.direction).toBe("rtl");
  expect(LOCALE_META.ur.direction).toBe("rtl");
  for (const locale of ["en", "id", "tr", "fr"] as const)
    expect(LOCALE_META[locale].direction).toBe("ltr");
  const source = readFileSync("src/routes/index.tsx", "utf8");
  expect(source).toContain("<span lang={language} dir={direction}");
  expect(source).toContain("profile.name || messages.homeGuest");
});

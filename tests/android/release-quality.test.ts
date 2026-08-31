import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createWarmingBudget,
  NATIVE_WARM_CACHE_BUDGET_BYTES,
  WEB_TOTAL_USAGE_BUDGET_BYTES,
  WEB_MIN_HEADROOM_BYTES,
} from "@/lib/offline/storage-budget";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

afterEach(() => {
  delete (globalThis as any).Capacitor;
});

describe("native warmed-image cache budget", () => {
  it("is a conservative 400 MB ceiling", () => {
    expect(NATIVE_WARM_CACHE_BUDGET_BYTES).toBe(400 * 1024 * 1024);
  });

  it("bounds warming on native instead of being unbounded", async () => {
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    const budget = await createWarmingBudget();
    expect(budget.exhausted()).toBe(false);
    // Write just under the ceiling.
    expect(await budget.note(NATIVE_WARM_CACHE_BUDGET_BYTES - 1)).toBe(false);
    // One more image crosses it and warming stops.
    expect(await budget.note(1024)).toBe(true);
    expect(budget.exhausted()).toBe(true);
  });

  it("leaves the web budget policy untouched", () => {
    expect(WEB_TOTAL_USAGE_BUDGET_BYTES).toBe(700 * 1024 * 1024);
    expect(WEB_MIN_HEADROOM_BYTES).toBe(300 * 1024 * 1024);
  });
});

describe("android release gradle config", () => {
  const gradle = read("android/app/build.gradle");

  it("enables R8 and resource shrinking in release", () => {
    const release = gradle.split("release {")[1]!.split("}")[0]!;
    expect(release).toMatch(/minifyEnabled\s+true/);
    expect(release).toMatch(/shrinkResources\s+true/);
    expect(release).toMatch(/proguard-rules\.pro/);
  });

  it("does not minify debug builds", () => {
    const debug = gradle.split("debug {")[1]!.split("}")[0]!;
    expect(debug).toMatch(/minifyEnabled\s+false/);
    expect(debug).toMatch(/shrinkResources\s+false/);
  });
});

describe("proguard keep rules", () => {
  const rules = read("android/app/proguard-rules.pro");
  const required = [
    "-keep class com.getcapacitor.** { *; }",
    "-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }",
    "@com.getcapacitor.PluginMethod <methods>;",
    "-keep class app.lovable.irth.** { *; }",
    "-keep class com.google.firebase.** { *; }",
    "@android.webkit.JavascriptInterface <methods>;",
  ];
  for (const rule of required) {
    it(`keeps: ${rule}`, () => expect(rules).toContain(rule));
  }

  it("parses as balanced directives (no stray braces)", () => {
    const body = rules.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    const open = (body.match(/\{/g) ?? []).length;
    const close = (body.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });
});

describe("webview remote debugging", () => {
  it("is gated to debug builds in MainActivity", () => {
    const main = read("android/app/src/main/java/app/lovable/irth/MainActivity.java");
    expect(main).toContain("WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)");
  });
});

describe("avatar picker bitmap pressure", () => {
  it("renders the 256px emblem asset in the picker grid", () => {
    const picker = read("src/components/AvatarPicker.tsx");
    expect(picker).toContain('artSize="md"');
    expect(picker).not.toMatch(/<Avatar[^>]*size="lg"(?![^>]*artSize)/);
  });

  it("keeps the 512px tier available for large surfaces", () => {
    const art = read("src/components/EmblemArt.tsx");
    expect(art).toMatch(/xl:\s*512/);
    expect(art).toMatch(/share:\s*512/);
  });
});

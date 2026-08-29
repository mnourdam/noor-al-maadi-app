import { describe, it, expect, beforeEach } from "vitest";
import {
  parseAndroidVersionCode,
  readAppVersion,
  peekAppVersion,
  __resetAppVersionCache,
} from "@/lib/app-version";
import { validateRelease } from "../../scripts/lib/android-release-version.mjs";

const android = { isNative: () => true };

beforeEach(() => __resetAppVersionCache());

describe("parseAndroidVersionCode", () => {
  it("parses '16'", () => expect(parseAndroidVersionCode("16")).toBe(16));
  it("parses a high build number", () => expect(parseAndroidVersionCode("2100000")).toBe(2100000));
  it("parses '0016' as 16", () => expect(parseAndroidVersionCode("0016")).toBe(16));
  it("rejects empty", () => expect(parseAndroidVersionCode("")).toBeNull());
  it("rejects 'abc'", () => expect(parseAndroidVersionCode("abc")).toBeNull());
  it("rejects '16.1'", () => expect(parseAndroidVersionCode("16.1")).toBeNull());
  it("rejects 0", () => expect(parseAndroidVersionCode("0")).toBeNull());
  it("rejects negatives", () => expect(parseAndroidVersionCode("-3")).toBeNull());
});

describe("readAppVersion", () => {
  it("reads a valid Android build", async () => {
    const info = await readAppVersion({ ...android, getInfo: async () => ({ version: "16.0.0", build: "16" }) });
    expect(info).toMatchObject({ platform: "android", versionCode: 16, versionName: "16.0.0", valid: true });
  });

  it("keeps versionName even when the build is invalid", async () => {
    const info = await readAppVersion({ ...android, getInfo: async () => ({ version: "16.0.0", build: "16.1" }) });
    expect(info.versionName).toBe("16.0.0");
    expect(info.versionCode).toBeNull();
    expect(info.valid).toBe(false);
  });

  it("never throws when App.getInfo() throws", async () => {
    const info = await readAppVersion({
      ...android,
      getInfo: async () => {
        throw new Error("plugin missing");
      },
    });
    expect(info).toMatchObject({ platform: "android", versionCode: null, valid: false });
  });

  it("reports web as not applicable", async () => {
    const info = await readAppVersion({ isNative: () => false });
    expect(info).toMatchObject({ platform: "web", versionCode: null, valid: false });
  });

  it("caches successful native reads", async () => {
    let calls = 0;
    const getInfo = async () => {
      calls += 1;
      return { version: "16.0.0", build: "42" };
    };
    await readAppVersion({ ...android, getInfo });
    const second = await readAppVersion({ ...android, getInfo });
    expect(calls).toBe(1);
    expect(second.versionCode).toBe(42);
    expect(peekAppVersion()?.versionCode).toBe(42);
  });

  it("does not cache invalid reads", async () => {
    await readAppVersion({ ...android, getInfo: async () => ({ version: "x", build: "" }) });
    expect(peekAppVersion()).toBeNull();
  });
});

const gradle = (code: string, name = "16.0.0") =>
  `android {\n  defaultConfig {\n    versionCode ${code}\n    versionName "${name}"\n  }\n}`;

describe("release version guard", () => {
  it("passes valid release metadata", () => {
    const r = validateRelease(gradle("17"), { playProductionVersionCode: 16, releaseVersionNamePrefix: "16." });
    expect(r.ok).toBe(true);
  });

  it("fails when the Play baseline is unknown", () => {
    const r = validateRelease(gradle("17"), { playProductionVersionCode: null });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("playProductionVersionCode");
  });

  it("fails on the placeholder versionCode 1", () => {
    const r = validateRelease(gradle("1"), { playProductionVersionCode: 16 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("placeholder");
  });

  it("fails when not strictly greater than production", () => {
    const r = validateRelease(gradle("16"), { playProductionVersionCode: 16 });
    expect(r.ok).toBe(false);
  });

  it("fails on missing versionName", () => {
    const r = validateRelease("android {\n versionCode 17\n}", { playProductionVersionCode: 16 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("versionName");
  });

  it("fails on a non-numeric versionCode", () => {
    const r = validateRelease(gradle("abc"), { playProductionVersionCode: 16 });
    expect(r.ok).toBe(false);
  });
});

// Focused unit tests for the centralized share/publicOrigin/displayName modules.
// Runs under bun's built-in test runner. No DOM, no network.

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Force the isCapacitorNative import used by publicOrigin to a stable value.
mock.module("@/lib/native-auth", () => ({
  isCapacitorNative: () => false,
}));

import {
  isLocalOrigin,
  buildPublicUrl,
  buildReferralUrl,
  PUBLIC_ORIGIN,
} from "@/lib/share/publicOrigin";
import { resolveDisplayName, sanitizeFilenameHandle } from "@/lib/share/displayName";
import { sanitizeFilename } from "@/lib/share/shareService";

describe("isLocalOrigin", () => {
  const local = [
    "http://localhost:8080",
    "https://localhost",
    "http://127.0.0.1:3000",
    "capacitor://localhost",
    "file:///android_asset/index.html",
    "chrome-extension://abc/index.html",
    "http://10.0.2.2",
    "http://192.168.1.5",
    "http://172.16.0.1",
    "",
    "not a url",
  ];
  for (const url of local) {
    it(`treats ${JSON.stringify(url)} as local/internal`, () => {
      expect(isLocalOrigin(url)).toBe(true);
    });
  }

  const publicOrigins = [
    "https://irth-develop.lovable.app",
    "https://irth.app",
    "https://example.com:8443",
  ];
  for (const url of publicOrigins) {
    it(`accepts public origin ${url}`, () => {
      expect(isLocalOrigin(url)).toBe(false);
    });
  }
});

describe("buildPublicUrl / buildReferralUrl", () => {
  beforeEach(() => {
    // simulate SSR — no window
    // @ts-expect-error test-only
    globalThis.window = undefined;
  });

  it("uses the approved public origin outside the browser", () => {
    expect(buildPublicUrl("/auth")).toBe(`${PUBLIC_ORIGIN}/auth`);
  });

  it("builds referral URL with encoded code and no localhost", () => {
    const url = buildReferralUrl("ABC 123");
    expect(url).toBeTruthy();
    expect(url!.startsWith(PUBLIC_ORIGIN)).toBe(true);
    expect(url).toContain("ref=ABC%20123");
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("127.0.0.1");
  });

  it("returns null for empty referral code", () => {
    expect(buildReferralUrl("")).toBeNull();
  });
});

describe("resolveDisplayName", () => {
  it("prefers display_name over public name over username", () => {
    expect(resolveDisplayName({
      displayName: "  عبدالله المستكشف ",
      publicName: "AbdullahX",
      username: "abd",
    })).toBe("عبدالله المستكشف");

    expect(resolveDisplayName({
      displayName: "",
      publicName: "AbdullahX",
      username: "abd",
    })).toBe("AbdullahX");

    expect(resolveDisplayName({
      displayName: null,
      publicName: null,
      username: "abd",
    })).toBe("abd");
  });

  it("rejects emails, empty strings and legacy ضيف placeholder", () => {
    expect(resolveDisplayName({
      displayName: "user@example.com",
      publicName: "  ",
      username: "abd",
    })).toBe("abd");

    expect(resolveDisplayName({
      displayName: "ضيف",
      username: "ضيف",
    })).toBe("صديق التاريخ");
  });

  it("falls back to generic Arabic label when nothing is available", () => {
    expect(resolveDisplayName({})).toBe("صديق التاريخ");
  });
});

describe("sanitizeFilenameHandle / sanitizeFilename", () => {
  it("strips path separators and unsafe chars from handle", () => {
    expect(sanitizeFilenameHandle("../secret\\name")).toBe("secret-name");
    expect(sanitizeFilenameHandle("")).toBe("user");
  });

  it("produces a safe filename with extension", () => {
    expect(sanitizeFilename("irth identity card")).toBe("irth-identity-card.png");
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("bad<name>?.png")).not.toMatch(/[<>?]/);
  });

  it("preserves QR ↔ displayed URL equality (same code → same URL)", () => {
    const a = buildReferralUrl("HELLO");
    const b = buildReferralUrl("HELLO");
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});

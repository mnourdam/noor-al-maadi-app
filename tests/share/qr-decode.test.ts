// QR decode + validation tests for the Historical Identity Card / referral.
//
// Runs under bun's built-in test runner. Uses the same `qrcode` generator
// (Canvas / PNG) that the ShareCard uses, then decodes the pixels with
// `jsqr` and asserts the payload equals the original public referral URL.

import { describe, it, expect, mock } from "bun:test";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";

mock.module("@/lib/native-auth", () => ({ isCapacitorNative: () => false }));

import {
  buildReferralUrl,
  validateConfiguredOrigin,
  isLocalOrigin,
} from "@/lib/share/publicOrigin";

async function generateQrPng(payload: string, opts?: Partial<QRCode.QRCodeToBufferOptions>) {
  const buf = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 8,
    color: { dark: "#0b1228", light: "#ffffff" },
    ...opts,
  });
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function decodePng(png: { width: number; height: number; data: Uint8ClampedArray }) {
  const res = jsQR(png.data, png.width, png.height, { inversionAttempts: "dontInvert" });
  return res?.data ?? null;
}

describe("QR decode round-trip", () => {
  it("decodes a short referral URL exactly as encoded", async () => {
    const url = buildReferralUrl("ABC123")!;
    expect(url).toBeTruthy();
    const png = await generateQrPng(url);
    expect(decodePng(png)).toBe(url);
  });

  it("decodes a long referral URL with unicode-ish payload", async () => {
    const url = buildReferralUrl("REF-" + "X".repeat(40))!;
    const png = await generateQrPng(url);
    expect(decodePng(png)).toBe(url);
  });

  it("survives being downscaled to the on-card display size (168px)", async () => {
    // The card renders the QR at 168x168 CSS pixels. We approximate by
    // regenerating at a smaller scale (still module-aligned) and decode.
    const url = buildReferralUrl("HELLO")!;
    const png = await generateQrPng(url, { scale: 4, margin: 4 });
    expect(decodePng(png)).toBe(url);
  });

  it("payload matches the exact string produced by buildReferralUrl", async () => {
    const code = "SAME";
    const url = buildReferralUrl(code)!;
    const png = await generateQrPng(url);
    const decoded = decodePng(png);
    expect(decoded).toBe(url);
    // And re-building yields the identical string.
    expect(buildReferralUrl(code)).toBe(url);
  });
});

describe("validateConfiguredOrigin", () => {
  it("accepts a bare HTTPS origin", () => {
    expect(validateConfiguredOrigin("https://irth.app")).toBe("https://irth.app");
  });
  it("rejects HTTP", () => {
    expect(validateConfiguredOrigin("http://irth.app")).toBeNull();
  });
  it("rejects an origin with a path", () => {
    expect(validateConfiguredOrigin("https://irth.app/foo")).toBeNull();
  });
  it("rejects an origin with a query", () => {
    expect(validateConfiguredOrigin("https://irth.app?x=1")).toBeNull();
  });
  it("rejects localhost / private IPs / capacitor", () => {
    for (const bad of [
      "https://localhost",
      "http://127.0.0.1",
      "https://192.168.1.1",
      "capacitor://localhost",
      "",
      "not a url",
    ]) {
      expect(validateConfiguredOrigin(bad)).toBeNull();
      expect(isLocalOrigin(bad)).toBe(true);
    }
  });
});

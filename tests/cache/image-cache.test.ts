import { afterEach, describe, expect, it, vi } from "vitest";
import { getStableStorageKey, resolveImageUrl } from "../../src/lib/image-cache";

afterEach(() => vi.unstubAllGlobals());
describe("persistent image cache", () => {
  it("uses HTTP(S) keys, strips signing tokens, and preserves versions and project", () => {
    const base = "https://project.supabase.co/storage/v1/object/";
    expect(getStableStorageKey(base + "sign/images/a.png?token=secret&v=2")).toBe(
      base + "images/a.png?v=2",
    );
    expect(getStableStorageKey(base + "public/images/a.png?v=2")).toBe(base + "images/a.png?v=2");
    expect(getStableStorageKey(base + "public/images/a.png?v=3")).not.toBe(
      getStableStorageKey(base + "public/images/a.png?v=2"),
    );
    expect(
      getStableStorageKey("https://other.supabase.co/storage/v1/object/public/images/a.png"),
    ).not.toBe(getStableStorageKey(base + "public/images/a.png"));
    expect(getStableStorageKey("not-a-url")).toBeNull();
  });

  it("fetches a readable response once, then serves the persistent cache", async () => {
    const stored = new Map<string, Response>();
    const put = vi.fn(async (key: string, response: Response) => {
      if (!/^https?:/.test(key)) throw new TypeError("Unsupported scheme");
      stored.set(key, response);
    });
    vi.stubGlobal("caches", {
      open: async () => ({
        put,
        match: async (key: string) => stored.get(key)?.clone(),
      }),
    });
    vi.stubGlobal("window", {
      location: { href: "https://irth.example/", origin: "https://irth.example" },
    });
    const fetcher = vi.fn(
      async () => new Response("image bytes", { headers: { "Content-Type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const url = "https://project.supabase.co/storage/v1/object/public/images/a.png?v=1";
    const first = await resolveImageUrl(url);
    vi.stubGlobal("navigator", { onLine: false });
    const second = await resolveImageUrl(url);
    expect(first).toMatch(/^blob:/);
    expect(second).toMatch(/^blob:/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(url, { mode: "cors", credentials: "omit" });
    expect(put).toHaveBeenCalledTimes(1);
    URL.revokeObjectURL(first!);
    URL.revokeObjectURL(second!);
  });

  it("falls back to original image when the remote host disallows CORS", async () => {
    vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("CORS");
      }),
    );
    const url = "https://external.example/a.png";
    expect(await resolveImageUrl(url)).toBe(url);
  });
});

it("shares concurrent token-rotated downloads and retries failed attempts", async () => {
  vi.stubGlobal("caches", {
    open: async () => ({ match: async () => undefined, put: async () => {} }),
  });
  vi.stubGlobal("window", {
    location: { href: "https://irth.example", origin: "https://irth.example" },
  });
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockImplementation(async () => new Response("bytes"));
  vi.stubGlobal("fetch", fetcher);
  const base =
    "https://project.supabase.co/storage/v1/object/sign/images/concurrent.png?v=1&token=";
  expect(await resolveImageUrl(base + "old")).toBe(base + "old");
  const urls = await Promise.all([resolveImageUrl(base + "new1"), resolveImageUrl(base + "new2")]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const url of urls) {
    expect(url).toMatch(/^blob:/);
    URL.revokeObjectURL(url!);
  }
});

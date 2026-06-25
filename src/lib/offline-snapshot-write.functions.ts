/**
 * Dev-only server function: overwrites `public/offline-snapshot.json` so the
 * admin can regenerate the bundled APK snapshot without copying files by hand.
 *
 * Disabled in production: throws if NODE_ENV === 'production'. Even if called
 * in prod, the Cloudflare Worker has no project filesystem to write to.
 */
import { createServerFn } from "@tanstack/react-start";

export const writeBundledSnapshotFile = createServerFn({ method: "POST" })
  .inputValidator((input: { json: string }) => {
    if (!input || typeof input.json !== "string" || input.json.length === 0) {
      throw new Error("invalid_payload");
    }
    if (input.json.length > 50 * 1024 * 1024) throw new Error("too_large");
    return input;
  })
  .handler(async ({ data }) => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("disabled_in_production");
    }
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const target = path.resolve(process.cwd(), "public", "offline-snapshot.json");
    await fs.writeFile(target, data.json, "utf8");
    return { ok: true as const, path: target, bytes: data.json.length };
  });

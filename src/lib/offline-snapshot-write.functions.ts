/**
 * Authenticated owner/admin development helper for the bundled APK snapshot.
 * All other environments deny by default before auth/network middleware.
 * This endpoint never enables production writes or grants an administrative role.
 */
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function requireDevelopment(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("snapshot_write_disabled");
  }
}

const requireSnapshotDevelopment = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    requireDevelopment();
    return next();
  },
);

const MAX_BYTES = 50 * 1024 * 1024;
export const writeBundledSnapshotFile = createServerFn({ method: "POST" })
  .middleware([requireSnapshotDevelopment, requireSupabaseAuth])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || !("json" in input)
      || typeof input.json !== "string" || input.json.length === 0) {
      throw new Error("invalid_payload");
    }
    if (input.json.length > MAX_BYTES || new TextEncoder().encode(input.json).byteLength > MAX_BYTES) {
      throw new Error("too_large");
    }
    try { JSON.parse(input.json); } catch { throw new Error("invalid_json"); }
    return { json: input.json };
  })
  .handler(async ({ data, context }) => {
    requireDevelopment();
    try {
      const { data: manager, error } = await context.supabase.rpc("is_user_manager");
      if (error || manager !== true) throw new Error("snapshot_write_forbidden");
    } catch {
      throw new Error("snapshot_write_forbidden");
    }
    requireDevelopment();

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { randomUUID } = await import("node:crypto");
    const target = path.resolve(process.cwd(), "public", "offline-snapshot.json");
    const temporary = path.join(path.dirname(target), `.offline-snapshot.${randomUUID()}.tmp`);
    let created = false;
    try {
      const file = await fs.open(temporary, "wx", 0o600);
      created = true;
      try {
        await file.writeFile(data.json, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(temporary, target);
      created = false;
    } finally {
      if (created) {
        try { await fs.unlink(temporary); } catch { /* preserve the original IO failure */ }
      }
    }
    return { ok: true as const, path: target, bytes: new TextEncoder().encode(data.json).byteLength };
  });

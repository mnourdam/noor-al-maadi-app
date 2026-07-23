// ============================================================
// Stories P2 — Server-side checksum verification
// ------------------------------------------------------------
// The verifier is the only path that can flip a `story_media`
// row's `verified` column to true. It:
//   1. Loads the row (admin only).
//   2. Downloads the storage object with the service role.
//   3. Re-computes SHA-256 over the on-disk bytes.
//   4. Calls `admin_mark_story_media_verified` with the observed
//      checksum + byte size, which enforces equality in SQL.
//
// A mismatch is a hard failure. The caller is responsible for
// deleting the offending row/object (see pipeline.ts rollback).
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  mediaId: z.string().uuid(),
});

export const verifyStoryMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Admin gate — verified server-side via has_role RPC (RLS-aware).
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(`role_check_failed: ${roleErr.message}`);
    if (!isAdmin) throw new Error("forbidden");

    // Load the row we're about to verify (still under RLS).
    const { data: row, error: rowErr } = await supabase
      .from("story_media")
      .select("id, storage_bucket, storage_path, byte_size, checksum_sha256")
      .eq("id", data.mediaId)
      .maybeSingle();
    if (rowErr) throw new Error(`row_load_failed: ${rowErr.message}`);
    if (!row) return { verified: false, reason: "not_found" as const };

    // Admin client so we can read private storage bytes.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(row.storage_bucket)
      .download(row.storage_path);
    if (dlErr || !blob) {
      return { verified: false, reason: `download_failed:${dlErr?.message ?? "empty"}` };
    }

    const buf = await blob.arrayBuffer();
    const bytes = buf.byteLength;
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const observed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (observed !== row.checksum_sha256) {
      return { verified: false, reason: "checksum_mismatch" as const };
    }
    if (bytes !== row.byte_size) {
      return { verified: false, reason: "size_mismatch" as const };
    }

    const { error: markErr } = await supabase.rpc("admin_mark_story_media_verified", {
      p_media_id: data.mediaId,
      p_observed_checksum: observed,
      p_observed_bytes: bytes,
    });
    if (markErr) return { verified: false, reason: `mark_failed:${markErr.message}` };

    return { verified: true as const };
  });

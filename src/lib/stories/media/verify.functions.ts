// ============================================================
// Stories P2 — Server-side checksum verification
// ------------------------------------------------------------
// The verifier is the only path that can flip a `story_media`
// row's `verified` column to true. It:
//   1. Authorizes the caller as a content editor.
//   2. Loads the row + downloads the storage object server-side.
//   3. Re-computes SHA-256 over the on-disk bytes.
//   4. Calls `admin_mark_story_media_verified` with the observed
//      checksum + byte size, which enforces equality in SQL.
//
// A mismatch is a hard failure. The caller is responsible for
// deleting the offending row/object (see pipeline.ts rollback).
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const InputSchema = z.object({
  mediaId: z.string().uuid(),
});

function createVerificationAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("server_storage_not_configured");

  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const verifyStoryMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // CMS gate — owner/admin/editor via the canonical content-editor RPC.
    const { data: isEditor, error: roleErr } = await supabase.rpc("is_content_editor");
    if (roleErr) throw new Error(`role_check_failed: ${roleErr.message}`);
    if (!isEditor) throw new Error("forbidden");

    const supabaseAdmin = createVerificationAdminClient();

    // Load the row we're about to verify after the caller has passed the
    // content-editor gate. Unverified rows are intentionally hidden from
    // regular user reads, so the verifier must read this server-side.
    const { data: row, error: rowErr } = await supabase
      .from("story_media")
      .select("id, storage_bucket, storage_path, byte_size, checksum_sha256")
      .eq("id", data.mediaId)
      .maybeSingle();
    if (rowErr) throw new Error(`row_load_failed: ${rowErr.message}`);
    const { data: adminRow, error: adminRowErr } = row
      ? { data: null, error: null }
      : await supabaseAdmin
          .from("story_media")
          .select("id, storage_bucket, storage_path, byte_size, checksum_sha256")
          .eq("id", data.mediaId)
          .maybeSingle();
    if (adminRowErr) throw new Error(`server_row_load_failed: ${adminRowErr.message}`);
    const finalRow = row ?? adminRow;
    if (!finalRow) return { verified: false, reason: "not_found" as const };

    // Admin client so we can read private storage bytes.
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(finalRow.storage_bucket)
      .download(finalRow.storage_path);
    if (dlErr || !blob) {
      return { verified: false, reason: `download_failed:${dlErr?.message ?? "empty"}` };
    }

    const buf = await blob.arrayBuffer();
    const bytes = buf.byteLength;
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const observed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (observed !== finalRow.checksum_sha256) {
      return { verified: false, reason: "checksum_mismatch" as const };
    }
    if (bytes !== finalRow.byte_size) {
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

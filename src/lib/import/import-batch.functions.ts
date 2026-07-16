// ============================================================
// Phase 5 — Server-side import batch operations.
//
// All heavy import writes go through these authenticated server
// functions. The database RPC admin_run_import_batch enforces
// admin/owner role via has_role() and executes every content write
// inside a single Postgres transaction (savepoint-rolled for dry runs).
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const planItemSchema = z.object({
  index: z.number().int().min(0),
  action: z.enum(["new", "update", "skip", "alias"]),
  data: z.unknown(),
  target_key: z.record(z.string(), z.unknown()).optional(),
  version_signal: z.string().nullable().optional(),
  accepted_repairs: z.unknown().optional(),
  classification: z.string().optional(),
  issues: z.unknown().optional(),
  incoming_id: z.string().optional(),
  incoming_slug: z.string().optional(),
});

const planSchema = z.object({
  content_type: z.string().min(1).max(64),
  file_name: z.string().nullable().optional(),
  original_payload_hash: z.string().min(4).max(128),
  approved_plan_hash: z.string().min(8).max(128),
  overwrite: z.boolean(),
  publish: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  items: z.array(planItemSchema).max(5000),
});

const runInput = z.object({
  plan: planSchema,
  mode: z.enum(["dry_run", "commit"]),
});

/** Run an approved plan in dry-run or commit mode. */
export const runImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_run_import_batch" as any, {
      plan: data.plan as any,
      mode: data.mode,
    });
    if (error) throw new Error(error.message);
    return result as {
      status: string;
      batch_id?: string;
      created?: number;
      updated?: number;
      aliased?: number;
      skipped?: number;
      failed?: number;
      conflicts?: number;
      items?: unknown[];
      error?: string;
    };
  });

const rollbackInput = z.object({
  batch_id: z.string().uuid(),
  force: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const rollbackImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rollbackInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_rollback_import_batch" as any, {
      p_batch: data.batch_id,
      p_force: data.force ?? false,
    });
    if (error) throw new Error(error.message);
    return result as { status: string; batch_id: string; rolled?: number; conflicts?: number; missing?: number; items?: unknown[] };
  });

const listInput = z.object({
  content_type: z.string().optional(),
  status: z.string().optional(),
  mode: z.string().optional(),
  admin_user_id: z.string().uuid().optional(),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listImportBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("admin_import_batches" as any)
      .select("*")
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.content_type) q = q.eq("content_type", data.content_type);
    if (data.status) q = q.eq("status", data.status);
    if (data.mode) q = q.eq("mode", data.mode);
    if (data.admin_user_id) q = q.eq("admin_user_id", data.admin_user_id);
    if (data.since) q = q.gte("started_at", data.since);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

const getInput = z.object({ batch_id: z.string().uuid() });

export const getImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: batch, error } = await context.supabase
      .from("admin_import_batches" as any).select("*").eq("id", data.batch_id).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: items, error: e2 } = await context.supabase
      .from("admin_import_items" as any).select("*")
      .eq("batch_id", data.batch_id).order("item_index", { ascending: true });
    if (e2) throw new Error(e2.message);
    return { batch, items: items ?? [] } as { batch: any; items: any[] };
  });

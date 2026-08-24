// Read-only production health snapshot for /admin/monitor.
// Manager-gated twice: server-side assertManager + the SQL function itself.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertManager } from "./admin-monitor.server";

export const getAdminSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase);
    const started = Date.now();
    const { data, error } = await context.supabase.rpc("admin_system_health");
    const latencyMs = Date.now() - started;
    if (error) throw new Error(error.message);
    return {
      snapshot: data,
      latencyMs,
      fetchedAt: new Date().toISOString(),
    };
  });

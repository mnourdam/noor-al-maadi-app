// Server-side admin operations that require the service role (creating auth
// users with passwords). Each handler verifies the caller is a manager
// (owner/admin) BEFORE loading the privileged admin client.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ROLE = z.enum(["owner", "admin", "editor", "player"]);

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  display_name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9_]+$/i).optional(),
  role: ROLE,
});

async function assertManager(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_user_manager");
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Create auth user with email confirmed so they can sign in immediately.
    const meta: Record<string, string> = { display_name: data.display_name };
    if (data.username) meta.username = data.username;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "create_failed");
    }
    const userId = created.user.id;

    // 2. Assign role (skip for plain 'player' — handle_new_user trigger already
    //    created the profile; no explicit role row needed). Done via the
    //    authenticated client so RLS + log_admin_action use the manager's uid.
    if (data.role !== "player") {
      const { error: roleErr } = await context.supabase.rpc("admin_assign_role", {
        p_user_id: userId,
        p_role: data.role,
        p_reason: "created via team users",
      });
      if (roleErr) {
        // Best-effort cleanup so a half-created user isn't left orphaned.
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(roleErr.message);
      }
    }

    // 3. Audit-log the user creation itself.
    await context.supabase.rpc("log_admin_action", {
      p_action: "user.create",
      p_target: userId,
      p_detail: { email: data.email, role: data.role, display_name: data.display_name },
      p_reason: null,
    });

    return { ok: true, user_id: userId };
  });

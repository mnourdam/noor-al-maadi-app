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
      p_reason: "",
    });

    return { ok: true, user_id: userId };
  });

const deletePlayerSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const deletePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deletePlayerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);

    if (data.user_id === context.userId) {
      throw new Error("لا يمكنك حذف حسابك الحالي.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = data.user_id;

    // Audit BEFORE deletion (target row still exists for FK in audit log).
    try {
      await context.supabase.rpc("log_admin_action", {
        p_action: "user.delete",
        p_target: uid,
        p_detail: { reason: data.reason ?? "" },
        p_reason: data.reason ?? "",
      });
    } catch {
      // non-fatal
    }

    // Explicitly purge player-linked rows (some tables may not cascade).
    const byUserId = [
      "game_progress",
      "user_collection",
      "user_campaign_progress",
      "notification_deliveries",
      "device_tokens",
      "cloud_saves",
      "user_roles",
    ] as const;
    for (const t of byUserId) {
      await supabaseAdmin.from(t).delete().eq("user_id", uid);
    }
    await supabaseAdmin.from("notifications").delete().eq("target_user_id", uid);
    await supabaseAdmin.from("friendships").delete().or(`user_a.eq.${uid},user_b.eq.${uid}`);
    await supabaseAdmin.from("referral_rewards").delete().or(`referrer_id.eq.${uid},referred_id.eq.${uid}`);
    await supabaseAdmin.from("referrals").delete().or(`referrer_id.eq.${uid},referred_id.eq.${uid}`);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);

    // Finally remove the auth user.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });

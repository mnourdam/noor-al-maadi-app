// Google Play compliant account deletion.
//
// The handler runs strictly as the signed-in caller: the user id comes from
// the validated bearer token (never from request data), so a user can only
// ever delete their own account. Privileged clients are loaded inside the
// handler, after the session is verified.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DELETE_ACCOUNT_CONFIRM_PHRASE = "حذف حسابي";

const schema = z.object({
  confirm: z.string().min(1).max(64),
});

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.confirm.trim() !== DELETE_ACCOUNT_CONFIRM_PHRASE) {
      throw new Error("عبارة التأكيد غير صحيحة");
    }

    const userId = context.userId;
    if (!userId) throw new Response("Unauthorized", { status: 401 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Purge every row belonging to this user across the public schema.
    const { error: purgeErr } = await supabaseAdmin.rpc("purge_user_account_data", {
      p_user_id: userId,
    });
    if (purgeErr) throw new Error(`purge failed: ${purgeErr.message}`);

    // 2) Delete the auth identity itself (cascades any remaining auth rows).
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`auth delete failed: ${authErr.message}`);

    return { ok: true as const, userId };
  });

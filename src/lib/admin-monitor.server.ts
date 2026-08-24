// Server-only helper for the production health monitor.
// Mirrors the manager gate used by teamUsers.functions.ts: the caller's own
// authenticated client runs the security-definer is_user_manager() RPC, so a
// normal user can never reach the monitoring snapshot.
export async function assertManager(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_user_manager");
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Response("Forbidden", { status: 403 });
  }
}

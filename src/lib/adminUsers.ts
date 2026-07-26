import { supabase } from "@/integrations/supabase/client";

export type AccountStatus = "active" | "suspended" | "disabled";
export type AccountType = "guest" | "registered" | "editor" | "admin";
export type AppRole = "owner" | "admin" | "editor" | "player";
export type UserFilter =
  | ""
  | "active"
  | "suspended"
  | "disabled"
  | "guest"
  | "registered"
  | "editor"
  | "admin"
  | "has_referrals"
  | "no_referrals";


export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_id: string | null;
  join_date: string;
  last_active: string;
  level: number;
  xp: number;
  dinars: number;
  hearts: number;
  streak: number;
  longest_streak: number;
  campaigns_completed: number;
  museum_items_unlocked: number;
  investigations_completed: number;
  referral_code: string | null;
  referred_by: string | null;
  account_status: AccountStatus;
  account_type: AccountType;
  marketing_opt_in: boolean;
  referrals_count: number;
  roles?: string[];
  providers?: string[];
}

export interface AdminUserIdentity {
  provider: string;
  provider_id: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}


export interface AdminListUsersResult {
  rows: AdminUserRow[];
  total: number;
}

export interface AdminListUsersParams {
  search?: string;
  filter?: UserFilter;
  minLevel?: number | null;
  maxLevel?: number | null;
  joinedAfter?: string | null;
  joinedBefore?: string | null;
  limit?: number;
  offset?: number;
}

export async function adminListUsers(p: AdminListUsersParams = {}): Promise<AdminListUsersResult> {
  const { data, error } = await supabase.rpc("admin_list_users" as any, {
    p_search: p.search ?? null,
    p_filter: p.filter || null,
    p_min_level: p.minLevel ?? null,
    p_max_level: p.maxLevel ?? null,
    p_joined_after: p.joinedAfter ?? null,
    p_joined_before: p.joinedBefore ?? null,
    p_limit: p.limit ?? 50,
    p_offset: p.offset ?? 0,
  });
  if (error) throw error;
  const obj = data as { rows: AdminUserRow[]; total: number } | null;
  return { rows: obj?.rows ?? [], total: obj?.total ?? 0 };
}

export interface AdminUserDetail {
  profile: AdminUserRow & Record<string, unknown>;
  auth_email: string | null;
  auth_created_at: string | null;
  auth_last_sign_in_at: string | null;
  providers?: string[];
  identities?: AdminUserIdentity[];
  referrer: (AdminUserRow & Record<string, unknown>) | null;
  referrals_out: Array<{
    id: string;
    referred_id: string;
    stage: number;
    stage1_at: string | null;
    stage2_at: string | null;
    username: string | null;
    display_name: string | null;
    level: number | null;
    created_at: string;
  }>;
  recent_notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    status: string;
    created_at: string;
    sent_at: string | null;
    deep_link: string | null;
  }>;
  audit_log: Array<{
    id: string;
    action: string;
    actor_email: string | null;
    detail: Record<string, unknown>;
    reason: string | null;
    created_at: string;
  }>;
  devices_count: number;
}

export async function adminUserDetail(userId: string): Promise<AdminUserDetail> {
  const { data, error } = await supabase.rpc("admin_user_detail" as any, { p_user_id: userId });
  if (error) throw error;
  return data as AdminUserDetail;
}

export async function adminAdjustBalance(
  userId: string,
  field: "xp" | "dinars",
  delta: number,
  reason: string,
) {
  const { data, error } = await supabase.rpc("admin_adjust_balance" as any, {
    p_user_id: userId,
    p_field: field,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function adminSetAccountStatus(userId: string, status: AccountStatus, reason: string) {
  const { data, error } = await supabase.rpc("admin_set_account_status" as any, {
    p_user_id: userId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function touchMyLastActive() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    // Signed-in only RPC — guests must not call it (it is not granted to anon).
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.rpc("touch_my_last_active" as any);
  } catch {
    /* silent */
  }
}


// Build CSV with western digits + UTF-8 BOM for Excel.
export function buildUsersCsv(rows: AdminUserRow[]): string {
  const cols: Array<[string, (r: AdminUserRow) => string | number | null]> = [
    ["name", (r) => r.display_name ?? ""],
    ["username", (r) => r.username],
    ["email", (r) => r.email ?? ""],
    ["signup_date", (r) => r.join_date],
    ["last_active", (r) => r.last_active],
    ["level", (r) => r.level],
    ["referral_code", (r) => r.referral_code ?? ""],
    ["account_status", (r) => r.account_status],
    ["account_type", (r) => r.account_type],
    ["referrals_count", (r) => r.referrals_count],
    ["providers", (r) => (r.providers ?? []).join("|")],
    ["marketing_opt_in", (r) => (r.marketing_opt_in ? "true" : "false")],
    ["locale", (r) => (r as unknown as { locale?: string }).locale ?? ""],
  ];
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(([k]) => k).join(",");
  const body = rows.map((r) => cols.map(([, f]) => esc(f(r))).join(",")).join("\n");
  return "\ufeff" + header + "\n" + body + "\n";
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Role management (manager-only on the server) ----------

export async function adminAssignRole(userId: string, role: AppRole, reason: string) {
  const { data, error } = await supabase.rpc("admin_assign_role" as any, {
    p_user_id: userId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw error;
  return data as { ok: boolean; roles: string[] };
}

export async function adminRevokeRole(userId: string, role: AppRole, reason: string) {
  const { data, error } = await supabase.rpc("admin_revoke_role" as any, {
    p_user_id: userId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

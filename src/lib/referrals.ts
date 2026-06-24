import { supabase } from "@/integrations/supabase/client";

export interface MyReferralStats {
  code: string | null;
  invited: number;        // total invitations linked
  joined: number;         // signup reward paid (= accounts created via my code)
  level5: number;         // level-5 reward paid
  conversion_pct: number; // joined / invited * 100
  total_dinars: number;
}

export async function fetchMyReferralStats(): Promise<MyReferralStats> {
  const { data, error } = await supabase.rpc("my_referral_stats" as any);
  if (error) throw error;
  const d = (data ?? {}) as Partial<MyReferralStats>;
  return {
    code: d.code ?? null,
    invited: Number(d.invited ?? 0),
    joined: Number(d.joined ?? 0),
    level5: Number(d.level5 ?? 0),
    conversion_pct: Number(d.conversion_pct ?? 0),
    total_dinars: Number(d.total_dinars ?? 0),
  };
}

export interface RedeemResult { ok: boolean; error?: string }

const REDEEM_ERROR_AR: Record<string, string> = {
  unauthenticated: "يجب تسجيل الدخول لاستخدام رمز الإحالة.",
  empty_code: "أدخل رمز إحالة صحيح.",
  invalid_code: "رمز الإحالة غير معروف.",
  self_referral: "لا يمكنك استخدام رمز الإحالة الخاص بك.",
  referral_loop: "هذا المستخدم تمت دعوته بواسطتك من قبل.",
  already_referred: "تمت إضافة رمز إحالة لحسابك مسبقاً.",
};

export async function redeemReferralCode(code: string): Promise<RedeemResult> {
  const { error } = await supabase.rpc("redeem_referral_code" as any, { p_code: code });
  if (error) {
    const key = (error.message || "").toLowerCase();
    for (const k of Object.keys(REDEEM_ERROR_AR)) {
      if (key.includes(k)) return { ok: false, error: REDEEM_ERROR_AR[k] };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function buildReferralShareUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth?ref=${encodeURIComponent(code)}`;
}

export async function shareReferral(code: string): Promise<"shared" | "copied" | "failed"> {
  const url = buildReferralShareUrl(code);
  const text = `انضم إليّ في إرث — رحلة عبر التاريخ الإسلامي.\nاستخدم رمز الإحالة: ${code}\n${url}`;
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ title: "إرث", text, url });
      return "shared";
    } catch { /* fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

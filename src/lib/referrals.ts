// Referral URL + share helpers. Thin wrapper around the centralized share
// service so every referral surface (Profile → Referrals, /referrals page,
// share card) behaves identically: same URL resolution, same Arabic
// feedback, same double-tap guard.

import { supabase } from "@/integrations/supabase/client";
import { buildReferralUrl } from "./share/publicOrigin";
import { shareTextAndUrl, type ShareStatus } from "./share/shareService";

export interface MyReferralStats {
  code: string | null;
  invited: number;
  joined: number;
  level5: number;
  conversion_pct: number;
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

/**
 * Public referral URL for the given code. Never returns a localhost /
 * capacitor origin. Returns empty string when the code is empty so
 * template strings render cleanly.
 */
export function buildReferralShareUrl(code: string | null | undefined): string {
  if (!code) return "";
  return buildReferralUrl(code) ?? "";
}

const SHARE_TEXT_AR = "انضم إليّ في إرث — رحلة عبر التاريخ الإسلامي";

/**
 * Share a referral code. Delegates to the centralized share service:
 *   1. Native / Web Share sheet if available
 *   2. Clipboard fallback with Arabic toast
 *   3. Consistent failure toast (never silent)
 */
export async function shareReferral(code: string): Promise<ShareStatus> {
  const url = buildReferralShareUrl(code);
  if (!url) return "failed";
  const res = await shareTextAndUrl({
    jobId: `referral-share-${code}`,
    title: "إرث",
    text: `${SHARE_TEXT_AR}\nرمز الإحالة: ${code}`,
    url,
  });
  return res.status;
}

import type { Campaign } from "@/types/campaign";
export const metrics: Record<string, number> = {};
export function count(name: string) { metrics[name] = (metrics[name] ?? 0) + 1; }
export function unexpected() { count("unexpected"); throw Error("external boundary prohibited"); }
export const profile = { loggedIn: true, hearts: 0, heartsAt: Date.now() };
export const campaign = {
  id: "synthetic-reread", title: "حملة تجريبية", description: "بيانات اختبار فقط",
  chapters: [
    { id: "one", order: 1, title: "الفصل الأول", introText: "مقدمة تجريبية", historicalReadingText: "قراءة تاريخية تجريبية محفوظة.",
      activities: [{ id: "answer-one", type: "fill_blank", prompt: "أكمل الجواب التجريبي", correctAnswer: "جواب مكتمل", xpReward: 5, coinsReward: 2 }] },
    { id: "two", order: 2, title: "الفصل الثاني", activities: [{id:"later",type:"reading",text:"لاحق"}] },
  ],
} as unknown as Campaign;
export const supabase = { auth: { getSession: unexpected }, rpc: unexpected, from: unexpected };
export function snapshot() {
  return Object.fromEntries(Object.keys(localStorage).filter(k => k.includes("::owner=")).sort().map(k=>[k,localStorage.getItem(k)]));
}

/** Explicit one-campaign synthetic published feed; lock calculation remains a documented stub. */
export function syntheticFeed(value: Campaign) {
  return { items: [{ type: "campaign" as const, campaign: value }], sections: [{ divider: null, campaigns: [value] }], dividers: [], campaigns: [value] };
}

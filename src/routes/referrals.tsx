import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Share2, Gift, ChevronLeft, Trophy } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AuthLink } from "@/components/AuthLink";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import {
  advanceReferralStage, buildReferralLink, fetchMyReferralCode, listMyReferrals,
  REFERRAL_REWARDS, type PublicProfile, type ReferralRow,
} from "@/lib/social";
import { fetchMyReferralStats, type MyReferralStats } from "@/lib/referrals";
import { levelFor } from "@/lib/app-constants";

export const Route = createFileRoute("/referrals")({
  head: () => ({ meta: [{ title: "حملة الإرث" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const { user } = useAccount();
  const { profile, awardBadge, grantTitle } = useProfile();
  const [code, setCode] = useState<string | null>(null);
  const [rows, setRows] = useState<{ row: ReferralRow; friend: PublicProfile | null }[]>([]);
  const [serverStats, setServerStats] = useState<MyReferralStats | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyReferralCode(user.id).then(setCode);
    listMyReferrals(user.id).then(setRows);
    fetchMyReferralStats().then(setServerStats).catch(() => {});
  }, [user]);


  const link = code ? buildReferralLink(code) : "";
  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.row.stage >= 2).length,
    rewards: rows.reduce((s, r) => {
      let v = 0;
      if (r.row.stage >= 1) v += REFERRAL_REWARDS.stage1.dinars;
      if (r.row.stage >= 2) v += REFERRAL_REWARDS.stage2.dinars;
      return s + v;
    }, 0),
  }), [rows]);

  // Referee-side: ping server so it grants/awards level-based rewards.
  // The server is the single source of truth for dinars (signup +50, level-5 +100).
  // Local-only effects (badges/titles/artifacts for stages 3 & 4) remain client-side.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const lvl = levelFor(profile.points).level;
      if (lvl >= 5) {
        await advanceReferralStage(2, profile); // server pays +100 via grant_level5_reward (idempotent)
      }
      if (profile.campaignsCompleted.length >= 1) {
        const r = await advanceReferralStage(3, profile);
        if (r.ok) { awardBadge(REFERRAL_REWARDS.stage3.badge); grantTitle(REFERRAL_REWARDS.stage3.title); }
      }
      if (profile.streak >= 7) {
        const r = await advanceReferralStage(4, profile);
        if (r.ok) grantTitle(REFERRAL_REWARDS.stage4.title);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile.points, profile.streak, profile.campaignsCompleted.length]);

  if (!user) {
    return (
      <AppShell>
        <Screen title="حَمَلة الإرث" subtitle="سجّل دخولك للحصول على رمزك">
          <AuthLink className="mt-4 inline-flex rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">دخول</AuthLink>
        </Screen>
      </AppShell>
    );
  }

  async function copy() {
    if (!link) return;
    const ok = await (await import("@/lib/share/shareService")).copyToClipboard(link);
    if (ok) (await import("sonner")).toast.success("تم نسخ الرابط");
    else (await import("sonner")).toast.error("تعذّر النسخ");
  }
  async function shareLink() {
    if (!code) return;
    const { shareReferral } = await import("@/lib/referrals");
    await shareReferral(code);
  }

  return (
    <AppShell>
      <Screen title="حَمَلة الإرث" subtitle="ادعُ أصدقاءك واحصل على مكافآت">
        <div className="mb-3"><Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> رجوع</Link></div>

        <div className="rounded-3xl border border-gold/30 bg-surface p-5 text-center shadow-elegant">
          <p className="text-xs text-muted-foreground">رمز الإحالة الخاص بك</p>
          <div className="my-2 text-2xl font-bold tracking-widest text-gold">{code ?? "—"}</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copy} className="flex items-center justify-center gap-1 rounded-xl border border-gold/30 py-2 text-sm"><Copy className="size-4" /> نسخ الرابط</button>
            <button onClick={shareLink} className="flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2 text-sm font-bold text-primary-foreground shadow-gold"><Share2 className="size-4" /> مشاركة</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <Box label="دعوات" value={serverStats?.invited ?? stats.total} />
          <Box label="انضموا" value={serverStats?.joined ?? 0} />
          <Box label="مستوى 5" value={serverStats?.level5 ?? stats.active} />
          <Box label="تحويل %" value={serverStats?.conversion_pct ?? 0} />
          <Box label="إجمالي دنانير" value={serverStats?.total_dinars ?? stats.rewards} />
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">المراحل</h3>
          <Stage n={1} title="انضمام الصديق" reward="+50 دينار" />
          <Stage n={2} title="وصول الصديق للمستوى 5" reward="+100 دينار · أثر حصري" />
          <Stage n={3} title="إتمام أول حملة" reward="شارة · لقب «حامل الإرث»" />
          <Stage n={4} title="استمرار 7 أيام" reward="لقب «ناشر الإرث»" />
        </div>

        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold"><Trophy className="size-4" /> إحالاتك</h3>
          {rows.length === 0 && <p className="text-xs text-muted-foreground">لم تتم أي إحالة بعد. شارك رمزك للبدء.</p>}
          <div className="space-y-2">
            {rows.map(({ row, friend }) => (
              <div key={row.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3">
                <Gift className="size-5 text-gold" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{friend?.username ?? "صديق"}</div>
                  <div className="text-[11px] text-muted-foreground">المرحلة {row.stage} / 4</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Screen>
    </AppShell>
  );
}

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gold/20 bg-surface p-3">
      <div className="text-lg font-bold text-gold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Stage({ n, title, reward }: { n: number; title: string; reward: string }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-gradient-gold text-xs font-bold text-primary-foreground shadow-gold">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-[11px] text-gold">{reward}</div>
      </div>
    </div>
  );
}
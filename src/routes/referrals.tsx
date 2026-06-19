import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Share2, Gift, ChevronLeft, Trophy } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import {
  advanceReferralStage, buildReferralLink, fetchPublicProfileById, listMyReferrals,
  REFERRAL_REWARDS, type PublicProfile, type ReferralRow,
} from "@/lib/social";
import { levelFor } from "@/lib/data";

export const Route = createFileRoute("/referrals")({
  head: () => ({ meta: [{ title: "حملة الإرث" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const { user } = useAccount();
  const { profile, addDinars, awardBadge, grantTitle, grantArtifact } = useProfile();
  const [code, setCode] = useState<string | null>(null);
  const [rows, setRows] = useState<{ row: ReferralRow; friend: PublicProfile | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchPublicProfileById(user.id).then((p) => setCode(p?.referral_code ?? null));
    listMyReferrals(user.id).then(setRows);
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

  // Referee-side: advance own stages as profile grows.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const lvl = levelFor(profile.points).level;
      if (lvl >= 5) {
        const r = await advanceReferralStage(2, profile);
        if (r.ok) { addDinars(REFERRAL_REWARDS.stage2.dinars); grantArtifact(REFERRAL_REWARDS.stage2.artifact); }
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
          <Link to="/auth" className="mt-4 inline-flex rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">دخول</Link>
        </Screen>
      </AppShell>
    );
  }

  async function copy() { if (link) await navigator.clipboard.writeText(link); }
  async function shareLink() {
    if (!link) return;
    try { await navigator.share?.({ text: "انضم إلى رحلتك التاريخية في إرث", url: link }); } catch {}
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

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Box label="إجمالي" value={stats.total} />
          <Box label="نشط" value={stats.active} />
          <Box label="دينار" value={stats.rewards} />
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
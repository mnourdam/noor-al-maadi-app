import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Flame, Star, Trophy, Coins, MapPin, IdCard, ChevronLeft, UserPlus, BarChart3 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { fetchPublicProfileByUsername, sendFriendRequest, type PublicProfile } from "@/lib/social";
import { useAccount } from "@/lib/account";
import { Avatar } from "@/components/Avatar";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "صفحة عامة" }] }),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAccount();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicProfileByUsername(username).then((r) => { setP(r); setLoading(false); });
  }, [username]);

  return (
    <AppShell>
      <Screen title={p ? `@${p.username}` : "صفحة عامة"} subtitle={p?.title ?? ""}>
        <div className="mb-3">
          <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> الأصدقاء</Link>
        </div>

        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && !p && <p className="text-sm text-rose-300">لم يُعثر على لاعب بهذا الاسم.</p>}

        {p && (
          <>
            <div className="rounded-3xl border border-gold/30 bg-surface p-5 shadow-elegant">
              <div className="flex items-center gap-3">
                <Avatar avatarId={p.avatar_id} size="lg" fallbackChar={p.username[0]} />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold">{p.username}</div>
                  <div className="text-xs text-gold">{p.title ?? "مستكشف التاريخ"}</div>
                  {p.bio && <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{p.bio}</p>}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat icon={<Crown className="size-4" />} label="المستوى" value={p.level} />
                <Stat icon={<Star className="size-4" />} label="XP" value={p.xp} />
                <Stat icon={<Coins className="size-4" />} label="دينار" value={p.dinars} />
                <Stat icon={<Flame className="size-4" />} label="السلسلة" value={p.streak} />
                <Stat icon={<Trophy className="size-4" />} label="حملات" value={p.campaigns_completed} />
                <Stat icon={<IdCard className="size-4" />} label="آثار" value={p.artifacts_collected} />
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">اكتشاف الموسوعة</span>
                  <span className="font-bold text-gold">{p.discovery_pct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full bg-gradient-gold" style={{ width: `${p.discovery_pct}%` }} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1 rounded-xl border border-white/10 p-2"><MapPin className="size-3.5 text-gold" /> {p.favorite_state_id || "—"}</div>
                <div className="rounded-xl border border-white/10 p-2">آخر نشاط: {new Date(p.last_active).toLocaleDateString("ar")}</div>
              </div>
            </div>

            {user && user.id !== p.id && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    const r = await sendFriendRequest(user.id, p.id);
                    setMsg(r.ok ? "أُرسل الطلب" : r.error ?? "تعذر الإرسال");
                  }}
                  className="flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
                >
                  <UserPlus className="size-4" /> إضافة صديق
                </button>
                <Link to="/compare/$id" params={{ id: p.id }} className="flex items-center justify-center gap-1 rounded-xl border border-gold/30 py-2.5 text-sm">
                  <BarChart3 className="size-4" /> مقارنة
                </Link>
              </div>
            )}
            {msg && <p className="mt-2 text-center text-xs text-gold">{msg}</p>}
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-2 text-center">
      <div className="mx-auto mb-1 inline-flex size-7 items-center justify-center rounded-lg bg-gradient-gold text-primary-foreground">{icon}</div>
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
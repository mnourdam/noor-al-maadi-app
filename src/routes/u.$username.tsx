import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Flame, Star, Trophy, Coins, MapPin, IdCard, ChevronLeft, UserPlus, BarChart3, Check, X, Users, Hourglass } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  fetchPublicProfileByUsername, fetchGatedProfileByUsername,
  sendFriendRequest, getFriendshipWith,
  acceptFriend, removeFriend,
  type PublicProfile, type FriendshipRow,
} from "@/lib/social";
import { useAccount } from "@/lib/account";
import { toWesternDigits } from "@/lib/formatNumber";
import { Avatar } from "@/components/Avatar";
import { displayEntityName, displayCharacterName } from "@/lib/display-names";

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
  const [friendship, setFriendship] = useState<
    { row: FriendshipRow; direction: "incoming" | "outgoing" | "accepted" } | null
  >(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Public player card: any signed-in player may open it. The RPC returns
      // curated public columns only. Falls back to the search projection if
      // the profile lookup is unavailable (offline / transient error).
      const gated = await fetchGatedProfileByUsername(username);
      if (gated) {
        if (!alive) return;
        setP(gated); setLoading(false); return;
      }
      const basic = await fetchPublicProfileByUsername(username);
      if (!alive) return;
      setP(basic); setLoading(false);
    })();
    return () => { alive = false; };
  }, [username]);

  useEffect(() => {
    if (!user || !p) { setFriendship(null); return; }
    if (user.id === p.id) { setFriendship(null); return; }
    getFriendshipWith(user.id, p.id).then(setFriendship);
  }, [user, p]);

  async function refreshFriendship() {
    if (!user || !p) return;
    setFriendship(await getFriendshipWith(user.id, p.id));
  }

  async function onAdd() {
    if (!user || !p) return;
    setBusy(true);
    const r = await sendFriendRequest(user.id, p.id);
    setMsg(r.ok ? "أُرسل الطلب" : r.error ?? "تعذر الإرسال");
    await refreshFriendship();
    setBusy(false);
  }
  async function onAccept() {
    if (!friendship) return;
    setBusy(true);
    await acceptFriend(friendship.row.id);
    await refreshFriendship();
    setBusy(false);
  }
  async function onReject() {
    if (!friendship) return;
    setBusy(true);
    await removeFriend(friendship.row.id);
    await refreshFriendship();
    setBusy(false);
  }

  return (
    <AppShell>
      <Screen title={p ? `@${p.username}` : "صفحة عامة"} subtitle={p?.title ?? ""}>
        <div className="mb-3">
          <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> الأصدقاء</Link>
        </div>

        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && !p && <p className="text-sm text-rose-300">لم يُعثر على لاعب بهذا الاسم.</p>}

        {p && (() => {
          const isSelf = !!user && user.id === p.id;
          const canView = isSelf || friendship?.direction === "accepted";
          return (
          <>
            <div className="rounded-3xl border border-gold/30 bg-surface p-5 shadow-elegant">
              <div className="flex items-center gap-3">
                <Avatar avatarId={p.avatar_id} size="lg" fallbackChar={p.username[0]} />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold">{p.username}</div>
                  <div className="text-xs text-gold">{p.title ?? "مستكشف التاريخ"}</div>
                  {canView && p.bio && <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{p.bio}</p>}
                </div>
              </div>

              {canView ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat icon={<Crown className="size-4" />} label="المستوى" value={p.level} />
                    <Stat icon={<Trophy className="size-4" />} label="حملات" value={p.campaigns_completed} />
                    <Stat icon={<IdCard className="size-4" />} label="آثار" value={p.artifacts_collected} />
                  </div>
                  {/* XP, dinars, streak, last_active are private and intentionally
                      not displayed for other players (security finding fix). */}

                  <div className="mt-4 rounded-2xl border border-white/10 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">اكتشاف الموسوعة</span>
                      <span className="font-bold text-gold">{p.discovery_pct}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full bg-gradient-gold" style={{ width: `${p.discovery_pct}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-1 rounded-xl border border-white/10 p-2">
                      <MapPin className="size-3.5 shrink-0 text-gold" />
                      <span className="truncate">{p.favorite_state_id ? displayEntityName(p.favorite_state_id) : "—"}</span>
                      {p.favorite_figure_id && (
                        <span className="truncate text-gold/70">· {displayCharacterName(p.favorite_figure_id)}</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-background/40 p-4 text-center text-xs text-muted-foreground">
                  تفاصيل تقدّم هذا اللاعب متاحة فقط للأصدقاء. أرسل طلب صداقة لعرض ملفه الكامل.
                </div>
              )}

            </div>

            {user && !isSelf && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {friendship?.direction === "accepted" ? (
                  <button
                    disabled
                    className="flex items-center justify-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/10 py-2.5 text-sm font-bold text-emerald-200"
                  >
                    <Users className="size-4" /> صديقك في الرحلة
                  </button>
                ) : friendship?.direction === "outgoing" ? (
                  <button
                    disabled
                    className="flex items-center justify-center gap-1 rounded-xl border border-white/15 bg-surface-2 py-2.5 text-sm font-bold text-muted-foreground"
                  >
                    <Hourglass className="size-4" /> بانتظار القبول
                  </button>
                ) : friendship?.direction === "incoming" ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      disabled={busy}
                      onClick={onAccept}
                      className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600/80 py-2.5 text-xs font-bold text-white"
                    >
                      <Check className="size-4" /> قبول
                    </button>
                    <button
                      disabled={busy}
                      onClick={onReject}
                      className="flex items-center justify-center gap-1 rounded-xl bg-rose-600/80 py-2.5 text-xs font-bold text-white"
                    >
                      <X className="size-4" /> رفض
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy}
                    onClick={onAdd}
                    className="flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
                  >
                    <UserPlus className="size-4" /> إضافة صديق
                  </button>
                )}
                {canView && (
                  <Link to="/compare/$id" params={{ id: p.id }} className="flex items-center justify-center gap-1 rounded-xl border border-gold/30 py-2.5 text-sm">
                    <BarChart3 className="size-4" /> مقارنة
                  </Link>
                )}
              </div>
            )}
            {msg && <p className="mt-2 text-center text-xs text-gold">{msg}</p>}
          </>
          );
        })()}
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
import { useUiLanguage } from "@/lib/ui-language/store";
import { COMMUNITY_CONTROL_MESSAGES, communityCount } from "@/lib/ui-language/community-control-messages";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, Trophy, UserPlus, Inbox, ChevronLeft, Sparkles, BellRing } from "lucide-react";
import { useAccount } from "@/lib/account";
import { listFriendships, type FriendEntry } from "@/lib/social";
import { usePendingBadge, refreshPendingBadges } from "@/lib/pending-badges";

function initialsOf(p: { display_name: string | null; username: string }): string {
  const src = (p.display_name?.trim() || p.username || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export function CommunityHubSection() {
  const { language } = useUiLanguage();
  const text = COMMUNITY_CONTROL_MESSAGES[language];
  const { user } = useAccount();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const pendingCount = usePendingBadge("friend_requests");

  useEffect(() => {
    if (!user) { setFriends([]); return; }
    let alive = true;
    const refresh = async () => {
      try {
        const list = await listFriendships(user.id);
        if (!alive) return;
        setFriends(list);
      } catch {
        if (alive) setFriends([]);
      }
      void refreshPendingBadges();
    };
    refresh();
    const onUpdate = () => { refresh(); };
    window.addEventListener("irth:friends:updated", onUpdate);
    window.addEventListener("irth:notifications:updated", onUpdate);
    return () => {
      alive = false;
      window.removeEventListener("irth:friends:updated", onUpdate);
      window.removeEventListener("irth:notifications:updated", onUpdate);
    };
  }, [user]);


  const accepted = (friends ?? []).filter((f) => f.direction === "accepted");
  const incoming = (friends ?? []).filter((f) => f.direction === "incoming");
  const isGuest = !user;
  const isEmpty = !isGuest && accepted.length === 0 && incoming.length === 0;
  const badgeCount = Math.max(pendingCount, incoming.length);

  const friendsLabel = isGuest ? text.signUp : communityCount(language, "friends", accepted.length);
  const requestsLabel = isGuest ? "—" : communityCount(language, "requests", badgeCount);
  const rankLabel = text.rankStart;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-[#0b1024] via-[#0a0f22] to-[#101736] p-5 shadow-elegant">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-gold/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-10 size-56 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Header */}
      <header className="relative flex items-start gap-3">
        <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/20 to-amber-700/10 text-gold shadow-gold/30">
          <Users className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">{text.title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {text.subtitle}
          </p>
        </div>
        <Sparkles className="size-4 text-gold/70" />
      </header>

      {/* Pending request highlight */}
      {badgeCount > 0 && (
        <Link
          to="/friends"
          search={{ tab: "requests" }}
          className="relative mt-4 flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5 text-amber-100 transition hover:bg-amber-300/15"
        >
          <BellRing className="size-4 text-amber-200" />
          <span className="text-[13px] font-bold">
            {communityCount(language, "pending", badgeCount)}
          </span>
          <ChevronLeft className="ms-auto size-4 opacity-70 ltr:rotate-180" />
        </Link>
      )}


      {/* Stat chips */}
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <StatChip icon={<Users className="size-3.5 text-gold" />} label={text.friends} value={friendsLabel} />
        <StatChip icon={<Inbox className="size-3.5 text-gold" />} label={text.requests} value={requestsLabel} />
        <StatChip icon={<Trophy className="size-3.5 text-gold" />} label={text.yourRank} value={rankLabel} />
      </div>

      {/* Social preview / empty */}
      <div className="relative mt-4 rounded-2xl border border-white/10 bg-background/40 p-3">
        {isEmpty || isGuest ? (
          <p className="text-center text-[12px] text-muted-foreground">
            {isGuest
              ? text.guestHint
              : text.emptyHint}
          </p>
        ) : accepted.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2 rtl:space-x-reverse">
              {accepted.slice(0, 5).map((f) => (
                <div
                  key={f.row.id}
                  title={f.other.display_name ?? f.other.username}
                  className="inline-flex size-9 items-center justify-center rounded-full border-2 border-[#0b1024] bg-gradient-to-br from-gold/30 to-amber-700/20 text-[11px] font-bold text-gold"
                >
                  {initialsOf(f.other)}
                </div>
              ))}
              {accepted.length > 5 && (
                <div className="inline-flex size-9 items-center justify-center rounded-full border-2 border-[#0b1024] bg-white/10 text-[11px] font-bold text-foreground">
                  +{accepted.length - 5}
                </div>
              )}
            </div>
            <span className="ms-auto text-[11px] text-muted-foreground">
              {text.recentResearchers}
            </span>
          </div>
        ) : (
          <p className="text-center text-[12px] text-muted-foreground">
            {text.pendingHint}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <Link
          to="/friends"
          search={{ tab: badgeCount > 0 ? "requests" : "friends" }}
          className="relative inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-gold py-2.5 text-[12px] font-bold text-primary-foreground shadow-gold"
        >
          <Users className="size-4" /> {text.viewFriends}
          {badgeCount > 0 && (
            <span className="absolute -top-1.5 -start-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-[#0b1024]">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Link>

        <Link
          to="/friends"
          search={{ tab: "leaderboard" }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gold/30 bg-background/40 py-2.5 text-[12px] font-bold text-foreground hover:bg-background/60"
        >
          <Trophy className="size-4 text-gold" /> {text.leaderboard}
        </Link>
        <Link
          to="/friends"
          search={{ tab: "add" }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-background/40 py-2.5 text-[12px] font-bold text-foreground hover:bg-background/60"
        >
          <UserPlus className="size-4 text-gold" /> {text.addFriend}
        </Link>
      </div>
    </section>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 truncate text-[12px] font-bold text-foreground">{value}</div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { fetchPublicProfileById, derivePublicStats, type PublicProfile } from "@/lib/social";
import { evaluateAchievements } from "@/lib/app-constants";
import { Avatar } from "@/components/Avatar";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";

export const Route = createFileRoute("/compare/$id")({
  head: () => ({ meta: [{ title: "مقارنة" }] }),
  component: ComparePage,
});

function ComparePage() {
  const { id } = Route.useParams();
  const { user, account } = useAccount();
  const { profile } = useProfile();
  const [other, setOther] = useState<PublicProfile | null>(null);

  useEffect(() => { fetchPublicProfileById(id).then(setOther); }, [id]);

  const me = useMemo(() => {
    const s = derivePublicStats(profile);
    return {
      username: account?.username ?? profile.name,
      ...s,
      achievements: evaluateAchievements(profile).filter((a) => a.earned).length,
      avatarId: profile.avatarId ?? DEFAULT_AVATAR_ID,
    };
  }, [profile, account]);

  if (!user) {
    return (
      <AppShell>
        <Screen title="مقارنة" subtitle="سجّل دخولك للمقارنة">
          <Link to="/auth" className="mt-4 inline-flex rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">دخول</Link>
        </Screen>
      </AppShell>
    );
  }

  // XP, dinars, streak are owner-private and not exposed for other players.
  const rows: { label: string; me: number | string; them: number | string }[] = other ? [
    { label: "المستوى", me: me.level, them: other.level },
    { label: "الحملات", me: me.campaigns_completed, them: other.campaigns_completed },
    { label: "الآثار", me: me.artifacts_collected, them: other.artifacts_collected },
    { label: "الموسوعة %", me: me.discovery_pct, them: other.discovery_pct },
    { label: "الإنجازات", me: me.achievements, them: "—" },
  ] : [];


  return (
    <AppShell>
      <Screen title="مقارنة التقدم" subtitle="أنت مقابل صديقك">
        <div className="mb-3"><Link to="/friends" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> رجوع</Link></div>
        {!other && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {other && (
          <div className="rounded-3xl border border-gold/25 bg-surface p-4 shadow-elegant">
            <div className="grid grid-cols-2 gap-3 border-b border-white/10 pb-3 text-center">
              <Head username={me.username} title={me.title ?? ""} avatarId={me.avatarId} />
              <Head username={other.username} title={other.title ?? ""} avatarId={other.avatar_id} />
            </div>
            <div className="mt-3 space-y-1">
              {rows.map((r) => <CompareRow key={r.label} {...r} />)}
            </div>
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function Head({ username, title, avatarId }: { username: string; title: string; avatarId?: string | null }) {
  return (
    <div>
      <div className="mx-auto"><Avatar avatarId={avatarId} size="md" fallbackChar={username[0]} /></div>
      <div className="mt-1 truncate text-sm font-bold">{username}</div>
      <div className="truncate text-[11px] text-gold">{title}</div>
    </div>
  );
}

function CompareRow({ label, me, them }: { label: string; me: number | string; them: number | string }) {
  const meWins = typeof me === "number" && typeof them === "number" && me > them;
  const themWins = typeof me === "number" && typeof them === "number" && them > me;
  return (
    <div className="grid grid-cols-5 items-center gap-2 rounded-xl border border-white/5 p-2 text-sm">
      <div className={`col-span-2 text-center font-bold ${meWins ? "text-gold" : ""}`}>{me}</div>
      <div className="col-span-1 text-center text-[11px] text-muted-foreground">{label}</div>
      <div className={`col-span-2 text-center font-bold ${themWins ? "text-gold" : ""}`}>{them}</div>
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Crown, Sparkles, Swords } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AuthLink } from "@/components/AuthLink";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import {
  fetchGatedProfileById,
  derivePublicStats,
  type PublicProfile,
} from "@/lib/social";
import { EmblemArt } from "@/components/EmblemArt";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";

export const Route = createFileRoute("/compare/$id")({
  head: () => ({
    meta: [
      { title: "مقارنة الأصدقاء · إرث" },
      { name: "description", content: "قارن تقدّمك التاريخي مع صديقك عبر مقاييس إرث الموحّدة." },
    ],
  }),
  component: ComparePage,
});

// ============================================================
// Ownership contract (frozen — do not use generic left/right):
//   RIGHT column visually  = current authenticated player  (`me`)
//   LEFT  column visually  = friend                        (`friend`)
//   Center column          = metric icon + label
//
// The page renders under dir="rtl". Under RTL a CSS grid places the
// FIRST DOM child on the RIGHT. Therefore for every 3-cell row we
// author DOM order [meCell, metricCell, friendCell] so that `me`
// is always on the right and `friend` is always on the left. Do
// NOT rely on implicit RTL flipping to reorder generic arrays.
// ============================================================

type SideId = "me" | "friend";

interface Side {
  side: SideId;
  displayName: string;
  username: string;
  title: string;
  avatarId: string | null;
  level: number;
  xp: number;
  campaigns: number;
}

interface MetricDef {
  key: "level" | "xp" | "campaigns";
  label: string;
  icon: React.ReactNode;
  diffNoun?: (n: number) => string;
}

// Symmetric metrics only. `artifacts_collected` and `discovery_pct` were
// removed from this comparison because their friend-side source
// (derivePublicStats over the friend's legacy profile arrays) is not
// symmetric with the current-user canonical sources (user_collection /
// user_entity_discoveries). They will return after the public projection
// exposes canonical counts derived from the same tables for both users.
const METRICS: MetricDef[] = [
  { key: "level", label: "المستوى", icon: <Crown className="size-4" />, diffNoun: (n) => `+${n} مستويات` },
  { key: "xp", label: "نقاط الخبرة", icon: <Sparkles className="size-4" />, diffNoun: (n) => `+${n} نقطة` },
  { key: "campaigns", label: "الحملات المكتملة", icon: <Swords className="size-4" />, diffNoun: (n) => `+${n} حملات` },
];

function bestDisplayName(p: { display_name?: string | null; username: string }) {
  const dn = (p.display_name ?? "").trim();
  if (dn && dn !== "ضيف" && !dn.includes("@")) return dn;
  return p.username;
}

function ComparePage() {
  const { id } = Route.useParams();
  const { user, account } = useAccount();
  const { profile } = useProfile();
  const [meProfile, setMeProfile] = useState<PublicProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      setDenied(false);
      
      try {
        // 1. Strict sequence: syncNow MUST complete before fetches
        if (user) {
          await account.syncNow();
        }

        if (!alive) return;

        // 2. Authoritative dual fetch from the same source
        const [meRes, otherRes] = await Promise.all([
          user ? fetchGatedProfileById(user.id) : Promise.resolve(null),
          fetchGatedProfileById(id)
        ]);

        if (!alive) return;

        setMeProfile(meRes);
        setOther(otherRes);
        
        if (!otherRes) {
          setDenied(true);
        }
      } catch (err) {
        console.error("[compare] Load failed:", err);
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [id, user?.id, account]);

  const me: Side | null = useMemo(() => {
    if (!user) return null;
    const s = derivePublicStats(profile);
    return {
      side: "me",
      displayName: bestDisplayName({
        display_name: account?.display_name ?? null,
        username: account?.username ?? profile.name,
      }),
      username: account?.username ?? profile.name,
      title: s.title ?? "مستكشف التاريخ",
      avatarId: profile.avatarId ?? DEFAULT_AVATAR_ID,
      level: s.level,
      xp: s.xp,
      campaigns: s.campaigns_completed,
    };
  }, [user, profile, account]);

  const friend: Side | null = useMemo(() => {
    if (!other) return null;
    return {
      side: "friend",
      displayName: bestDisplayName({ display_name: other.display_name, username: other.username }),
      username: other.username,
      title: other.title ?? "مستكشف التاريخ",
      avatarId: other.avatar_id,
      level: other.level,
      xp: other.xp ?? 0,
      campaigns: other.campaigns_completed,
    };
  }, [other]);

  // Dev-only ownership assertion. Guarantees the row builder never swaps
  // sides. If this ever fires, someone reordered the DOM children.
  if (import.meta.env.DEV && me && friend) {
    console.assert(me.side === "me", "[compare] me.side must be 'me'");
    console.assert(friend.side === "friend", "[compare] friend.side must be 'friend'");
  }

  if (!user) {
    return (
      <AppShell>
        <Screen title="مقارنة" subtitle="سجّل دخولك للمقارنة">
          <AuthLink className="mt-4 inline-flex rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">دخول</AuthLink>
        </Screen>
      </AppShell>
    );
  }

  const meLead = me && friend
    ? METRICS.filter((m) => me[m.key] > friend[m.key]).length
    : 0;
  const friendLead = me && friend
    ? METRICS.filter((m) => friend[m.key] > me[m.key]).length
    : 0;
  const summary = !me || !friend
    ? ""
    : meLead === friendLead
      ? "التقدم متقارب — رحلة متكافئة"
      : meLead > friendLead
        ? `أنت متقدّم في ${meLead} ${meLead === 1 ? "مجال" : "مجالات"}`
        : `${friend.displayName} متقدّم في ${friendLead} ${friendLead === 1 ? "مجال" : "مجالات"}`;

  return (
    <AppShell>
      <Screen title="مواجهة تقدّم تاريخية" subtitle="أنت مقابل صديقك في مقاييس إرث الموحّدة">
        <div className="mb-3">
          <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> الأصدقاء
          </Link>
        </div>

        {!other && !denied && (
          <div className="rounded-3xl border border-gold/20 bg-surface p-8 text-center text-sm text-muted-foreground">
            جارٍ التحميل…
          </div>
        )}

        {denied && (
          <div className="rounded-3xl border border-white/10 bg-surface p-6 text-center text-sm text-muted-foreground">
            هذه المقارنة متاحة فقط بين الأصدقاء. أرسل طلب صداقة أولاً لعرض تقدّم هذا اللاعب.
          </div>
        )}

        {me && friend && (
          <div dir="rtl" className="overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-b from-surface to-surface-2 shadow-elegant">
            {/* HERO — DOM order [me, VS, friend] → RTL renders me on the RIGHT */}
            <div className="relative px-3 pt-6 pb-4 sm:px-5">
              <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(60%_40%_at_15%_30%,color-mix(in_oklab,var(--color-gold)_18%,transparent),transparent),radial-gradient(60%_40%_at_85%_30%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent)]" />
              <div className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-4">
                <PlayerHero side={me} align="end" eager />
                <VsBadge />
                <PlayerHero side={friend} align="start" />
              </div>
            </div>

            {/* METRICS */}
            <div className="border-t border-white/10 bg-background/30 px-3 py-4 sm:px-5">
              <div className="space-y-2">
                {METRICS.map((m) => (
                  <CompareRow key={m.key} metric={m} me={me} friend={friend} />
                ))}
              </div>
            </div>

            {/* SUMMARY */}
            <div className="border-t border-white/10 px-4 py-4 text-center">
              <p className="text-sm font-bold text-gold">{summary}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">مقارنة بصرية — لا مكافآت ولا ترتيب</p>
            </div>
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

// ---------- Sub-components ----------

function PlayerHero({ side, align, eager = false }: { side: Side; align: "start" | "end"; eager?: boolean }) {
  const alignCls = align === "end" ? "items-end text-right" : "items-start text-left";
  return (
    <div className={`flex min-w-0 flex-col ${alignCls}`}>
      <div className="relative">
        <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-gold/30 to-primary/20 blur-lg opacity-70" />
        <div className="relative grid size-24 place-items-center rounded-full border border-gold/40 bg-background/70 sm:size-28">
          <EmblemArt avatarId={side.avatarId} size="lg" className="size-20 sm:size-24" eager={eager} />
        </div>
      </div>
      <div className={`mt-3 flex w-full min-w-0 flex-col ${alignCls}`}>
        <div className="w-full truncate text-sm font-black sm:text-base">{side.displayName}</div>
        <div className="w-full truncate text-[11px] text-gold">{side.title}</div>
        <div className="w-full truncate text-[10px] text-muted-foreground">@{side.username}</div>
        <div className="mt-1.5 inline-flex items-center gap-1 self-auto rounded-full border border-gold/30 bg-background/60 px-2 py-0.5 text-[10px] font-bold text-gold">
          <Crown className="size-3" /> المستوى {side.level}
        </div>
      </div>
    </div>
  );
}

function VsBadge() {
  return (
    <div className="flex flex-col items-center justify-start pt-6">
      <div className="relative grid size-12 place-items-center rounded-full border border-gold/50 bg-gradient-gold text-primary-foreground shadow-gold sm:size-14">
        <span className="text-sm font-black tracking-wider sm:text-base">VS</span>
      </div>
      <div className="mt-2 text-[10px] font-bold text-muted-foreground">مقارنة</div>
    </div>
  );
}

function CompareRow({ metric, me, friend }: { metric: MetricDef; me: Side; friend: Side }) {
  const meVal = me[metric.key];
  const friendVal = friend[metric.key];
  const meWins = meVal > friendVal;
  const friendWins = friendVal > meVal;
  const diff = Math.abs(meVal - friendVal);
  const diffLabel = diff > 0 && metric.diffNoun ? metric.diffNoun(diff) : "";

  // Fixed 3-column grid with equal-width value columns. DOM order
  // [meCell, metricCell, friendCell] → RTL puts `me` on the RIGHT and
  // `friend` on the LEFT to match the hero band above.
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/5 bg-background/40 px-2 py-2.5 sm:gap-3 sm:px-3">
      <ValueCell value={meVal} highlight={meWins} side="me" />
      <div className="flex w-24 flex-col items-center sm:w-28">
        <div className="grid size-8 place-items-center rounded-full border border-gold/25 bg-surface text-gold">
          {metric.icon}
        </div>
        <div className="mt-1 whitespace-nowrap text-[10px] font-bold text-muted-foreground">{metric.label}</div>
        {diffLabel && (
          <div className="mt-0.5 whitespace-nowrap text-[9px] text-gold/70">{diffLabel}</div>
        )}
      </div>
      <ValueCell value={friendVal} highlight={friendWins} side="friend" />
    </div>
  );
}

function ValueCell({ value, highlight, side }: { value: number; highlight: boolean; side: SideId }) {
  // Ownership-locked cell:
  //  - `me`     → visually right in RTL, contents flush to the OUTER (right) edge
  //  - `friend` → visually left  in RTL, contents flush to the OUTER (left) edge
  // Under dir="rtl" `justify-start` = right edge, `justify-end` = left edge.
  const justify = side === "me" ? "justify-start" : "justify-end";
  return (
    <div
      data-owner={side}
      className={`flex min-w-0 items-center gap-1 ${justify}`}
    >
      {highlight && <Crown className="size-3.5 text-gold" />}
      <div className={`truncate text-lg font-black tabular-nums sm:text-xl ${highlight ? "text-gold" : "text-foreground/85"}`}>
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}

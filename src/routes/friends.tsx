import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, UserPlus, Check, X, Trash2, ChevronLeft, Users, Inbox,
  GitCompare, Trophy, Sparkles, Crown,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AuthLink } from "@/components/AuthLink";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { useAccount } from "@/lib/account";
import {
  acceptFriend, listFriendships, removeFriend, searchPlayers, sendFriendRequest,
  fetchGlobalLeaderboard, fetchLeaderboardAroundMe,
  type FriendEntry, type PublicProfile, type LeaderboardRow,
} from "@/lib/social";
import { Avatar } from "@/components/Avatar";

type FriendsTab = "friends" | "requests" | "add" | "compare" | "leaderboard";

const TABS: { id: FriendsTab; label: string; icon: typeof Users; subtitle: string }[] = [
  { id: "friends",     label: "أصدقائي",       icon: Users,      subtitle: "قائمة من قبلت طلباتك" },
  { id: "requests",    label: "طلبات الصداقة", icon: Inbox,      subtitle: "الطلبات الواردة والمرسلة" },
  { id: "add",         label: "إضافة صديق",     icon: UserPlus,   subtitle: "ابحث بالاسم أو اسم المستخدم" },
  { id: "compare",     label: "مقارنة",         icon: GitCompare, subtitle: "قارن إنجازاتك مع صديق" },
  { id: "leaderboard", label: "لوحة الترتيب",   icon: Trophy,     subtitle: "الترتيب العالمي حسب الخبرة" },
];


export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "الأصدقاء" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: FriendsTab } => {
    const t = typeof s.tab === "string" ? (s.tab as FriendsTab) : undefined;
    return TABS.some((x) => x.id === t) ? { tab: t } : {};
  },
  component: FriendsPage,
});

function FriendsPage() {
  const { user } = useAccount();
  const search = useSearch({ from: "/friends" });
  const [tab, setTab] = useState<FriendsTab>(search.tab ?? "friends");
  useEffect(() => { if (search.tab && search.tab !== tab) setTab(search.tab); }, [search.tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const reload = useCallback(async () => {
    if (!user) return;
    setFriends(await listFriendships(user.id));
  }, [user]);
  useEffect(() => { reload(); }, [reload]);

  if (!user) {
    return (
      <AppShell>
        <Screen title="الأصدقاء" subtitle="سجّل دخولك لاكتشاف الأصدقاء">
          <AuthLink className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">تسجيل الدخول</AuthLink>
        </Screen>
      </AppShell>
    );
  }

  const incoming = friends.filter((f) => f.direction === "incoming");
  const outgoing = friends.filter((f) => f.direction === "outgoing");
  const accepted = friends.filter((f) => f.direction === "accepted");

  return (
    <AppShell>
      <Screen title="الأصدقاء" subtitle="ابحث وأرسل الطلبات وقارن الإنجازات">
        <div className="mb-3">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> رجوع
          </Link>
        </div>

        {/* Tabs */}
        <nav
          className="sticky top-0 z-30 -mx-4 border-y border-gold/15 bg-background/85 px-4 py-2 backdrop-blur-md"
          role="tablist" aria-label="أقسام الأصدقاء"
        >
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const badge =
                t.id === "requests" ? incoming.length :
                t.id === "friends" ? accepted.length : 0;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    active
                      ? "bg-gradient-gold text-primary-foreground shadow-gold"
                      : "border border-white/10 bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{t.label}</span>
                  {badge > 0 && (
                    <span className={`ms-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${
                      active ? "bg-background/90 text-gold" : "bg-gold/20 text-gold"
                    }`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {TABS.find((t) => t.id === tab)?.subtitle}
        </p>

        <div className="mt-4">
          {tab === "friends"     && <FriendsSection accepted={accepted} reload={reload} onAdd={() => setTab("add")} />}
          {tab === "requests"    && <RequestsSection incoming={incoming} outgoing={outgoing} reload={reload} onAdd={() => setTab("add")} />}
          {tab === "add"         && <AddSection meId={user.id} friends={friends} reload={reload} />}
          {tab === "compare"     && <CompareSection accepted={accepted} onAdd={() => setTab("add")} />}
          {tab === "leaderboard" && <LeaderboardSection />}
        </div>
      </Screen>
    </AppShell>
  );
}

// ============== Sections ==============

function FriendsSection({ accepted, reload, onAdd }: {
  accepted: FriendEntry[]; reload: () => void; onAdd: () => void;
}) {
  if (accepted.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-8 text-gold" />}
        title="لا أصدقاء بعد"
        body="ابدأ بإضافة صديق لمشاركة رحلتك التاريخية ومقارنة إنجازاتكم."
        cta={{ label: "إضافة صديق", onClick: onAdd }}
      />
    );
  }
  return (
    <div className="space-y-2">
      {accepted.map((f) => (
        <Row key={f.row.id} other={f.other} right={
          <div className="flex gap-1.5">
            <Link to="/compare/$id" params={{ id: f.other.id }} className="rounded-xl border border-gold/30 px-3 py-1.5 text-xs text-gold">مقارنة</Link>
            <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-rose-300" aria-label="إزالة">
              <Trash2 className="size-4" />
            </button>
          </div>
        } />
      ))}
    </div>
  );
}

function RequestsSection({ incoming, outgoing, reload, onAdd }: {
  incoming: FriendEntry[]; outgoing: FriendEntry[]; reload: () => void; onAdd: () => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-8 text-gold" />}
        title="لا توجد طلبات"
        body="عندما يرسل أحدهم طلب صداقة سيظهر هنا. يمكنك أيضاً البدء بإرسال طلب جديد."
        cta={{ label: "إرسال طلب", onClick: onAdd }}
      />
    );
  }
  return (
    <div className="space-y-5">
      {incoming.length > 0 && (
        <Section title={`واردة (${incoming.length})`} icon={<Inbox className="size-4" />}>
          {incoming.map((f) => (
            <Row key={f.row.id} other={f.other} right={
              <div className="flex gap-1.5">
                <button onClick={async () => { await acceptFriend(f.row.id); reload(); }} className="rounded-xl bg-emerald-600/80 p-2 text-white" aria-label="قبول"><Check className="size-4" /></button>
                <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl bg-rose-600/80 p-2 text-white" aria-label="رفض"><X className="size-4" /></button>
              </div>
            } />
          ))}
        </Section>
      )}
      {outgoing.length > 0 && (
        <Section title={`مرسلة (${outgoing.length})`}>
          {outgoing.map((f) => (
            <Row key={f.row.id} other={f.other} right={
              <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-rose-300" aria-label="إلغاء">
                <Trash2 className="size-4" />
              </button>
            } />
          ))}
        </Section>
      )}
    </div>
  );
}

function AddSection({ meId, friends, reload }: {
  meId: string; friends: FriendEntry[]; reload: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const relById = useMemo(() => {
    const m = new Map<string, FriendEntry["direction"]>();
    for (const f of friends) m.set(f.other.id, f.direction);
    return m;
  }, [friends]);

  async function doSearch(nextQuery = q) {
    const clean = nextQuery.trim();
    if (!clean) { setResults([]); setMsg(null); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await searchPlayers(clean, meId);
      setResults(r);
      if (r.length === 0) setMsg({ ok: false, text: "لا يوجد مستخدمون مطابقون" });
    } catch {
      setMsg({ ok: false, text: "تعذر تنفيذ البحث" });
    } finally {
      setBusy(false);
    }
  }

  async function invite(id: string) {
    setBusy(true);
    const r = await sendFriendRequest(meId, id);
    setMsg(r.ok ? { ok: true, text: "أُرسل الطلب وتم إشعار اللاعب" } : { ok: false, text: r.error ?? "تعذر الإرسال" });
    setBusy(false);
    reload();
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-gold/25 bg-surface p-2">
        <Search className="ms-1 size-4 text-gold" />
        <AndroidPlainTextInput
          value={q}
          onValueChange={setQ}
          commitMode="blur"
          onEnter={(next) => { setQ(next); doSearch(next); }}
          androidEntryKey="friends.search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-transparent text-sm outline-none"
          placeholder="اسم المستخدم أو اسم العرض"
        />
        <button
          disabled={busy || !q.trim()}
          onClick={() => doSearch()}
          className="rounded-xl bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >{busy ? "…" : "بحث"}</button>
      </div>
      {msg && <p className={`mt-2 text-center text-xs ${msg.ok ? "text-emerald-300" : "text-gold"}`}>{msg.text}</p>}

      <p className="mt-3 text-[11px] text-muted-foreground">
        اكتب اسم المستخدم (handle) للحصول على نتيجة دقيقة، أو ابحث باسم العرض.
      </p>

      <div className="mt-4 space-y-2">
        {results.map((p) => {
          const rel = relById.get(p.id);
          return (
            <Row key={p.id} other={p} right={
              rel === "accepted" ? (
                <span className="rounded-xl border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-300">صديق</span>
              ) : rel === "outgoing" ? (
                <span className="rounded-xl border border-white/10 px-2 py-1 text-[11px] text-muted-foreground">طلب مرسل</span>
              ) : rel === "incoming" ? (
                <span className="rounded-xl border border-gold/30 px-2 py-1 text-[11px] text-gold">بانتظار قبولك</span>
              ) : (
                <button onClick={() => invite(p.id)} className="flex items-center gap-1 rounded-xl bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
                  <UserPlus className="size-3.5" /> إضافة
                </button>
              )
            } />
          );
        })}
      </div>
    </div>
  );
}

function CompareSection({ accepted, onAdd }: { accepted: FriendEntry[]; onAdd: () => void }) {
  if (accepted.length === 0) {
    return (
      <EmptyState
        icon={<GitCompare className="size-8 text-gold" />}
        title="لا أصدقاء للمقارنة"
        body="أضف أصدقاء لمقارنة المستوى، الإنجازات، والاكتشافات جنباً إلى جنب."
        cta={{ label: "إضافة صديق", onClick: onAdd }}
      />
    );
  }
  return (
    <div>
      <p className="mb-3 text-[11px] text-muted-foreground">اختر صديقاً لرؤية صفحة المقارنة الكاملة.</p>
      <div className="space-y-2">
        {accepted.map((f) => (
          <Row key={f.row.id} other={f.other} right={
            <Link to="/compare/$id" params={{ id: f.other.id }} className="inline-flex items-center gap-1 rounded-xl bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
              <GitCompare className="size-3.5" /> مقارنة
            </Link>
          } />
        ))}
      </div>
    </div>
  );
}

function LeaderboardSection() {
  const [top, setTop] = useState<LeaderboardRow[] | null>(null);
  const [around, setAround] = useState<LeaderboardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, a] = await Promise.all([
          fetchGlobalLeaderboard(50, 0),
          fetchLeaderboardAroundMe(3),
        ]);
        if (!alive) return;
        setTop(t);
        setAround(a);
      } catch {
        if (alive) setErr("تعذر تحميل لوحة الترتيب");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) return <p className="text-center text-xs text-rose-300">{err}</p>;
  if (!top) return <p className="text-center text-xs text-muted-foreground">جارٍ التحميل…</p>;

  const meInTop = top.some((r) => r.is_me);
  const aroundFiltered = (around ?? []).filter((r) => !top.some((t) => t.id === r.id));

  return (
    <div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        الترتيب العالمي حسب الخبرة. الأصدقاء يظهرون بإطار ذهبي. اضغط لاعبًا لزيارة صفحته العامة.
      </p>
      <div className="space-y-1.5">
        {top.map((r) => <LeaderRow key={r.id} r={r} />)}
      </div>

      {!meInTop && aroundFiltered.length > 0 && (
        <>
          <div className="my-4 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-white/10" /> ترتيبك <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="space-y-1.5">
            {aroundFiltered.map((r) => <LeaderRow key={r.id} r={r} />)}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderRow({ r }: { r: LeaderboardRow }) {
  const displayName = r.display_name?.trim() || r.username;
  const tone = r.is_me
    ? "border-gold/60 bg-gold/10 shadow-gold/40"
    : r.is_friend
      ? "border-amber-300/40 bg-amber-300/5"
      : "border-white/10 bg-surface";
  const rankBadge =
    r.rank === 1 ? "bg-gradient-gold text-primary-foreground shadow-gold" :
    r.rank === 2 ? "border border-white/30 bg-white/5 text-foreground" :
    r.rank === 3 ? "border border-amber-700/40 bg-amber-700/15 text-amber-200" :
                   "border border-white/10 text-muted-foreground";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-2.5 ${tone}`}>
      <div className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${rankBadge}`}>
        {r.rank === 1 ? <Crown className="size-4" /> : r.rank}
      </div>
      <Avatar avatarId={r.avatar_id} size="sm" fallbackChar={displayName[0] ?? "?"} />
      <Link to="/u/$username" params={{ username: r.username }} className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{displayName}</span>
          {r.is_me && <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold text-gold">أنت</span>}
          {!r.is_me && r.is_friend && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
              <Users className="size-2.5" /> صديق
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">@{r.username} • م.{r.level}</div>
      </Link>
      <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
        <Sparkles className="size-3" /> {r.xp.toLocaleString("ar-EG")} خبرة
      </span>
    </div>
  );
}


// ============== Shared ==============

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">{icon}{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ other, right }: { other: PublicProfile; right: React.ReactNode }) {
  const displayName = other.display_name?.trim() || other.username || "—";
  const fallbackChar = (displayName[0] ?? other.username?.[0] ?? "?");
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3">
      <Avatar avatarId={other.avatar_id} size="sm" fallbackChar={fallbackChar} />
      <Link to="/u/$username" params={{ username: other.username }} className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{displayName}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          @{other.username} • المستوى {other.level} • {other.campaigns_completed} حملة
        </div>
      </Link>
      {right}
    </div>
  );
}

function EmptyState({ icon, title, body, cta }: {
  icon: React.ReactNode; title: string; body: string; cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-3xl border border-gold/20 bg-surface/50 p-8 text-center">
      <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full border border-gold/30 bg-gold/5">{icon}</div>
      <h4 className="font-display text-base font-bold">{title}</h4>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
      {cta && (
        <button onClick={cta.onClick} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground shadow-gold">
          <UserPlus className="size-3.5" /> {cta.label}
        </button>
      )}
    </div>
  );
}

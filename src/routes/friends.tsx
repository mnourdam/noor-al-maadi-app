import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, Check, X, Trash2, ChevronLeft, Users } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AuthLink } from "@/components/AuthLink";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { useAccount } from "@/lib/account";
import {
  acceptFriend, listFriendships, removeFriend, searchPlayers, sendFriendRequest,
  type FriendEntry, type PublicProfile,
} from "@/lib/social";
import { Avatar } from "@/components/Avatar";

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "الأصدقاء" }] }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user } = useAccount();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function doSearch(nextQuery = q) {
    setBusy(true); setMsg(null);
    try {
      const clean = nextQuery.trim();
      const r = await searchPlayers(clean, user!.id);
      setResults(r);
      if (r.length === 0 && clean) setMsg("لا يوجد مستخدمون مطابقون");
    } catch {
      setMsg("تعذر تنفيذ البحث");
    } finally {
      setBusy(false);
    }
  }

  async function invite(id: string) {
    setBusy(true);
    const r = await sendFriendRequest(user!.id, id);
    setMsg(r.ok ? "أُرسل الطلب" : r.error ?? "تعذر الإرسال");
    setBusy(false);
    reload();
  }

  const incoming = friends.filter((f) => f.direction === "incoming");
  const outgoing = friends.filter((f) => f.direction === "outgoing");
  const accepted = friends.filter((f) => f.direction === "accepted");

  // Map of other-user id -> existing relationship direction (to hide Add for them).
  const relById = new Map<string, FriendEntry["direction"]>();
  for (const f of friends) relById.set(f.other.id, f.direction);

  return (
    <AppShell>
      <Screen title="الأصدقاء" subtitle="ابحث وأرسل الطلبات">
        <div className="mb-3">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> رجوع</Link>
        </div>

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
            placeholder="اسم العرض أو اسم المستخدم"
          />
          <button disabled={busy || !q.trim()} onClick={() => doSearch()} className="rounded-xl bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
            {busy ? "…" : "بحث"}
          </button>
        </div>
        {msg && <p className="mt-2 text-center text-xs text-gold">{msg}</p>}

        {results.length > 0 && (
          <Section title="نتائج البحث">
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
          </Section>
        )}


        {incoming.length > 0 && (
          <Section title={`طلبات واردة (${incoming.length})`}>
            {incoming.map((f) => (
              <Row key={f.row.id} other={f.other} right={
                <div className="flex gap-1.5">
                  <button onClick={async () => { await acceptFriend(f.row.id); reload(); }} className="rounded-xl bg-emerald-600/80 p-2 text-white"><Check className="size-4" /></button>
                  <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl bg-rose-600/80 p-2 text-white"><X className="size-4" /></button>
                </div>
              } />
            ))}
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section title={`طلبات مرسلة (${outgoing.length})`}>
            {outgoing.map((f) => (
              <Row key={f.row.id} other={f.other} right={
                <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl border border-white/10 p-2"><Trash2 className="size-4" /></button>
              } />
            ))}
          </Section>
        )}

        <Section title={`أصدقائي (${accepted.length})`} icon={<Users className="size-4" />}>
          {accepted.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد أصدقاء بعد. ابحث بالأعلى للبدء.</p>}
          {accepted.map((f) => (
            <Row key={f.row.id} other={f.other} right={
              <div className="flex gap-1.5">
                <Link to="/compare/$id" params={{ id: f.other.id }} className="rounded-xl border border-gold/30 px-3 py-1.5 text-xs">مقارنة</Link>
                <button onClick={async () => { await removeFriend(f.row.id); reload(); }} className="rounded-xl border border-white/10 p-2"><Trash2 className="size-4" /></button>
              </div>
            } />
          ))}
        </Section>
      </Screen>
    </AppShell>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5">
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

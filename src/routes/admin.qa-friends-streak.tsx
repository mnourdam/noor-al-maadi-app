// Temporary admin-only QA panel for Friends Search + Daily Streak.
// Gated by AdminGate. Remove this file after manual verification is complete.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import {
  listFriendships, searchPlayers, sendFriendRequest,
  type FriendEntry, type PublicProfile,
} from "@/lib/social";

export const Route = createFileRoute("/admin/qa-friends-streak")({
  head: () => ({
    meta: [
      { title: "QA — Friends & Streak (Admin)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><QAPanel /></AdminGate>,
});

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function shiftedKey(deltaDays: number): string {
  const d = new Date(); d.setDate(d.getDate() + deltaDays);
  return todayKey(d);
}

function QAPanel() {
  const { user } = useAccount();
  const { profile, replaceProfile, touchStreak } = useProfile();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(todayKey());

  useEffect(() => { setNow(todayKey()); }, [profile.lastActiveDay]);

  async function reloadFriends() {
    if (!user) return;
    setFriends(await listFriendships(user.id));
  }
  useEffect(() => { reloadFriends(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const relById = new Map<string, FriendEntry["direction"]>();
  for (const f of friends) relById.set(f.other.id, f.direction);

  async function doSearch() {
    if (!user) return;
    setBusy(true); setMsg(null);
    try {
      const r = await searchPlayers(q, user.id);
      setResults(r);
      if (!r.length && q.trim()) setMsg("لا يوجد مستخدمون مطابقون");
    } catch (e) {
      setMsg(`خطأ: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function invite(id: string) {
    if (!user) return;
    setBusy(true);
    const r = await sendFriendRequest(user.id, id);
    setMsg(r.ok ? "أُرسل الطلب" : `فشل: ${r.error}`);
    setBusy(false);
    reloadFriends();
  }

  function simulate(deltaDays: number | "today") {
    const next = deltaDays === "today" ? todayKey() : shiftedKey(deltaDays);
    replaceProfile({ ...profile, lastActiveDay: next });
    // Defer so state commits before touchStreak reads.
    setTimeout(() => touchStreak(), 0);
  }

  if (!user) {
    return <div className="p-6 text-amber-200">سجّل دخولك للاختبار.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-amber-300">QA — الأصدقاء والسلسلة</h1>
          <p className="text-xs text-slate-400">لوحة مؤقتة للمراجعة اليدوية فقط. احذف بعد التأكد.</p>
        </header>

        {/* Friends Search */}
        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
          <h2 className="mb-3 font-bold text-amber-200">بحث الأصدقاء</h2>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="اسم العرض أو اسم المستخدم"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
            />
            <button disabled={busy || !q.trim()} onClick={doSearch}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50">
              {busy ? "…" : "بحث"}
            </button>
          </div>
          {msg && <p className="mt-2 text-xs text-amber-300">{msg}</p>}
          <div className="mt-3 space-y-2">
            {results.map((p) => {
              const rel = relById.get(p.id);
              const chip = rel === "accepted" ? "صديق"
                : rel === "outgoing" ? "طلب مرسل"
                : rel === "incoming" ? "بانتظار قبولك"
                : null;
              const isSelf = p.id === user.id;
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-sm">
                  <div>
                    <div className="font-bold">{p.display_name || p.username}</div>
                    <div className="text-[11px] text-slate-400">@{p.username} • id={p.id.slice(0, 8)}…{isSelf && " ← أنا (يجب ألا يظهر!)"}</div>
                  </div>
                  {chip ? (
                    <span className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-200">{chip}</span>
                  ) : (
                    <button onClick={() => invite(p.id)} disabled={busy || isSelf}
                      className="rounded-md bg-emerald-500 px-3 py-1 text-[11px] font-bold text-slate-900 disabled:opacity-50">
                      إرسال طلب
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-[11px] text-slate-400">
            علاقات حالية: {friends.length} (مقبولة {friends.filter(f=>f.direction==="accepted").length} • صادرة {friends.filter(f=>f.direction==="outgoing").length} • واردة {friends.filter(f=>f.direction==="incoming").length})
          </div>
        </section>

        {/* Streak */}
        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
          <h2 className="mb-3 font-bold text-amber-200">السلسلة اليومية</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="مفتاح اليوم المحلي" value={now} />
            <Stat label="lastActiveDay" value={profile.lastActiveDay ?? "—"} />
            <Stat label="streak" value={String(profile.streak)} />
            <Stat label="أطول سلسلة (محلي)" value={String(Math.max(profile.streak, ...(profile.streakMilestonesClaimed ?? [0])))} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => simulate("today")}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold">محاكاة نفس اليوم</button>
            <button onClick={() => simulate(-1)}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900">محاكاة اليوم التالي (+1)</button>
            <button onClick={() => simulate(-3)}
              className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-bold text-slate-900">محاكاة فقدان 2+ أيام (إعادة 1)</button>
            <button onClick={() => { replaceProfile({ ...profile, lastActiveDay: null, streak: 0 }); }}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs">تصفير محلي</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            الأزرار تغيّر <code>lastActiveDay</code> محليًا فقط ثم تستدعي <code>touchStreak()</code>. لا تؤثر على بيانات اللاعبين الآخرين.
          </p>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm">{value}</div>
    </div>
  );
}

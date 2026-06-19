import { Link } from "@tanstack/react-router";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, ShieldCheck, UserPlus, CheckCircle2 } from "lucide-react";
import { useAccount } from "@/lib/account";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "الآن";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return new Date(ts).toLocaleString("ar-EG");
}

export function AccountSection() {
  const { user, account, syncing, lastSyncAt, syncNow, signOut, conflict, resolveConflict } = useAccount();
  const isGuest = !user;

  return (
    <section className="rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
      <header className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-5 text-gold" />
        <h2 className="text-base font-bold">الحساب</h2>
        <span className={`mr-auto rounded-full px-2 py-0.5 text-[10px] ${isGuest ? "bg-white/10 text-muted-foreground" : "bg-gradient-gold text-primary-foreground"}`}>
          {isGuest ? "ضيف" : "مسجَّل"}
        </span>
      </header>

      <div className="space-y-2 text-sm">
        <Row label="اسم المستخدم" value={account?.username ?? "—"} />
        <Row label="البريد" value={account?.email ?? user?.email ?? "—"} />
        <Row
          label="حالة السحابة"
          value={
            isGuest ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><CloudOff className="size-3.5" /> غير مفعّلة</span>
            ) : syncing ? (
              <span className="inline-flex items-center gap-1 text-amber-200"><RefreshCw className="size-3.5 animate-spin" /> مزامنة…</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-300"><Cloud className="size-3.5" /> متصل</span>
            )
          }
        />
        <Row label="آخر مزامنة" value={timeAgo(lastSyncAt)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {isGuest ? (
          <>
            <Link to="/auth" className="col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-gold py-2 text-sm font-bold text-primary-foreground shadow-gold">
              <UserPlus className="size-4" /> إنشاء حساب
            </Link>
            <Link to="/auth" className="col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2 text-sm">
              <LogIn className="size-4" /> تسجيل الدخول
            </Link>
          </>
        ) : (
          <>
            <button
              onClick={() => void syncNow()}
              disabled={syncing}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-gold py-2 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} /> مزامنة الآن
            </button>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2 text-sm"
            >
              <LogOut className="size-4" /> تسجيل الخروج
            </button>
          </>
        )}
      </div>

      {conflict && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-surface p-5 shadow-elegant">
            <h3 className="mb-1 text-base font-bold">استعادة التقدم</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              لديك تقدم محلي على هذا الجهاز وتقدم محفوظ في السحابة. أيهما تريد الاحتفاظ به؟
            </p>
            <div className="space-y-2">
              <ConflictRow
                title="التقدم المحلي"
                points={conflict.localSnapshot.points}
                streak={conflict.localSnapshot.streak}
                campaigns={conflict.localSnapshot.campaignsCompleted.length}
                onChoose={() => void resolveConflict("local")}
              />
              <ConflictRow
                title="التقدم السحابي"
                points={conflict.cloudSnapshot.points}
                streak={conflict.cloudSnapshot.streak}
                campaigns={conflict.cloudSnapshot.campaignsCompleted.length}
                onChoose={() => void resolveConflict("cloud")}
                highlight
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-background/40 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </div>
  );
}

function ConflictRow({ title, points, streak, campaigns, onChoose, highlight }: {
  title: string; points: number; streak: number; campaigns: number; onChoose: () => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={onChoose}
      className={`w-full rounded-xl border p-3 text-right transition ${highlight ? "border-gold/60 bg-gold/10" : "border-white/10 bg-background/40 hover:bg-background/60"}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-bold">{title}</span>
        {highlight && <CheckCircle2 className="size-4 text-gold" />}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {points} XP · سلسلة {streak} · حملات {campaigns}
      </div>
    </button>
  );
}
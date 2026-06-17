import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Flame, Star, BookOpen, Search, GitBranch, LogOut, Bookmark, Bell, Swords, Library } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { BADGES, STORIES, CAMPAIGNS } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "حسابي" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, login, logout } = useProfile();

  if (!profile.loggedIn) return <LoginScreen onLogin={login} />;

  const saved = STORIES.filter((s) => profile.savedStories.includes(s.id));

  return (
    <AppShell>
      <div className="px-5 pt-10">
        <div className="shadow-elegant relative overflow-hidden rounded-3xl border border-gold/30 bg-surface p-6">
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-full bg-gradient-gold text-2xl font-bold text-primary-foreground shadow-gold">
              {profile.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-2xl font-bold">{profile.name}</h1>
              <p className="text-xs text-muted-foreground">رحّالة في التاريخ</p>
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-3 gap-3 text-center">
            <Stat icon={<Star className="size-4" />} value={profile.points} label="نقطة" />
            <Stat icon={<Flame className="size-4" />} value={profile.streak} label="يوم متتالي" />
            <Stat icon={<BookOpen className="size-4" />} value={profile.storiesRead.length} label="قصة" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <MiniStat icon={<Search className="size-4 text-gold" />} value={profile.investigationsCompleted.length} label="تحقيقات" />
          <MiniStat icon={<GitBranch className="size-4 text-gold" />} value={profile.decisionsCompleted.length} label="قرارات" />
          <MiniStat icon={<Swords className="size-4 text-gold" />} value={profile.campaignsCompleted.length} label="حملات" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <MiniStat icon={<Library className="size-4 text-gold" />} value={profile.artifactsFound.length} label="آثار" />
          <MiniStat icon={<Star className="size-4 text-gold" />} value={profile.charactersUnlocked.length} label="شخصيات" />
          <MiniStat icon={<Bookmark className="size-4 text-gold" />} value={profile.savedStories.length} label="محفوظ" />
        </div>

        <section className="mt-7">
          <h2 className="font-display mb-3 text-lg font-bold">الأوسمة</h2>
          <div className="grid grid-cols-4 gap-3">
            {BADGES.map((b) => {
              const earned = profile.badges.includes(b.id);
              return (
                <div key={b.id} className={`rounded-2xl border p-3 text-center text-xs ${earned ? "border-gold/40 bg-gold/10" : "border-white/10 bg-surface opacity-60"}`}>
                  <div className={`text-2xl ${earned ? "" : "grayscale"}`}>{b.icon}</div>
                  <p className="mt-1 font-bold">{b.name}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="font-display mb-3 text-lg font-bold">القصص المحفوظة</h2>
          {saved.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-surface p-4 text-center text-sm text-muted-foreground">لا توجد قصص محفوظة بعد.</p>
          ) : (
            <div className="space-y-2">
              {saved.map((s) => (
                <Link key={s.id} to="/story/$id" params={{ id: s.id }} className="block rounded-2xl border border-white/10 bg-surface p-4">
                  <p className="font-display text-sm font-bold">{s.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{s.excerpt}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-7">
          <button className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-surface p-4 text-sm">
            <span className="flex items-center gap-2"><Bell className="size-4 text-gold" /> إشعار «في مثل هذا اليوم»</span>
            <span className="text-xs text-gold">مُفعّل</span>
          </button>
        </section>

        <button onClick={logout} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-300">
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </AppShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-2/60 p-3">
      <div className="mx-auto flex w-fit items-center gap-1 text-gold">{icon}</div>
      <p className="font-display mt-1 text-xl font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3">
      <div className="grid size-9 place-items-center rounded-xl bg-gold/15">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-base font-bold leading-none">{value}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <AppShell>
      <Screen title="مرحبًا بك في حكايا" subtitle="ابدأ رحلتك في التاريخ العربي والإسلامي.">
        <div className="shadow-elegant rounded-3xl border border-gold/30 bg-surface p-6">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-gradient-gold text-3xl shadow-gold">📜</div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            أدخل اسمك لتبدأ جمع النقاط، فتح الحقب، وتجميع الأوسمة.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسمك"
            className="mt-5 w-full rounded-2xl border border-white/10 bg-surface-2 px-4 py-3 text-center outline-none focus:border-gold/50"
          />
          <button
            onClick={() => onLogin(name)}
            className="mt-3 w-full rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            ابدأ الرحلة
          </button>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            تجربة محلية في هذه النسخة — يمكن لاحقًا ربطها بحسابك السحابي.
          </p>
        </div>
      </Screen>
    </AppShell>
  );
}
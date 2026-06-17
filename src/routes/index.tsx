import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Star, Sparkles, Search, ListOrdered, GitBranch, Map as MapIcon, Swords, ArrowLeft, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { dailyStory, todayOnThisDay, ERAS, CAMPAIGNS, ARTIFACTS, CHARACTERS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حكايا — رحلتك في التاريخ" },
      { name: "description", content: "استكشف، حقّق، قرّر، واجمع آثار التاريخ العربي والإسلامي." },
      { property: "og:title", content: "حكايا" },
      { property: "og:description", content: "مغامرة تاريخية تفاعلية." },
    ],
  }),
  component: Index,
});

function Index() {
  const { profile, touchStreak } = useProfile();
  // Avoid SSR/client mismatch — daily content depends on Date.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); touchStreak(); }, [touchStreak]);
  const story = mounted ? dailyStory() : null;
  const today = mounted ? todayOnThisDay() : null;

  // Continue campaign: first not-completed
  const activeCampaign =
    CAMPAIGNS.find((c) => !profile.campaignsCompleted.includes(c.eraId) && profile.unlockedEras.includes(c.eraId)) ?? CAMPAIGNS[0];
  const doneMissions = activeCampaign.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
  const progress = Math.round((doneMissions / activeCampaign.missions.length) * 100);

  return (
    <AppShell>
      <header className="px-5 pt-9">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">مرحبًا، {profile.name}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              مغامرتك التاريخية
            </h1>
          </div>
          <div className="glass flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2">
            <div className="flex items-center gap-1 text-gold">
              <Flame className="size-4" />
              <span className="text-sm font-bold">{profile.streak}</span>
            </div>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <Star className="size-4 text-gold" />
              <span className="text-sm font-bold">{profile.points}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Continue Campaign */}
      <section className="mt-7 px-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-gold">
          <Swords className="size-3.5" />
          <span>تابع حملتك</span>
        </div>
        <Link
          to="/campaigns/$era"
          params={{ era: activeCampaign.eraId }}
          className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/20 bg-surface"
        >
          <div className="absolute inset-0 bg-gradient-to-tl from-amber-500/15 via-transparent to-amber-300/10" />
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative p-6">
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
              {ERAS.find((e) => e.id === activeCampaign.eraId)?.name}
            </span>
            <h2 className="font-display mt-3 text-2xl font-bold leading-snug">{activeCampaign.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{activeCampaign.intro}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{doneMissions} / {activeCampaign.missions.length} مهمة</span>
              <span className="flex items-center gap-1 text-gold">المتابعة <ArrowLeft className="size-3.5" /></span>
            </div>
          </div>
        </Link>
      </section>

      {/* Game modes */}
      <section className="mt-6 px-5">
        <h3 className="font-display mb-3 text-base font-bold">أنماط اللعب</h3>
        <div className="grid grid-cols-2 gap-3">
          <Mode to="/play/investigate" icon={<Search className="size-5" />} title="التحقيق التاريخي" desc="حلّل القرائن واكتشف" />
          <Mode to="/play/timeline" icon={<ListOrdered className="size-5" />} title="ترتيب الأحداث" desc="رتّب على الخطّ الزمني" />
          <Mode to="/play/decisions" icon={<GitBranch className="size-5" />} title="قرارات تاريخية" desc="ماذا لو كنتَ مكانهم؟" />
          <Mode to="/map" icon={<MapIcon className="size-5" />} title="خارطة العالم" desc="افتح المناطق" />
        </div>
      </section>

      {/* Daily mission */}
      {mounted && story && (
        <section className="mt-7 px-5">
          <div className="mb-2 flex items-center gap-2 text-xs text-gold">
            <Sparkles className="size-3.5" />
            <span>مهمة اليوم</span>
          </div>
          <Link
            to="/story/$id"
            params={{ id: story.id }}
            className="block rounded-2xl border border-white/10 bg-surface p-5"
          >
            <p className="text-[10px] text-gold">{ERAS.find((e) => e.id === story.era)?.name}</p>
            <p className="font-display mt-1 text-base font-bold">{story.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{story.excerpt}</p>
          </Link>
        </section>
      )}

      {/* On this day strip */}
      {mounted && today && (
        <section className="mt-6 px-5">
          <div className="rounded-2xl border border-white/10 bg-surface p-4">
            <p className="text-[10px] text-gold">في مثل هذا اليوم · {today.year}</p>
            <p className="font-display mt-1 text-sm font-bold">{today.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{today.detail}</p>
          </div>
        </section>
      )}

      {/* Collection progress */}
      <section className="mt-6 px-5">
        <h3 className="font-display mb-3 text-base font-bold">تقدّم المجموعة</h3>
        <div className="grid grid-cols-2 gap-3">
          <ProgressCard icon="🗿" label="آثار" found={profile.artifactsFound.length} total={ARTIFACTS.length} />
          <ProgressCard icon="🎴" label="شخصيات" found={profile.charactersUnlocked.length} total={CHARACTERS.length} />
        </div>
      </section>

      {profile.campaignsCompleted.length > 0 && (
        <section className="mt-6 px-5">
          <div className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <Trophy className="size-5 text-gold" />
            <span>أتممت {profile.campaignsCompleted.length} حملة!</span>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Mode({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to as "/"} className="rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-gold/40">
      <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">{icon}</div>
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{desc}</p>
    </Link>
  );
}

function ProgressCard({ icon, label, found, total }: { icon: string; label: string; found: number; total: number }) {
  const pct = Math.round((found / total) * 100);
  return (
    <Link to="/collection" className="rounded-2xl border border-white/10 bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gold">{found}/{total}</span>
      </div>
      <p className="font-display mt-2 text-sm font-bold">{label}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

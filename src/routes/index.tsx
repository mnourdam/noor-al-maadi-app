import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Flame, Star, Sparkles, Search, ListOrdered, GitBranch, Map as MapIcon,
  Swords, ArrowLeft, Trophy, BookOpen, Library, Crown, CheckCircle2, Lock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  dailyStory, todayOnThisDay, ERAS, CAMPAIGNS, ARTIFACTS, CHARACTERS, MAP_REGIONS,
  levelFor, dailyMissionsForDate, CURRENT_SEASON, UPCOMING_CAMPAIGNS,
  explorationPercent, overallCampaignPercent, todayKey,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حكايا — عالم تاريخي متكامل" },
      { name: "description", content: "ادخل عالمًا واسعًا من القصص والحملات والآثار والمعارك في التاريخ العربي والإسلامي." },
    ],
  }),
  component: Index,
});

const ICONS = {
  story: BookOpen, puzzle: Sparkles, investigate: Search, timeline: ListOrdered,
  decision: GitBranch, map: MapIcon, collect: Library,
} as const;

function Index() {
  const { profile, touchStreak, claimDaily } = useProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); touchStreak(); }, [touchStreak]);

  const story = mounted ? dailyStory() : null;
  const today = mounted ? todayOnThisDay() : null;
  const lvl = levelFor(profile.points);
  const flagship = CAMPAIGNS.find((c) => c.flagship)!;
  const flagshipDone = flagship.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
  const flagshipPct = Math.round((flagshipDone / flagship.missions.length) * 100);

  const activeCampaign =
    CAMPAIGNS.find((c) => !profile.campaignsCompleted.includes(c.eraId) && profile.unlockedEras.includes(c.eraId)) ?? flagship;
  const doneMissions = activeCampaign.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
  const progress = Math.round((doneMissions / activeCampaign.missions.length) * 100);

  const dailies = useMemo(() => mounted ? dailyMissionsForDate() : [], [mounted]);
  const claimedToday = profile.dailyClaimed.day === todayKey() ? profile.dailyClaimed.ids : [];

  const seasonPct = Math.min(100, Math.round((profile.seasonPoints / CURRENT_SEASON.goalPoints) * 100));
  const explorePct = explorationPercent(profile.regionsUnlocked);
  const overallPct = overallCampaignPercent(profile.missionsCompleted);

  return (
    <AppShell>
      <header className="px-5 pt-9">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">مرحبًا، {profile.name}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">عالمك التاريخي</h1>
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

        {/* LEVEL CARD */}
        <div className="mt-5 overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant relative">
          <div className="particle-field" />
          <div className="relative flex items-center gap-4">
            <div className="animate-gold-pulse grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
              <Crown className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gold">المستوى {lvl.level} · {lvl.rank}</p>
              <p className="font-display truncate text-lg font-bold shimmer-text">{lvl.title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {lvl.next ? `${lvl.toNext} نقطة لبلوغ «${lvl.next.title}»` : "بلغتَ أعلى الرتب!"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* FLAGSHIP CAMPAIGN BANNER */}
      <section className="mt-6 px-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-gold">
          <Crown className="size-3.5" /> الحملة الكبرى
        </div>
        <Link
          to="/campaigns/$era" params={{ era: flagship.eraId }}
          className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/40"
        >
          <div className="particle-field" />
          <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative p-6">
            <span className="rounded-full border border-gold/50 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
              ٨ فصول · {ERAS.find((e) => e.id === flagship.eraId)?.name}
            </span>
            <h2 className="font-display mt-3 text-2xl font-bold leading-snug">{flagship.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{flagship.intro}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-all" style={{ width: `${flagshipPct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{flagshipDone} / {flagship.missions.length} فصلًا · {flagshipPct}٪</span>
              <span className="flex items-center gap-1 text-gold">ابدأ الرحلة <ArrowLeft className="size-3.5" /></span>
            </div>
          </div>
        </Link>
      </section>

      {/* DAILY MISSIONS */}
      <section className="mt-6 px-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gold"><Sparkles className="size-3.5" /> مهام اليوم</div>
          <span className="text-[10px] text-muted-foreground">{claimedToday.length}/{dailies.length}</span>
        </div>
        <div className="space-y-2">
          {dailies.map((d) => {
            const claimed = claimedToday.includes(d.id);
            const Icon = ICONS[d.icon] ?? Sparkles;
            return (
              <div key={d.id} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${claimed ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface"}`}>
                <div className={`grid size-10 place-items-center rounded-xl ${claimed ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
                  {claimed ? <CheckCircle2 className="size-5" /> : <Icon className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">{d.title}</p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{d.desc}</p>
                </div>
                {claimed ? (
                  <span className="text-[10px] text-gold">+{d.reward} ✓</span>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <Link to={d.link.to as "/"} className="text-[10px] text-gold underline">افتح</Link>
                    <button
                      onClick={() => claimDaily(d.id, d.reward)}
                      className="rounded-full bg-gradient-gold px-2.5 py-1 text-[10px] font-bold text-primary-foreground"
                    >+{d.reward}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SEASON */}
      <section className="mt-6 px-5">
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5">
          <div className="particle-field" />
          <div className="relative">
            <p className="text-[10px] text-gold">🏆 موسم محدود · {CURRENT_SEASON.endsAt}</p>
            <p className="font-display mt-1 text-lg font-bold">{CURRENT_SEASON.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{CURRENT_SEASON.tagline}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-all" style={{ width: `${seasonPct}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{Math.min(profile.seasonPoints, CURRENT_SEASON.goalPoints)} / {CURRENT_SEASON.goalPoints} نقطة</p>
          </div>
        </div>
      </section>

      {/* GAME MODES */}
      <section className="mt-6 px-5">
        <h3 className="font-display mb-3 text-base font-bold">أنماط اللعب</h3>
        <div className="grid grid-cols-2 gap-3">
          <Mode to="/play/investigate" icon={<Search className="size-5" />} title="التحقيق التاريخي" desc="حلّل القرائن" />
          <Mode to="/play/timeline" icon={<ListOrdered className="size-5" />} title="ترتيب الأحداث" desc="رتّب على الخطّ الزمني" />
          <Mode to="/play/decisions" icon={<GitBranch className="size-5" />} title="قرارات تاريخية" desc="قرّر ثم تعلّم" />
          <Mode to="/map" icon={<MapIcon className="size-5" />} title="خارطة العالم" desc="افتح المناطق" />
        </div>
      </section>

      {/* DAILY STORY + ON THIS DAY */}
      {mounted && story && (
        <section className="mt-7 px-5">
          <div className="mb-2 flex items-center gap-2 text-xs text-gold"><BookOpen className="size-3.5" /> قصة اليوم</div>
          <Link to="/story/$id" params={{ id: story.id }} className="block rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-gold/40">
            <p className="text-[10px] text-gold">{ERAS.find((e) => e.id === story.era)?.name}</p>
            <p className="font-display mt-1 text-base font-bold">{story.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{story.excerpt}</p>
          </Link>
        </section>
      )}

      {mounted && today && (
        <section className="mt-6 px-5">
          <Link to="/on-this-day" className="block rounded-2xl border border-white/10 bg-surface p-4">
            <p className="text-[10px] text-gold">في مثل هذا اليوم · {today.year}</p>
            <p className="font-display mt-1 text-sm font-bold">{today.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{today.detail}</p>
          </Link>
        </section>
      )}

      {/* WORLD PROGRESS */}
      <section className="mt-7 px-5">
        <h3 className="font-display mb-3 text-base font-bold">تقدّمك في العالم</h3>
        <div className="grid grid-cols-2 gap-3">
          <ProgressCard to="/map" icon="🗺️" label="استكشاف العالم" pct={explorePct} caption={`${profile.regionsUnlocked.length}/${MAP_REGIONS.length} منطقة`} />
          <ProgressCard to="/campaigns" icon="⚔️" label="إتمام الحملات" pct={overallPct} caption={`${profile.campaignsCompleted.length}/${CAMPAIGNS.length} حملة`} />
          <ProgressCard to="/collection" icon="🗿" label="الآثار" pct={Math.round((profile.artifactsFound.length / ARTIFACTS.length) * 100)} caption={`${profile.artifactsFound.length}/${ARTIFACTS.length}`} />
          <ProgressCard to="/collection" icon="🎴" label="الشخصيات" pct={Math.round((profile.charactersUnlocked.length / CHARACTERS.length) * 100)} caption={`${profile.charactersUnlocked.length}/${CHARACTERS.length}`} />
        </div>
      </section>

      {/* CONTINUE CAMPAIGN */}
      {activeCampaign.eraId !== flagship.eraId && (
        <section className="mt-7 px-5">
          <div className="mb-2 flex items-center gap-2 text-xs text-gold"><Swords className="size-3.5" /> تابع</div>
          <Link to="/campaigns/$era" params={{ era: activeCampaign.eraId }} className="block rounded-3xl border border-white/10 bg-surface p-5">
            <p className="text-[10px] text-gold">{ERAS.find((e) => e.id === activeCampaign.eraId)?.name}</p>
            <p className="font-display mt-1 text-base font-bold">{activeCampaign.title}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{doneMissions}/{activeCampaign.missions.length} مهمة</p>
          </Link>
        </section>
      )}

      {/* COMING SOON */}
      <section className="mt-7 px-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-gold"><Lock className="size-3.5" /> قادمٌ إليك</div>
        <div className="-mr-5 flex gap-3 overflow-x-auto pr-5 pb-2">
          {UPCOMING_CAMPAIGNS.map((u) => (
            <div key={u.id} className="w-56 shrink-0 rounded-2xl border border-dashed border-white/15 bg-surface/60 p-4">
              <p className="text-[10px] text-gold/80">{u.eta}</p>
              <p className="font-display mt-1 text-sm font-bold">{u.name}</p>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">{u.teaser}</p>
            </div>
          ))}
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

function ProgressCard({ to, icon, label, pct, caption }: { to: string; icon: string; label: string; pct: number; caption: string }) {
  return (
    <Link to={to as "/"} className="rounded-2xl border border-white/10 bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gold">{pct}٪</span>
      </div>
      <p className="font-display mt-2 text-sm font-bold">{label}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{caption}</p>
    </Link>
  );
}
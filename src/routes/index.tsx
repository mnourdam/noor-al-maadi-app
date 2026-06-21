import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Map as MapIcon, ChevronLeft, Crown, Lock, Compass, Play,
  Hourglass, Calendar, Heart, Coins, Trophy, Package, BookOpen,
  Swords, Sparkles, Bell, Gem,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  ERAS, CAMPAIGNS, ARTIFACTS, CHARACTERS,
  levelFor, currentSeason, UPCOMING_CAMPAIGNS,
  FLAGSHIP_CHAPTERS, nextActiveCampaign,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { getEffectiveHearts, HEART_MAX } from "@/lib/hearts";
import { runDailyNotifications, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import { useAccount } from "@/lib/account";
import { useTodayInHistoryEvent, type TodayInHistoryEvent } from "@/lib/today-in-history";
import { OnboardingTour } from "@/components/OnboardingTour";
import salahuddinHero from "@/assets/salahuddin-hero.jpg";
import heroCitySunrise from "@/assets/hero-city-sunrise.jpg";
import heroDesertCaravan from "@/assets/hero-desert-caravan.jpg";
import heroManuscriptLamp from "@/assets/hero-manuscript-lamp.jpg";
import heroBattlefield from "@/assets/hero-battlefield.jpg";
import heroFortress from "@/assets/hero-fortress.jpg";

const HERO_BACKGROUNDS = [
  salahuddinHero, heroCitySunrise, heroDesertCaravan,
  heroManuscriptLamp, heroBattlefield, heroFortress,
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "description", content: "ادخل عالمًا تفاعليًا واسعًا من الشخصيات والدول والمعارك والمدن والأحداث في التاريخ الإسلامي." },
    ],
  }),
  component: Index,
});

function Index() {
  const { profile, touchStreak } = useProfile();
  const { account, user } = useAccount();
  const displayName = account?.username ?? (user ? profile.name : profile.name);
  const [mounted, setMounted] = useState(false);
  const { selected: todayEvent } = useTodayInHistoryEvent();

  useEffect(() => {
    setMounted(true);
    touchStreak();
    const season = currentSeason();
    runDailyNotifications({
      prefs: profile.settings.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      today: todayEvent
        ? { title: todayEvent.title, teaser: todayEvent.body, href: todayEvent.deep_link ?? "/on-this-day" }
        : null,
      season: {
        name: season.name, tagline: season.tagline,
        ready: profile.seasonPoints >= season.goalPoints && !profile.seasonClaimed,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchStreak, todayEvent?.id]);

  const lvl = levelFor(profile.points);
  const [bgIndex, setBgIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBgIndex((i) => (i + 1) % HERO_BACKGROUNDS.length), 5000);
    return () => clearInterval(id);
  }, []);

  // ===== Active campaign =====
  const active = nextActiveCampaign(profile.missionsCompleted);
  const activeEra = active ? ERAS.find((e) => e.id === active.eraId) : undefined;
  const activeDone = active ? active.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length : 0;
  const activePct  = active ? Math.round((activeDone / active.missions.length) * 100) : 0;
  const activeHasStarted = activeDone > 0;
  const isFlagship = active?.flagship === true;
  const nextChapter = isFlagship
    ? (FLAGSHIP_CHAPTERS.find((c) => !profile.missionsCompleted.includes(c.missionId))
        ?? FLAGSHIP_CHAPTERS[FLAGSHIP_CHAPTERS.length - 1])
    : null;
  const nextMission = active?.missions.find((m) => !profile.missionsCompleted.includes(m.id)) ?? null;

  // ===== Stats strip =====
  const hearts = getEffectiveHearts(profile);
  const battlesCompleted = useMemo(() => {
    // Count completed missions that look like battles via story id contains battle keywords —
    // simpler: count all completed missions across all CAMPAIGNS classified as "story" referencing
    // known battle ids. For now use missionsCompleted length as a proxy with safe label.
    const ids = new Set(profile.missionsCompleted);
    return CAMPAIGNS.flatMap((c) => c.missions).filter(
      (m) => ids.has(m.id) && (m.title.includes("معركة") || m.title.includes("غزوة") || m.title.includes("فتح")),
    ).length;
  }, [profile.missionsCompleted]);
  const collectionCount = profile.artifactsFound.length + profile.charactersUnlocked.length;
  const eventsDiscovered = profile.storiesRead.length + profile.timelinesCompleted.length;

  // ===== Recently discovered =====
  const recent = useMemo(() => {
    type RecentItem = { key: string; kind: string; title: string; subtitle: string; icon: string; to: string };
    const out: RecentItem[] = [];
    profile.charactersUnlocked.slice(-4).reverse().forEach((id) => {
      const c = CHARACTERS.find((x) => x.id === id);
      if (c) out.push({ key: `c-${id}`, kind: "شخصية", title: c.name, subtitle: c.title, icon: c.avatar, to: "/collection" });
    });
    profile.artifactsFound.slice(-4).reverse().forEach((id) => {
      const a = ARTIFACTS.find((x) => x.id === id);
      if (a) out.push({ key: `a-${id}`, kind: a.typeLabel, title: a.name, subtitle: a.description, icon: a.icon, to: "/collection" });
    });
    return out.slice(0, 6);
  }, [profile.charactersUnlocked, profile.artifactsFound]);

  return (
    <AppShell>
      {/* ============ CINEMATIC HERO ============ */}
      <section className="relative -mt-2 overflow-hidden">
        <div className="relative h-[78vh] min-h-[560px] w-full overflow-hidden">
          {HERO_BACKGROUNDS.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={active?.title ?? "إرث"}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`animate-ken-burns absolute inset-0 size-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
                i === bgIndex ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="ink-overlay absolute inset-0" />
          <div className="arabesque-layer" />
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="ember"
              style={{
                left: `${(i * 73) % 100}%`,
                animationDelay: `${(i * 0.7) % 7}s`,
                animationDuration: `${6 + ((i * 1.3) % 5)}s`,
              }}
            />
          ))}

          <div className="relative z-10 flex items-start justify-between px-5 pt-8">
            <div className="animate-curtain rounded-2xl bg-gradient-to-l from-black/55 via-black/35 to-transparent px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-[11px] tracking-[0.2em] text-gold drop-shadow-[0_1px_4px_oklch(0_0_0/0.6)]">مرحبًا بك، {displayName}</p>
              <p className="font-display mt-1 text-[11px] text-white/80">المستوى {lvl.level} · {lvl.title}</p>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10">
            {active && activeEra ? (
              <div className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <Crown className="size-3.5" />
                  <span className="tracking-[0.25em]">
                    {isFlagship ? "رحلتك الحالية" : "حملتك النشطة"} · {activeEra.name}
                  </span>
                </div>
                <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white drop-shadow-[0_4px_18px_oklch(0_0_0/0.6)]">
                  {active.title}
                </h1>
                <p className="mt-3 text-sm text-white/75">
                  {isFlagship && nextChapter ? (
                    <>الفصل {nextChapter.index} · <span className="text-gold">{nextChapter.title}</span></>
                  ) : (
                    activeHasStarted ? "تابع رحلتك في هذه الحملة." : active.intro
                  )}
                </p>
                {isFlagship && nextChapter?.hook && (
                  <p className="mt-2 line-clamp-2 text-[13px] italic text-white/55">«{nextChapter.hook}»</p>
                )}

                <div className="mt-5 flex items-center gap-3">
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-gradient-gold transition-all" style={{ width: `${activePct}%` }} />
                  </div>
                  <span className="text-[11px] text-white/70">{activeDone}/{active.missions.length} فصل</span>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  {isFlagship && nextChapter ? (
                    <Link
                      to="/play/chapter" search={{ id: nextChapter.id }}
                      className="shadow-gold animate-gold-pulse inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                    >
                      <Play className="size-4 fill-current" />
                      {activeHasStarted ? "تابع رحلتك" : "ابدأ الرحلة"}
                    </Link>
                  ) : (
                    <Link
                      to="/campaigns/$era" params={{ era: active.eraId }}
                      className="shadow-gold animate-gold-pulse inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                    >
                      <Play className="size-4 fill-current" />
                      {activeHasStarted ? "تابع رحلتك" : "ابدأ الحملة"}
                    </Link>
                  )}
                  <Link
                    to="/campaigns/$era" params={{ era: active.eraId }}
                    className="glass inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-xs text-white/80"
                  >
                    كل الفصول
                  </Link>
                </div>
              </div>
            ) : (
              <div className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <Lock className="size-3.5" />
                  <span className="tracking-[0.25em]">قريبًا · حملة جديدة</span>
                </div>
                <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white drop-shadow-[0_4px_18px_oklch(0_0_0/0.6)]">
                  {UPCOMING_CAMPAIGNS[0]?.name ?? "حملة قادمة"}
                </h1>
                <p className="mt-3 line-clamp-3 text-sm text-white/75">
                  {UPCOMING_CAMPAIGNS[0]?.teaser ?? "لقد أتممت كل الحملات الحالية. ترقّب الحملات القادمة قريبًا."}
                </p>
                <div className="mt-6">
                  <Link to="/campaigns" className="glass inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs text-gold">
                    استعرض كل الحملات <ChevronLeft className="size-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ PROGRESSION STRIP ============ */}
      <section className="mt-5 px-5">
        <div className="parchment-dark relative overflow-hidden rounded-2xl border border-gold/20 px-3 py-3 shadow-elegant">
          <div className="arabesque-layer opacity-40" />
          <div className="relative -mx-1 flex items-stretch gap-1 overflow-x-auto no-scrollbar">
            <Stat icon={<Heart className="size-3.5" />} label="القلوب" value={`${hearts}/${HEART_MAX}`} tone="rose" />
            <Stat icon={<Coins className="size-3.5" />} label="دنانير" value={profile.dinars} tone="gold" />
            <Stat icon={<Trophy className="size-3.5" />} label="مستوى" value={lvl.level} tone="gold" />
            <Stat icon={<Package className="size-3.5" />} label="المتحف" value={collectionCount} tone="emerald" />
            <Stat icon={<BookOpen className="size-3.5" />} label="أحداث" value={eventsDiscovered} tone="indigo" />
            <Stat icon={<Swords className="size-3.5" />} label="معارك" value={battlesCompleted} tone="ruby" />
          </div>
        </div>
      </section>

      {/* ============ WHAT'S NEXT ============ */}
      {active && (nextChapter || nextMission) && (
        <section className="mt-10 px-5">
          <SectionHeader icon={<Sparkles className="size-3.5" />} eyebrow="ماذا ينتظرك الآن؟" title="فصلك التالي" />
          <NextUpCard
            title={isFlagship && nextChapter ? nextChapter.title : (nextMission?.title ?? active.title)}
            subtitle={isFlagship && nextChapter ? `الفصل ${nextChapter.index} · ${nextChapter.setting ?? activeEra?.name ?? ""}` : (activeEra?.name ?? "")}
            xp={isFlagship && nextChapter ? (nextChapter.rewards?.points ?? 40) : (nextMission?.reward ?? 0)}
            dinars={Math.max(5, Math.round(((isFlagship && nextChapter ? (nextChapter.rewards?.points ?? 40) : (nextMission?.reward ?? 0)) / 4)))}
            rewardLabel={isFlagship && nextChapter?.rewards?.artifactIds?.[0]
              ? (ARTIFACTS.find((a) => a.id === nextChapter.rewards!.artifactIds![0])?.name ?? "أثر نادر")
              : isFlagship && nextChapter?.rewards?.characterIds?.[0]
                ? (CHARACTERS.find((c) => c.id === nextChapter!.rewards!.characterIds![0])?.name ?? "شخصية")
                : "تقدّم في الحملة"}
            to={isFlagship && nextChapter ? { route: "/play/chapter", search: { id: nextChapter.id } } : { route: "/campaigns/$era", params: { era: active.eraId } }}
          />
        </section>
      )}

      {/* ============ RECENTLY DISCOVERED ============ */}
      <section className="mt-10 px-5">
        <SectionHeader icon={<Gem className="size-3.5" />} eyebrow="أرشيفك الشخصي" title="آخر ما اكتشفته" />
        {recent.length > 0 ? (
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 no-scrollbar">
            {recent.map((r) => (
              <Link
                key={r.key}
                to={r.to as "/"}
                className="group relative w-44 shrink-0 overflow-hidden rounded-2xl border border-gold/20 bg-surface/70 p-3 transition hover:border-gold/50"
              >
                <div className="absolute -left-6 -top-6 size-20 rounded-full bg-gold/10 blur-2xl" />
                <div className="relative">
                  <div className="text-2xl">{r.icon}</div>
                  <p className="mt-2 text-[10px] tracking-[0.2em] text-gold">{r.kind}</p>
                  <p className="font-display mt-0.5 text-sm font-bold leading-tight line-clamp-1">{r.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-white/60 leading-snug">{r.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Gem className="size-5 text-gold" />}
            title="لم تبدأ رحلتك بعد…"
            body="أكمل الفصول لتفتح شخصياتٍ وآثارًا وتظهر هنا."
          />
        )}
      </section>

      {/* ============ TODAY IN HISTORY ============ */}
      {mounted && todayEvent && <OnThisDayCalendarCard event={todayEvent} />}

      {/* ============ WORLD ACTIVITY ============ */}
      <section className="mt-10 px-5">
        <SectionHeader icon={<Bell className="size-3.5" />} eyebrow="جديد في إرث" title="نبضات العالم" />
        <EmptyState
          icon={<Bell className="size-5 text-gold" />}
          title="لا توجد تحديثات جديدة بعد"
          body="ستظهر هنا الحملات والشخصيات والتحقيقات الجديدة فور إضافتها."
        />
      </section>

      {/* ============ EXPLORE IRTH WORLDS ============ */}
      <section className="mt-10 mb-6 px-5">
        <SectionHeader icon={<Compass className="size-3.5" />} eyebrow="استكشف" title="عوالم إرث" />
        <div className="grid grid-cols-2 gap-3">
          <WorldCard to="/campaigns" icon={<Crown className="size-5" />} title="الحملات" subtitle="رحلات تاريخية كبرى" />
          <WorldCard to="/encyclopedia" icon={<Search className="size-5" />} title="الموسوعة" subtitle="ابحث وتعلّم" />
          <WorldCard to="/map" icon={<MapIcon className="size-5" />} title="الأطلس الإسلامي" subtitle="خارطة العصور" />
          <WorldCard to="/collection" icon={<Package className="size-5" />} title="المتحف" subtitle="أرشيفك ومقتنياتك" />
          <div className="col-span-2">
            <WorldCard to="/timeline" icon={<Hourglass className="size-5" />} title="الخط الزمني العظيم" subtitle="أكثر من 1400 سنة من التاريخ" wide />
          </div>
        </div>
      </section>

      <OnboardingTour />
    </AppShell>
  );
}

// ============================================================
// Small home components
// ============================================================

function SectionHeader({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-gold">{icon} {eyebrow}</div>
      <h2 className="font-display mt-1 text-lg font-bold">{title}</h2>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "gold" | "rose" | "emerald" | "indigo" | "ruby" }) {
  const toneClass: Record<string, string> = {
    gold: "text-gold bg-gold/10",
    rose: "text-rose-300 bg-rose-500/10",
    emerald: "text-emerald-300 bg-emerald-500/10",
    indigo: "text-indigo-300 bg-indigo-500/10",
    ruby: "text-red-300 bg-red-500/10",
  };
  return (
    <div className="flex min-w-[78px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2">
      <span className={`grid size-8 place-items-center rounded-full ${toneClass[tone]}`}>{icon}</span>
      <span className="font-display text-sm font-bold leading-none text-white">{value}</span>
      <span className="text-[9px] tracking-[0.15em] text-white/55">{label}</span>
    </div>
  );
}

type NextTo =
  | { route: "/play/chapter"; search: { id: string } }
  | { route: "/campaigns/$era"; params: { era: string } };

function NextUpCard({
  title, subtitle, xp, dinars, rewardLabel, to,
}: {
  title: string; subtitle: string; xp: number; dinars: number; rewardLabel: string; to: NextTo;
}) {
  const inner = (
    <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-5 shadow-elegant">
      <div className="arabesque-layer" />
      <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
      <div className="relative">
        <p className="text-[10px] tracking-[0.25em] text-gold">{subtitle}</p>
        <p className="font-display mt-1 text-lg font-bold leading-snug shimmer-text">{title}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
            <Sparkles className="size-3" /> {xp} خبرة
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
            <Coins className="size-3" /> {dinars} دينار
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-white/75">
            <Gem className="size-3" /> {rewardLabel}
          </span>
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-gold">
          ابدأ الآن <ChevronLeft className="size-4" />
        </div>
      </div>
    </div>
  );
  if (to.route === "/play/chapter") {
    return <Link to="/play/chapter" search={to.search}>{inner}</Link>;
  }
  return <Link to="/campaigns/$era" params={to.params}>{inner}</Link>;
}

function WorldCard({ to, icon, title, subtitle, wide }: { to: string; icon: React.ReactNode; title: string; subtitle: string; wide?: boolean }) {
  return (
    <Link
      to={to as "/"}
      className={`group relative block overflow-hidden rounded-2xl border border-gold/20 parchment-dark p-4 transition hover:border-gold/50 ${wide ? "min-h-[90px]" : "min-h-[110px]"}`}
    >
      <div className="arabesque-layer opacity-40" />
      <div className={`relative flex ${wide ? "items-center gap-4" : "flex-col gap-3"}`}>
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold transition group-hover:bg-gold/25">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-bold leading-tight">{title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/60">{subtitle}</p>
        </div>
        <ChevronLeft className="size-4 shrink-0 text-gold/50 transition group-hover:text-gold" />
      </div>
    </Link>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-surface/40 p-6 text-center">
      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-gold/10">{icon}</div>
      <p className="font-display text-sm font-bold">{title}</p>
      <p className="mt-1 text-[12px] text-white/55">{body}</p>
    </div>
  );
}

// ----- Today in History: card backed by today_in_history_events -----
function OnThisDayCalendarCard({ event }: { event: TodayInHistoryEvent }) {
  const href = event.deep_link ?? "/on-this-day";
  const yearBits: string[] = [];
  if (event.hijri_year) yearBits.push(`${event.hijri_year} هـ`);
  if (event.gregorian_year) yearBits.push(`${event.gregorian_year} م`);
  return (
    <section className="mt-10 px-5">
      <SectionHeader icon={<Calendar className="size-3.5" />} eyebrow="في مثل هذا اليوم" title="حدث من تاريخنا" />
      <Link
        to={href as "/"}
        className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/30 parchment-dark p-5 transition hover:border-gold/60"
      >
        <div className="arabesque-layer opacity-50" />
        <div className="absolute -left-10 -top-10 size-32 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex gap-4">
          {/* Date stamp */}
          <div className="shrink-0 rounded-2xl border border-gold/40 bg-black/30 px-3 py-2 text-center">
            <div className="text-[9px] tracking-[0.2em] text-gold/80">يوم</div>
            <div className="font-display text-2xl font-bold text-gold leading-none mt-1">
              {new Date().getDate()}
            </div>
            <div className="text-[9px] text-white/55 mt-1">
              {new Date().toLocaleDateString("ar", { month: "short" })}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {yearBits.length > 0 && (
              <p className="text-[10px] tracking-[0.25em] text-gold">{yearBits.join(" · ")}</p>
            )}
            <h3 className="font-display mt-1 text-base font-bold leading-snug">{event.title}</h3>
            <p className="mt-2 line-clamp-3 text-[12px] text-white/65 leading-relaxed">{event.body}</p>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="flex items-center gap-1 text-gold">اقرأ المزيد <ChevronLeft className="size-3" /></span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

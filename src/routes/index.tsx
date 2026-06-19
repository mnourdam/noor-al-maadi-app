import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Flame, Star, Sparkles, Search, ListOrdered, GitBranch, Map as MapIcon,
  ChevronLeft, Crown, Lock, Compass, Eye, Play, Hourglass,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  dailyStory, todayOnThisDay, ERAS, CAMPAIGNS, ARTIFACTS, CHARACTERS,
  levelFor, currentSeason, UPCOMING_CAMPAIGNS,
  UPCOMING_REGIONS, MYSTERY_CHARACTERS, FLAGSHIP_CHAPTERS,
  nextActiveCampaign,
} from "@/lib/data";
import {
  todayEvents as calendarToday, gregorianLabel, hijriLabel,
  CALENDAR_TYPE_LABELS, CALENDAR_TYPE_GLYPHS, primaryHref,
  IMPORTANCE_LABEL,
} from "@/lib/historical-calendar";
import { useProfile } from "@/lib/profile";
import { runDailyNotifications, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import salahuddinHero from "@/assets/salahuddin-hero.jpg";

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    touchStreak();
    // Fire the daily / re-engagement / season notifications when due.
    const today = todayOnThisDay();
    const season = currentSeason();
    runDailyNotifications({
      prefs: profile.settings.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      today: { title: today.title, teaser: today.detail, href: "/on-this-day" },
      season: {
        name: season.name,
        tagline: season.tagline,
        ready: profile.seasonPoints >= season.goalPoints && !profile.seasonClaimed,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchStreak]);

  const lvl = levelFor(profile.points);
  // ===== Dynamic hero campaign =====
  // Show the active campaign (flagship first if not yet completed; otherwise
  // the next campaign with remaining missions). When everything is done the
  // hero falls back to a "قريبًا" card built from UPCOMING_CAMPAIGNS.
  const active = nextActiveCampaign(profile.missionsCompleted);
  const activeEra = active ? ERAS.find((e) => e.id === active.eraId) : undefined;
  const activeDone = active ? active.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length : 0;
  const activePct  = active ? Math.round((activeDone / active.missions.length) * 100) : 0;
  const activeHasStarted = activeDone > 0;
  const isFlagship = active?.flagship === true;
  // For the flagship Ayyubid campaign, the "continue" target is the next FLAGSHIP_CHAPTERS entry.
  const nextChapter = isFlagship
    ? (FLAGSHIP_CHAPTERS.find((c) => !profile.missionsCompleted.includes(c.missionId))
        ?? FLAGSHIP_CHAPTERS[FLAGSHIP_CHAPTERS.length - 1])
    : null;

  const discovery = mounted ? rotatingDiscovery() : null;
  const season = currentSeason();
  const seasonPct = Math.min(100, Math.round((profile.seasonPoints / season.goalPoints) * 100));

  return (
    <AppShell>
      {/* ============ CINEMATIC HERO ============ */}
      <section className="relative -mt-2 overflow-hidden">
        {/* Artwork */}
        <div className="relative h-[78vh] min-h-[560px] w-full overflow-hidden">
          <img
            src={salahuddinHero}
            alt={active?.title ?? "إرث"}
            className="animate-ken-burns absolute inset-0 size-full object-cover"
          />
          <div className="ink-overlay absolute inset-0" />
          <div className="arabesque-layer" />
          {/* embers */}
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

          {/* Status bar (compact) */}
          <div className="relative z-10 flex items-start justify-between px-5 pt-8">
            <div className="animate-curtain rounded-2xl bg-gradient-to-l from-black/55 via-black/35 to-transparent px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-[11px] tracking-[0.2em] text-gold drop-shadow-[0_1px_4px_oklch(0_0_0/0.6)]">مرحبًا بك، {profile.name}</p>
              <p className="font-display mt-1 text-[11px] text-white/80">
                المستوى {lvl.level} · {lvl.title}
              </p>
            </div>
            <div className="glass animate-curtain flex items-center gap-3 rounded-full border border-gold/30 px-3 py-1.5">
              <div className="flex items-center gap-1 text-gold">
                <Flame className="size-3.5" />
                <span className="text-xs font-bold">{profile.streak}</span>
              </div>
              <div className="h-3 w-px bg-white/20" />
              <div className="flex items-center gap-1 text-gold">
                <Star className="size-3.5" />
                <span className="text-xs font-bold">{profile.points}</span>
              </div>
            </div>
          </div>

          {/* Hero copy */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10">
            {active && activeEra ? (
              <div className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <Crown className="size-3.5" />
                  <span className="tracking-[0.25em]">
                    {isFlagship ? "الحملة الكبرى" : "حملة نشِطة"} · {activeEra.name}
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

                {/* progress band */}
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-gradient-gold transition-all" style={{ width: `${activePct}%` }} />
                  </div>
                  <span className="text-[11px] text-white/70">
                    {activeDone}/{active.missions.length} فصل
                  </span>
                </div>

                {/* CTA */}
                <div className="mt-6 flex items-center gap-3">
                  {isFlagship && nextChapter ? (
                    <Link
                      to="/play/chapter" search={{ id: nextChapter.id }}
                      className="shadow-gold animate-gold-pulse inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                    >
                      <Play className="size-4 fill-current" />
                      {activeHasStarted ? "تابع الرحلة" : "ابدأ الرحلة"}
                    </Link>
                  ) : (
                    <Link
                      to="/campaigns/$era" params={{ era: active.eraId }}
                      className="shadow-gold animate-gold-pulse inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                    >
                      <Play className="size-4 fill-current" />
                      {activeHasStarted ? "تابع الحملة" : "ابدأ الحملة"}
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
                  <Link
                    to="/campaigns"
                    className="glass inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs text-gold"
                  >
                    استعرض كل الحملات <ChevronLeft className="size-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ DAILY MISSIONS ============ */}
      {/* ============ TODAY IN HISTORY ============ */}
      {mounted && <OnThisDayCalendarCard />}

      {/* ============ ACTIVE SEASON ============ */}
      <section className="mt-12 px-5">
        <Link
          to="/seasons"
          className="group relative block overflow-hidden rounded-3xl border border-gold/25 parchment-dark p-6 transition hover:border-gold/50"
        >
          <div className="arabesque-layer" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracking-[0.3em] text-gold">موسم محدود · {season.endsAt}</p>
              <span className="text-[10px] text-gold/70 group-hover:text-gold">الأرشيف ←</span>
            </div>
            <p className="font-display mt-2 text-xl font-bold shimmer-text">{season.name}</p>
            <p className="mt-2 max-w-md text-[12px] text-white/65">{season.tagline}</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${seasonPct}%` }} />
              </div>
              <span className="text-[10px] text-white/60">{Math.min(profile.seasonPoints, season.goalPoints)}/{season.goalPoints}</span>
            </div>
          </div>
        </Link>
      </section>

      {/* ============ EXPLORE MORE ============ */}
      <section className="mt-10 mb-6 px-5">
        <SectionHeader icon={<Compass className="size-3.5" />} eyebrow="استكشف المزيد" title="عوالم تنتظر" />
        <div className="grid grid-cols-2 gap-2.5">
          <ExploreTile to="/campaigns" icon={<Crown className="size-4" />} title="كل الحملات" subtitle={`${UPCOMING_CAMPAIGNS.length}+ قادمة`} />
          <ExploreTile to="/seasons" icon={<Sparkles className="size-4" />} title="المواسم" subtitle="مكافآت محدودة" />
          <ExploreTile to="/timeline" icon={<Hourglass className="size-4" />} title="الخط الزمني" subtitle="١٤٠٠ سنة" />
          <ExploreTile to="/map" icon={<MapIcon className="size-4" />} title="الخارطة" subtitle={`${UPCOMING_REGIONS.length}+ مناطق`} />
          <ExploreTile to="/on-this-day" icon={<Eye className="size-3.5" />} title="في مثل هذا اليوم" subtitle="أحداث اليوم" />
          <ExploreTile to="/collection" icon={<Star className="size-3.5" />} title="المتحف" subtitle="أرشيفك" />
        </div>
        <div className="gold-divider my-6" />
        <div className="grid grid-cols-4 gap-2">
          <ModeChip to="/play/investigate" icon={<Search className="size-4" />} label="تحقيق" />
          <ModeChip to="/play/timeline" icon={<ListOrdered className="size-4" />} label="ترتيب" />
          <ModeChip to="/play/decisions" icon={<GitBranch className="size-4" />} label="قرارات" />
          <ModeChip to="/map" icon={<MapIcon className="size-4" />} label="الخارطة" />
        </div>
      </section>
    </AppShell>
  );
}

// ============================================================
// Small home components
// ============================================================

function SectionHeader({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-gold">
        {icon} {eyebrow}
      </div>
      <h2 className="font-display mt-1 text-lg font-bold">{title}</h2>
    </div>
  );
}

function ModeChip({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to as "/"}
      className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-surface/60 px-2 py-3 text-center transition hover:border-gold/40"
    >
      <span className="grid size-9 place-items-center rounded-full bg-gold/10 text-gold transition group-hover:bg-gold/20">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </Link>
  );
}

function ExploreTile({ to, icon, title, subtitle }: { to: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link
      to={to as "/"}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-surface/70 p-3 transition hover:border-gold/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold transition group-hover:bg-gold/25">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[13px] font-bold">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronLeft className="size-4 shrink-0 text-gold/60 transition group-hover:text-gold" />
    </Link>
  );
}

// ----- Daily Discovery rotation -----

// (component defined above)
type DiscoveryItem =
  | { kind: "character"; id: string; title: string; eyebrow: string; body: string; icon: string; era: string; to: string }
  | { kind: "artifact";  id: string; title: string; eyebrow: string; body: string; icon: string; era: string; to: string }
  | { kind: "event";     id: string; title: string; eyebrow: string; body: string; icon: string; era: string; to: string }
  | { kind: "manuscript";id: string; title: string; eyebrow: string; body: string; icon: string; era: string; to: string }
  | { kind: "location";  id: string; title: string; eyebrow: string; body: string; icon: string; era: string; to: string };

function rotatingDiscovery(): DiscoveryItem | null {
  const day = Math.floor(Date.now() / 86400000);
  const order: DiscoveryItem["kind"][] = ["character", "artifact", "event", "manuscript", "location"];
  const kind = order[day % order.length];
  const eraName = (e: string) => ERAS.find((x) => x.id === e)?.name ?? "";

  if (kind === "character") {
    const c = CHARACTERS[day % CHARACTERS.length];
    return { kind, id: c.id, title: c.name, eyebrow: `شخصية · ${c.title}`, body: c.bio, icon: c.avatar, era: eraName(c.era), to: "/collection" };
  }
  if (kind === "artifact") {
    const a = ARTIFACTS[day % ARTIFACTS.length];
    return { kind, id: a.id, title: a.name, eyebrow: `أثر · ${a.typeLabel}`, body: a.description, icon: a.icon, era: eraName(a.era), to: "/collection" };
  }
  if (kind === "event") {
    const e = todayOnThisDay();
    return { kind, id: e.title, title: e.title, eyebrow: `في مثل هذا اليوم · ${e.year}`, body: e.detail, icon: "📅", era: eraName(e.era), to: "/on-this-day" };
  }
  if (kind === "manuscript") {
    const mans = ARTIFACTS.filter((a) => a.type === "manuscript");
    const a = mans[day % Math.max(1, mans.length)];
    return { kind, id: a.id, title: a.name, eyebrow: "مخطوط نادر", body: a.description, icon: "📜", era: eraName(a.era), to: "/collection" };
  }
  // location → daily story setting
  const s = dailyStory();
  return { kind: "location", id: s.id, title: s.title, eyebrow: "موضع وحكاية", body: s.excerpt, icon: "🏛️", era: eraName(s.era), to: "/story/$id" };
}

function DiscoveryCard({ d }: { d: DiscoveryItem }) {
  const content = (
    <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/25 p-6 shadow-elegant">
      <div className="arabesque-layer" />
      <div className="particle-field opacity-60" />
      <div className="relative flex gap-5">
        <div className="chapter-seal animate-stamp shrink-0 text-2xl">{d.icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-[0.25em] text-gold">{d.eyebrow}</p>
          <p className="font-display mt-1 text-xl font-bold leading-snug">{d.title}</p>
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-white/75">{d.body}</p>
          <div className="mt-3 flex items-center justify-between text-[10px]">
            <span className="text-white/50">{d.era}</span>
            <span className="flex items-center gap-1 text-gold">اكتشف <ChevronLeft className="size-3" /></span>
          </div>
        </div>
      </div>
    </div>
  );
  if (d.kind === "location") {
    return <Link to="/story/$id" params={{ id: d.id }}>{content}</Link>;
  }
  return <Link to={d.to as "/"}>{content}</Link>;
}
// ----- Historical calendar: Today card -----
function OnThisDayCalendarCard() {
  const events = calendarToday();
  if (events.length === 0) return null;
  const main = events[0];
  const href = primaryHref(main) ?? "/history-calendar";
  const hijri = hijriLabel(main);
  return (
    <section className="mt-10 px-5">
      <SectionHeader
        icon={<Calendar className="size-3.5" />}
        eyebrow="التقويم التاريخي"
        title="حدث في مثل هذا اليوم"
      />
      <Link
        to={href as "/"}
        className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/30 bg-surface p-5 transition hover:border-gold/60"
      >
        <div className="absolute -left-10 -top-10 size-32 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] tracking-[0.25em] text-gold">
              {gregorianLabel(main)} · {main.year}
            </p>
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
              {IMPORTANCE_LABEL[main.importance]}
            </span>
          </div>
          {hijri && <p className="mt-0.5 text-[10px] text-white/50">الموافق {hijri}</p>}
          <h3 className="font-display mt-1 text-lg font-bold leading-snug">{main.title}</h3>
          <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{main.description}</p>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/70">
              {CALENDAR_TYPE_GLYPHS[main.type]} {CALENDAR_TYPE_LABELS[main.type]}
            </span>
            <span className="flex items-center gap-1 text-gold">اقرأ المزيد <ChevronLeft className="size-3" /></span>
          </div>
          {events.length > 1 && (
            <p className="mt-3 text-[10px] text-white/55">
              +{events.length - 1} أحداث أخرى في نفس اليوم
            </p>
          )}
        </div>
      </Link>
    </section>
  );
}

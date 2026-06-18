import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Flame, Star, Sparkles, Search, ListOrdered, GitBranch, Map as MapIcon,
  ChevronLeft, Crown, Lock, Compass, Eye, Play, Hourglass,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  dailyStory, todayOnThisDay, ERAS, CAMPAIGNS, ARTIFACTS, CHARACTERS,
  levelFor, dailyMissionsForDate, CURRENT_SEASON, UPCOMING_CAMPAIGNS,
  UPCOMING_REGIONS, MYSTERY_CHARACTERS, FLAGSHIP_CHAPTERS, todayKey,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import salahuddinHero from "@/assets/salahuddin-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حكايا — عالم تاريخي متكامل" },
      { name: "description", content: "ادخل عالمًا واسعًا من القصص والحملات والآثار والمعارك في التاريخ العربي والإسلامي." },
    ],
  }),
  component: Index,
});

function Index() {
  const { profile, touchStreak } = useProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); touchStreak(); }, [touchStreak]);

  const lvl = levelFor(profile.points);
  const flagship = CAMPAIGNS.find((c) => c.flagship)!;
  const flagshipEra = ERAS.find((e) => e.id === flagship.eraId)!;
  const flagshipDone = flagship.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
  const flagshipPct = Math.round((flagshipDone / flagship.missions.length) * 100);

  // Find the next unfinished flagship chapter — this is the "Continue Journey" target.
  const nextChapter =
    FLAGSHIP_CHAPTERS.find((c) => !profile.missionsCompleted.includes(c.missionId)) ?? FLAGSHIP_CHAPTERS[FLAGSHIP_CHAPTERS.length - 1];
  const isCampaignDone = profile.missionsCompleted.includes(FLAGSHIP_CHAPTERS[FLAGSHIP_CHAPTERS.length - 1].missionId);
  const hasStarted = flagshipDone > 0;

  const dailies = useMemo(() => (mounted ? dailyMissionsForDate() : []), [mounted]);
  const claimedToday = profile.dailyClaimed.day === todayKey() ? profile.dailyClaimed.ids : [];
  const dailyTodo = dailies.filter((d) => !claimedToday.includes(d.id));

  const discovery = mounted ? rotatingDiscovery() : null;
  const seasonPct = Math.min(100, Math.round((profile.seasonPoints / CURRENT_SEASON.goalPoints) * 100));

  return (
    <AppShell>
      {/* ============ CINEMATIC HERO ============ */}
      <section className="relative -mt-2 overflow-hidden">
        {/* Artwork */}
        <div className="relative h-[78vh] min-h-[560px] w-full overflow-hidden">
          <img
            src={salahuddinHero}
            alt={flagship.title}
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
            <div className="animate-curtain">
              <p className="text-[11px] tracking-[0.2em] text-gold/80">مرحبًا بك، {profile.name}</p>
              <p className="font-display mt-1 text-[11px] text-white/60">
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
            <div className="animate-curtain max-w-xl">
              <div className="flex items-center gap-2 text-[11px] text-gold">
                <Crown className="size-3.5" />
                <span className="tracking-[0.25em]">الحملة الكبرى · {flagshipEra.name}</span>
              </div>
              <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white drop-shadow-[0_4px_18px_oklch(0_0_0/0.6)]">
                {flagship.title}
              </h1>
              <p className="mt-3 text-sm text-white/75">
                {hasStarted
                  ? <>الفصل {nextChapter.index} · <span className="text-gold">{nextChapter.title}</span></>
                  : "ابدأ ملحمتك الأولى من حلب إلى أسوار القدس."}
              </p>
              <p className="mt-2 line-clamp-2 text-[13px] italic text-white/55">
                «{nextChapter.hook}»
              </p>

              {/* progress band */}
              <div className="mt-5 flex items-center gap-3">
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${flagshipPct}%` }} />
                </div>
                <span className="text-[11px] text-white/70">
                  {flagshipDone}/{flagship.missions.length} فصل
                </span>
              </div>

              {/* CTA */}
              <div className="mt-6 flex items-center gap-3">
                {isCampaignDone ? (
                  <Link
                    to="/campaigns/$era" params={{ era: flagship.eraId }}
                    className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                  >
                    أرشيف الحملة <ChevronLeft className="size-4" />
                  </Link>
                ) : (
                  <Link
                    to="/play/chapter" search={{ id: nextChapter.id }}
                    className="shadow-gold animate-gold-pulse inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
                  >
                    <Play className="size-4 fill-current" />
                    {hasStarted ? "تابع الرحلة" : "ابدأ الرحلة"}
                  </Link>
                )}
                <Link
                  to="/campaigns/$era" params={{ era: flagship.eraId }}
                  className="glass inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-xs text-white/80"
                >
                  كل الفصول
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ DAILY DISCOVERY ============ */}
      {discovery && (
        <section className="mt-10 px-5">
          <SectionHeader icon={<Eye className="size-3.5" />} eyebrow="اكتشاف اليوم" title="من خزائن التاريخ" />
          <DiscoveryCard d={discovery} />
        </section>
      )}

      {/* ============ DAILY MISSIONS (compact ribbon) ============ */}
      {mounted && dailyTodo.length > 0 && (
        <section className="mt-10 px-5">
          <SectionHeader icon={<Sparkles className="size-3.5" />} eyebrow="مهام اليوم" title={`${dailyTodo.length} مهام بانتظارك`} />
          <div className="-mr-5 flex gap-3 overflow-x-auto pr-5 pb-2">
            {dailyTodo.map((d) => (
              <Link
                key={d.id} to={d.link.to as "/"}
                className="group relative w-60 shrink-0 overflow-hidden rounded-2xl border border-gold/20 bg-surface p-4 transition hover:border-gold/50"
              >
                <span className="text-[10px] tracking-[0.2em] text-gold/80">+{d.reward} نقطة</span>
                <p className="font-display mt-2 text-sm font-bold">{d.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{d.desc}</p>
                <span className="absolute -left-6 -bottom-6 size-20 rounded-full bg-gold/10 blur-2xl transition group-hover:bg-gold/30" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ============ LIVING WORLD ============ */}
      <section className="mt-12 px-5">
        <SectionHeader
          icon={<Compass className="size-3.5" />}
          eyebrow="ما وراء الأفق"
          title="عوالم تنتظر اكتشافها"
        />
        <div className="-mr-5 flex gap-3 overflow-x-auto pr-5 pb-3">
          {UPCOMING_CAMPAIGNS.slice(0, 6).map((u) => (
            <div
              key={u.id}
              className="relative w-64 shrink-0 overflow-hidden rounded-2xl border border-dashed border-white/15 bg-surface/40 p-5"
            >
              <div className="absolute -right-8 -top-8 size-24 rounded-full bg-gold/5 blur-2xl" />
              <div className="flex items-center gap-1 text-[10px] tracking-[0.2em] text-gold/70">
                <Lock className="size-3" /> {u.eta}
              </div>
              <p className="font-display mt-3 text-base font-bold leading-snug">{u.name}</p>
              <p className="mt-2 line-clamp-3 text-[11px] text-muted-foreground">{u.teaser}</p>
            </div>
          ))}
        </div>

        {/* Hidden discoveries */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {MYSTERY_CHARACTERS.slice(0, 2).map((m) => (
            <div key={m.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-4">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-gold/70">
                <Lock className="size-3" /> شخصية مخفية
              </div>
              <p className="mt-2 line-clamp-3 font-display text-[12px] italic text-white/70">«{m.hint}»</p>
            </div>
          ))}
        </div>

        <Link
          to="/map"
          className="glass mt-4 flex items-center justify-between rounded-2xl border border-white/10 p-4 transition hover:border-gold/40"
        >
          <div>
            <p className="text-[10px] tracking-[0.2em] text-gold/80">خارطة العالم الإسلامي</p>
            <p className="font-display mt-1 text-sm font-bold">من الحجاز إلى الأندلس · {UPCOMING_REGIONS.length}+ مناطق قادمة</p>
          </div>
          <ChevronLeft className="size-5 text-gold" />
        </Link>
      </section>

      {/* ============ SEASON whisper ============ */}
      <section className="mt-12 px-5">
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 parchment-dark p-6">
          <div className="arabesque-layer" />
          <div className="relative">
            <p className="text-[10px] tracking-[0.3em] text-gold">موسم محدود · {CURRENT_SEASON.endsAt}</p>
            <p className="font-display mt-2 text-xl font-bold shimmer-text">{CURRENT_SEASON.name}</p>
            <p className="mt-2 max-w-md text-[12px] text-white/65">{CURRENT_SEASON.tagline}</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${seasonPct}%` }} />
              </div>
              <span className="text-[10px] text-white/60">{Math.min(profile.seasonPoints, CURRENT_SEASON.goalPoints)}/{CURRENT_SEASON.goalPoints}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Quiet modes rail ============ */}
      <section className="mt-10 mb-6 px-5">
        <div className="gold-divider mb-6" />
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

// ----- Daily Discovery rotation -----
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
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Search, Map as MapIcon, ChevronLeft, Crown, Lock, Compass, Play,
  Hourglass, Calendar, Heart, Coins, Trophy, Package, BookOpen,
  Swords, Sparkles, Bell, Gem, Target, Flame, Sunrise, Zap, Award,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  ERAS,
  levelFor, currentSeason,
  ACHIEVEMENTS, evaluateAchievements,
} from "@/lib/app-constants";
import { useProfile } from "@/lib/profile";
import { getEffectiveHearts, HEART_MAX } from "@/lib/hearts";
import { runDailyNotifications, DEFAULT_NOTIFICATION_PREFS, unreadCount, formatBadgeCount } from "@/lib/notifications";
import { fetchMyUnreadCount, subscribeToMyNotifications } from "@/lib/notifications/server";
import { useAccount } from "@/lib/account";
import { useTodayInHistoryEvent, type TodayInHistoryEvent } from "@/lib/today-in-history";
import { useRealCollectionStats, type UnifiedUnlock } from "@/lib/real-collection-stats";
import { OnboardingTour } from "@/components/OnboardingTour";
import { listPublishedCampaigns } from "@/lib/campaignStorage";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type { Campaign as ImportedCampaign, CampaignActivity, CampaignChapter } from "@/types/campaign";
import heroCitySunrise from "@/assets/hero-city-sunrise.jpg";
import heroDesertCaravan from "@/assets/hero-desert-caravan.jpg";
import heroManuscriptLamp from "@/assets/hero-manuscript-lamp.jpg";
import heroFortress from "@/assets/hero-fortress.jpg";

import { useQuery } from "@tanstack/react-query";
import { fetchWorldsIndex } from "@/lib/worlds";
import { DailyChallengesSection } from "@/components/home/DailyChallengesSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "description", content: "ادخل عالمًا تفاعليًا واسعًا من الشخصيات والدول والمعارك والمدن والأحداث في التاريخ الإسلامي." },
    ],
  }),
  component: HomeFull,
});

// ============================================================
// Hero carousel slide types
// ============================================================
type HeroSlide =
  | { kind: "campaign"; bg: string; eyebrow: string; title: string; subtitle: string; quote?: string; progress?: { done: number; total: number }; cta: { label: string; link: React.ReactNode } }
  | { kind: "history"; bg: string; eyebrow: string; title: string; subtitle: string; cta?: { label: string; link: React.ReactNode } }
  | { kind: "discovery"; bg: string; eyebrow: string; title: string; subtitle: string; icon: string; cta: { label: string; link: React.ReactNode } }
  | { kind: "timeline"; bg: string; eyebrow: string; title: string; subtitle: string; cta: { label: string; link: React.ReactNode } };



function HomeFull() {
  const { profile, touchStreak } = useProfile();
  const { account, user, lastSyncAt } = useAccount();

  const displayName = account?.username ?? (user ? profile.name : profile.name);
  const [mounted, setMounted] = useState(false);
  const { selected: todayEvent } = useTodayInHistoryEvent();
  const stats = useRealCollectionStats();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let serverAuthoritative = false;
    let cancelled = false;
    const recount = async () => {
      try {
        const n = await fetchMyUnreadCount();
        if (cancelled) return;
        serverAuthoritative = true;
        setUnread(n);
      } catch {
        if (cancelled) return;
        if (!serverAuthoritative) setUnread(unreadCount());
      }
    };
    void recount();
    const unsubRealtime = subscribeToMyNotifications(() => { void recount(); });
    const onLocal = () => { void recount(); };
    window.addEventListener("irth:notifications:updated", onLocal);
    window.addEventListener("focus", onLocal);
    return () => {
      cancelled = true;
      window.removeEventListener("irth:notifications:updated", onLocal);
      window.removeEventListener("focus", onLocal);
      unsubRealtime();
    };
  }, []);


  useEffect(() => {
    setMounted(true);
    if (!user || lastSyncAt) {
      touchStreak();
    }
    const season = currentSeason();
    runDailyNotifications({
      prefs: profile.settings.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      today: todayEvent
        ? { title: todayEvent.title, teaser: todayEvent.body, href: "/on-this-day" }
        : null,
      season: {
        name: season.name, tagline: season.tagline,
        ready: profile.seasonPoints >= season.goalPoints && !profile.seasonClaimed,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchStreak, todayEvent?.id, user, lastSyncAt]);


  const lvl = levelFor(profile.points);

  // ===== Imported campaigns (single source of truth) =====
  const [importedCampaigns, setImportedCampaigns] = useState<ImportedCampaign[]>(() => {
    try { return listPublishedCampaigns(); } catch { return []; }
  });
  useEffect(() => {
    import("@/lib/cloudSync")
      .then((m) => m.pullAllFromCloud())
      .then(() => {
        try { setImportedCampaigns(listPublishedCampaigns()); } catch {}
      })
      .catch(() => {});
  }, []);
  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setProgressTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); };
  }, []);


  type CampaignSelection = {
    campaign: ImportedCampaign;
    progress: ReturnType<typeof getCampaignProgress>;
    hasStarted: boolean;
    isComplete: boolean;
    completedChapters: number;
    nextChapter: CampaignChapter | null;
    nextActivity: CampaignActivity | null;
  };
  const campaignSel = useMemo<CampaignSelection | null>(() => {
    if (!importedCampaigns.length) return null;
    const enriched: CampaignSelection[] = importedCampaigns.map((c) => {
      const p = getCampaignProgress(c.id);
      const sorted = [...c.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const completedChapters = sorted.filter((ch) => p.chapters[ch.id]?.completed).length;
      const nextChapter = sorted.find((ch) => !p.chapters[ch.id]?.completed) ?? null;
      const nextActivity = nextChapter
        ? (nextChapter.activities.find(
            (a) => !(p.chapters[nextChapter.id]?.completedActivityIds ?? []).includes(a.id),
          ) ?? null)
        : null;
      const hasStarted =
        completedChapters > 0 ||
        Object.values(p.chapters).some((ch) => (ch.completedActivityIds?.length ?? 0) > 0);
      return { campaign: c, progress: p, hasStarted, isComplete: p.completed, completedChapters, nextChapter, nextActivity };
    });
    return (
      enriched.find((e) => e.hasStarted && !e.isComplete) ??
      enriched.find((e) => !e.isComplete) ??
      enriched[0]
    );
  }, [importedCampaigns, progressTick]);

  // ===== Hero slides =====
  const slides = useMemo<HeroSlide[]>(() => {
    const out: HeroSlide[] = [];
    if (campaignSel) {
      const { campaign, hasStarted, isComplete, completedChapters, nextChapter } = campaignSel;
      const total = campaign.chapters.length;
      const ctaLabel = isComplete ? "استعرض الحملة" : hasStarted ? "أكمل رحلتك" : "ابدأ رحلتك";
      const heroBg =
        (campaign.coverImage && /^(https?:|data:|\/)/i.test(campaign.coverImage) && campaign.coverImage) ||
        heroFortress;
      const subtitle = nextChapter && !isComplete
        ? `الفصل ${nextChapter.order ?? completedChapters + 1} · ${nextChapter.title}`
        : (campaign.subtitle ?? campaign.description ?? "تابع رحلتك في هذه الحملة.");
      out.push({
        kind: "campaign",
        bg: heroBg,
        eyebrow: isComplete ? "حملتك المكتملة" : hasStarted ? "أكمل رحلتك من حيث توقفت" : "ابدأ رحلتك الآن",

        title: campaign.title,
        subtitle,
        progress: { done: completedChapters, total },
        cta: { label: ctaLabel, link: (
          <Link
            to="/campaigns/imported/$id"
            params={{ id: campaign.id }}
            className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            <Play className="size-4 fill-current" />{ctaLabel}
          </Link>
        )},
      });
    }
    if (todayEvent) {
      const yr = todayEvent.hijri_year ? `${todayEvent.hijri_year} هـ` : (todayEvent.gregorian_year ? `${todayEvent.gregorian_year} م` : "في مثل هذا اليوم");
      out.push({
        kind: "history",
        bg: heroManuscriptLamp,
        eyebrow: `في مثل هذا اليوم · ${yr}`,
        title: todayEvent.title,
        subtitle: todayEvent.body,
      });
    }
    if (stats.recent.length > 0) {
      const r = stats.recent[0];
      out.push({
        kind: "discovery", bg: heroFortress,
        eyebrow: `آخر اكتشافاتك · ${r.kind}`,
        title: r.title,
        subtitle: r.subtitle ?? "افتح أرشيفك التاريخي واكتشف ما جمعته.",
        icon: r.icon,
        cta: { label: "افتح البطاقة", link:
          <Link to={(r.to ?? "/collection") as "/"} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground">
            <Gem className="size-4" />افتح البطاقة
          </Link>,
        },
      });
    }
    out.push({
      kind: "timeline", bg: heroDesertCaravan,
      eyebrow: "الخط الزمني العظيم",
      title: "أكثر من 1400 سنة من التاريخ",
      subtitle: "تجوّل في العصور من البعثة حتى اليوم.",
      cta: { label: "ابدأ الرحلة الزمنية", link:
        <Link to="/timeline" className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground">
          <Hourglass className="size-4" />ابدأ الرحلة الزمنية
        </Link>,
      },
    });
    return out;
  }, [campaignSel, todayEvent, stats.recent]);

  // Carousel
  const [slideIdx, setSlideIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; locked: "h" | "v" | null } | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const isRTL = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  useEffect(() => {
    if (slides.length <= 1 || isDragging) return;
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(id);
  }, [slides.length, isDragging]);

  useEffect(() => { if (slideIdx >= slides.length) setSlideIdx(0); }, [slides.length, slideIdx]);
  const slide = slides[Math.min(slideIdx, slides.length - 1)] ?? slides[0];

  const goTo = (n: number) => {
    if (slides.length === 0) return;
    setSlideIdx(((n % slides.length) + slides.length) % slides.length);
  };
  const next = () => goTo(slideIdx + 1);
  const prev = () => goTo(slideIdx - 1);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragStart.current = { x: t.clientX, y: t.clientY, locked: null };
    setIsDragging(true);
    setDragX(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = dragStart.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (s.locked === "h") {
      if (e.cancelable) e.preventDefault();
      const w = heroRef.current?.clientWidth ?? 320;
      const clamped = Math.max(-w * 0.6, Math.min(w * 0.6, dx));
      setDragX(clamped);
    }
  };
  const onTouchEnd = () => {
    const s = dragStart.current;
    dragStart.current = null;
    const w = heroRef.current?.clientWidth ?? 320;
    const threshold = Math.max(48, w * 0.18);
    if (s?.locked === "h" && Math.abs(dragX) > threshold) {
      const goNext = isRTL ? dragX > 0 : dragX < 0;
      if (goNext) next(); else prev();
    }
    setDragX(0);
    setIsDragging(false);
  };

  const hearts = getEffectiveHearts(profile);

  // ===== Today's Journey (dynamic recommendation) =====
  type Recommendation = {
    kind: "campaign" | "hearts" | "atlas" | "encyclopedia" | "today" | "timeline";
    eyebrow: string;
    title: string;
    subtitle: string;
    xp: number;
    dinars: number;
    icon: ReactNode;
    link: ReactNode;
  };
  const recommendation = useMemo<Recommendation | null>(() => {
    // Heart recovery loop has top priority when low.
    if (hearts <= 1) {
      return {
        kind: "hearts",
        eyebrow: "استعد قواك",
        title: "تحقيق سريع لاستعادة القلوب",
        subtitle: "اكشف الخيوط واستعد قلوبك للعودة إلى الميدان.",
        xp: 15, dinars: 8,
        icon: <Heart className="size-4" />,
        link: (
          <Link to="/investigations" className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
            <Search className="size-4" /> ابدأ تحقيقًا
          </Link>
        ),
      };
    }
    if (campaignSel && !campaignSel.isComplete && campaignSel.nextChapter) {
      const { campaign, nextChapter, nextActivity, hasStarted } = campaignSel;
      const xp = nextActivity?.xpReward ?? 10;
      const dinars = nextActivity?.coinsReward ?? 5;
      return {
        kind: "campaign",
        eyebrow: hasStarted ? "تابع رحلتك" : "ابدأ رحلتك",
        title: nextActivity?.prompt?.trim() || nextChapter.title,
        subtitle: `الفصل ${nextChapter.order ?? "?"} · ${campaign.title}`,
        xp, dinars,
        icon: <Crown className="size-4" />,
        link: (
          <Link to="/campaigns/imported/$id" params={{ id: campaign.id }} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
            <Play className="size-4 fill-current" />{hasStarted ? "تابع الرحلة" : "ابدأ الحملة"}
          </Link>
        ),
      };
    }
    if (todayEvent && todayEvent.deep_link) {
      return {
        kind: "today",
        eyebrow: "حدث اليوم",
        title: todayEvent.title,
        subtitle: "اقرأ حدث اليوم وانطلق في رحلتك.",
        xp: 15, dinars: 5,
        icon: <Calendar className="size-4" />,
        link: (
          <Link to={todayEvent.deep_link as "/"} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
            <BookOpen className="size-4" />اقرأ القصة
          </Link>
        ),
      };
    }
    return {
      kind: "encyclopedia",
      eyebrow: "استكشف",
      title: "اكتشف الموسوعة التاريخية",
      subtitle: "شخصيات ودول ومدن تنتظر اكتشافها.",
      xp: 10, dinars: 3,
      icon: <Search className="size-4" />,
      link: (
        <Link to="/encyclopedia" className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
          <Search className="size-4" />استكشف
        </Link>
      ),
    };
  }, [hearts, campaignSel, todayEvent]);

  // ===== Almost There (nearby goals) =====
  type Goal = { icon: ReactNode; label: string; remaining: number; unit: string; to: string };
  const almostThere = useMemo<Goal[]>(() => {
    const goals: Goal[] = [];
    if (lvl.next && lvl.toNext > 0 && lvl.toNext <= 2000) {
      goals.push({
        icon: <Zap className="size-3.5" />,
        label: `حتى ${lvl.next.title}`,
        remaining: lvl.toNext,
        unit: "نقطة خبرة",
        to: "/profile",
      });
    }
    if (campaignSel && !campaignSel.isComplete) {
      const remaining = campaignSel.campaign.chapters.length - campaignSel.completedChapters;
      if (remaining > 0 && remaining <= 5) {
        goals.push({
          icon: <Crown className="size-3.5" />,
          label: `إنهاء «${campaignSel.campaign.title}»`,
          remaining,
          unit: remaining === 1 ? "فصل" : "فصول",
          to: `/campaigns/imported/${campaignSel.campaign.id}`,
        });
      }
    }
    const evals = evaluateAchievements(profile);
    const earnedMap = profile.achievementsEarned ?? {};
    const nearest = evals
      .filter((e) => !e.earned && !earnedMap[e.id])
      .map((e) => {
        const def = ACHIEVEMENTS.find((a) => a.id === e.id);
        if (!def) return null;
        const remaining = Math.max(0, def.goal - e.current);
        return { def, remaining };
      })
      .filter((x): x is { def: typeof ACHIEVEMENTS[number]; remaining: number } => x !== null && x.remaining > 0)
      .sort((a, b) => a.remaining - b.remaining)[0];
    if (nearest && nearest.remaining <= 20) {
      goals.push({
        icon: <Award className="size-3.5" />,
        label: `إنجاز «${nearest.def.name}»`,
        remaining: nearest.remaining,
        unit: "خطوة",
        to: "/achievements",
      });
    }
    return goals.slice(0, 3);
  }, [lvl, campaignSel, profile]);

  // ===== Recent Activity =====
  type Activity = { key: string; icon: ReactNode; eyebrow: string; title: string; to: string };
  const recentActivity = useMemo<Activity[]>(() => {
    const acts: Activity[] = [];
    if (stats.recent[0]) {
      const r = stats.recent[0];
      acts.push({
        key: `disc:${r.key}`,
        icon: <Gem className="size-3.5" />,
        eyebrow: `اكتشاف · ${r.kind}`,
        title: r.title,
        to: r.to ?? "/collection",
      });
    }
    const earnedMap = profile.achievementsEarned ?? {};
    const earnedSorted = Object.entries(earnedMap)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    if (earnedSorted.length > 0) {
      const def = ACHIEVEMENTS.find((a) => a.id === earnedSorted[0][0]);
      if (def) {
        acts.push({
          key: `ach:${def.id}`,
          icon: <Trophy className="size-3.5" />,
          eyebrow: "إنجاز جديد",
          title: def.name,
          to: "/achievements",
        });
      }
    }
    if (campaignSel && campaignSel.hasStarted) {
      acts.push({
        key: `camp:${campaignSel.campaign.id}`,
        icon: <Crown className="size-3.5" />,
        eyebrow: campaignSel.isComplete ? "حملة مكتملة" : "حملة نشطة",
        title: campaignSel.campaign.title,
        to: `/campaigns/imported/${campaignSel.campaign.id}`,
      });
    }
    if (profile.artifactsFound.length > 0) {
      acts.push({
        key: "museum",
        icon: <Package className="size-3.5" />,
        eyebrow: "متحفك",
        title: `${profile.artifactsFound.length} أثرًا في خزانتك`,
        to: "/collection",
      });
    }
    return acts.slice(0, 4);
  }, [stats.recent, profile.achievementsEarned, profile.artifactsFound.length, campaignSel]);

  return (
    <AppShell>






      {/* Page-wide atmosphere: a single fixed parchment fog behind everything.
          Mobile-safe — no background-attachment:fixed; absolutely positioned. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.62_0.13_75/0.06),transparent_60%),radial-gradient(ellipse_at_bottom,oklch(0.4_0.06_260/0.05),transparent_55%)]" />


      {/* ============ 1. ATMOSPHERIC HERO CAROUSEL ============ */}
      <section className="relative -mt-2 overflow-hidden">
        <div
          ref={heroRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="relative h-[78vh] min-h-[560px] w-full overflow-hidden touch-pan-y select-none"
        >
          {slides.map((s, i) => (
            <img
              key={`${s.kind}-${i}`}
              src={s.bg}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`animate-ken-burns absolute inset-0 size-full object-cover transition-opacity duration-[1200ms] ease-in-out ${i === slideIdx ? "opacity-100" : "opacity-0"}`}
            />
          ))}
          <div className="ink-overlay absolute inset-0" />
          <div className="arabesque-layer" />
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="ember" style={{
              left: `${(i * 73) % 100}%`,
              animationDelay: `${(i * 0.7) % 7}s`,
              animationDuration: `${6 + ((i * 1.3) % 5)}s`,
            }} />
          ))}

          {/* Top greeting strip */}
          <div className="relative z-10 flex items-start justify-between px-5 pt-8">
            <div className="animate-curtain rounded-2xl bg-gradient-to-l from-black/55 via-black/35 to-transparent px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="text-[11px] tracking-[0.2em] text-gold drop-shadow-[0_1px_4px_oklch(0_0_0/0.6)]">مرحبًا بك، {displayName}</p>
              <p className="font-display mt-1 text-[11px] text-white/80">المستوى {lvl.level} · {lvl.title}</p>
            </div>
            {profile.streak > 1 && (
              <div className="animate-curtain inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 ring-1 ring-gold/30 backdrop-blur-sm">
                <Flame className="size-3.5 text-gold" />
                <span className="font-display text-[11px] font-bold text-gold">{profile.streak}</span>
              </div>
            )}
          </div>

          {/* Slide content */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 px-6 pb-16"
            style={{
              transform: `translate3d(${dragX}px, 0, 0)`,
              transition: isDragging ? "none" : "transform 320ms cubic-bezier(.22,.61,.36,1)",
            }}
          >
            {slide && (
              <div key={`slide-${slideIdx}`} className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  {slide.kind === "campaign" && <Crown className="size-3.5" />}
                  {slide.kind === "history" && <Calendar className="size-3.5" />}
                  {slide.kind === "discovery" && <Gem className="size-3.5" />}
                  {slide.kind === "timeline" && <Hourglass className="size-3.5" />}
                  <span className="tracking-[0.25em]">{slide.eyebrow}</span>
                </div>
                <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white drop-shadow-[0_4px_18px_oklch(0_0_0/0.6)]">
                  {slide.kind === "discovery" && <span className="me-2 text-3xl">{slide.icon}</span>}
                  {slide.title}
                </h1>
                <p className="mt-3 line-clamp-3 text-sm text-white/75">{slide.subtitle}</p>
                {slide.kind === "campaign" && slide.progress && (
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full bg-gradient-gold transition-all" style={{ width: `${Math.round((slide.progress.done / slide.progress.total) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-white/70">{slide.progress.done}/{slide.progress.total} فصل</span>
                  </div>
                )}
                {slide.cta && (
                  <div className="mt-6 flex items-center gap-3">
                    {slide.cta.link}
                  </div>
                )}
              </div>
            )}
            {!slide && (
              <div className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <Lock className="size-3.5" />
                  <span className="tracking-[0.25em]">قريبًا · حملة جديدة</span>
                </div>
                <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white">حملة قادمة</h1>
                <p className="mt-3 line-clamp-3 text-sm text-white/75">
                  لقد أتممت كل الحملات الحالية. ترقّب الحملات القادمة قريبًا.
                </p>
                <div className="mt-6">
                  <Link to="/campaigns" className="glass inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs text-gold">
                    استعرض كل الحملات <ChevronLeft className="size-4" />
                  </Link>
                </div>
              </div>
            )}

            {slides.length > 1 && (
              <div className="mt-6 flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`الشريحة ${i + 1}`}
                    onClick={() => setSlideIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slideIdx ? "w-8 bg-gold" : "w-1.5 bg-white/30"}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom soft gradient bridge into next section (no hard cut). */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-background/60 to-background" />
        </div>
      </section>

      {/* ============ 2. CONTINUE / START JOURNEY — primary action ============ */}
      {campaignSel && !campaignSel.isComplete && campaignSel.nextChapter && (
        <Reveal>
          <ContinueJourneyCard sel={campaignSel} />
        </Reveal>
      )}

      {/* ============ 3. DAILY GOAL — today's objective + reward ============ */}
      {recommendation && (
        <Reveal>
          <section className="mt-12 px-5">
            <SectionHeader icon={<Target className="size-3.5" />} eyebrow="هدف اليوم" title="ابدأ من هنا" />
            <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-5 shadow-elegant">
              <div className="arabesque-layer" />
              <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative">
                <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.25em] text-gold">
                  {recommendation.icon} {recommendation.eyebrow}
                </p>
                <p className="font-display mt-1 text-lg font-bold leading-snug shimmer-text">{recommendation.title}</p>
                <p className="mt-1 text-[12px] text-white/65">{recommendation.subtitle}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
                    <Sparkles className="size-3" /> {recommendation.xp} خبرة
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
                    <Coins className="size-3" /> {recommendation.dinars} دينار
                  </span>
                </div>
                <div className="mt-5">{recommendation.link}</div>
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ============ 3b. DAILY CHALLENGES (games) ============ */}
      <Reveal>
        <DailyChallengesSection />
      </Reveal>

      {/* ============ 4. LATEST DISCOVERIES ============ */}
      <Reveal>
        <section className="mt-12 px-5">
          <SectionHeader icon={<Gem className="size-3.5" />} eyebrow="أرشيفك الشخصي" title="آخر ما اكتشفته" />
          {stats.recent.length > 0 ? (
            <div className="relative">
              <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pe-12 pb-2 no-scrollbar snap-x snap-mandatory [scroll-padding-inline-end:3rem]">
                {stats.recent.map((r) => <RecentCard key={r.key} item={r} />)}
              </div>
              {stats.recent.length > 2 && (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-l from-background to-transparent" />
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Gem className="size-5 text-gold" />}
              title="لم تبدأ رحلتك بعد…"
              body="أكمل الفصول لتفتح شخصياتٍ وآثارًا وتظهر هنا."
            />
          )}
        </section>
      </Reveal>

      {/* ============ 5. TODAY IN HISTORY ============ */}
      {mounted && todayEvent && (
        <Reveal>
          <OnThisDayCalendarCard event={todayEvent} />
        </Reveal>
      )}

      {/* ============ 6. GREAT TIMELINE ============ */}
      <Reveal>
        <JourneyThroughTimeSection />
      </Reveal>

      {/* ============ 7. WHAT'S NEW — recent activity ============ */}
      {recentActivity.length > 0 && (
        <Reveal>
          <section className="mt-12 px-5">
            <SectionHeader icon={<Sunrise className="size-3.5" />} eyebrow="آخر نشاطاتك" title="عودة إلى رحلتك" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recentActivity.map((a) => (
                <Link
                  key={a.key}
                  to={a.to as "/"}
                  className="group flex items-center gap-3 rounded-2xl border border-gold/20 bg-surface/60 p-3 transition hover:border-gold/50"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">{a.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] tracking-[0.2em] text-gold">{a.eyebrow}</p>
                    <p className="font-display text-sm font-bold leading-tight line-clamp-1">{a.title}</p>
                  </div>
                  <ChevronLeft className="size-4 shrink-0 text-gold/50 group-hover:text-gold" />
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ============ 8. WORLDS OF IRTH ============ */}
      <Reveal>
        <WorldsHomepageSection />
      </Reveal>

      {/* ============ Secondary: Notifications banner ============ */}
      {unread > 0 && (
        <section className="mt-12 px-5 animate-fade-in">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
                <Bell className="size-4" />
                <span className="absolute -top-1 -right-1 grid min-w-[16px] h-[16px] place-items-center rounded-full bg-gradient-gold px-1 text-[9px] font-bold text-primary-foreground">
                  {formatBadgeCount(unread)}
                </span>
              </div>
              <p className="font-display truncate text-sm font-bold text-gold">
                لديك {unread.toLocaleString("en-US")} {unread === 1 ? "إشعار جديد" : "إشعارات جديدة"}
              </p>
            </div>
            <Link
              to="/notifications"
              className="shrink-0 rounded-full bg-gradient-gold px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90"
            >
              عرض الإشعارات
            </Link>
          </div>
        </section>
      )}

      {/* ============ Secondary: Level & quick stats ============ */}
      <section className="mt-12 relative z-10 px-5 animate-fade-in">
        <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 px-4 py-4 shadow-elegant">
          <div className="arabesque-layer opacity-30" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shadow-elegant">
              <span className="font-display text-base font-extrabold">{lvl.level}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[0.2em] text-gold/80">المستوى {lvl.level}</p>
              <p className="font-display text-sm font-bold leading-tight truncate">{lvl.title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-gold transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.round(lvl.progress * 100)}%` }}
                />
              </div>
              {lvl.next ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {lvl.toNext.toLocaleString("en-US")} نقطة حتى{" "}
                  <span className="text-gold">{lvl.next.title}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-gold">أعلى مستوى — أنت أسطورة التاريخ.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <Reveal>
        <section className="mt-6 px-5">
          <div className="parchment-dark relative overflow-hidden rounded-2xl border border-gold/20 px-3 py-3 shadow-elegant">
            <div className="arabesque-layer opacity-40" />
            <div className="relative -mx-1 flex items-stretch gap-1 overflow-x-auto no-scrollbar">
              <Stat icon={<Heart className="size-3.5" />} label="القلوب" value={`${hearts}/${HEART_MAX}`} tone="rose" />
              <Stat icon={<Coins className="size-3.5" />} label="دنانير" value={profile.dinars} tone="gold" />
              <Stat icon={<Trophy className="size-3.5" />} label="مستوى" value={lvl.level} tone="gold" />
              <Stat icon={<Package className="size-3.5" />} label="المتحف" value={stats.totalCollection} tone="emerald" />
              <Stat icon={<BookOpen className="size-3.5" />} label="أحداث" value={stats.eventsDiscovered} tone="indigo" />
              <Stat icon={<Swords className="size-3.5" />} label="معارك" value={stats.battlesCompleted} tone="ruby" />
            </div>
          </div>
        </section>
      </Reveal>

      {/* ============ Secondary: Almost There ============ */}
      {almostThere.length > 0 && (
        <Reveal>
          <section className="mt-12 mb-8 px-5">
            <SectionHeader icon={<Flame className="size-3.5" />} eyebrow="على بُعد خطوات" title="أنت قريب جدًا…" />
            <div className="space-y-2">
              {almostThere.map((g, i) => (
                <Link
                  key={i}
                  to={g.to as "/"}
                  className="group flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-l from-gold/10 to-transparent p-3 transition hover:border-gold/60"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-gold text-primary-foreground shadow-elegant">
                    {g.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold leading-tight line-clamp-1">{g.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      المتبقي{" "}
                      <span className="font-display text-gold">{g.remaining.toLocaleString("en-US")}</span>{" "}
                      {g.unit}
                    </p>
                  </div>
                  <ChevronLeft className="size-4 shrink-0 text-gold/50 group-hover:text-gold" />
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
      )}

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

/** Lightweight intersection-observer fade-in wrapper. Hidden by default; once
 *  in view it stays visible. One observer per Reveal — cheap on mobile. */
function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setShown(true); io.disconnect(); break; }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={shown ? "animate-fade-in" : ""}
      style={shown ? undefined : { opacity: 0, transform: "translateY(10px)" }}
    >
      {children}
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

function RecentCard({ item }: { item: UnifiedUnlock }) {
  return (
    <Link
      to={item.to as "/"}
      className="group relative w-48 shrink-0 snap-start overflow-hidden rounded-2xl border border-gold/20 bg-surface/70 p-3 transition hover:border-gold/50"
    >
      <div className="absolute -left-6 -top-6 size-24 rounded-full bg-gold/10 blur-2xl" />
      <div className="relative">
        <div className="text-2xl">{item.icon}</div>
        <p className="mt-2 text-[10px] tracking-[0.2em] text-gold">{item.kind}</p>
        <p className="font-display mt-0.5 text-sm font-bold leading-tight line-clamp-1">{item.title}</p>
        {item.subtitle && <p className="mt-1 line-clamp-2 text-[11px] text-white/60 leading-snug">{item.subtitle}</p>}
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

// ----- Continue Journey premium CTA -----
function ContinueJourneyCard({ sel }: {
  sel: {
    campaign: ImportedCampaign;
    completedChapters: number;
    nextChapter: CampaignChapter | null;
    hasStarted: boolean;
    isComplete: boolean;
  };
}) {
  const { campaign, completedChapters, nextChapter, hasStarted } = sel;
  const total = campaign.chapters.length;
  const pct = total > 0 ? Math.round((completedChapters / total) * 100) : 0;
  const cover = (campaign.coverImage && /^(https?:|data:|\/)/i.test(campaign.coverImage) && campaign.coverImage) || heroFortress;
  return (
    <section className="mt-12 px-5">
      <SectionHeader icon={<Crown className="size-3.5" />} eyebrow="حملتك النشطة" title="واصل رحلتك" />
      <Link
        to="/campaigns/imported/$id"
        params={{ id: campaign.id }}
        className="group relative block overflow-hidden rounded-3xl border border-gold/35 shadow-elegant"
      >
        <div className="relative h-48 w-full overflow-hidden">
          <img src={cover} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
          <div className="arabesque-layer opacity-40" />
          <div className="absolute -left-12 -top-12 size-40 rounded-full bg-gold/20 blur-3xl" />
        </div>
        <div className="parchment-dark relative -mt-14 px-5 pt-4 pb-5">
          <p className="text-[10px] tracking-[0.25em] text-gold">
            {hasStarted ? "تابع من حيث توقفت" : "ابدأ حملتك الأولى"}
          </p>
          <h3 className="font-display mt-1 text-xl font-bold leading-snug shimmer-text">{campaign.title}</h3>
          {nextChapter && (
            <p className="mt-1 text-[12px] text-white/70 line-clamp-2">
              الفصل {nextChapter.order ?? completedChapters + 1} · {nextChapter.title}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-display text-[11px] text-gold">{completedChapters}/{total}</span>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-2.5 text-[12px] font-bold text-primary-foreground shadow-elegant">
            <Play className="size-3.5 fill-current" />
            {hasStarted ? "تابع الرحلة" : "ابدأ الحملة"}
          </div>
        </div>
      </Link>
    </section>
  );
}

// ----- Journey Through Time preview (links to /timeline) -----
function JourneyThroughTimeSection() {
  return (
    <section className="mt-12 px-5">
      <SectionHeader icon={<Hourglass className="size-3.5" />} eyebrow="رحلة عبر الزمن" title="عصور تنتظر اكتشافها" />
      <Link
        to="/timeline"
        className="group relative block overflow-hidden rounded-3xl border border-gold/30 parchment-dark shadow-elegant"
      >
        <div className="relative h-28 w-full overflow-hidden">
          <img src={heroCitySunrise} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-background/40 to-background" />
          <div className="arabesque-layer opacity-50" />
        </div>
        <div className="relative -mt-10 px-5 pb-5">
          <p className="text-[10px] tracking-[0.25em] text-gold">من البعثة إلى اليوم</p>
          <h3 className="font-display mt-1 text-base font-bold">1400 سنة في خط واحد</h3>
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar snap-x snap-mandatory">
            {ERAS.map((e) => (
              <div
                key={e.id}
                className="min-w-[140px] snap-start rounded-xl border border-gold/20 bg-surface/60 px-3 py-2"
              >
                <p className="text-[9px] tracking-[0.2em] text-gold">{e.years}</p>
                <p className="font-display mt-0.5 text-[12px] font-bold leading-tight line-clamp-1">{e.name}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 text-[12px] font-bold text-gold">
            ابدأ الرحلة الزمنية <ChevronLeft className="size-3.5 transition group-hover:-translate-x-0.5" />
          </div>
        </div>
      </Link>
    </section>
  );
}

// ----- Historical Worlds homepage section -----
function WorldsHomepageSection() {
  const { data } = useQuery({
    queryKey: ["worlds-index"],
    staleTime: 60_000,
    queryFn: fetchWorldsIndex,
  });
  const worlds = (data ?? []).slice(0, 4);
  if (worlds.length === 0) return null;
  return (
    <section className="mt-12 px-5">
      <SectionHeader icon={<Compass className="size-3.5" />} eyebrow="استكشاف الحضارات" title="عوالم إرث" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {worlds.map((w) => (
          <Link
            key={w.hub.slug}
            to="/worlds/$slug"
            params={{ slug: w.hub.slug }}
            className="group relative block overflow-hidden rounded-3xl border border-gold/25 parchment-dark shadow-elegant transition hover:border-gold/55"
          >
            <div className="absolute -left-6 -top-6 size-32 rounded-full bg-gold/15 blur-3xl" />
            <div className="arabesque-layer opacity-30" />
            <div className="relative p-5">
              <div className="text-4xl">{w.hub.glyph}</div>
              <p className="mt-3 text-[10px] tracking-[0.2em] text-gold">عالم #{w.hub.order}</p>
              <p className="font-display mt-0.5 text-base font-bold leading-tight line-clamp-1">{w.entity.title}</p>
              <p className="mt-1 text-[10px] text-white/55">{w.relatedCount} كيان · {w.campaignsCount} حملة</p>
            </div>
          </Link>
        ))}
      </div>
      <Link
        to="/worlds"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/40 bg-black/30 px-5 py-3 text-[12px] font-bold text-gold hover:bg-gold/10"
      >
        استكشف جميع العوالم <ChevronLeft className="size-3.5" />
      </Link>
    </section>
  );
}

// ----- Today in History card -----
function OnThisDayCalendarCard({ event }: { event: TodayInHistoryEvent }) {
  const href = event.deep_link ?? null;
  const yearBits: string[] = [];
  if (event.hijri_year) yearBits.push(`${event.hijri_year} هـ`);
  if (event.gregorian_year) yearBits.push(`${event.gregorian_year} م`);
  const inner = (
    <>
      <div className="relative h-32 w-full overflow-hidden">
        <img src={heroManuscriptLamp} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-surface" />
      </div>
      <div className="arabesque-layer opacity-50" />
      <div className="absolute -left-10 -top-10 size-32 rounded-full bg-gold/15 blur-3xl" />
      <div className="relative flex gap-4 p-5 pt-0 -mt-10">
        <div className="shrink-0 rounded-2xl border border-gold/40 bg-black/60 px-3 py-2 text-center backdrop-blur-sm">
          <div className="text-[9px] tracking-[0.2em] text-gold/80">يوم</div>
          <div className="font-display text-2xl font-bold text-gold leading-none mt-1">{new Date().getDate()}</div>
          <div className="text-[9px] text-white/55 mt-1">{new Date().toLocaleDateString("ar", { month: "short" })}</div>
        </div>
        <div className="min-w-0 flex-1 pt-1">
          {yearBits.length > 0 && (
            <p className="text-[10px] tracking-[0.25em] text-gold">{yearBits.join(" · ")}</p>
          )}
          <h3 className="font-display mt-1 text-base font-bold leading-snug">{event.title}</h3>
          <p className="mt-2 line-clamp-3 text-[12px] text-white/65 leading-relaxed">{event.body}</p>
          {href && (
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="flex items-center gap-1 text-gold">اقرأ المزيد <ChevronLeft className="size-3" /></span>
            </div>
          )}
        </div>
      </div>
    </>
  );
  return (
    <section className="mt-12 px-5">
      <SectionHeader icon={<Calendar className="size-3.5" />} eyebrow="في مثل هذا اليوم" title="حدث من تاريخنا" />
      {href ? (
        <Link
          to={href as "/"}
          className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/30 parchment-dark transition hover:border-gold/60"
        >
          {inner}
        </Link>
      ) : (
        <div className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/30 parchment-dark">
          {inner}
        </div>
      )}
    </section>
  );
}

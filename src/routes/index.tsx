import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Map as MapIcon, ChevronLeft, Crown, Lock, Compass, Play,
  Hourglass, Calendar, Heart, Coins, Trophy, Package, BookOpen,
  Swords, Sparkles, Bell, Gem, Target, Flame,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  ERAS, ARTIFACTS, CHARACTERS,
  levelFor, currentSeason, UPCOMING_CAMPAIGNS,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { getEffectiveHearts, HEART_MAX } from "@/lib/hearts";
import { runDailyNotifications, DEFAULT_NOTIFICATION_PREFS, unreadCount, formatBadgeCount } from "@/lib/notifications";
import { useAccount } from "@/lib/account";
import { useTodayInHistoryEvent, type TodayInHistoryEvent } from "@/lib/today-in-history";
import { useRealCollectionStats, type UnifiedUnlock } from "@/lib/real-collection-stats";
import { OnboardingTour } from "@/components/OnboardingTour";
import { listPublishedCampaigns } from "@/lib/campaignStorage";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import { listRegistry } from "@/lib/contentRegistryStorage";
import { registryItemIcon, registryItemImageUrl } from "@/lib/importedUnlocks";
import type { Campaign as ImportedCampaign, CampaignActivity, CampaignChapter } from "@/types/campaign";
import type { ContentRegistryItem } from "@/types/contentRegistry";
import heroCitySunrise from "@/assets/hero-city-sunrise.jpg";
import heroDesertCaravan from "@/assets/hero-desert-caravan.jpg";
import heroManuscriptLamp from "@/assets/hero-manuscript-lamp.jpg";
import heroFortress from "@/assets/hero-fortress.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "description", content: "ادخل عالمًا تفاعليًا واسعًا من الشخصيات والدول والمعارك والمدن والأحداث في التاريخ الإسلامي." },
    ],
  }),
  component: Index,
});

// ============================================================
// Hero carousel slide types
// ============================================================
type HeroSlide =
  | { kind: "campaign"; bg: string; eyebrow: string; title: string; subtitle: string; quote?: string; progress?: { done: number; total: number }; cta: { label: string; link: React.ReactNode } }
  | { kind: "history"; bg: string; eyebrow: string; title: string; subtitle: string; cta: { label: string; link: React.ReactNode } }
  | { kind: "discovery"; bg: string; eyebrow: string; title: string; subtitle: string; icon: string; cta: { label: string; link: React.ReactNode } }
  | { kind: "timeline"; bg: string; eyebrow: string; title: string; subtitle: string; cta: { label: string; link: React.ReactNode } };

function Index() {
  const { profile, touchStreak } = useProfile();
  const { account, user } = useAccount();
  const displayName = account?.username ?? (user ? profile.name : profile.name);
  const [mounted, setMounted] = useState(false);
  const { selected: todayEvent } = useTodayInHistoryEvent();
  const stats = useRealCollectionStats();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const recount = () => setUnread(unreadCount());
    recount();
    window.addEventListener("irth:notifications:updated", recount);
    window.addEventListener("focus", recount);
    return () => {
      window.removeEventListener("irth:notifications:updated", recount);
      window.removeEventListener("focus", recount);
    };
  }, []);

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

  // ===== Imported campaigns (admin/import = single source of truth) =====
  const [importedCampaigns, setImportedCampaigns] = useState<ImportedCampaign[]>(() => {
    try { return listPublishedCampaigns(); } catch { return []; }
  });
  const [registryItems, setRegistryItems] = useState<ContentRegistryItem[]>(() => {
    try { return listRegistry(); } catch { return []; }
  });
  useEffect(() => {
    import("@/lib/cloudSync")
      .then((m) => m.pullAllFromCloud())
      .then(() => {
        try { setImportedCampaigns(listPublishedCampaigns()); } catch {}
        try { setRegistryItems(listRegistry()); } catch {}
      })
      .catch(() => {});
  }, []);
  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setProgressTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
    // Priority: active & resumable → next unfinished published → first
    return (
      enriched.find((e) => e.hasStarted && !e.isComplete) ??
      enriched.find((e) => !e.isComplete) ??
      enriched[0]
    );
  }, [importedCampaigns, progressTick]);

  // ===== Build hero slides =====
  const slides = useMemo<HeroSlide[]>(() => {
    const out: HeroSlide[] = [];
    if (campaignSel) {
      const { campaign, hasStarted, isComplete, completedChapters, nextChapter } = campaignSel;
      const total = campaign.chapters.length;
      const ctaLabel = isComplete
        ? "استعرض الحملة"
        : hasStarted
          ? "تابع الرحلة"
          : "ابدأ الحملة";
      const heroBg =
        (campaign.coverImage && /^(https?:|data:|\/)/i.test(campaign.coverImage) && campaign.coverImage) ||
        heroFortress;
      const subtitle =
        nextChapter && !isComplete
          ? `الفصل ${nextChapter.order ?? completedChapters + 1} · ${nextChapter.title}`
          : (campaign.subtitle ?? campaign.description ?? "تابع رحلتك في هذه الحملة.");
      out.push({
        kind: "campaign",
        bg: heroBg,
        eyebrow: hasStarted ? "حملتك النشطة" : "حملة جديدة بانتظارك",
        title: campaign.title,
        subtitle,
        progress: { done: completedChapters, total },
        cta: {
          label: ctaLabel,
          link: (
            <Link
              to="/campaigns/imported/$id"
              params={{ id: campaign.id }}
              className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground"
            >
              <Play className="size-4 fill-current" />{ctaLabel}
            </Link>
          ),
        },
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
        cta: {
          label: "اقرأ القصة",
          link: <Link to={(todayEvent.deep_link ?? "/on-this-day") as "/"} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground">
            <BookOpen className="size-4" />اقرأ القصة
          </Link>,
        },
      });
    }
    if (stats.recent.length > 0) {
      const r = stats.recent[0];
      out.push({
        kind: "discovery",
        bg: heroFortress,
        eyebrow: `آخر اكتشافاتك · ${r.kind}`,
        title: r.title,
        subtitle: r.subtitle ?? "افتح أرشيفك التاريخي واكتشف ما جمعته.",
        icon: r.icon,
        cta: {
          label: "اعرض في المتحف",
          link: <Link to="/collection" className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground">
            <Gem className="size-4" />اعرض في المتحف
          </Link>,
        },
      });
    }
    out.push({
      kind: "timeline",
      bg: heroDesertCaravan,
      eyebrow: "الخط الزمني العظيم",
      title: "أكثر من 1400 سنة من التاريخ",
      subtitle: "تجوّل في العصور من البعثة حتى اليوم.",
      cta: {
        label: "ابدأ الرحلة الزمنية",
        link: <Link to="/timeline" className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3 text-sm font-bold text-primary-foreground">
          <Hourglass className="size-4" />ابدأ الرحلة الزمنية
        </Link>,
      },
    });
    return out;
  }, [campaignSel, todayEvent, stats.recent]);

  // Carousel
  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(id);
  }, [slides.length]);
  useEffect(() => { if (slideIdx >= slides.length) setSlideIdx(0); }, [slides.length, slideIdx]);
  const slide = slides[Math.min(slideIdx, slides.length - 1)] ?? slides[0];

  // ===== Stats strip =====
  const hearts = getEffectiveHearts(profile);

  // ===== Today's Objective (imported campaign-driven) =====
  const objective = useMemo(() => {
    if (campaignSel && !campaignSel.isComplete && campaignSel.nextChapter) {
      const { campaign, nextChapter, nextActivity } = campaignSel;
      const xp = nextActivity?.xpReward ?? 10;
      const dinars = nextActivity?.coinsReward ?? 5;
      return {
        title: nextActivity?.prompt?.trim() || nextChapter.title,
        subtitle: nextActivity
          ? `الفصل ${nextChapter.order ?? "?"} · ${nextChapter.title} — ${campaign.title}`
          : `أكمل الفصل ${nextChapter.order ?? "?"} من ${campaign.title}`,
        xp,
        dinars,
        rewardLabel: "تقدّم في الحملة",
        link: (
          <Link
            to="/campaigns/imported/$id"
            params={{ id: campaign.id }}
            className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            <Play className="size-4 fill-current" />
            {campaignSel.hasStarted ? "تابع الرحلة" : "ابدأ الحملة"}
          </Link>
        ),
      };
    }
    if (campaignSel && campaignSel.isComplete) {
      // Suggest a fresh published campaign if any
      const fresh = importedCampaigns
        .map((c) => ({ c, p: getCampaignProgress(c.id) }))
        .find((x) => !x.p.completed);
      if (fresh) {
        return {
          title: fresh.c.title,
          subtitle: "ابدأ حملتك التالية",
          xp: 10, dinars: 5, rewardLabel: "حملة جديدة",
          link: (
            <Link to="/campaigns/imported/$id" params={{ id: fresh.c.id }} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
              <Play className="size-4 fill-current" />ابدأ الحملة
            </Link>
          ),
        };
      }
    }
    if (todayEvent) {
      return {
        title: todayEvent.title,
        subtitle: "اقرأ حدث اليوم وانطلق في رحلتك.",
        xp: 15, dinars: 5, rewardLabel: "معرفة جديدة",
        link: <Link to={(todayEvent.deep_link ?? "/on-this-day") as "/"} className="shadow-gold inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-3 text-sm font-bold text-primary-foreground">
          <BookOpen className="size-4" />ابدأ الآن
        </Link>,
      };
    }
    return null;
  }, [campaignSel, importedCampaigns, todayEvent]);

  // ===== Latest updates (newest content from admin/import) =====
  type LatestUpdate = {
    key: string;
    kind: "حملة" | "شخصية" | "أثر" | "مدينة" | "معركة" | "علم" | "دولة" | "شارة" | "إنجاز" | "محتوى";
    title: string;
    subtitle?: string;
    icon: string;
    image: string | null;
    to: string;
    ts: number;
  };
  const REG_KIND: Record<string, LatestUpdate["kind"]> = {
    figure: "شخصية", scholar: "علم", artifact: "أثر", city: "مدينة",
    battle: "معركة", dynasty: "دولة", badge: "شارة", achievement: "إنجاز",
  };
  const latestUpdates = useMemo<LatestUpdate[]>(() => {
    const items: LatestUpdate[] = [];
    for (const c of importedCampaigns) {
      const ts = Date.parse(c.updatedAt ?? c.createdAt ?? "") || 0;
      items.push({
        key: `c:${c.id}`,
        kind: "حملة",
        title: c.title?.trim() || "حملة جديدة",
        subtitle: c.subtitle ?? c.description ?? c.historicalPeriod ?? undefined,
        icon: "👑",
        image: c.coverImage && /^(https?:|data:|\/)/i.test(c.coverImage) ? c.coverImage : null,
        to: `/campaigns/imported/${c.id}`,
        ts,
      });
    }
    for (const i of registryItems) {
      const ts = Date.parse(i.updatedAt ?? i.createdAt ?? "") || 0;
      const kind = REG_KIND[String(i.type).toLowerCase()] ?? "محتوى";
      const title = i.name?.trim();
      if (!title || !/[\u0600-\u06FF]/.test(title)) {
        // Skip items without a valid Arabic display name.
        // eslint-disable-next-line no-console
        console.warn(`[home] skipping registry item without Arabic title: ${i.id}`);
        continue;
      }
      items.push({
        key: `r:${i.id}`,
        kind,
        title,
        subtitle: kind,
        icon: registryItemIcon(i),
        image: registryItemImageUrl(i),
        to: "/collection",
        ts,
      });
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, 3);
  }, [importedCampaigns, registryItems]);

  return (
    <AppShell>
      {/* ============ 1. DYNAMIC HERO CAROUSEL ============ */}
      <section className="relative -mt-2 overflow-hidden">
        <div className="relative h-[78vh] min-h-[560px] w-full overflow-hidden">
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
          {Array.from({ length: 12 }).map((_, i) => (
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
          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-12">
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
                {slide.kind === "campaign" && slide.quote && (
                  <p className="mt-2 line-clamp-2 text-[13px] italic text-white/55">{slide.quote}</p>
                )}
                {slide.kind === "campaign" && slide.progress && (
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full bg-gradient-gold transition-all" style={{ width: `${Math.round((slide.progress.done / slide.progress.total) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-white/70">{slide.progress.done}/{slide.progress.total} فصل</span>
                  </div>
                )}
                <div className="mt-6 flex items-center gap-3">
                  {slide.cta.link}
                  {slide.kind === "campaign" && campaignSel && (
                    <Link
                      to="/campaigns/imported/$id" params={{ id: campaignSel.campaign.id }}
                      className="glass inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-xs text-white/80"
                    >
                      استكشف الحملة
                    </Link>
                  )}
                </div>
              </div>
            )}
            {!slide && (
              <div className="animate-curtain max-w-xl">
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <Lock className="size-3.5" />
                  <span className="tracking-[0.25em]">قريبًا · حملة جديدة</span>
                </div>
                <h1 className="font-display mt-3 text-4xl font-bold leading-[1.15] text-white">
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

            {/* Dots */}
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
        </div>
      </section>

      {/* ============ Unread notifications banner ============ */}
      {unread > 0 && (
        <section className="mt-4 px-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
                <Bell className="size-4" />
                <span className="absolute -mt-6 -ms-6 grid min-w-[16px] h-[16px] place-items-center rounded-full bg-gradient-gold px-1 text-[9px] font-bold text-primary-foreground">
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

      {/* ============ 2. TODAY'S OBJECTIVE ============ */}
      {objective && (
        <section className="mt-6 px-5">
          <SectionHeader icon={<Target className="size-3.5" />} eyebrow="هدفك اليوم" title="ابدأ من هنا" />
          <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-5 shadow-elegant">
            <div className="arabesque-layer" />
            <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
            <div className="relative">
              <p className="text-[10px] tracking-[0.25em] text-gold">{objective.subtitle}</p>
              <p className="font-display mt-1 text-lg font-bold leading-snug shimmer-text">{objective.title}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
                  <Sparkles className="size-3" /> {objective.xp} خبرة
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-black/30 px-2.5 py-1 text-[11px] text-gold">
                  <Coins className="size-3" /> {objective.dinars} دينار
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-white/75">
                  <Gem className="size-3" /> {objective.rewardLabel}
                </span>
              </div>
              <div className="mt-5">{objective.link}</div>
            </div>
          </div>
        </section>
      )}

      {/* ============ 3. REAL PROGRESS STRIP ============ */}
      <section className="mt-8 px-5">
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

      {/* ============ 4. RECENTLY DISCOVERED ============ */}
      <section className="mt-10 px-5">
        <SectionHeader icon={<Gem className="size-3.5" />} eyebrow="أرشيفك الشخصي" title="آخر ما اكتشفته" />
        {stats.recent.length > 0 ? (
          <div className="relative">
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 no-scrollbar snap-x snap-mandatory">
              {stats.recent.map((r) => <RecentCard key={r.key} item={r} />)}
            </div>
            {/* Scroll affordance: gradient edge + arrow hint (RTL: more items on the left) */}
            {stats.recent.length > 2 && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-l from-background via-background/70 to-transparent" />
                <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-full bg-black/50 ring-1 ring-gold/40 backdrop-blur-sm animate-pulse">
                  <ChevronLeft className="size-4 text-gold" />
                </div>
              </>
            )}
            <p className="mt-1 text-[10px] text-white/40 text-center">اسحب أفقيًا لرؤية المزيد</p>
          </div>
        ) : (
          <EmptyState
            icon={<Gem className="size-5 text-gold" />}
            title="لم تبدأ رحلتك بعد…"
            body="أكمل الفصول لتفتح شخصياتٍ وآثارًا وتظهر هنا."
          />
        )}
      </section>

      {/* ============ 5. TODAY IN HISTORY ============ */}
      {mounted && todayEvent && <OnThisDayCalendarCard event={todayEvent} />}

      {/* ============ 6. THE GREAT TIMELINE ============ */}
      <section className="mt-10 px-5">
        <Link
          to="/timeline"
          className="group relative block h-56 overflow-hidden rounded-3xl border border-gold/30 shadow-elegant"
        >
          <img src={heroDesertCaravan} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-1000 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/20" />
          <div className="arabesque-layer opacity-60" />
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-gold">
              <Hourglass className="size-3.5" /> الخط الزمني العظيم
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_8px_oklch(0_0_0/0.7)]">
              رحلة عبر أكثر من 1400 سنة من التاريخ الإسلامي
            </h2>
            <p className="mt-1 text-[12px] text-white/70">من البعثة النبوية إلى عصرنا — استكشف العصور حدثًا حدثًا.</p>
            <div className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground shadow-gold">
              <Play className="size-3.5 fill-current" /> ابدأ الرحلة الزمنية
            </div>
          </div>
        </Link>
      </section>

      {/* ============ 7. NEW IN IRTH ============ */}
      <section className="mt-10 px-5">
        <SectionHeader icon={<Bell className="size-3.5" />} eyebrow="آخر التحديثات" title="جديد في إرث" />
        {latestUpdates.length > 0 ? (
          <div className="space-y-2">
            {latestUpdates.map((u) => <UpdateRow key={u.key} item={u} />)}
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="size-5 text-gold" />}
            title="لا توجد تحديثات جديدة بعد"
            body="ستظهر هنا الحملات والشخصيات والتحقيقات الجديدة فور إضافتها."
          />
        )}
      </section>

      {/* ============ 8. EXPLORE IRTH ============ */}
      <section className="mt-10 mb-8 px-5">
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

function RecentCard({ item }: { item: UnifiedUnlock }) {
  return (
    <Link
      to={item.to as "/"}
      className="group relative w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-gold/20 bg-surface/70 p-3 transition hover:border-gold/50"
    >
      <div className="absolute -left-6 -top-6 size-20 rounded-full bg-gold/10 blur-2xl" />
      <div className="relative">
        <div className="text-2xl">{item.icon}</div>
        <p className="mt-2 text-[10px] tracking-[0.2em] text-gold">{item.kind}</p>
        <p className="font-display mt-0.5 text-sm font-bold leading-tight line-clamp-1">{item.title}</p>
        {item.subtitle && <p className="mt-1 line-clamp-2 text-[11px] text-white/60 leading-snug">{item.subtitle}</p>}
      </div>
    </Link>
  );
}

function UpdateRow({ item }: { item: { kind: string; title: string; subtitle?: string; icon: string; image: string | null; to: string } }) {
  return (
    <Link
      to={item.to as "/"}
      className="group flex items-center gap-3 rounded-2xl border border-gold/20 bg-surface/60 p-3 transition hover:border-gold/50"
    >
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gold/10 text-xl text-gold">
        {item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : <span>{item.icon}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracking-[0.2em] text-gold">{item.kind}</p>
        <p className="font-display text-sm font-bold leading-tight line-clamp-1">{item.title}</p>
        {item.subtitle && <p className="mt-0.5 text-[11px] text-white/55 line-clamp-1">{item.subtitle}</p>}
      </div>
      <ChevronLeft className="size-4 shrink-0 text-gold/50 group-hover:text-gold" />
    </Link>
  );
}

function WorldCard({ to, icon, title, subtitle, wide }: { to: string; icon: React.ReactNode; title: string; subtitle: string; wide?: boolean }) {
  return (
    <Link
      to={to as "/"}
      className={`group relative block overflow-hidden rounded-2xl border border-gold/20 parchment-dark p-4 transition hover:border-gold/50 ${wide ? "min-h-[90px]" : "min-h-[120px]"}`}
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

// ----- Today in History card -----
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
        className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/30 parchment-dark transition hover:border-gold/60"
      >
        <div className="relative h-32 w-full overflow-hidden">
          <img src={heroManuscriptLamp} alt="" className="size-full object-cover opacity-50" />
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
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="flex items-center gap-1 text-gold">اقرأ المزيد <ChevronLeft className="size-3" /></span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

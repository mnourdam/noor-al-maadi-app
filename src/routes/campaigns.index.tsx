import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, Sparkles, BookOpen, Trophy, Award, Zap, Coins, Swords, CheckCircle2, ScrollText, Globe2, Search, X, SearchX } from "lucide-react";
import { normalizeArabicSearch } from "@/lib/encyclopedia-search";

import { AppShell, Screen } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CinematicPageBackdrop } from "@/components/CinematicPageBackdrop";
import { WorldFilterChip } from "@/components/WorldFilterChip";
import campaignsHeaderArt from "@/assets/hero/21-islamic-army-banners.jpg?url";
import { useProfile } from "@/lib/profile";
import { displayBadgeName, displayArtifactName } from "@/lib/display-names";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { fetchWorldsIndex, findHub } from "@/lib/worlds";
import { useWorldMembership, isValidWorldSlug } from "@/lib/worlds-progress";
import { useResolvedUnlocks } from "@/lib/campaignUnlocks";
import { useStashCurrentAsOrigin } from "@/lib/navigation";

import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type { Campaign as ImportedCampaign } from "@/types/campaign";
import type { CampaignDivider } from "@/lib/campaignDividers";
import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { Reveal, Stagger } from "@/components/motion/MotionPrimitives";
import { safeKey } from "@/lib/text/safe-text";

const campaignsSearchSchema = z.object({
  world: fallback(z.string().optional(), undefined).optional(),
});

export const Route = createFileRoute("/campaigns/")({
  head: () => ({ meta: [{ title: "الحملات التاريخية" }] }),
  validateSearch: zodValidator(campaignsSearchSchema),
  component: CampaignsHub,
});

function CampaignsHub() {
  androidMark("render:Campaigns");
  if (isAndroidUltraStableMode()) return <AndroidStableCampaigns />;
  return <CampaignsHubFull />;
}

function CampaignsHubFull() {
  useProfile();
  const navigate = useNavigate({ from: "/campaigns" });
  const rawWorld = safeKey(Route.useSearch().world);
  const worldSlug = rawWorld && isValidWorldSlug(rawWorld) && findHub(rawWorld) ? rawWorld : null;

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", "feed"],
    queryFn: fetchPublishedFeed,
  });
  const { data: worldsIndex } = useQuery({
    queryKey: ["worlds-index"],
    queryFn: () => fetchWorldsIndex(),
    enabled: !!worldSlug,
    staleTime: 60_000,
  });
  const worldTitle = useMemo(() => {
    if (!worldSlug) return "";
    return worldsIndex?.find((w) => w.hub.slug === worldSlug)?.entity.title ?? worldSlug;
  }, [worldsIndex, worldSlug]);

  const { campaignIds, ready: membershipReady } = useWorldMembership(worldSlug);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 120);

  // Prebuilt, normalized haystack per campaign — built once per feed, never
  // per keystroke. No network is touched by search.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.campaigns ?? []) map.set(c.id, buildCampaignHaystack(c));
    return map;
  }, [data]);

  const worldFiltered = useMemo(() => {
    const base = data?.sections ?? [];
    if (!worldSlug) return base;
    if (!membershipReady) return base;
    return base
      .map((s) => ({ ...s, campaigns: s.campaigns.filter((c) => campaignIds.has(c.id)) }))
      .filter((s) => s.campaigns.length > 0);
  }, [data, worldSlug, membershipReady, campaignIds]);

  const nq = useMemo(() => normalizeArabicSearch(debouncedQuery.trim()), [debouncedQuery]);

  const sections = useMemo(() => {
    if (!nq) return worldFiltered;
    return worldFiltered
      .map((s) => ({
        ...s,
        campaigns: s.campaigns.filter((c) => (haystacks.get(c.id) ?? "").includes(nq)),
      }))
      .filter((s) => s.campaigns.length > 0);
  }, [worldFiltered, nq, haystacks]);

  const totalCampaigns = useMemo(
    () => sections.reduce((n, s) => n + s.campaigns.length, 0),
    [sections],
  );
  const isSearching = nq.length > 0;


  return (
    <AppShell>
      <CinematicPageBackdrop image={campaignsHeaderArt} alt="حصن تاريخي" />
      <div className="px-5 pt-6">
        <Breadcrumbs
          items={[
            { label: "الرئيسية", to: "/" },
            { label: "الحملات" },
          ]}
        />
      </div>
      <Screen title="الحملات" subtitle="رحلةٌ زمنيّة عبر العصور">
        <div className="mb-4">
          <CampaignSearchBar value={query} onChange={setQuery} />
        </div>

        {worldSlug && (
          <div className="mb-4">
            <WorldFilterChip
              worldTitle={worldTitle}
              onClear={() => navigate({ search: { world: undefined } })}
            />
          </div>
        )}


        {isLoading && (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        )}

        {!isLoading && totalCampaigns > 0 && (
          <div className="space-y-8">
            {sections.map((section, i) => (
              <section key={section.divider?.id ?? `uncat-${i}`} className="space-y-3">
                <Reveal>
                  {section.divider ? (
                    <EraDivider d={section.divider} count={section.campaigns.length} />
                  ) : (
                    <UncategorizedHeader count={section.campaigns.length} />
                  )}
                </Reveal>
                <Stagger className="space-y-3" max={12}>
                  {section.campaigns.map((c) => (
                    <ImportedCampaignCard key={c.id} c={c} />
                  ))}
                </Stagger>
                {section.campaigns.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gold/15 bg-surface/30 p-4 text-center text-xs text-muted-foreground">
                    لا توجد حملات في هذا العصر بعد.
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {!isLoading && totalCampaigns === 0 && (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
            {isSearching ? (
              <>
                <SearchX className="mx-auto mb-3 size-8 text-gold/70" />
                <p className="font-display text-base font-bold text-gold">لم نعثر على حملة مطابقة.</p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="motion-tap mt-4 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-bold text-gold"
                >
                  مسح البحث
                </button>
              </>
            ) : worldSlug ? (
              <>
                <Globe2 className="mx-auto mb-3 size-8 text-gold/70" />
                <p className="font-display text-base font-bold text-gold">لا توجد حملات متاحة في هذا العالم حاليًا</p>
              </>
            ) : (
              <>
                <Swords className="mx-auto mb-3 size-8 text-gold/70" />
                <p className="font-display text-base font-bold text-gold">لا توجد حملات منشورة حاليًا.</p>
              </>
            )}
          </div>
        )}

      </Screen>
    </AppShell>
  );
}

/** Tiny debounce — keeps typing responsive while avoiding re-filtering per keystroke. */
function useDebounced<T>(value: T, delay = 120): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/**
 * One normalized haystack per campaign: title, subtitle, description, tags,
 * era/period/category/region, plus the figures, cities and battles referenced
 * by its activities. Arabic-normalized once (diacritics + hamza tolerant).
 */
function buildCampaignHaystack(c: ImportedCampaign): string {
  const parts: (string | undefined)[] = [
    c.title,
    c.subtitle,
    c.description,
    c.historicalPeriod,
    c.era,
    c.category,
    c.mapRegion,
    c.worldSlug,
    c.slug,
    ...(c.tags ?? []),
  ];
  for (const ch of c.chapters ?? []) {
    parts.push(ch.title, ch.subtitle);
    for (const a of ch.activities ?? []) {
      parts.push(a.relatedFigure, a.relatedCity, a.relatedBattle, a.relatedArtifact);
    }
  }
  return normalizeArabicSearch(parts.filter(Boolean).join(" "));
}

function CampaignSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-gold/70">
        <Search className="size-4" />
      </div>
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ابحث عن حملة..."
        aria-label="ابحث عن حملة"
        className="h-12 w-full rounded-2xl border border-gold/35 bg-gradient-to-l from-amber-950/25 via-surface/70 to-stone-950/40 pr-11 pl-10 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-[0_10px_30px_-22px_rgba(0,0,0,0.9)] outline-none transition focus:border-gold/70 focus:ring-1 focus:ring-gold/40 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="مسح البحث"
          className="motion-tap absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground hover:text-gold"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}


function EraDivider({ d, count }: { d: CampaignDivider; count: number }) {
  return (
    <header
      className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-l from-amber-950/40 via-stone-950/60 to-amber-950/40 px-5 py-5"
      aria-label={`عصر ${d.title}`}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-6 top-2 h-px bg-gradient-to-l from-transparent via-gold/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-6 bottom-2 h-px bg-gradient-to-l from-transparent via-gold/30 to-transparent" />
      <div className="relative flex items-center gap-3">
        <ScrollText className="size-5 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] tracking-[0.35em] text-gold/70">عصر تاريخي</div>
          <h2 className="font-display text-2xl font-bold text-amber-100 shimmer-text">{d.title}</h2>
          {d.subtitle && <p className="mt-0.5 text-xs text-gold/70">{d.subtitle}</p>}
        </div>
        <span className="rounded-full border border-gold/40 bg-black/30 px-2.5 py-1 text-[10px] font-bold text-gold">
          {count.toLocaleString("en-US")} حملة
        </span>
      </div>
    </header>
  );
}

function UncategorizedHeader({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <header className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-gold/15" />
      <span>حملات بانتظار التصنيف ({count.toLocaleString("en-US")})</span>
      <div className="h-px flex-1 bg-gold/15" />
    </header>
  );
}

function AndroidStableCampaigns() {
  return (
    <AppShell>
      <Screen title="الحملات" subtitle="وضع أندرويد المستقر">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5">
          <Swords className="mb-3 size-8 text-gold" />
          <h2 className="font-display text-xl font-bold text-foreground">الحملات في الوضع المستقر</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            تم إيقاف تحميل قائمة الحملات الثقيلة تلقائيًا داخل APK أثناء التشخيص. يمكنك فتح التحديات اليومية أو الموسوعة أثناء اختبار الثبات.
          </p>
          <div className="mt-4 grid gap-2">
            <Link to="/adventure" className="flex items-center justify-between rounded-2xl border border-white/10 bg-background p-4 text-sm font-bold text-foreground">
              التحديات <ArrowLeft className="size-4 text-gold" />
            </Link>
            <Link to="/" className="flex items-center justify-between rounded-2xl border border-white/10 bg-background p-4 text-sm font-bold text-foreground">
              الرئيسية <ArrowLeft className="size-4 text-gold" />
            </Link>
          </div>
        </div>
      </Screen>
    </AppShell>
  );
}


function ImportedCampaignCard({ c, status }: { c: ImportedCampaign; status?: CampaignLockStatus }) {
  const fr = c.finalRewards;
  const firstUnlock = fr?.unlocks?.[0];
  const { resolved } = useResolvedUnlocks(firstUnlock ? [firstUnlock] : []);
  const mainReward =
    (fr?.artifactId ? displayArtifactName(fr.artifactId) : undefined) ??
    (resolved[0]?.title ?? undefined);
  const badgeLabel = fr?.badgeId ? displayBadgeName(fr.badgeId) : undefined;
  const xp = fr?.xp;
  const coins = fr?.coins;

  const progress = getCampaignProgress(c.id);
  const isComplete =
    c.chapters.length > 0 &&
    (progress.completed || c.chapters.every((ch) => progress.chapters[ch.id]?.completed));

  const locked = !!status?.locked;
  const stashOrigin = useStashCurrentAsOrigin();
  const cardClass = `motion-tap shadow-elegant relative block overflow-hidden rounded-3xl border bg-gradient-to-tl from-amber-900/30 via-surface to-stone-900/40 p-6 transition ${
    locked
      ? "border-white/10 opacity-80 grayscale-[0.35]"
      : isComplete
        ? "border-emerald-400/60 ring-1 ring-emerald-400/30 shadow-[0_18px_50px_-25px_rgba(16,185,129,0.55)]"
        : "border-gold/40 hover:border-gold/60"
  }`;

  const body = (
    <>
      <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />

      {isComplete && (
        <>
          {/* corner ribbon */}
          <div className="pointer-events-none absolute -right-12 top-5 z-10 rotate-45 bg-gradient-to-l from-emerald-500 to-emerald-400 px-12 py-1 text-[10px] font-extrabold tracking-[0.35em] text-emerald-950 shadow-md">
            مكتملة
          </div>
          {/* large floating check seal */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 grid size-14 place-items-center rounded-full border-2 border-emerald-300/70 bg-emerald-500/20 backdrop-blur-sm shadow-[0_0_30px_-5px_rgba(16,185,129,0.6)]">
            <CheckCircle2 className="size-8 text-emerald-200" strokeWidth={2.2} />
          </div>
          {/* subtle emerald wash so it reads as "done" without dimming the card */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-emerald-500/10 via-transparent to-transparent" />
        </>
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[10px] tracking-widest text-gold">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" />
            حملة جديدة · {c.chapters.length.toLocaleString("en-US")} فصول
          </span>
          {c.historicalPeriod && (
            <span className="rounded-full border border-gold/40 bg-black/30 px-2 py-0.5 text-[10px] text-gold">
              {c.historicalPeriod}
            </span>
          )}
        </div>
        <h2 className="font-display mt-2 text-2xl font-bold shimmer-text">{c.title}</h2>
        {c.subtitle && <p className="mt-1 text-sm text-gold/80">{c.subtitle}</p>}
        {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}

        {(xp || coins || badgeLabel || mainReward) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
            {mainReward && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                <Trophy className="size-3" /> {mainReward}
              </span>
            )}
            {badgeLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-200">
                <Award className="size-3" /> {badgeLabel}
              </span>
            )}
            {typeof xp === "number" && xp > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-sky-200">
                <Zap className="size-3" /> {xp} XP
              </span>
            )}
            {typeof coins === "number" && coins > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                <Coins className="size-3" /> {coins}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <BookOpen className="size-3" /> {c.chapters.length.toLocaleString("en-US")} فصلًا
          </span>
          {!locked && (
            <span className="flex items-center gap-1 text-gold">
              {c.chapters.length === 0 ? "اعرض" : "ابدأ"} <ArrowLeft className="size-3.5" />
            </span>
          )}
        </div>

        {locked && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/15 bg-black/40 px-3 py-2.5 text-[11px] leading-6 text-amber-100/90">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-200/80" />
            <span>{status?.reason ?? "هذه الحملة مقفلة حاليًا."}</span>
          </div>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div className={cardClass} aria-disabled="true">
        <div className="pointer-events-none absolute left-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-white/20 bg-black/50">
          <Lock className="size-4 text-amber-200/90" />
        </div>
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/campaigns/imported/$id"
      params={{ id: c.id }}
      onClick={() => stashOrigin(`/campaigns/imported/${c.id}`)}
      className={cardClass}
    >
      {body}
    </Link>
  );
}



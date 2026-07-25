import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useStashOrigin } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, Globe2, Users, Building2, Calendar,
  Swords, Landmark, Gem, ArrowLeft, ArrowRight, Compass,
  BookOpen, Search, Trophy, CheckCircle2, Clock, Star,
} from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchWorldDetail,
  fetchWorldsIndex,
  PUBLIC_WORLD_HUBS,
  isPublicWorld,
  findHub,
  type WorldSectionKey,
} from "@/lib/worlds";
import type { RelatedNode } from "@/lib/relationship-graph";
import {
  useWorldProgress,
  useStableSectionOrder,
  useWorldMembership,
  useCloudCampaignProgress,
  useAllWorldsProgress,
  type Recommendation,
  type SectionKey,
} from "@/lib/worlds-progress";
import { useProfile } from "@/lib/profile";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { useSupabaseInvestigations, countQuestions } from "@/lib/investigations-source";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import { sortCampaignsChronological } from "@/lib/campaignChronology";
import type { Campaign as ImportedCampaign } from "@/types/campaign";
import { WorldStoriesSection } from "@/components/stories/WorldStoriesSection";
import { CampaignArtwork } from "@/lib/campaignArtwork";

export const Route = createFileRoute("/worlds/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `عالم ${params.slug} — إرث` },
      { name: "description", content: "استكشف شخصيات ومدن وأحداث ومعارك هذا العالم التاريخي." },
    ],
  }),
  component: WorldDetailPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-10 text-center">
        <h1 className="font-display text-xl">العالم غير موجود</h1>
        <Link to="/worlds" className="mt-4 inline-block text-gold underline">
          عُد إلى العوالم
        </Link>
      </div>
    </AppShell>
  ),
});

const SECTION_META: Record<WorldSectionKey, { title: string; glyph: string; icon: ReactNode }> = {
  figure:   { title: "الشخصيات المحورية", glyph: "🪶", icon: <Users className="size-4" /> },
  city:     { title: "المدن المحورية",   glyph: "🏙️", icon: <Building2 className="size-4" /> },
  event:    { title: "الأحداث المحورية", glyph: "📜", icon: <Calendar className="size-4" /> },
  battle:   { title: "المعارك المحورية", glyph: "⚔️", icon: <Swords className="size-4" /> },
  landmark: { title: "المعالم",          glyph: "🕌", icon: <Landmark className="size-4" /> },
  artifact: { title: "المقتنيات",        glyph: "🗝️", icon: <Gem className="size-4" /> },
};

const ENCY_SUBSECTIONS: WorldSectionKey[] = ["figure", "city", "event", "battle", "landmark"];

function recTitle(rec: Recommendation): { chip: string; title: string; caption: string } {
  switch (rec.kind) {
    case "campaign_resume": return { chip: "تابع الحملة", title: rec.title, caption: "من حيث توقّفت" };
    case "campaign_start":  return { chip: "ابدأ حملة",   title: rec.title, caption: "أول خطوة في هذا العالم" };
    case "investigation":   return { chip: "تحقيق جديد",  title: rec.title, caption: "اكتشف الحقيقة" };
    case "entity":          return { chip: "اكتشاف",      title: rec.title, caption: "أضف إلى معرفتك" };
    case "artifact":        return { chip: "قطعة أثرية",  title: rec.title, caption: "أضفها إلى متحفك" };
    case "world_complete":  return { chip: "مكتمل",       title: "استكشفت هذا العالم بالكامل", caption: "عد لتصفّح أي فصل" };
  }
}

function ContinueJourneyCard({ rec }: { rec: Recommendation }) {
  const t = recTitle(rec);
  const content = (
    <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/20 via-black/50 to-transparent p-5">
      <div className="absolute -left-8 -top-8 size-32 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-black/60 ring-1 ring-gold/40">
          <Compass className="size-5 text-gold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-[0.3em] text-gold/80">{t.chip}</p>
          <h2 className="font-display text-lg font-bold leading-tight truncate">{t.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t.caption}</p>
        </div>
        {rec.kind !== "world_complete" && <ChevronRight className="size-5 shrink-0 text-gold/70" />}
      </div>
    </div>
  );
  if (rec.kind === "world_complete") return content;
  if (rec.kind === "campaign_resume") {
    return <Link to={rec.to.path} params={rec.to.params} className="block">{content}</Link>;
  }
  if (rec.kind === "campaign_start") {
    return <Link to={rec.to.path} params={rec.to.params} className="block">{content}</Link>;
  }
  if (rec.kind === "investigation") {
    return <Link to={rec.to.path} params={rec.to.params} className="block">{content}</Link>;
  }
  return <Link to={rec.to.path} params={rec.to.params} className="block">{content}</Link>;
}

function ProgressBar({ label, icon, value, meta, tone = "gold" }: {
  label: string; icon: ReactNode; value: number; meta: string; tone?: "gold" | "muted";
}) {
  const bar = tone === "gold"
    ? "bg-gradient-to-r from-gold/60 to-gold"
    : "bg-white/25";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        <span className="text-gold/80">{icon}</span>
        <span className="font-display font-bold">{label}</span>
        <span className="ms-auto text-muted-foreground">{meta}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%`, transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}

function useReduceMotion(): boolean {
  const { profile } = useProfile();
  const [os, setOs] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setOs(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return os || !!profile.settings?.reduceMotion;
}

/**
 * Reorder-with-anchor: when section order changes we adjust window
 * scrollTop so the section previously at the top of the viewport stays
 * at the top of the viewport. Prevents visual jumps.
 */
function useSectionScrollAnchor(order: SectionKey[]) {
  const prevOrderRef = useRef<SectionKey[]>(order);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prev = prevOrderRef.current;
    if (prev === order || prev.join("|") === order.join("|")) return;

    // Find the anchor: the section closest to (but above) the viewport top
    // BEFORE React re-lays out. We approximate by measuring after a paint
    // and adjusting scrollTop by the delta.
    if (typeof window === "undefined") { prevOrderRef.current = order; return; }
    const scrollBefore = window.scrollY;
    const el = container.current;
    if (!el) { prevOrderRef.current = order; return; }

    // Find first section whose top is >= 0 relative to viewport pre-relayout.
    let anchorKey: SectionKey | null = null;
    let anchorTopBefore = 0;
    for (const key of prev) {
      const node = el.querySelector<HTMLElement>(`[data-section="${key}"]`);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom > 0) { anchorKey = key; anchorTopBefore = rect.top; break; }
    }

    // After paint, measure again and adjust.
    const raf = requestAnimationFrame(() => {
      if (!anchorKey || !el) return;
      const node = el.querySelector<HTMLElement>(`[data-section="${anchorKey}"]`);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const delta = rect.top - anchorTopBefore;
      if (Math.abs(delta) > 1) window.scrollTo({ top: scrollBefore + delta, behavior: "auto" });
    });

    prevOrderRef.current = order;
    return () => cancelAnimationFrame(raf);
  }, [order]);

  return container;
}

/**
 * Origin stashing — every contextual link out of a world records its
 * return path so Back lands here (Priority 3), not on the structural
 * parent (/worlds / /encyclopedia / /investigations). Sections use this
 * hook so the helpers are in-scope wherever a link is rendered.
 */
function useWorldOrigins(slug: string) {
  const stash = useStashOrigin();
  const origin = { route: "/worlds/$slug" as const, params: { slug } };
  return {
    stashInvestigation: (id: string) => stash(`/investigation/${id}`, origin),
    stashEntity: (id: string) => stash(`/encyclopedia/entity/${id}`, origin),
  };
}

function WorldDetailPage() {
  const { slug } = Route.useParams();
  
  // Non-playable slugs (e.g. fatimid, mongols, timurid, safavid) redirect
  // safely to the explorer. Encyclopedia entities that link into these
  // eras continue to work via /encyclopedia/*.
  if (!isPublicWorld(slug)) {
    return <Navigate to="/worlds" replace />;
  }
  // Non-playable slugs (e.g. fatimid, mongols, timurid, safavid) redirect
  // safely to the explorer. Encyclopedia entities that link into these
  // eras continue to work via /encyclopedia/*.
  if (!isPublicWorld(slug)) {
    return <Navigate to="/worlds" replace />;
  }
  const hub = findHub(slug);

  const { data, isLoading } = useQuery({
    queryKey: ["world-detail", slug],
    enabled: !!hub,
    staleTime: 60_000,
    queryFn: () => fetchWorldDetail(slug),
  });

  const { data: worldsIndex } = useQuery({
    queryKey: ["worlds-index"],
    staleTime: 60_000,
    queryFn: () => fetchWorldsIndex(),
  });

  const titleBySlug = new Map((worldsIndex ?? []).map((w) => [w.hub.slug, w.entity.title]));

  const { progress, recommendation, rankedSections, ready } = useWorldProgress(slug);
  const { byWorld } = useAllWorldsProgress();
  const reduceMotion = useReduceMotion();
  const stableOrder = useStableSectionOrder(rankedSections, progress.signature);
  const containerRef = useSectionScrollAnchor(stableOrder);

  if (!hub) {
    return (
      <AppShell>
        <div className="px-5 pt-10">
          <h1 className="font-display text-xl">العالم غير موجود</h1>
          <p className="mt-2 text-[12px] text-muted-foreground">اختر عالمًا من القائمة.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {PUBLIC_WORLD_HUBS.map((h) => (
              <Link key={h.slug} to="/worlds/$slug" params={{ slug: h.slug }}
                className="rounded-2xl border border-gold/20 bg-black/30 p-3 text-right">
                <p className="text-lg">{h.glyph}</p>
                <p className="font-display text-[13px] font-bold">{titleBySlug.get(h.slug) ?? "—"}</p>
              </Link>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center text-[12px] text-muted-foreground">جارٍ تحميل العالم…</div>
      </AppShell>
    );
  }

  const period = (data.entity.metadata as { period?: unknown } | null)?.period;
  const periodStr = typeof period === "string" ? period : null;

  // Prev/Next navigation is bound to PUBLIC_WORLD_HUBS. Non-playable worlds
  // are intentionally skipped.
  const publicIdx = PUBLIC_WORLD_HUBS.findIndex((h) => h.slug === hub.slug);
  const prevHub = publicIdx > 0 ? PUBLIC_WORLD_HUBS[publicIdx - 1] : undefined;
  const nextHub = publicIdx >= 0 && publicIdx < PUBLIC_WORLD_HUBS.length - 1
    ? PUBLIC_WORLD_HUBS[publicIdx + 1]
    : undefined;

  return (
    <AppShell>
      <div className="px-5 pt-8 pb-12">
        <Link
          to="/worlds"
          search={{ from: slug }}
          className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold"
        >
          <ChevronRight className="size-3.5" /> العوالم
        </Link>

        {/* Hero */}
        <div className="mt-3 overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/15 via-black/40 to-transparent p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-16 place-items-center rounded-2xl bg-black/50 text-4xl ring-1 ring-white/10">
              {hub.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80 inline-flex items-center gap-1">
                <Globe2 className="size-3" /> عالم #{hub.order}
              </p>
              <h1 className="font-display text-2xl font-bold leading-tight">{data.entity.title}</h1>
              {data.entity.subtitle && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">{data.entity.subtitle}</p>
              )}
            </div>
            <div className="grid size-14 shrink-0 place-items-center rounded-full border border-gold/40 bg-black/50">
              <span className="font-display text-[14px] font-bold text-gold">{progress.overallPct}%</span>
            </div>
          </div>
          {periodStr && (
            <p className="mt-3 text-[11px] text-gold/80">الفترة: {periodStr}</p>
          )}

          {/* Continue Journey */}
          {ready && (
            <div className="mt-4">
              <ContinueJourneyCard rec={recommendation} />
            </div>
          )}

          {/* Four progress bars */}
          <div className="mt-4 grid gap-3">
            <ProgressBar
              label="الحملات"
              icon={<Trophy className="size-3.5" />}
              value={progress.campaigns.pct}
              meta={`${progress.campaigns.completed} / ${progress.campaigns.total}`}
              tone={progress.campaigns.total > 0 ? "gold" : "muted"}
            />
            <ProgressBar
              label="الاكتشاف"
              icon={<BookOpen className="size-3.5" />}
              value={progress.entities.pct}
              meta={`${progress.entities.discovered} / ${progress.entities.total}`}
            />
            <ProgressBar
              label="التحقيقات"
              icon={<Search className="size-3.5" />}
              value={progress.investigations.pct}
              meta={`${progress.investigations.completed} / ${progress.investigations.total}`}
              tone={progress.investigations.total > 0 ? "gold" : "muted"}
            />
            <ProgressBar
              label="المتحف"
              icon={<Gem className="size-3.5" />}
              value={progress.museum.pct}
              meta={`${progress.museum.discovered} / ${progress.museum.total}`}
              tone={progress.museum.total > 0 ? "gold" : "muted"}
            />
          </div>

          {data.entity.summary && (
            <p className="mt-4 text-[13px] leading-relaxed text-white/80">{data.entity.summary}</p>
          )}
        </div>

        {/* Mini timeline — derived only from real dated Event entities in
            this world. Hidden when fewer than 3 dated events exist. No
            fabricated milestones. */}
        <MiniTimeline events={data.sections.event} worldSlug={slug} />

        {/* Stories of this world (P4.1). Informational only. */}
        <WorldStoriesSection worldSlug={slug} />

        {/* Connected worlds */}
        {data.connectedWorlds.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display mb-3 text-base font-bold">عوالم مرتبطة</h2>
            <div className="grid grid-cols-2 gap-2">
              {data.connectedWorlds.map((w) => {
                const h = findHub(w.slug);
                return (
                  <Link
                    key={w.slug}
                    to="/worlds/$slug"
                    params={{ slug: w.slug }}
                    className="group flex items-center gap-3 rounded-2xl border border-gold/20 bg-black/30 p-3 transition hover:border-gold/55"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-black/50 text-xl ring-1 ring-white/10">
                      {h?.glyph ?? "🌍"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gold/80">عالم مرتبط</p>
                      <p className="font-display text-[13px] font-bold leading-snug break-words">{w.title}</p>
                    </div>
                    <ChevronRight className="size-4 text-gold/60 group-hover:text-gold" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Dynamic sections */}
        <div
          ref={containerRef}
          className="mt-4"
          style={{
            // Small stagger animation for reorder; disabled under reduce-motion.
            // Real reflow work happens through DOM order; this only softens it.
          }}
        >
          {stableOrder.map((key) => (
            <div
              key={key}
              data-section={key}
              style={{
                transition: reduceMotion ? undefined : "opacity 300ms ease, transform 300ms ease",
              }}
            >
              {key === "campaigns" && progress.campaigns.total > 0 && (
                <CampaignsSection worldSlug={slug} progress={progress} />
              )}
              {key === "encyclopedia" && (
                <>
                  {ENCY_SUBSECTIONS.map((k) => {
                    const items = data.sections[k];
                    if (!items || items.length === 0) return null;
                    return <ContentSection key={k} worldSlug={slug} sectionKey={k} items={items} />;
                  })}
                </>
              )}
              {key === "investigations" && progress.investigations.total > 0 && (
                <InvestigationsSection worldSlug={slug} progress={progress} />
              )}
              {key === "museum" && data.sections.artifact.length > 0 && (
                <ContentSection worldSlug={slug} sectionKey="artifact" items={data.sections.artifact} />
              )}
            </div>
          ))}
        </div>

        {/* Prev / Next world — canonical PUBLIC_WORLD_ORDER only. Each card
            reflects real per-world completion from the canonical progress
            service; no placeholder values. */}
        <div className="mt-10 grid grid-cols-2 gap-2">
          {prevHub ? (
            <WorldNavCard
              direction="prev"
              hub={prevHub}
              title={titleBySlug.get(prevHub.slug)}
              pct={byWorld.get(prevHub.slug)?.progress.overallPct}
            />
          ) : <div />}
          {nextHub ? (
            <WorldNavCard
              direction="next"
              hub={nextHub}
              title={titleBySlug.get(nextHub.slug)}
              pct={byWorld.get(nextHub.slug)?.progress.overallPct}
            />
          ) : <div />}
        </div>


      </div>
    </AppShell>
  );
}

type WP = import("@/lib/worlds-progress").WorldProgress;

const DIFF_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

function CampaignsSection({ worldSlug, progress }: { worldSlug: string; progress: WP }) {
  const { data } = useQuery({ queryKey: ["campaigns", "feed"], queryFn: fetchPublishedFeed });
  const { campaignIds } = useWorldMembership(worldSlug);
  const cloudCampaign = useCloudCampaignProgress();
  const canonicalInv = useCanonicalInvestigationProgress();
  const invalidatedTick = canonicalInv.count; // dep to re-render on progress change

  const ordered = useMemo(() => {
    const list = (data?.campaigns ?? []).filter((c) => campaignIds.has(c.id));
    type Row = {
      c: ImportedCampaign;
      status: "in_progress" | "unstarted" | "completed";
      pct: number;
      completedCh: number;
      totalCh: number;
      nextChapterId: string | null;
      nextChapterTitle: string | null;
    };
    const rows: Row[] = list.map((c) => {
      const chapters = c.chapters ?? [];
      const local = getCampaignProgress(c.id);
      // Merge cloud completions with local — matches computeWorldProgress
      // so card status and the aggregate campaigns bar never disagree.
      const cloudDone = cloudCampaign.get(c.id) ?? new Set<string>();
      const total = chapters.length;
      let done = 0;
      let nextId: string | null = null;
      let nextTitle: string | null = null;
      for (const ch of chapters) {
        const isDone = cloudDone.has(ch.id) || !!local.chapters[ch.id]?.completed;
        if (isDone) done++;
        else if (!nextId) { nextId = ch.id; nextTitle = ch.title ?? null; }
      }
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const status: Row["status"] =
        total > 0 && done === total ? "completed"
        : done > 0 ? "in_progress"
        : "unstarted";
      return { c, status, pct, completedCh: done, totalCh: total, nextChapterId: nextId, nextChapterTitle: nextTitle };
    });
    // in-progress → unstarted (chronological) → completed
    const bucket = (s: Row["status"]) => s === "in_progress" ? 0 : s === "unstarted" ? 1 : 2;
    return rows.sort((a, b) => {
      const ba = bucket(a.status); const bb = bucket(b.status);
      if (ba !== bb) return ba - bb;
      const sorted = sortCampaignsChronological([a.c, b.c]);
      return sorted[0].id === a.c.id ? -1 : 1;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, campaignIds, cloudCampaign, invalidatedTick]);

  const shown = ordered.slice(0, 6);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold"><Trophy className="size-4" /></span>
        <h2 className="font-display text-base font-bold">الحملات</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {progress.campaigns.completed} / {progress.campaigns.total}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold/20 bg-black/20 p-4 text-center text-[12px] text-muted-foreground">
          لا توجد حملات متاحة في هذا العالم حاليًا
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const label = r.status === "completed" ? "مكتملة" : r.status === "in_progress" ? "قيد التقدم" : "لم تبدأ";
            const cta =
              r.status === "completed" ? "مراجعة الحملة"
              : r.status === "in_progress" ? "تابع الحملة"
              : "ابدأ الحملة";
            const to = r.status === "in_progress" && r.nextChapterId
              ? { path: "/campaigns/imported/$id/chapter/$chapter" as const, params: { id: r.c.slug ?? r.c.id, chapter: r.nextChapterId } }
              : { path: "/campaigns/imported/$id" as const, params: { id: r.c.slug ?? r.c.id } };
            return (
              <Link
                key={r.c.id}
                to={to.path}
                params={to.params}
                className={`block rounded-2xl border p-3 transition ${
                  r.status === "completed"
                    ? "border-emerald-400/40 bg-emerald-500/5 hover:border-emerald-400/70"
                    : "border-gold/25 bg-black/30 hover:border-gold/55"
                }`}
              >
                <div className="flex items-start gap-3">
                  <CampaignArtwork
                    campaign={r.c}
                    surface="world-card"
                    alt=""
                    className="size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10"
                    imgClassName="size-full object-cover"
                    fallback={
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-black/40 text-2xl ring-1 ring-white/10">
                        <Trophy className="size-6 text-gold/80" />
                      </span>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                        r.status === "completed" ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                        : r.status === "in_progress" ? "border border-gold/40 bg-gold/10 text-gold"
                        : "border border-white/10 bg-black/40 text-muted-foreground"
                      }`}>
                        {r.status === "completed" && <CheckCircle2 className="size-3" />}
                        {r.status === "in_progress" && <Clock className="size-3" />}
                        {label}
                      </span>
                      {r.totalCh > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {r.completedCh} / {r.totalCh} فصول
                        </span>
                      )}
                    </div>
                    <p className="font-display mt-1 truncate text-[13px] font-bold">{r.c.title}</p>
                    {r.status === "in_progress" && r.nextChapterTitle && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        الفصل التالي: {r.nextChapterTitle}
                      </p>
                    )}
                    {r.totalCh > 0 && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${r.status === "completed" ? "bg-emerald-400/70" : "bg-gradient-to-r from-gold/60 to-gold"}`}
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gold">
                      {cta} <ChevronRight className="size-3.5" />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {ordered.length > 0 && (
        <Link
          to="/campaigns"
          search={{ world: worldSlug }}
          className="mt-3 inline-flex items-center gap-1 text-[12px] text-gold hover:underline"
        >
          عرض جميع الحملات <ChevronRight className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

function InvestigationsSection({ worldSlug, progress }: { worldSlug: string; progress: WP }) {
  const { rows } = useSupabaseInvestigations();
  const canonicalInv = useCanonicalInvestigationProgress();
  const { investigationSlugs } = useWorldMembership(worldSlug);
  const { stashInvestigation } = useWorldOrigins(worldSlug);


  const ordered = useMemo(() => {
    const list = (rows ?? []).filter((r) => investigationSlugs.has(r.slug));
    return list
      .map((r) => ({ r, done: canonicalInv.matches(r.slug) || canonicalInv.matches(r.id) }))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const da = DIFF_RANK[a.r.difficulty ?? ""] ?? 3;
        const db = DIFF_RANK[b.r.difficulty ?? ""] ?? 3;
        if (da !== db) return da - db;
        return a.r.slug.localeCompare(b.r.slug);
      });
  }, [rows, investigationSlugs, canonicalInv]);

  const shown = ordered.slice(0, 6);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold"><Search className="size-4" /></span>
        <h2 className="font-display text-base font-bold">التحقيقات</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {progress.investigations.completed} / {progress.investigations.total}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold/20 bg-black/20 p-4 text-center text-[12px] text-muted-foreground">
          لا توجد تحقيقات متاحة في هذا العالم حاليًا
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(({ r, done }) => {
            const steps = Array.isArray(r.steps) ? r.steps : [];
            const qCount = countQuestions(steps);
            const diffLabel = r.difficulty === "easy" ? "سهل" : r.difficulty === "medium" ? "متوسط" : r.difficulty === "hard" ? "صعب" : null;
            const briefing = r.subtitle ?? null;
            return (
              <Link
                key={r.slug}
                to="/investigation/$id"
                params={{ id: r.slug }}
                onClick={() => stashInvestigation(r.slug)}
                className={`block rounded-2xl border p-3 transition ${done ? "border-emerald-400/40 bg-emerald-500/5" : "border-white/10 bg-surface hover:border-gold/40"}`}
              >
                <div className="flex items-start gap-3">
                  {(r as { cover_image?: string }).cover_image ? (
                    <img
                      src={(r as { cover_image?: string }).cover_image!}
                      alt=""
                      loading="lazy"
                      className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-white/10">
                      <Search className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${done ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border border-white/10 bg-black/40 text-muted-foreground"}`}>
                        {done ? <><CheckCircle2 className="size-3" /> منتهي</> : "غير منتهي"}
                      </span>
                      {diffLabel && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {diffLabel}
                        </span>
                      )}
                      {qCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">{qCount} سؤال</span>
                      )}
                    </div>
                    <p className="font-display mt-1 truncate text-[13px] font-bold">{r.title}</p>
                    {briefing && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{briefing}</p>
                    )}
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gold">
                      {done ? "أعد استكشاف التحقيق" : "ابدأ التحقيق"} <ChevronRight className="size-3.5" />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {ordered.length > 0 && (
        <Link
          to="/investigations"
          search={{ world: worldSlug }}
          className="mt-3 inline-flex items-center gap-1 text-[12px] text-gold hover:underline"
        >
          عرض جميع التحقيقات <ChevronRight className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

/** Slug of the Prophet ﷺ entity. Always pinned first inside the Prophetic
 *  world. Rendered with a premium gold card and NO face depiction. */
const PROPHET_SLUG = "prophet-muhammad";

function ContentSection({
  worldSlug,
  sectionKey,
  items,
}: {
  worldSlug: string;
  sectionKey: WorldSectionKey;
  items: RelatedNode[];
}) {
  const meta = SECTION_META[sectionKey];
  const { stashEntity } = useWorldOrigins(worldSlug);


  // Inside the Prophetic world, the Prophet ﷺ must always appear first with
  // a premium gold treatment. Pinning is derived from real encyclopedia data
  // — if the entity is missing from `items`, no card is fabricated.
  const isPropheticFigures = worldSlug === "prophetic" && sectionKey === "figure";
  const propheticFirst = isPropheticFigures
    ? items.find((n) => n.entity.slug === PROPHET_SLUG) ?? null
    : null;
  const rest = propheticFirst
    ? items.filter((n) => n.entity.slug !== PROPHET_SLUG)
    : items;

  return (
    <section className="mt-8" data-subsection={sectionKey}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold">{meta.icon}</span>
        <h2 className="font-display text-base font-bold">{meta.title}</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {items.length}
        </span>
      </div>

      {propheticFirst && (
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: propheticFirst.entity.slug }}
          onClick={() => stashEntity(propheticFirst.entity.slug)}
          data-role="prophet-card"
          className="relative mb-3 block overflow-hidden rounded-3xl border border-gold/60 bg-gradient-to-br from-gold/30 via-black/60 to-black/40 p-4 shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)] ring-1 ring-gold/40 transition hover:border-gold hover:shadow-[0_0_60px_-8px_rgba(212,175,55,0.75)]"
        >
          <div className="pointer-events-none absolute -left-8 -top-8 size-40 rounded-full bg-gold/30 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-40 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center rounded-2xl border border-gold/70 bg-black/70 ring-1 ring-gold/40"
            >
              {/* No face depiction — a calligraphic star glyph only. */}
              <Star className="size-7 text-gold" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-black/50 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.2em] text-gold">
                رسول الله ﷺ
              </p>
              <p className="font-display mt-1 truncate text-[15px] font-bold text-gold-foreground">
                {propheticFirst.entity.title}
              </p>
              {propheticFirst.entity.subtitle && (
                <p className="mt-0.5 truncate text-[11px] text-white/70">
                  {propheticFirst.entity.subtitle}
                </p>
              )}
            </div>
            <ChevronRight className="size-4 text-gold" />
          </div>
        </Link>
      )}

      {/* Figure hierarchy: canonical order already applied by the loader
          (timeline_order → year → alphabetical). We promote the first few
          non-Prophet figures as larger "featured" cards; the rest fall
          back to the normal compact grid. No fabricated ranking. */}
      {sectionKey === "figure" && rest.length > 0 ? (
        <>
          {(() => {
            const FEATURED = 3;
            const featured = rest.slice(0, FEATURED);
            const remainder = rest.slice(FEATURED);
            return (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {featured.map((n) => (
                    <Link
                      key={n.entity.id}
                      to="/encyclopedia/entity/$id"
                      params={{ id: n.entity.slug }}
                      onClick={() => stashEntity(n.entity.slug)}
                      className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-black/50 to-transparent p-3 transition hover:border-gold/60"
                    >
                      <span className="grid size-12 place-items-center rounded-xl bg-black/50 text-2xl ring-1 ring-gold/25">
                        {meta.glyph}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display truncate text-[14px] font-bold text-gold-foreground">{n.entity.title}</p>
                        {n.entity.subtitle && (
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{n.entity.subtitle}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
                {remainder.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {remainder.map((n) => (
                      <Link
                        key={n.entity.id}
                        to="/encyclopedia/entity/$id"
                        params={{ id: n.entity.slug }}
                        onClick={() => stashEntity(n.entity.slug)}
                        className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40 hover:bg-surface-2"
                      >
                        <span className="grid size-11 place-items-center rounded-xl bg-black/40 text-2xl ring-1 ring-white/10">
                          {meta.glyph}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-display truncate text-[13px] font-bold">{n.entity.title}</p>
                          {n.entity.subtitle && (
                            <p className="truncate text-[10px] text-muted-foreground">{n.entity.subtitle}</p>
                          )}
                        </div>
                        <ChevronRight className="size-4 text-gold/60 group-hover:text-gold" />
                      </Link>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rest.map((n) => (
            <Link
              key={n.entity.id}
              to="/encyclopedia/entity/$id"
              params={{ id: n.entity.slug }}
              onClick={() => stashEntity(n.entity.slug)}
              className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40 hover:bg-surface-2"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-black/40 text-2xl ring-1 ring-white/10">
                {meta.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-[13px] font-bold">{n.entity.title}</p>
                {n.entity.subtitle && (
                  <p className="truncate text-[10px] text-muted-foreground">{n.entity.subtitle}</p>
                )}
              </div>
              <ChevronRight className="size-4 text-gold/60 group-hover:text-gold" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Mini timeline — real, dated Event entities only. Hidden if fewer than
 *  3 events carry a chronology signal (timeline_year or timeline_start_year).
 *  Never fabricated. */
function MiniTimeline({ events, worldSlug }: { events: RelatedNode[]; worldSlug: string }) {
  const { stashEntity } = useWorldOrigins(worldSlug);
  const dated = events
    .map((n) => {
      const y = n.entity.timeline_year ?? n.entity.timeline_start_year ?? null;
      return typeof y === "number" && Number.isFinite(y) ? { n, y } : null;
    })
    .filter((x): x is { n: RelatedNode; y: number } => x !== null)
    .sort((a, b) => a.y - b.y);

  if (dated.length < 3) return null;

  // Prefer up to 6 evenly-distributed points across the span (first, last,
  // and interior samples). Preserves chronological arc without cherry-picking.
  const MAX = 6;
  const picks: { n: RelatedNode; y: number }[] = [];
  if (dated.length <= MAX) {
    picks.push(...dated);
  } else {
    for (let i = 0; i < MAX; i++) {
      const idx = Math.round((i * (dated.length - 1)) / (MAX - 1));
      picks.push(dated[idx]);
    }
  }

  const label = (y: number): string => (y > 622 ? `${y}م` : `${y}هـ`);

  return (
    <section className="mt-6" aria-label="خط زمني موجز">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="size-3.5 text-gold" />
        <h2 className="font-display text-[13px] font-bold">خط زمني موجز</h2>
      </div>
      <div className="relative overflow-x-auto">
        <ol className="flex min-w-full items-stretch gap-3 pb-2">
          {picks.map(({ n, y }, i) => (
            <li key={n.entity.id} className="flex min-w-[140px] flex-col">
              <Link
                to="/encyclopedia/entity/$id"
                params={{ id: n.entity.slug }}
                onClick={() => stashEntity(n.entity.slug)}
                className="group flex h-full flex-col rounded-2xl border border-gold/25 bg-black/30 p-2.5 transition hover:border-gold/55"
              >
                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-gold">
                  {label(y)}
                </span>
                <p className="font-display mt-1.5 line-clamp-2 text-[12px] font-bold text-white/90 group-hover:text-gold">
                  {n.entity.title}
                </p>
                {i < picks.length - 1 && (
                  <span className="mt-auto pt-1 text-[10px] text-gold/50">→</span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
function WorldNavCard({
  direction,
  hub,
  title,
  pct,
}: {
  direction: "prev" | "next";
  hub: { slug: string; glyph: string };
  title: string | undefined;
  pct: number | undefined;
}) {
  const isPrev = direction === "prev";
  const displayPct = typeof pct === "number" ? pct : null;
  return (
    <Link
      to="/worlds/$slug"
      params={{ slug: hub.slug }}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-gold/20 bg-black/30 p-3 transition hover:border-gold/55"
    >
      {isPrev && <ArrowRight className="size-4 shrink-0 text-gold/70" />}
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-black/50 text-2xl ring-1 ring-white/10"
      >
        {hub.glyph}
      </span>
      <div className={`min-w-0 flex-1 ${isPrev ? "text-right" : "text-left"}`}>
        <p className="text-[10px] tracking-[0.2em] text-muted-foreground">
          {isPrev ? "العالم السابق" : "العالم التالي"}
        </p>
        <p className="font-display truncate text-[13px] font-bold leading-snug">
          {title ?? "—"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold"
              style={{ width: `${displayPct ?? 0}%`, transition: "width 400ms ease" }}
            />
          </div>
          {displayPct !== null && (
            <span className="tabular-nums text-[10px] text-gold/80">{displayPct}%</span>
          )}
        </div>
      </div>
      {!isPrev && <ArrowLeft className="size-4 shrink-0 text-gold/70" />}
    </Link>
  );
}

// Suppress unused import warning; SectionKey is used implicitly by hook return.
export type _SectionKey = SectionKey;

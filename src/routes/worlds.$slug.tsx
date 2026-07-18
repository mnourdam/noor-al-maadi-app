import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, Globe2, Users, Building2, Calendar,
  Swords, Landmark, Gem, ArrowLeft, ArrowRight, Compass,
  BookOpen, Search, Trophy, CheckCircle2, Clock,
} from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchWorldDetail,
  fetchWorldsIndex,
  WORLD_HUBS,
  findHub,
  type WorldSectionKey,
} from "@/lib/worlds";
import type { RelatedNode } from "@/lib/relationship-graph";
import {
  useWorldProgress,
  useStableSectionOrder,
  useWorldMembership,
  type Recommendation,
  type SectionKey,
} from "@/lib/worlds-progress";
import { useProfile } from "@/lib/profile";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { useSupabaseInvestigations, countQuestions } from "@/lib/investigations-source";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import { sortCampaignsChronological } from "@/lib/campaignChronology";
import type { Campaign as ImportedCampaign } from "@/types/campaign";

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

function WorldDetailPage() {
  const { slug } = Route.useParams();
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
            {WORLD_HUBS.map((h) => (
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

  const prevHub = WORLD_HUBS.find((h) => h.order === hub.order - 1);
  const nextHub = WORLD_HUBS.find((h) => h.order === hub.order + 1);

  return (
    <AppShell>
      <div className="px-5 pt-8 pb-12">
        <Link to="/worlds" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
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
                    return <ContentSection key={k} sectionKey={k} items={items} />;
                  })}
                </>
              )}
              {key === "investigations" && progress.investigations.total > 0 && (
                <InvestigationsSection progress={progress} />
              )}
              {key === "museum" && data.sections.artifact.length > 0 && (
                <ContentSection sectionKey="artifact" items={data.sections.artifact} />
              )}
            </div>
          ))}
        </div>

        {/* Prev / Next world */}
        <div className="mt-10 grid grid-cols-2 gap-2">
          {prevHub ? (
            <Link to="/worlds/$slug" params={{ slug: prevHub.slug }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-right">
              <ArrowRight className="size-4 text-gold/70" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground">العالم السابق</p>
                <p className="font-display text-[12px] font-bold leading-snug break-words">
                  {prevHub.glyph} {titleBySlug.get(prevHub.slug) ?? ""}
                </p>
              </div>
            </Link>
          ) : <div />}
          {nextHub ? (
            <Link to="/worlds/$slug" params={{ slug: nextHub.slug }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] text-muted-foreground">العالم التالي</p>
                <p className="font-display text-[12px] font-bold leading-snug break-words">
                  {nextHub.glyph} {titleBySlug.get(nextHub.slug) ?? ""}
                </p>
              </div>
              <ArrowLeft className="size-4 text-gold/70" />
            </Link>
          ) : <div />}
        </div>

      </div>
    </AppShell>
  );
}

function CampaignsSection({ worldSlug: _slug, progress }: { worldSlug: string; progress: import("@/lib/worlds-progress").WorldProgress }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold"><Trophy className="size-4" /></span>
        <h2 className="font-display text-base font-bold">الحملات</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {progress.campaigns.completed} / {progress.campaigns.total}
        </span>
      </div>
      <Link to="/campaigns" className="block rounded-2xl border border-gold/25 bg-black/30 p-4 transition hover:border-gold/55">
        <p className="text-[12px] text-muted-foreground">
          {progress.campaigns.started === 0
            ? "لم تبدأ أي حملة في هذا العالم بعد."
            : progress.campaigns.completed < progress.campaigns.total
              ? `أنجزت ${progress.campaigns.completed} من ${progress.campaigns.total} حملات — تابع الرحلة.`
              : "أكملت جميع حملات هذا العالم."}
        </p>
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-gold">
          استعراض الحملات <ChevronRight className="size-3.5" />
        </p>
      </Link>
    </section>
  );
}

function InvestigationsSection({ progress }: { progress: import("@/lib/worlds-progress").WorldProgress }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold"><Search className="size-4" /></span>
        <h2 className="font-display text-base font-bold">التحقيقات</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {progress.investigations.completed} / {progress.investigations.total}
        </span>
      </div>
      <Link to="/investigations" className="block rounded-2xl border border-gold/25 bg-black/30 p-4 transition hover:border-gold/55">
        <p className="text-[12px] text-muted-foreground">
          {progress.investigations.completed === 0
            ? "تحقيقات هذا العالم بانتظار المحقّق."
            : progress.investigations.completed < progress.investigations.total
              ? `حللت ${progress.investigations.completed} من ${progress.investigations.total} تحقيقات.`
              : "حللت كل تحقيقات هذا العالم."}
        </p>
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-gold">
          استعراض التحقيقات <ChevronRight className="size-3.5" />
        </p>
      </Link>
    </section>
  );
}

function ContentSection({ sectionKey, items }: { sectionKey: WorldSectionKey; items: RelatedNode[] }) {
  const meta = SECTION_META[sectionKey];
  return (
    <section className="mt-8" data-subsection={sectionKey}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gold">{meta.icon}</span>
        <h2 className="font-display text-base font-bold">{meta.title}</h2>
        <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((n) => (
          <Link
            key={n.entity.id}
            to="/encyclopedia/entity/$id"
            params={{ id: n.entity.slug }}
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
    </section>
  );
}

// Suppress unused import warning; SectionKey is used implicitly by hook return.
export type _SectionKey = SectionKey;

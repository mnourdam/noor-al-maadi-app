import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight, Globe2, Users, Building2, Calendar,
  Swords, Landmark, Gem, ArrowLeft, ArrowRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import {
  fetchWorldDetail,
  WORLD_HUBS,
  findHub,
  type WorldSectionKey,
} from "@/lib/worlds";
import type { RelatedNode } from "@/lib/relationship-graph";

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
  figure: { title: "الشخصيات المحورية", glyph: "🪶", icon: <Users className="size-4" /> },
  city: { title: "المدن المحورية", glyph: "🏙️", icon: <Building2 className="size-4" /> },
  event: { title: "الأحداث المحورية", glyph: "📜", icon: <Calendar className="size-4" /> },
  battle: { title: "المعارك المحورية", glyph: "⚔️", icon: <Swords className="size-4" /> },
  landmark: { title: "المعالم", glyph: "🕌", icon: <Landmark className="size-4" /> },
  artifact: { title: "المقتنيات", glyph: "🗝️", icon: <Gem className="size-4" /> },
};

const ORDER: WorldSectionKey[] = ["figure", "city", "event", "battle", "landmark", "artifact"];

function WorldDetailPage() {
  const { slug } = Route.useParams();
  const hub = findHub(slug);

  const { data, isLoading } = useQuery({
    queryKey: ["world-detail", slug],
    enabled: !!hub,
    staleTime: 60_000,
    queryFn: () => fetchWorldDetail(slug),
  });

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
                <p className="font-display text-[13px] font-bold">{h.slug}</p>
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
          </div>
          {data.entity.summary && (
            <p className="mt-4 text-[13px] leading-relaxed text-white/80">{data.entity.summary}</p>
          )}
          {periodStr && (
            <p className="mt-2 text-[11px] text-gold/80">الفترة: {periodStr}</p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ORDER.map((k) => (
              <div key={k} className="rounded-xl border border-white/10 bg-black/30 p-2 text-center">
                <p className="text-lg">{SECTION_META[k].glyph}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{SECTION_META[k].title}</p>
                <p className="font-display text-base font-bold">{data.stats[k]}</p>
              </div>
            ))}
            <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-center">
              <p className="text-lg">👑</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">الحملات</p>
              <p className="font-display text-base font-bold">{data.campaignsCount}</p>
            </div>
          </div>
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
                      <p className="font-display truncate text-[13px] font-bold">{w.title}</p>
                    </div>
                    <ChevronRight className="size-4 text-gold/60 group-hover:text-gold" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Content sections */}
        {ORDER.map((k) => {
          const items = data.sections[k];
          if (items.length === 0) return null;
          return <ContentSection key={k} sectionKey={k} items={items} />;
        })}

        {/* Prev / Next world */}
        <div className="mt-10 grid grid-cols-2 gap-2">
          {prevHub ? (
            <Link to="/worlds/$slug" params={{ slug: prevHub.slug }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-right">
              <ArrowRight className="size-4 text-gold/70" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground">العالم السابق</p>
                <p className="font-display truncate text-[12px] font-bold">{prevHub.glyph} {prevHub.slug}</p>
              </div>
            </Link>
          ) : <div />}
          {nextHub ? (
            <Link to="/worlds/$slug" params={{ slug: nextHub.slug }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] text-muted-foreground">العالم التالي</p>
                <p className="font-display truncate text-[12px] font-bold">{nextHub.glyph} {nextHub.slug}</p>
              </div>
              <ArrowLeft className="size-4 text-gold/70" />
            </Link>
          ) : <div />}
        </div>
      </div>
    </AppShell>
  );
}

function ContentSection({ sectionKey, items }: { sectionKey: WorldSectionKey; items: RelatedNode[] }) {
  const meta = SECTION_META[sectionKey];
  return (
    <section className="mt-8">
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

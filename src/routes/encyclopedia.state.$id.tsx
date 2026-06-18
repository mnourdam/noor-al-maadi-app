import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, BookOpen, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  SECTION_LABELS, SECTION_GLYPHS, stateEntities, stateEntityForEra, sortChrono,
  KNOWN_ERAS, type EncyclopediaSection,
} from "@/lib/encyclopedia";
import { CAMPAIGN_REGISTRY } from "@/lib/campaign-engine/registry";
import { ERAS, type Era } from "@/lib/data";

const SECTION_ORDER: EncyclopediaSection[] = [
  "figure", "scholar", "city", "battle", "event", "landmark", "artifact",
];

const VALID = new Set(KNOWN_ERAS.map((e) => e.id));

export const Route = createFileRoute("/encyclopedia/state/$id")({
  head: ({ params }) => {
    const era = ERAS.find((e) => e.id === params.id);
    const title = era?.name ?? "الدولة";
    return {
      meta: [
        { title: `${title} — الموسوعة التاريخية` },
        { name: "description", content: era?.tagline ?? "صفحة الدولة في موسوعة إرث." },
        { property: "og:title", content: `${title} — إرث` },
        { property: "og:description", content: era?.tagline ?? "صفحة الدولة في موسوعة إرث." },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!VALID.has(params.id)) throw notFound();
  },
  component: StatePage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-10 text-center">
        <h1 className="font-display text-xl">الدولة غير موجودة</h1>
        <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
      </div>
    </AppShell>
  ),
});

function StatePage() {
  const { id } = Route.useParams() as { id: string };
  const era = ERAS.find((e) => e.id === id);
  const state = stateEntityForEra(id);
  const groups = stateEntities(id);
  const campaigns = CAMPAIGN_REGISTRY.filter((c) => (c as { packId?: string }).packId === id || c.eraId === id);

  const totalEntities = SECTION_ORDER.reduce((s, k) => s + groups[k].length, 0);

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/encyclopedia" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>

        {/* Hero */}
        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 text-3xl ring-1 ring-white/10">
              {state?.image.glyph ?? "🏛️"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80">دولة</p>
              <h1 className="font-display text-2xl font-bold">{era?.name ?? state?.title ?? id}</h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{state?.period.label ?? era?.years}</p>
              {era?.tagline && (
                <p className="mt-1 text-[12px] italic text-white/70">«{era.tagline}»</p>
              )}
            </div>
          </div>
          {state?.description && (
            <p className="mt-3 text-[13px] leading-7 text-foreground/90">{state.description}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-gold/85">
              {totalEntities} عنصرًا تاريخيًا
            </span>
            <Link
              to="/timeline"
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold"
            >
              <Clock className="size-3" /> اقفز إلى الخط الزمني
            </Link>
            {era && (
              <Link
                to="/campaigns/$era" params={{ era: id as Era }}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold"
              >
                <BookOpen className="size-3" /> القصص والحملات
              </Link>
            )}
          </div>
        </div>

        {/* Campaigns */}
        {campaigns.length > 0 && (
          <section className="mt-6">
            <h2 className="font-display mb-2 text-sm font-bold">الحملات المرتبطة</h2>
            <div className="grid grid-cols-1 gap-2">
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  to="/play/campaign/$id" params={{ id: c.id }}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40 hover:bg-surface-2"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-black/35 text-xl ring-1 ring-white/5">
                    🎯
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[13px] font-bold line-clamp-1">{c.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{c.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Grouped sections */}
        {SECTION_ORDER.map((s) => {
          const list = sortChrono(groups[s]);
          if (list.length === 0) return null;
          return (
            <section key={s} className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg">{SECTION_GLYPHS[s]}</span>
                <h2 className="font-display text-sm font-bold">{SECTION_LABELS[s]}</h2>
                <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                  {list.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {list.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
              </div>
            </section>
          );
        })}

        <div className="h-10" />
      </div>
    </AppShell>
  );
}
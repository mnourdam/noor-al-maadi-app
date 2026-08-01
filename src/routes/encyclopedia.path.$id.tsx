import { ReadingProgress } from "@/components/ReadingProgress";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Compass, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import {
  buildExplorationJourney,
  findExplorationPath,
  EXPLORATION_PATHS,
} from "@/lib/exploration-paths";
import { useStashCurrentAsOrigin } from "@/lib/navigation";


const TYPE_LABEL: Record<string, string> = {
  state: "دولة",
  figure: "شخصية",
  scholar: "عالم",
  city: "مدينة",
  battle: "معركة",
  event: "حدث",
  landmark: "معلم",
  artifact: "أثر",
};

const TYPE_GLYPH: Record<string, string> = {
  state: "🏛️",
  figure: "🪶",
  scholar: "📚",
  city: "🏙️",
  battle: "⚔️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};

export const Route = createFileRoute("/encyclopedia/path/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `مسار الاستكشاف — ${params.id}` },
      { name: "description", content: "رحلة تاريخية مترابطة عبر شخصيات ومدن وأحداث الموسوعة." },
    ],
  }),
  component: PathPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-10 text-center">
        <h1 className="font-display text-xl">المسار غير موجود</h1>
        <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">
          عُد إلى الموسوعة
        </Link>
      </div>
    </AppShell>
  ),
});

function PathPage() {
  const { id } = Route.useParams();
  const config = findExplorationPath(id);
  const stashOrigin = useStashCurrentAsOrigin();



  const journeyQuery = useQuery({
    queryKey: ["exploration-path", id],
    enabled: !!config,
    staleTime: 60_000,
    queryFn: async () => (config ? buildExplorationJourney(config) : null),
  });

  if (!config) {
    return (
      <AppShell>
        <div className="px-5 pt-10">
          <h1 className="font-display text-xl">المسار غير موجود</h1>
          <p className="mt-2 text-[12px] text-muted-foreground">
            اختر مسارًا من قائمة "مسارات الاستكشاف".
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {EXPLORATION_PATHS.map((p) => (
              <Link
                key={p.id}
                to="/encyclopedia/path/$id"
                params={{ id: p.id }}
                className="rounded-2xl border border-gold/20 bg-black/30 p-3 text-right"
              >
                <p className="text-lg">{p.glyph}</p>
                <p className="font-display text-[13px] font-bold">{p.title}</p>
                {p.subtitle && (
                  <p className="text-[10px] text-muted-foreground">{p.subtitle}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ReadingProgress />
      <div className="px-5 pt-8">
        <Link to="/encyclopedia" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>

        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 text-3xl ring-1 ring-white/10">
              {config.glyph ?? "🧭"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80">مسار استكشاف</p>
              <h1 className="font-display text-2xl font-bold">{config.title}</h1>
              {config.subtitle && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">{config.subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {journeyQuery.isLoading ? (
          <p className="mt-10 text-center text-[12px] text-muted-foreground">جارٍ بناء الرحلة…</p>
        ) : !journeyQuery.data || !journeyQuery.data.anchor ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gold/20 bg-black/20 p-6 text-center">
            <p className="text-[12px] text-muted-foreground">
              لا توجد بيانات كافية لبناء هذا المسار بعد.
            </p>
          </div>
        ) : journeyQuery.data.steps.length <= 1 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gold/20 bg-black/20 p-6 text-center">
            <p className="text-[12px] text-muted-foreground">
              لا توجد روابط تاريخية موثقة كافية بعد لرسم رحلة كاملة.
            </p>
          </div>
        ) : (
          <section className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <Compass className="size-4 text-gold" />
              <h2 className="font-display text-base font-bold">الرحلة</h2>
              <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                {journeyQuery.data.steps.length} محطات
              </span>
            </div>

            <ol className="space-y-2">
              {journeyQuery.data.steps.map((s, i) => {
                const isAnchor = s.role === "anchor";
                const glyph = TYPE_GLYPH[s.entity.entity_type] ?? "📜";
                const typeLabel = TYPE_LABEL[s.entity.entity_type] ?? s.entity.entity_type;
                return (
                  <li key={`${s.entity.id}-${i}`}>
                    <Link
                      to="/encyclopedia/entity/$id"
                      params={{ id: s.entity.slug }}
                      onClick={() => stashOrigin(`/encyclopedia/entity/${s.entity.slug}`)}
                      className={`group flex items-center gap-3 rounded-2xl border p-3 transition ${

                        isAnchor
                          ? "border-gold/40 bg-gradient-to-br from-gold/15 via-transparent to-transparent"
                          : "border-white/10 bg-surface hover:border-gold/40 hover:bg-surface-2"
                      }`}
                    >
                      <span className="grid size-11 place-items-center rounded-xl bg-black/40 text-2xl ring-1 ring-white/10">
                        {glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] tracking-[0.2em] text-gold/80">
                          {isAnchor ? "محور المسار" : `محطة ${i + 1}`} · {typeLabel}
                        </p>
                        <p className="font-display text-[14px] font-bold">{s.entity.title}</p>
                        {s.entity.subtitle && (
                          <p className="truncate text-[10px] text-muted-foreground">{s.entity.subtitle}</p>
                        )}
                      </div>
                      <ChevronRight className="size-4 text-gold/60 group-hover:text-gold" />
                    </Link>
                    {i < journeyQuery.data!.steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="size-3.5 text-gold/40" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {journeyQuery.data?.anchor && (
          <FeedbackCTA
            context={{
              entity_id: journeyQuery.data.anchor.id,
              slug: journeyQuery.data.anchor.slug,
              title: journeyQuery.data.anchor.title,
            }}
          />
        )}

        <div className="h-10" />
      </div>
    </AppShell>
  );
}

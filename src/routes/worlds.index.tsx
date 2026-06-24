import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe2, ChevronLeft, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { fetchWorldsIndex } from "@/lib/worlds";

export const Route = createFileRoute("/worlds/")({
  head: () => ({
    meta: [
      { title: "عوالم إرث — استكشاف الحضارات والعصور" },
      { name: "description", content: "ادخل عوالم إرث وتجوّل في الحضارات والدول الإسلامية الكبرى عبر الموسوعة." },
    ],
  }),
  component: WorldsIndex,
});

function WorldsIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["worlds-index"],
    staleTime: 60_000,
    queryFn: fetchWorldsIndex,
  });

  return (
    <AppShell>
      <div className="px-5 pt-8 pb-12">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.3em] text-gold/80">
          <Globe2 className="size-3.5" /> عوالم إرث
        </div>
        <h1 className="font-display mt-2 text-3xl font-bold">سافر عبر الحضارات</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          الخط الزمني يمضي عبر القرون. العوالم تتيح لك دخول حضارة بعينها واستكشاف شخصياتها ومدنها ومعاركها.
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-[12px] text-muted-foreground">جارٍ تحميل العوالم…</p>
        ) : !data || data.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gold/20 bg-black/20 p-6 text-center">
            <p className="text-[12px] text-muted-foreground">لا توجد عوالم متاحة بعد.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.map((w) => {
              const period = (w.entity.metadata as { period?: unknown } | null)?.period;
              return (
                <Link
                  key={w.hub.slug}
                  to="/worlds/$slug"
                  params={{ slug: w.hub.slug }}
                  className="group relative overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-black/40 to-transparent p-5 transition hover:border-gold/55"
                >
                  <div className="absolute -left-10 -top-10 size-32 rounded-full bg-gold/15 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start gap-3">
                      <span className="grid size-14 place-items-center rounded-2xl bg-black/50 text-3xl ring-1 ring-white/10">
                        {w.hub.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] tracking-[0.3em] text-gold/80">عالم #{w.hub.order}</p>
                        <h2 className="font-display text-xl font-bold leading-tight">{w.entity.title}</h2>
                        {w.entity.subtitle && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{w.entity.subtitle}</p>
                        )}
                      </div>
                    </div>
                    {typeof period === "string" && period && (
                      <p className="mt-3 text-[11px] text-white/70">{period}</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
                        {w.relatedCount} كيان مرتبط
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
                        {w.campaignsCount} حملة
                      </span>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 text-[11px] text-gold group-hover:gap-2 transition-all">
                      ادخل العالم <ChevronLeft className="size-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-gold/15 bg-black/30 p-4">
          <div className="flex items-center gap-2 text-[11px] text-gold/80">
            <Sparkles className="size-3.5" /> نصيحة
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            الخط الزمني = السفر عبر الزمن. العوالم = السفر عبر الحضارات.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

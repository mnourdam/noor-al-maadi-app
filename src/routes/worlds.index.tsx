import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe2, ChevronLeft, Sparkles, Compass, MapPin } from "lucide-react";
import { WorldGlyph } from "@/components/worlds/WorldGlyph";
import { AppShell } from "@/components/AppShell";
import { fetchWorldsIndex } from "@/lib/worlds";
import { isPublicWorld } from "@/lib/worlds-constants";
import { useAllWorldsProgress } from "@/lib/worlds-progress";

type WorldsSearch = { from?: string };

export const Route = createFileRoute("/worlds/")({
  validateSearch: (raw: Record<string, unknown>): WorldsSearch => {
    const from = typeof raw.from === "string" && isPublicWorld(raw.from) ? raw.from : undefined;
    return from ? { from } : {};
  },
  head: () => ({
    meta: [
      { title: "عوالم إرث — استكشاف الحضارات والعصور" },
      { name: "description", content: "ادخل عوالم إرث وتجوّل في الحضارات والدول الإسلامية الكبرى عبر الموسوعة." },
    ],
  }),
  component: WorldsIndex,
});

import type { Recommendation } from "@/lib/worlds-progress";
function recLabel(rec: Recommendation | undefined): string {
  if (!rec) return "";
  switch (rec.kind) {
    case "campaign_resume": return `تابع: ${rec.title}`;
    case "campaign_start":  return `ابدأ: ${rec.title}`;
    case "investigation":   return `تحقيق: ${rec.title}`;
    case "entity":          return `اكتشف: ${rec.title}`;
    case "artifact":        return `اقتنِ: ${rec.title}`;
    case "world_complete":  return "مكتمل ✦";
  }
}


function WorldsIndex() {
  const { from } = Route.useSearch();
  const { data, isLoading } = useQuery({
    queryKey: ["worlds-index"],
    staleTime: 60_000,
    queryFn: fetchWorldsIndex,
  });

  const { byWorld } = useAllWorldsProgress();

  return (
    <AppShell>
      <div className="px-5 pt-8 pb-12">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.3em] text-gold/80">
          <Globe2 className="size-3.5" /> عوالم إرث
        </div>
        <h1 className="font-display mt-2 text-3xl font-bold">مسيرتك عبر الحضارات</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          كل عالمٍ يقود رحلتك التالية. تابع من حيث توقّفت أو ابدأ اكتشافًا جديدًا.
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
              const prog = byWorld.get(w.hub.slug);
              const overall = prog?.progress.overallPct ?? 0;
              const entities = prog?.progress.entities;
              const period = (w.entity.metadata as { period?: unknown } | null)?.period;
              const isHere = from === w.hub.slug;
              return (
                <Link
                  key={w.hub.slug}
                  to="/worlds/$slug"
                  params={{ slug: w.hub.slug }}
                  aria-current={isHere ? "page" : undefined}
                  className={
                    "group relative overflow-hidden rounded-3xl border p-5 transition " +
                    (isHere
                      ? "border-gold/70 bg-gradient-to-br from-gold/20 via-black/40 to-transparent shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)] ring-1 ring-gold/50"
                      : "border-gold/25 bg-gradient-to-br from-gold/10 via-black/40 to-transparent hover:border-gold/55")
                  }
                >
                  {isHere && (
                    <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-gold/60 bg-black/70 px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] text-gold">
                      <MapPin className="size-2.5" /> أنت هنا
                    </span>
                  )}
                  <div className="absolute -left-10 -top-10 size-32 rounded-full bg-gold/15 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start gap-3">
                      <span className="grid size-14 place-items-center rounded-2xl bg-black/50 p-1.5 ring-1 ring-white/10">
                        <WorldGlyph slug={w.hub.slug} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] tracking-[0.3em] text-gold/80">عالم #{w.hub.order}</p>
                        <h2 className="font-display text-xl font-bold leading-tight">{w.entity.title}</h2>
                        {w.entity.subtitle && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{w.entity.subtitle}</p>
                        )}
                      </div>
                      <div className="grid size-12 shrink-0 place-items-center rounded-full border border-gold/40 bg-black/50">
                        <span className="font-display text-[13px] font-bold text-gold">{overall}%</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold"
                        style={{ width: `${overall}%`, transition: "width 400ms ease" }}
                      />
                    </div>

                    {typeof period === "string" && period && (
                      <p className="mt-3 text-[11px] text-white/70">{period}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      {entities && entities.total > 0 && (
                        <>
                          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 tabular-nums">
                            اكتُشف {entities.discovered} / {entities.total}
                          </span>
                          {entities.total - entities.discovered > 0 && (
                            <span className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 tabular-nums text-gold/90">
                              متبقٍّ {entities.total - entities.discovered}
                            </span>
                          )}
                        </>
                      )}
                      <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
                        {w.campaignsCount} حملة
                      </span>
                    </div>

                    {prog && (
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gold/90">
                        <Compass className="size-3.5" /> {recLabel(prog.recommendation)}
                      </p>
                    )}

                    <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-gold group-hover:gap-2 transition-all">
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
            الخط الزمني = السفر عبر الزمن. العوالم = السفر عبر الحضارات ومتابعة تقدّمك.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

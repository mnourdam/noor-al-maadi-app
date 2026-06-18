import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  SECTION_LABELS, SECTION_GLYPHS, KNOWN_ERAS, sectionCounts, searchAll,
  stateEntityForEra, type EncyclopediaSection,
} from "@/lib/encyclopedia";

export const Route = createFileRoute("/encyclopedia/")({
  head: () => ({
    meta: [
      { title: "الموسوعة التاريخية — إرث" },
      { name: "description", content: "تصفّح حر لكل الدول والشخصيات والعلماء والمعارك والمدن والأحداث والمعالم والآثار في عالم إرث." },
      { property: "og:title", content: "الموسوعة التاريخية — إرث" },
      { property: "og:description", content: "تصفّح حر لكل المحتوى التاريخي في إرث: دول، شخصيات، علماء، معارك، مدن، أحداث، معالم وآثار." },
    ],
  }),
  component: EncyclopediaHub,
});

const SECTIONS = Object.keys(SECTION_LABELS) as EncyclopediaSection[];

function EncyclopediaHub() {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string | "">("");

  const counts = useMemo(() => sectionCounts(), []);
  const results = useMemo(
    () => (query.trim() ? searchAll(query, era || undefined, 30) : []),
    [query, era],
  );

  return (
    <AppShell>
      <Screen
        title="الموسوعة التاريخية"
        subtitle="تصفّح حرّ في كل المحتوى — دون انتظار الحملات أو الفتوحات."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن شخصية، مدينة، معركة، حدث…"
            className="w-full rounded-2xl border border-white/10 bg-surface py-3 pr-10 pl-10 text-right text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
            dir="rtl"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <FilterChip active={era === ""} onClick={() => setEra("")}>كل العصور</FilterChip>
          {KNOWN_ERAS.map((e) => (
            <FilterChip key={e.id} active={era === e.id} onClick={() => setEra(e.id)}>
              {e.label}
            </FilterChip>
          ))}
        </div>

        {query.trim() ? (
          <section className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-display text-sm font-bold">نتائج البحث</h2>
              <span className="rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                {results.length}
              </span>
            </div>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
                لا توجد نتائج مطابقة.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {results.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="font-display mb-2 text-sm font-bold">الدول</h2>
              <div className="grid grid-cols-1 gap-2.5">
                {KNOWN_ERAS.map((e) => {
                  const state = stateEntityForEra(e.id);
                  return (
                    <Link
                      key={e.id}
                      to="/encyclopedia/state/$id"
                      params={{ id: e.id }}
                      className="group flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-l from-gold/10 via-transparent to-transparent p-3 transition hover:border-gold/50"
                    >
                      <span className="grid size-12 place-items-center rounded-xl bg-black/35 text-2xl ring-1 ring-white/5">
                        {state?.image.glyph ?? "🏛️"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-bold">{e.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                          {state?.description ?? "صفحة الدولة الكاملة"}
                        </p>
                      </div>
                      <span className="text-[10px] text-gold/70">{state?.period.label ?? ""}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="font-display mb-2 text-sm font-bold">الأقسام</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {SECTIONS.map((s) => (
                  <Link
                    key={s}
                    to="/encyclopedia/type/$type"
                    params={{ type: s }}
                    className="group rounded-2xl border border-white/10 bg-surface p-3 text-right transition hover:border-gold/40 hover:bg-surface-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="grid size-10 place-items-center rounded-xl bg-black/35 text-xl ring-1 ring-white/5">
                        {SECTION_GLYPHS[s]}
                      </span>
                      <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                        {counts[s]}
                      </span>
                    </div>
                    <p className="font-display mt-2 text-sm font-bold">{SECTION_LABELS[s]}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      تصفّح كل {SECTION_LABELS[s]}
                    </p>
                  </Link>
                ))}
              </div>
            </section>

            <p className="mt-6 text-center text-[10px] text-muted-foreground">
              كل المحتوى مفتوح للتصفّح بدون اشتراطات تقدّم.
            </p>
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[10px] transition ${
        active
          ? "border-gold/50 bg-gold/15 text-gold"
          : "border-white/10 bg-transparent text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
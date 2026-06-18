import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  SECTION_LABELS, SECTION_GLYPHS, KNOWN_ERAS,
  entitiesForSection, applyFilters, sortChrono,
  type EncyclopediaSection,
} from "@/lib/encyclopedia";

const VALID = new Set<string>(Object.keys(SECTION_LABELS));

export const Route = createFileRoute("/encyclopedia/type/$type")({
  head: ({ params }) => {
    const label = (SECTION_LABELS as Record<string, string>)[params.type] ?? "الموسوعة";
    return {
      meta: [
        { title: `${label} — الموسوعة التاريخية` },
        { name: "description", content: `تصفّح كل ${label} في عالم إرث.` },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!VALID.has(params.type)) throw notFound();
  },
  component: TypeBrowsePage,
  notFoundComponent: () => (
    <AppShell>
      <Screen title="قسم غير معروف">
        <Link to="/encyclopedia" className="text-gold underline">عُد إلى الموسوعة</Link>
      </Screen>
    </AppShell>
  ),
});

function TypeBrowsePage() {
  const { type } = Route.useParams() as { type: EncyclopediaSection };
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string | "">("");

  const all = useMemo(() => entitiesForSection(type), [type]);
  const filtered = useMemo(
    () => sortChrono(applyFilters(all, { query, era: era || undefined })),
    [all, query, era],
  );

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link
          to="/encyclopedia"
          className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold"
        >
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-black/35 text-2xl ring-1 ring-white/5">
            {SECTION_GLYPHS[type]}
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">{SECTION_LABELS[type]}</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {filtered.length} من أصل {all.length}
            </p>
          </div>
        </div>
        <div className="ornament-divider mt-3" />

        {/* Search */}
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`ابحث في ${SECTION_LABELS[type]}…`}
            className="w-full rounded-2xl border border-white/10 bg-surface py-3 pr-10 pl-10 text-right text-sm focus:border-gold/40 focus:outline-none"
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

        {/* Era filters */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={era === ""} onClick={() => setEra("")}>كل العصور</Chip>
          {KNOWN_ERAS.map((e) => (
            <Chip key={e.id} active={era === e.id} onClick={() => setEra(e.id)}>{e.label}</Chip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر مطابقة.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2.5 pb-8">
            {filtered.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[10px] transition ${
        active ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
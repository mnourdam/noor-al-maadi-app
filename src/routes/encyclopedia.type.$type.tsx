import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Screen } from "@/components/AppShell";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  fetchEncyclopediaByTypeLocalFirst,
  isDisplayableEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { canonicalEraLabel, eraSortIndex, toCanonicalEra } from "@/lib/era-canonical";
import { isPublicEntity } from "@/lib/taxonomy-public";

const SECTION_LABELS: Record<string, string> = {
  state: "الدول",
  figure: "الشخصيات",
  battle: "المعارك",
  city: "المدن",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_GLYPHS: Record<string, string> = {
  state: "🏛️",
  figure: "🪶",
  battle: "⚔️",
  city: "🏙️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};
const VALID = new Set(Object.keys(SECTION_LABELS));

export const Route = createFileRoute("/encyclopedia/type/$type")({
  head: ({ params }) => {
    const label = SECTION_LABELS[params.type] ?? "الموسوعة";
    return {
      meta: [
        { title: `${label} — الموسوعة التاريخية` },
        { name: "description", content: `تصفّح كل ${label} في عالم إرث.` },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!VALID.has(params.type)) throw notFound();
    return undefined as never;
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

function metaEra(entity: SupabaseEncyclopediaEntity): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string) : "";
}

function TypeBrowsePage() {
  const { type } = Route.useParams();
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string>("");

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["encyclopedia", "type", type, "v2"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity[]> => {
      const rows = await fetchEncyclopediaByTypeLocalFirst(type);
      return rows.filter(isDisplayableEntity).filter(isPublicEntity);
    },
  });

  // Only show eras that (a) map to a canonical era and (b) actually have
  // published entities in this category. Never show "غير محدد".
  const eras = useMemo(() => {
    const set = new Set<string>();
    for (const e of all) {
      const canon = toCanonicalEra(metaEra(e));
      if (canon) set.add(canon);
    }
    return Array.from(set).sort((a, b) => eraSortIndex(a) - eraSortIndex(b));
  }, [all]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return all
      .filter((e) => !era || toCanonicalEra(metaEra(e)) === era)
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.title} ${e.subtitle ?? ""} ${e.summary ?? ""} ${e.slug}`.toLowerCase();
        return hay.includes(q);
      });
  }, [all, q, era]);

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Breadcrumbs
          items={[
            { label: "الرئيسية", to: "/" },
            { label: "الموسوعة", to: "/encyclopedia" },
            { label: SECTION_LABELS[type] },
          ]}
        />
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

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
          <AndroidPlainTextInput
            value={query}
            onValueChange={setQuery}
            commitMode="blur"
            onEnter={setQuery}
            androidEntryKey={`encyclopedia.type.${type}.search`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
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

        {eras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip active={era === ""} onClick={() => setEra("")}>كل العصور</Chip>
            {eras.map((e) => (
              <Chip key={e} active={era === e} onClick={() => setEra(e)}>{canonicalEraLabel(e)}</Chip>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            {all.length === 0 ? "لا توجد عناصر في هذا القسم بعد." : "لا توجد عناصر مطابقة."}
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

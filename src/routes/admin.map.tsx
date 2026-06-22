// /admin/map — Map Administration System (Phase 2.5).
// Place encyclopedia entities on the world map by saving
// metadata.coords {x,y} (+ optional metadata.region) to Supabase.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Save, SkipForward, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { WorldAtlasCanvas, markerId } from "@/components/WorldAtlasCanvas";
import {
  ENTITY_TYPE_AR,
  ENTITY_TYPE_AR_SINGULAR,
  eraLabel,
  extractCoords,
  extractEra,
  type WorldEntity,
  type WorldEntityType,
  type MapCoords,
} from "@/lib/world-map-source";

export const Route = createFileRoute("/admin/map")({
  head: () => ({
    meta: [
      { title: "إدارة الخريطة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminMapPage /></AdminGate>,
});

const REGIONS = [
  "الحجاز", "الشام", "العراق", "مصر", "الأندلس", "المغرب",
  "الأناضول", "فارس", "خراسان", "الهند", "أفريقيا",
];

const TYPE_OPTIONS: WorldEntityType[] = [
  "city", "battle", "figure", "landmark", "artifact", "event", "state",
];

function useAdminEntities() {
  return useQuery({
    queryKey: ["admin-map-entities"],
    staleTime: 30_000,
    queryFn: async (): Promise<WorldEntity[]> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("id,slug,entity_type,title,subtitle,summary,metadata")
        .eq("enabled", true)
        .order("entity_type", { ascending: true })
        .order("title", { ascending: true });
      if (error) { console.warn("[admin-map]", error.message); return []; }
      return (data ?? []) as WorldEntity[];
    },
  });
}

function AdminMapPage() {
  const { data, isLoading } = useAdminEntities();
  const qc = useQueryClient();
  const entities = data ?? [];

  const [typeFilter, setTypeFilter] = useState<WorldEntityType | "all">("all");
  const [eraFilter, setEraFilter] = useState<string | "all">("all");
  const [mapStatus, setMapStatus] = useState<"all" | "mapped" | "unmapped">("unmapped");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftCoords, setDraftCoords] = useState<MapCoords | null>(null);
  const [draftRegion, setDraftRegion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Counts
  const counts = useMemo(() => {
    const total = entities.length;
    let mapped = 0;
    const byType: Record<WorldEntityType, { mapped: number; total: number }> = {
      city: { mapped: 0, total: 0 }, battle: { mapped: 0, total: 0 },
      figure: { mapped: 0, total: 0 }, landmark: { mapped: 0, total: 0 },
      artifact: { mapped: 0, total: 0 }, event: { mapped: 0, total: 0 },
      state: { mapped: 0, total: 0 },
    };
    for (const e of entities) {
      byType[e.entity_type].total++;
      if (extractCoords(e.metadata)) {
        mapped++;
        byType[e.entity_type].mapped++;
      }
    }
    return { total, mapped, missing: total - mapped, byType };
  }, [entities]);

  const eras = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) { const era = extractEra(e.metadata); if (era) s.add(era); }
    return Array.from(s).sort();
  }, [entities]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (typeFilter !== "all" && e.entity_type !== typeFilter) return false;
      if (eraFilter !== "all" && extractEra(e.metadata) !== eraFilter) return false;
      const has = !!extractCoords(e.metadata);
      if (mapStatus === "mapped" && !has) return false;
      if (mapStatus === "unmapped" && has) return false;
      if (q && !e.title.toLowerCase().includes(q) && !e.slug.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entities, typeFilter, eraFilter, mapStatus, search]);

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId],
  );

  // Init draft when selection changes
  useEffect(() => {
    if (!selected) { setDraftCoords(null); setDraftRegion(null); return; }
    setDraftCoords(extractCoords(selected.metadata));
    const r = (selected.metadata as { region?: unknown }).region;
    setDraftRegion(typeof r === "string" ? r : null);
    setStatusMsg(null);
  }, [selected]);

  // All mapped markers visible during editing
  const allMarkers = useMemo(
    () => entities
      .map((e) => {
        const c = extractCoords(e.metadata);
        return c ? { ...e, coords: c } : null;
      })
      .filter((m): m is WorldEntity & { coords: MapCoords } => !!m),
    [entities],
  );

  const coveragePct = counts.total > 0
    ? Math.round((counts.mapped / counts.total) * 1000) / 10
    : 0;

  async function save(advance: boolean) {
    if (!selected || !draftCoords) return;
    setSaving(true); setStatusMsg(null);
    const nextMeta: Record<string, unknown> = {
      ...(selected.metadata as Record<string, unknown>),
      coords: { x: draftCoords.x, y: draftCoords.y },
    };
    if (draftRegion) nextMeta.region = draftRegion;
    else delete nextMeta.region;
    const { error } = await supabase
      .from("encyclopedia_entities")
      .update({ metadata: nextMeta })
      .eq("id", selected.id);
    setSaving(false);
    if (error) { setStatusMsg(`فشل الحفظ: ${error.message}`); return; }
    setStatusMsg("تم الحفظ ✓");
    await qc.invalidateQueries({ queryKey: ["admin-map-entities"] });
    await qc.invalidateQueries({ queryKey: ["world-map-entities"] });
    if (advance) goNextUnmapped();
  }

  function goNextUnmapped() {
    // Pick next unmapped from filtered list, skipping current
    const refreshed = (qc.getQueryData<WorldEntity[]>(["admin-map-entities"]) ?? entities);
    const pool = refreshed.filter((e) =>
      !extractCoords(e.metadata) &&
      (typeFilter === "all" || e.entity_type === typeFilter) &&
      (eraFilter === "all" || extractEra(e.metadata) === eraFilter)
    );
    const next = pool.find((e) => e.id !== selected?.id) ?? null;
    setSelectedId(next?.id ?? null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Link to="/admin" className="text-slate-400 hover:text-amber-300">
            <ChevronLeft className="size-5" />
          </Link>
          <MapPin className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">إدارة الخريطة</h1>
            <p className="text-sm text-slate-400">إدارة المواقع والإحداثيات الجغرافية لعالم إرث.</p>
          </div>
        </header>

        {/* Coverage stats */}
        <section className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Metric label="جاهزية الخريطة" value={`${coveragePct}%`} accent />
            <Metric label="مرسومة" value={counts.mapped} />
            <Metric label="متبقية" value={counts.missing} />
            <Metric label="الإجمالي" value={counts.total} />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-amber-400" style={{ width: `${coveragePct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-7">
            {TYPE_OPTIONS.map((t) => (
              <div key={t} className="rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-2 text-center">
                <p className="text-[11px] text-slate-400">{ENTITY_TYPE_AR[t]}</p>
                <p className="mt-0.5 text-xs">
                  <span className="font-bold text-amber-300">{counts.byType[t].mapped}</span>
                  <span className="text-slate-500"> / {counts.byType[t].total}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Queue */}
          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute right-2 top-2.5 size-3.5 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث (العنوان أو slug)"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 pr-7 text-sm placeholder:text-slate-600"
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["unmapped", "mapped", "all"] as const).map((s) => (
                  <button key={s} onClick={() => setMapStatus(s)}
                    className={`rounded-md border px-2 py-1.5 text-[11px] ${
                      mapStatus === s
                        ? "border-amber-400 bg-amber-500/15 text-amber-200"
                        : "border-slate-800 text-slate-400"
                    }`}>
                    {s === "unmapped" ? "بلا موقع" : s === "mapped" ? "مرسومة" : "الكل"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as WorldEntityType | "all")}
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs">
                  <option value="all">كل الأنواع</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{ENTITY_TYPE_AR[t]}</option>
                  ))}
                </select>
                <select value={eraFilter} onChange={(e) => setEraFilter(e.target.value)}
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs">
                  <option value="all">كل العصور</option>
                  {eras.map((e) => <option key={e} value={e}>{eraLabel(e)}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              {isLoading ? "جارٍ التحميل…" : `${filtered.length} نتيجة`}
            </p>
            <ul className="mt-2 max-h-[520px] overflow-y-auto divide-y divide-slate-800/60">
              {filtered.slice(0, 200).map((e) => {
                const mapped = !!extractCoords(e.metadata);
                const era = extractEra(e.metadata);
                const active = e.id === selectedId;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full px-2 py-2 text-right transition ${
                        active ? "bg-amber-500/10" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{e.title}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                          mapped ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/60 text-slate-400"
                        }`}>{mapped ? "✓" : "—"}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                        {ENTITY_TYPE_AR_SINGULAR[e.entity_type]}
                        {era && ` · ${eraLabel(era)}`}
                        {` · ${e.slug}`}
                      </p>
                    </button>
                  </li>
                );
              })}
              {filtered.length > 200 && (
                <li className="px-2 py-2 text-center text-[11px] text-slate-500">
                  +{filtered.length - 200} نتيجة إضافية — ضيّق البحث
                </li>
              )}
            </ul>
          </aside>

          {/* Editor */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            {!selected ? (
              <div className="grid h-[420px] place-items-center text-slate-500">
                اختر عنصرًا من القائمة للبدء.
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold text-amber-100 truncate">{selected.title}</p>
                    <p className="text-[12px] text-slate-400 truncate">
                      {ENTITY_TYPE_AR_SINGULAR[selected.entity_type]} · {selected.slug}
                    </p>
                  </div>
                  <button onClick={() => setSelectedId(null)}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200">
                    <X className="inline size-3.5 me-1" /> إغلاق
                  </button>
                </div>

                <p className="mb-2 text-[11px] text-amber-200/80">
                  انقر على الخريطة لوضع علامة، أو اسحب العلامة الذهبية لتعديل الموقع.
                </p>

                <WorldAtlasCanvas
                  markers={allMarkers}
                  selectedId={selected ? markerId({ entity_type: selected.entity_type, slug: selected.slug }) : null}
                  onSelect={() => { /* admin selects via list */ }}
                  editMode
                  previewCoords={draftCoords}
                  onPlace={setDraftCoords}
                />

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[11px] text-slate-400">الإحداثيات (x من 0 إلى 100، y من 0 إلى 60)</p>
                    <p className="font-display mt-1 text-sm">
                      {draftCoords
                        ? <>x: <span className="text-amber-300">{draftCoords.x}</span> · y: <span className="text-amber-300">{draftCoords.y}</span></>
                        : <span className="text-slate-500">— لم يُحدَّد موقع —</span>}
                    </p>
                    {draftCoords && (
                      <button
                        onClick={() => setDraftCoords(null)}
                        className="mt-2 text-[11px] text-rose-400 hover:underline"
                      >مسح الموقع</button>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[11px] text-slate-400">المنطقة (اختياري)</p>
                    <select
                      value={draftRegion ?? ""}
                      onChange={(e) => setDraftRegion(e.target.value || null)}
                      className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm"
                    >
                      <option value="">— بدون —</option>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => save(false)}
                    disabled={!draftCoords || saving}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"
                  >
                    <Save className="inline size-4 me-1" /> حفظ
                  </button>
                  <button
                    onClick={() => save(true)}
                    disabled={!draftCoords || saving}
                    className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-bold text-amber-200 disabled:opacity-40"
                  >
                    حفظ والتالي
                  </button>
                  <button
                    onClick={goNextUnmapped}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
                  >
                    <SkipForward className="inline size-4 me-1" /> التالي يحتاج موقع
                  </button>
                  {statusMsg && (
                    <span className={`text-xs ${statusMsg.startsWith("فشل") ? "text-rose-400" : "text-emerald-400"}`}>
                      {statusMsg}
                    </span>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-display text-2xl font-bold ${accent ? "text-amber-300" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

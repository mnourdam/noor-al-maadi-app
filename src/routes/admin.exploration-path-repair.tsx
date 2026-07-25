import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, ShieldCheck, Compass, Save, Eye } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import {
  EXPLORATION_PATHS,
  buildExplorationJourney,
  type ExplorationPathConfig,
} from "@/lib/exploration-paths";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/exploration-path-repair")({
  head: () => ({
    meta: [
      { title: "إصلاح مسارات الاستكشاف — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <Page />
    </AdminGate>
  ),
});

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

type Candidate = {
  slug: string;
  title: string;
  entity_type: string;
  source: string; // human label of where the suggestion came from
};

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const s =
        (typeof o.slug === "string" && o.slug) ||
        (typeof o.id === "string" && o.id) ||
        (typeof o.entity_slug === "string" && o.entity_slug);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}

function stripPrefix(s: string): string {
  const colon = s.includes(":") ? s.split(":").pop()! : s;
  return normalizeEntitySlug(colon);
}

async function loadAnchor(slug: string): Promise<SupabaseEncyclopediaEntity | null> {
  const { data } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  return (data ?? null) as SupabaseEncyclopediaEntity | null;
}

async function gatherCandidates(
  anchor: SupabaseEncyclopediaEntity,
): Promise<Candidate[]> {
  const map = new Map<string, Candidate>();
  const selfSlug = anchor.slug.toLowerCase();
  const meta = (anchor.metadata && typeof anchor.metadata === "object"
    ? (anchor.metadata as Record<string, unknown>)
    : {});

  const candidateSlugs = new Map<string, string>(); // slug -> source

  // 1) Campaign core / supporting entities — any campaign whose lists mention this anchor.
  const { data: camps } = await supabase
    .from("admin_campaigns")
    .select("data")
    .limit(500);
  for (const c of selectCampaignRows(camps ?? [])) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const core = [
      ...asStringList(cm.core_entities),
      ...asStringList(cmeta.core_entities),
    ].map(stripPrefix);
    const sup = [
      ...asStringList(cm.supporting_entities),
      ...asStringList(cmeta.supporting_entities),
    ].map(stripPrefix);
    if (!core.includes(selfSlug) && !sup.includes(selfSlug)) continue;
    for (const s of core) if (s && s !== selfSlug) candidateSlugs.set(s, "حملة (محوري)");
    for (const s of sup) if (s && s !== selfSlug && !candidateSlugs.has(s)) candidateSlugs.set(s, "حملة (داعم)");
  }

  // 2) Reverse geography — entities that point AT this anchor.
  const ors: string[] = [];
  if (anchor.entity_type === "state") {
    ors.push(`metadata->>state.eq.${anchor.slug}`);
    ors.push(`metadata->>affiliation.eq.${anchor.slug}`);
  }
  if (anchor.entity_type === "city") {
    ors.push(`metadata->>city.eq.${anchor.slug}`);
    ors.push(`metadata->>location.eq.${anchor.slug}`);
    ors.push(`metadata->>capital.eq.${anchor.slug}`);
  }
  if (anchor.entity_type === "figure") {
    ors.push(`metadata->>affiliation.eq.${anchor.slug}`);
  }
  if (ors.length > 0) {
    const { data: rev } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", anchor.id)
      .or(ors.join(","))
      .limit(120);
    for (const r of (rev ?? []) as { slug: string }[]) {
      if (!candidateSlugs.has(r.slug)) candidateSlugs.set(r.slug, "ربط جغرافي/انتماء");
    }
  }

  // 3) Atlas family.
  const atlasId = typeof meta.atlas_id === "string" ? meta.atlas_id : "";
  if (atlasId) {
    const { data: atl } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", anchor.id)
      .contains("metadata", { atlas_id: atlasId })
      .limit(80);
    for (const r of (atl ?? []) as { slug: string }[]) {
      if (!candidateSlugs.has(r.slug)) candidateSlugs.set(r.slug, "أطلس مشترك");
    }
  }

  // 4) Entities that explicitly list this anchor in their related_entities/related.
  const { data: backRefs } = await supabase
    .from("encyclopedia_entities")
    .select("slug, metadata")
    .eq("enabled", true)
    .neq("id", anchor.id)
    .or(
      `metadata.cs.{"related_entities":["${anchor.slug}"]},metadata.cs.{"related":["${anchor.slug}"]}`,
    )
    .limit(120);
  for (const r of (backRefs ?? []) as { slug: string }[]) {
    if (!candidateSlugs.has(r.slug)) candidateSlugs.set(r.slug, "روابط مباشرة عكسية");
  }

  if (candidateSlugs.size === 0) return [];

  // Resolve to live entities.
  const { data: rows } = await supabase
    .from("encyclopedia_entities")
    .select("slug,entity_type,title")
    .eq("enabled", true)
    .in("slug", Array.from(candidateSlugs.keys()));
  for (const r of (rows ?? []) as { slug: string; entity_type: string; title: string }[]) {
    map.set(r.slug, {
      slug: r.slug,
      title: r.title,
      entity_type: r.entity_type,
      source: candidateSlugs.get(r.slug) ?? "—",
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.entity_type.localeCompare(b.entity_type) || a.title.localeCompare(b.title, "ar"),
  );
}

function Page() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Compass className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">إصلاح مسارات الاستكشاف</h1>
            <p className="text-sm text-slate-400">
              إضافة <code>metadata.related_entities</code> إلى محاور المسارات الفارغة فقط.
              لا يتم لمس أي كيان آخر. لا توليد محتوى. لا اعتماد عصور كبديل.
            </p>
          </div>
          <Link to="/admin" className="ms-auto text-xs text-amber-300 underline">عودة إلى لوحة الإدارة</Link>
        </header>

        <div className="space-y-5">
          {EXPLORATION_PATHS.map((p) => (
            <AnchorCard key={p.id} config={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnchorCard({ config }: { config: ExplorationPathConfig }) {
  const qc = useQueryClient();
  const slug = config.anchorSlug;

  const anchorQ = useQuery({
    queryKey: ["repair", "anchor", slug],
    queryFn: () => loadAnchor(slug),
    staleTime: 30_000,
  });

  const candQ = useQuery({
    queryKey: ["repair", "candidates", slug, anchorQ.data?.id ?? ""],
    enabled: !!anchorQ.data,
    queryFn: () => (anchorQ.data ? gatherCandidates(anchorQ.data) : Promise.resolve([] as Candidate[])),
    staleTime: 30_000,
  });

  const journeyQ = useQuery({
    queryKey: ["repair", "journey", slug, anchorQ.data?.updated_at ?? ""],
    enabled: !!anchorQ.data,
    queryFn: () => buildExplorationJourney(config),
    staleTime: 5_000,
  });

  const currentRelated: string[] = useMemo(() => {
    const m = (anchorQ.data?.metadata && typeof anchorQ.data.metadata === "object"
      ? (anchorQ.data.metadata as Record<string, unknown>)
      : {});
    return asStringList(m.related_entities).map(stripPrefix).filter(Boolean);
  }, [anchorQ.data]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // initialize selection with current related once loaded
  useMemo(() => {
    if (currentRelated.length > 0 && selected.size === 0) {
      setSelected(new Set(currentRelated));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRelated.join(",")]);

  const candidates = candQ.data ?? [];
  const candidateSlugs = new Set(candidates.map((c) => c.slug));
  const orphanCurrent = currentRelated.filter((s) => !candidateSlugs.has(s));

  const toggle = (s: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const handleSave = async () => {
    if (!anchorQ.data) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const existingMeta = (anchorQ.data.metadata && typeof anchorQ.data.metadata === "object"
        ? (anchorQ.data.metadata as Record<string, unknown>)
        : {});
      const newMeta = {
        ...existingMeta,
        related_entities: Array.from(selected).sort(),
      };
      const { error } = await supabase
        .from("encyclopedia_entities")
        .update({ metadata: newMeta })
        .eq("id", anchorQ.data.id);
      if (error) throw error;
      setSaveMsg("تم الحفظ بنجاح.");
      await qc.invalidateQueries({ queryKey: ["repair", "anchor", slug] });
      await qc.invalidateQueries({ queryKey: ["repair", "journey", slug] });
      await qc.invalidateQueries({ queryKey: ["exploration-path", config.id] });
    } catch (err) {
      setSaveMsg(`فشل الحفظ: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const journeyLen = journeyQ.data?.steps.length ?? 0;

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-amber-500/10 text-2xl">
          {config.glyph ?? "🧭"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-amber-100">{config.title}</h2>
          <p className="text-xs text-slate-400">
            المحور: <code>{slug}</code>
            {anchorQ.data ? (
              <> · {anchorQ.data.title} · {TYPE_LABEL[anchorQ.data.entity_type] ?? anchorQ.data.entity_type}</>
            ) : anchorQ.isLoading ? (
              <> · جارٍ التحميل…</>
            ) : (
              <> · <span className="text-rose-300">المحور غير موجود</span></>
            )}
          </p>
        </div>
        <Link
          to="/encyclopedia/path/$id"
          params={{ id: config.id }}
          className="text-xs text-amber-300 underline"
        >
          فتح المسار
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
          <div className="text-slate-400">طول الرحلة الحالي</div>
          <div className="mt-1 text-lg font-bold text-amber-200">
            {journeyQ.isLoading ? "…" : journeyLen}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
          <div className="text-slate-400">related_entities الحالية</div>
          <div className="mt-1 text-lg font-bold text-amber-200">{currentRelated.length}</div>
          {currentRelated.length > 0 && (
            <div className="mt-1 text-[10px] text-slate-400 break-all">
              {currentRelated.join("، ")}
            </div>
          )}
        </div>
      </div>

      {orphanCurrent.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-300">
          ملاحظة: {orphanCurrent.length} من الروابط الحالية لا تطابق كيانًا مفعّلًا. ستُحفظ كما هي إذا أبقيتها محددة.
        </p>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="size-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-100">المرشحون من بيانات Supabase</h3>
          <span className="text-xs text-slate-400">{candidates.length}</span>
        </div>
        {!anchorQ.data ? (
          <p className="text-xs text-slate-400">لا يمكن جمع المرشحين بدون المحور.</p>
        ) : candQ.isLoading ? (
          <p className="text-xs text-slate-400">جارٍ جمع المرشحين…</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-slate-400">
            لا يوجد مرشحون من الحملات / الأطلس / الإشارات العكسية. لا يمكن البناء تلقائيًا.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/40">
            <ul className="divide-y divide-slate-800">
              {candidates.map((c) => {
                const checked = selected.has(c.slug);
                return (
                  <li key={c.slug} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.slug)}
                      className="size-4 accent-amber-400"
                    />
                    <span className="flex-1">
                      <span className="font-semibold text-slate-100">{c.title}</span>
                      <span className="ms-2 text-slate-500">{TYPE_LABEL[c.entity_type] ?? c.entity_type}</span>
                      <span className="ms-2 text-slate-500">· <code className="text-[10px]">{c.slug}</code></span>
                    </span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                      {c.source}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">المختار: {selected.size}</span>
        <button
          onClick={() => setShowPreview((v) => !v)}
          disabled={!anchorQ.data || selected.size === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-40"
        >
          <Eye className="size-3.5" /> {showPreview ? "إخفاء المعاينة" : "معاينة"}
        </button>
        <button
          onClick={handleSave}
          disabled={!anchorQ.data || saving}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40"
        >
          <Save className="size-3.5" /> {saving ? "جارٍ الحفظ…" : "حفظ related_entities"}
        </button>
        {saveMsg && (
          <span className={`text-xs ${saveMsg.startsWith("تم") ? "text-emerald-300" : "text-rose-300"}`}>
            {saveMsg}
          </span>
        )}
      </div>

      {showPreview && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-slate-950/60 p-3">
          <p className="text-[11px] text-slate-400">
            ستُكتب هذه القيم إلى <code>metadata.related_entities</code> على المحور فقط:
          </p>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs text-slate-200">
            {Array.from(selected).sort().map((s) => {
              const c = candidates.find((x) => x.slug === s);
              return (
                <li key={s}>
                  {c ? (
                    <>
                      <span className="font-semibold">{c.title}</span>{" "}
                      <span className="text-slate-500">({TYPE_LABEL[c.entity_type] ?? c.entity_type})</span>{" "}
                      <code className="text-[10px] text-slate-500">{s}</code>
                    </>
                  ) : (
                    <>
                      <code className="text-[10px]">{s}</code>{" "}
                      <span className="text-rose-300">(ليس كيانًا مفعّلًا — سيتم تجاهله أثناء بناء المسار)</span>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-slate-400">
            بعد الحفظ، سيُعاد بناء المسار تلقائيًا. <ChevronRight className="inline size-3" />
            <Link to="/encyclopedia/path/$id" params={{ id: config.id }} className="text-amber-300 underline">
              تحقق من المسار
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

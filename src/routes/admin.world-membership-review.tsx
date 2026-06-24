// Sprint 1.5 — Historical metadata review surface.
// Read-only audit page: lists encyclopedia entities that lack era/state/world
// metadata, filterable by category, with a suggested hub when confidence
// exists. NEVER auto-publishes — admins must edit and confirm manually.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { WORLD_HUBS, WORLD_ERA } from "@/lib/worlds";

export const Route = createFileRoute("/admin/world-membership-review")({
  head: () => ({
    meta: [
      { title: "مراجعة انتماء العوالم — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ReviewPage />
    </AdminGate>
  ),
});

type EntityRow = {
  id: string;
  slug: string;
  entity_type: string;
  title: string;
  metadata: Record<string, unknown> | null;
};

type HubRow = { slug: string; metadata: Record<string, unknown> | null };

const TYPE_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "figure", label: "شخصيات" },
  { value: "city", label: "مدن" },
  { value: "event", label: "أحداث" },
  { value: "battle", label: "معارك" },
  { value: "landmark", label: "معالم" },
  { value: "artifact", label: "مقتنيات" },
  { value: "scholar", label: "علماء" },
] as const;

function metaStr(m: Record<string, unknown> | null, k: string): string {
  const v = m?.[k];
  return typeof v === "string" ? v : "";
}

function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) {
      const last = x.split(".").pop() ?? x;
      out.push(last.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
    }
  }
  return out;
}

function ReviewPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // 1. All entities that currently fail the membership test.
  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["world-review-entities"],
    staleTime: 60_000,
    queryFn: async (): Promise<EntityRow[]> => {
      const { data } = await supabase
        .from("encyclopedia_entities")
        .select("id,slug,entity_type,title,metadata")
        .eq("enabled", true)
        .in("entity_type", ["figure", "city", "event", "battle", "landmark", "artifact", "scholar"])
        .limit(2000);
      const rows = (data ?? []) as EntityRow[];
      return rows.filter((r) => {
        const m = r.metadata ?? {};
        return (
          !metaStr(m, "era") &&
          !metaStr(m, "state") &&
          !metaStr(m, "affiliation") &&
          !metaStr(m, "world") &&
          !metaStr(m, "worldSlug")
        );
      });
    },
  });

  // 2. Hub related lists, used to suggest a hub for each ⚠ entity.
  const { data: hubs = [] } = useQuery({
    queryKey: ["world-review-hubs"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HubRow[]> => {
      const slugs = WORLD_HUBS.map((h) => h.slug);
      const { data } = await supabase
        .from("encyclopedia_entities")
        .select("slug,metadata")
        .in("slug", slugs)
        .eq("enabled", true);
      return (data ?? []) as HubRow[];
    },
  });

  // Build slug → list of hub claims.
  const suggestionIndex = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of hubs) {
      const all = [
        ...asList((h.metadata as Record<string, unknown>)?.related_entities),
        ...asList((h.metadata as Record<string, unknown>)?.related),
      ];
      for (const s of all) {
        const list = map.get(s) ?? [];
        list.push(h.slug);
        map.set(s, list);
      }
    }
    return map;
  }, [hubs]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return entities;
    return entities.filter((e) => e.entity_type === typeFilter);
  }, [entities, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entities) c[e.entity_type] = (c[e.entity_type] ?? 0) + 1;
    return c;
  }, [entities]);

  return (
    <AdminLayout
      title="مراجعة انتماء العوالم"
      subtitle="كيانات بلا تصنيف تاريخي — لا يتم النشر التلقائي"
      back={{ to: "/admin", label: "لوحة الإدارة" }}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-gold/20 bg-black/30 p-3 text-[12px] text-muted-foreground">
          هذه القائمة تعرض الكيانات التي لا تحمل أي إشارة موثقة إلى عصر أو دولة
          أو عالم. لن تظهر في صفحات العوالم حتى يتم تعيينها يدويًا. الاقتراحات
          مبنية على قوائم <span className="text-gold">related_entities</span>{" "}
          للمحاور فقط — لا يتم التخمين.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((t) => {
            const n = t.value === "all" ? entities.length : counts[t.value] ?? 0;
            const active = typeFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`rounded-full border px-3 py-1 text-[11px] ${
                  active
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-white/15 bg-black/30 text-muted-foreground hover:text-white"
                }`}
              >
                {t.label} <span className="opacity-70">({n})</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-[12px] text-muted-foreground">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            لا توجد كيانات تحتاج مراجعة في هذا التصنيف.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-right text-[12px]">
              <thead className="bg-black/50 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2">العنوان</th>
                  <th className="p-2">النوع</th>
                  <th className="p-2">المعرف</th>
                  <th className="p-2">اقتراح المحور</th>
                  <th className="p-2">الثقة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((e) => {
                  const suggestions = suggestionIndex.get(e.slug) ?? [];
                  const suggestion =
                    suggestions.length === 1 ? suggestions[0] : null;
                  const confidence =
                    suggestions.length === 0
                      ? "—"
                      : suggestions.length === 1
                        ? "explicit"
                        : `multi (${suggestions.length})`;
                  return (
                    <tr key={e.id} className="border-t border-white/5">
                      <td className="p-2">{e.title}</td>
                      <td className="p-2 text-muted-foreground">{e.entity_type}</td>
                      <td className="p-2 font-mono text-[10px] text-muted-foreground">{e.slug}</td>
                      <td className="p-2">
                        {suggestion ? (
                          <Link
                            to="/worlds/$slug"
                            params={{ slug: suggestion }}
                            className="text-gold hover:underline"
                          >
                            {suggestion} ({WORLD_ERA[suggestion] ?? suggestion})
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-[10px] text-muted-foreground">
                        {confidence}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 500 && (
              <p className="border-t border-white/10 p-2 text-center text-[11px] text-muted-foreground">
                عُرضت 500 من أصل {filtered.length}.
              </p>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// World Map data source — single source of truth = Supabase encyclopedia_entities.
// Phase 1: counts, era + type filters, map-capable list, "needs location" list.
// No hardcoded regions, no fake percentages, no legacy pack fallback.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { publicEraLabel, publicEraSortIndex, toPublicEra } from "@/lib/eras-public";
import { supabase } from "@/integrations/supabase/client";

export type WorldEntityType =
  | "city" | "battle" | "figure" | "landmark" | "artifact" | "event" | "state";

export type WorldEntity = {
  id: string;
  slug: string;
  entity_type: WorldEntityType;
  title: string;
  subtitle: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export const ENTITY_TYPE_AR: Record<WorldEntityType, string> = {
  city: "مدن",
  battle: "معارك",
  figure: "شخصيات",
  landmark: "معالم",
  artifact: "آثار",
  event: "أحداث",
  state: "دول",
};

export const ENTITY_TYPE_AR_SINGULAR: Record<WorldEntityType, string> = {
  city: "مدينة",
  battle: "معركة",
  figure: "شخصية",
  landmark: "معلم",
  artifact: "أثر",
  event: "حدث",
  state: "دولة",
};

const ERA_AR: Record<string, string> = {
  "seerah": "السيرة النبوية",
  "prophetic-era": "عصر النبوة",
  "rashidun": "الراشدون",
  "rashidun-era": "الراشدون",
  "rashidun-caliphate": "الخلافة الراشدة",
  "umayyad": "الأمويون",
  "abbasid": "العباسيون",
  "ayyubid": "الأيوبيون",
  "zengid": "الزنكيون",
  "mamluk": "المماليك",
  "seljuk": "السلاجقة",
  "murabitun": "المرابطون",
  "muwahhidun": "الموحدون",
  "andalus": "الأندلس",
  "andalusia": "الأندلس",
  "ottoman": "العثمانيون",
  "modern": "العصر الحديث",
};

// Player-facing era labels come from the unified public taxonomy
// (`src/lib/eras-public.ts`). The legacy ERA_AR map is kept only as a
// last-resort label for admin/debug values that never reach a filter.
export function eraLabel(era: string): string {
  return publicEraLabel(era) || ERA_AR[era] || era;
}

export type MapCoords = { x: number; y: number };

export function extractCoords(meta: Record<string, unknown>): MapCoords | null {
  const c = meta.coords as { x?: number; y?: number } | undefined;
  if (c && typeof c.x === "number" && typeof c.y === "number") return { x: c.x, y: c.y };
  const mx = meta.map_x, my = meta.map_y;
  if (typeof mx === "number" && typeof my === "number") return { x: mx, y: my };
  return null;
}

export function extractEra(meta: Record<string, unknown>): string | null {
  const e = meta.era;
  if (typeof e === "string" && e.trim()) return e;
  return null;
}

export function extractLocation(meta: Record<string, unknown>): string | null {
  const v = meta.location;
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

export function useWorldMapData() {
  return useQuery({
    queryKey: ["world-map-entities"],
    staleTime: 60_000,
    queryFn: async (): Promise<WorldEntity[]> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("id,slug,entity_type,title,subtitle,summary,metadata")
        .eq("enabled", true);
      if (error) {
        console.warn("[world-map] fetch failed", error.message);
        return [];
      }
      return (data ?? []) as WorldEntity[];
    },
  });
}

export type WorldMapDerived = {
  total: number;
  byType: Record<WorldEntityType, number>;
  typesWithData: WorldEntityType[];
  eras: { id: string; label: string; count: number }[];
  mappable: (WorldEntity & { coords: MapCoords })[];
  needsLocation: WorldEntity[];
  mapMetaPercent: number;
};

export function useWorldMapDerived(
  entities: WorldEntity[] | undefined,
  filters: { era: string | null; type: WorldEntityType | null },
): WorldMapDerived {
  return useMemo(() => {
    const all = entities ?? [];
    const byType: Record<WorldEntityType, number> = {
      city: 0, battle: 0, figure: 0, landmark: 0, artifact: 0, event: 0, state: 0,
    };
    const eraCounts = new Map<string, number>();

    for (const e of all) {
      byType[e.entity_type] = (byType[e.entity_type] ?? 0) + 1;
      // Only officially approved, non-hidden eras may appear as a filter.
      const era = toPublicEra(extractEra(e.metadata));
      if (era) eraCounts.set(era, (eraCounts.get(era) ?? 0) + 1);
    }

    const typesWithData = (Object.keys(byType) as WorldEntityType[])
      .filter((t) => byType[t] > 0);

    const eras = Array.from(eraCounts.entries())
      .map(([id, count]) => ({ id, label: publicEraLabel(id), count }))
      .sort((a, b) => publicEraSortIndex(a.id) - publicEraSortIndex(b.id));

    // Apply filters for mappable / needs-location lists
    const filtered = all.filter((e) => {
      if (filters.type && e.entity_type !== filters.type) return false;
      if (filters.era) {
        const era = toPublicEra(extractEra(e.metadata));
        if (era !== filters.era) return false;
      }
      return true;
    });

    const mappable: (WorldEntity & { coords: MapCoords })[] = [];
    const needsLocation: WorldEntity[] = [];
    for (const e of filtered) {
      const c = extractCoords(e.metadata);
      if (c) mappable.push({ ...e, coords: c });
      else needsLocation.push(e);
    }

    const mapCapable = all.reduce(
      (n, e) => (extractCoords(e.metadata) ? n + 1 : n),
      0,
    );
    const mapMetaPercent = all.length
      ? Math.round((mapCapable / all.length) * 100)
      : 0;

    return {
      total: all.length,
      byType,
      typesWithData,
      eras,
      mappable,
      needsLocation,
      mapMetaPercent,
    };
  }, [entities, filters.era, filters.type]);
}

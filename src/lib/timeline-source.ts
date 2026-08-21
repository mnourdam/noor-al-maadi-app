// ============================================================
// Timeline data source — Supabase primary, legacy fallback.
//
// Reads encyclopedia_entities rows that carry timeline metadata
// (timeline_year, timeline_start_year/end, timeline_category) and
// maps them to the existing TimelineBand / TimelinePoint shapes
// used by /timeline. Adding/editing/disabling an encyclopedia
// entity automatically reshapes the Great Timeline.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Era, TimelineBand, TimelinePoint, TimelineLane } from "@/lib/timeline";

type TimelineRow = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  summary: string | null;
  subtitle: string | null;
  metadata: any;
  enabled: boolean;
  timeline_year: number | null;
  timeline_start_year: number | null;
  timeline_end_year: number | null;
  timeline_hijri: string | null;
  timeline_order: number | null;
  timeline_category: string | null;
  timeline_tone: string | null;
  timeline_glyph: string | null;
};

const SELECT_COLS =
  "id,entity_type,slug,title,summary,subtitle,metadata,enabled," +
  "timeline_year,timeline_start_year,timeline_end_year,timeline_hijri," +
  "timeline_order,timeline_category,timeline_tone,timeline_glyph";

function defaultCategory(entityType: string): TimelineLane | null {
  switch (entityType) {
    case "state":    return "caliphate";
    case "figure":   return "figure";
    case "battle":   return "battle";
    case "artifact": return "book";
    case "event":    return "event";
    case "city":     return "event";
    case "landmark": return "event";
    default:         return null;
  }
}

function toneFromEra(era: string | null | undefined): TimelineBand["tone"] {
  switch (era) {
    case "seerah":   return "gold";
    case "rashidun": return "emerald";
    case "umayyad":  return "sky";
    case "abbasid":  return "violet";
    case "andalus":  return "rose";
    case "seljuk":   return "indigo";
    case "ayyubid":  return "amber";
    case "mamluk":   return "gold";
    case "ottoman":  return "emerald";
    case "modern":   return "sand";
    default:         return "sand";
  }
}

function defaultGlyph(entityType: string): string {
  switch (entityType) {
    case "battle":   return "⚔️";
    case "city":     return "🏛️";
    case "landmark": return "🏰";
    case "artifact": return "📜";
    case "event":    return "✦";
    default:         return "✦";
  }
}

function rowEra(r: TimelineRow): string | null {
  const md = r.metadata as any;
  return md?.era ?? md?.bridges?.era ?? null;
}

function rowHref(r: TimelineRow): string {
  return `/encyclopedia/entity/${r.slug}`;
}

function rowToneFor(r: TimelineRow): TimelineBand["tone"] {
  if (r.timeline_tone) return r.timeline_tone as TimelineBand["tone"];
  const md = r.metadata as any;
  if (md?.tone) return md.tone as TimelineBand["tone"];
  return toneFromEra(rowEra(r));
}

function rowGlyphFor(r: TimelineRow): string {
  if (r.timeline_glyph) return r.timeline_glyph;
  const md = r.metadata as any;
  if (md?.glyph) return md.glyph as string;
  return defaultGlyph(r.entity_type);
}

function rowCategory(r: TimelineRow): TimelineLane | null {
  if (r.timeline_category) {
    const c = r.timeline_category;
    if (c === "caliphate" || c === "figure" || c === "battle" || c === "book" || c === "event") {
      return c;
    }
  }
  return defaultCategory(r.entity_type);
}

/** Fetch all enabled entities that participate in the timeline (single query). */
function useTimelineRows() {
  return useQuery({
    queryKey: ["timeline-entities"],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<TimelineRow[]> => {
      try {
        const { data, error } = await (supabase as any)
          .from("encyclopedia_entities")
          .select(SELECT_COLS)
          .eq("enabled", true)
          .or("timeline_year.not.is.null,timeline_start_year.not.is.null");
        if (error) {
          if (typeof console !== "undefined")
            console.warn("[timeline-source] fetch failed", error.message);
          return [];
        }
        return (data as TimelineRow[] | null) ?? [];
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[timeline-source] fetch crashed", e);
        return [];
      }
    },
  });
}

/** Supabase-backed timeline bands (caliphate + figure lifespans). */
export function useTimelineBands() {
  const q = useTimelineRows();
  const bands = useMemo<TimelineBand[]>(() => {
    const out: TimelineBand[] = [];
    for (const r of q.data ?? []) {
      const start = r.timeline_start_year;
      const end = r.timeline_end_year;
      if (start == null || end == null || end <= start) continue;
      const cat = rowCategory(r);
      if (cat !== "caliphate" && cat !== "figure") continue;
      const era = rowEra(r);
      out.push({
        id: `sb-${r.id}`,
        lane: cat,
        label: r.title,
        sub: r.subtitle ?? undefined,
        start,
        end,
        era: (era ?? undefined) as Era | undefined,
        href: rowHref(r),
        tone: rowToneFor(r),
      });
    }
    // stable ordering within a lane
    out.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label, "ar"));
    return out;
  }, [q.data]);
  return { bands, isLoading: q.isLoading, isError: q.isError };
}

/** Supabase-backed timeline points (battle / book / event). */
export function useTimelinePoints() {
  const q = useTimelineRows();
  const points = useMemo<TimelinePoint[]>(() => {
    const out: TimelinePoint[] = [];
    for (const r of q.data ?? []) {
      const year = r.timeline_year;
      if (year == null) continue;
      const cat = rowCategory(r);
      if (cat !== "battle" && cat !== "book" && cat !== "event") continue;
      const era = rowEra(r);
      out.push({
        id: `sb-${r.id}`,
        lane: cat,
        year,
        label: r.title,
        hint: r.summary ?? r.subtitle ?? undefined,
        era: (era ?? undefined) as Era | undefined,
        href: rowHref(r),
        tone: rowToneFor(r),
        glyph: rowGlyphFor(r),
      });
    }
    out.sort(
      (a, b) =>
        a.year - b.year ||
        a.lane.localeCompare(b.lane) ||
        a.label.localeCompare(b.label, "ar"),
    );
    return out;
  }, [q.data]);
  return { points, isLoading: q.isLoading, isError: q.isError };
}

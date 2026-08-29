// ============================================================
// Analytics — client helpers
//
// All aggregation happens server-side via SECURITY DEFINER RPCs
// (analytics_overview, analytics_content_health, analytics_atlas,
// analytics_system_health, analytics_timeseries). The client never
// counts rows itself and never bypasses RLS.
//
// The timeseries RPC dispatches on a `metric` name so future
// telemetry (button_clicks, content_views, retention, funnels) can
// plug in without touching the client contract.
// ============================================================
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RangeKey =
  | "today" | "yesterday" | "last_7d" | "last_30d"
  | "last_90d" | "this_year" | "all_time" | "custom";

export interface TimeRange {
  key: RangeKey;
  label: string;
  from: Date;
  to: Date;
  bucket: "hour" | "day" | "week" | "month";
}

const day = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function resolveRange(key: RangeKey, customFrom?: string, customTo?: string): TimeRange {
  const now = new Date();
  const today = startOfToday();
  switch (key) {
    case "today":
      return { key, label: "اليوم", from: today, to: now, bucket: "hour" };
    case "yesterday": {
      const from = new Date(today.getTime() - day);
      return { key, label: "أمس", from, to: today, bucket: "hour" };
    }
    case "last_7d":
      return { key, label: "آخر 7 أيام", from: new Date(now.getTime() - 7 * day), to: now, bucket: "day" };
    case "last_30d":
      return { key, label: "آخر 30 يومًا", from: new Date(now.getTime() - 30 * day), to: now, bucket: "day" };
    case "last_90d":
      return { key, label: "آخر 90 يومًا", from: new Date(now.getTime() - 90 * day), to: now, bucket: "week" };
    case "this_year": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { key, label: "هذه السنة", from, to: now, bucket: "month" };
    }
    case "custom": {
      const from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 30 * day);
      const to = customTo ? new Date(customTo) : now;
      const span = to.getTime() - from.getTime();
      const bucket: TimeRange["bucket"] =
        span <= 2 * day ? "hour" : span <= 60 * day ? "day" : span <= 365 * day ? "week" : "month";
      return { key, label: "نطاق مخصّص", from, to, bucket };
    }
    case "all_time":
    default:
      return { key: "all_time", label: "منذ البداية", from: new Date(2024, 0, 1), to: now, bucket: "month" };
  }
}

// ── RPC wrappers ───────────────────────────────────────────────
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface OverviewData {
  is_manager: boolean;
  users: Record<string, number>;
}
export interface ContentHealthData {
  campaigns: Record<string, number>;
  encyclopedia: Record<string, number>;
  investigations: Record<string, number>;
  today_in_history: Record<string, number>;
  daily_facts: Record<string, number>;
  integrity: Record<string, number>;
}
export interface AtlasAnalyticsData {
  totals: Record<string, number>;
  eligible_encyclopedia: number;
  coverage_pct: number;
  by_kind: Record<string, number>;
  by_era: Record<string, number>;
}
export interface SystemHealthData {
  missing_encyclopedia_links: number;
  duplicate_atlas_slugs: number;
  duplicate_encyclopedia_slugs: number;
}
export interface SeriesPoint { t: string; v: number }
export interface SeriesData { metric: string; bucket: string; points: SeriesPoint[] }

export const analyticsKeys = {
  overview: () => ["analytics", "overview"] as const,
  content:  () => ["analytics", "content"]  as const,
  atlas:    () => ["analytics", "atlas"]    as const,
  system:   () => ["analytics", "system"]   as const,
  series:   (metric: string, r: TimeRange) =>
    ["analytics", "series", metric, r.from.toISOString(), r.to.toISOString(), r.bucket] as const,
};

export const overviewQuery = () => queryOptions({
  queryKey: analyticsKeys.overview(),
  queryFn: () => rpc<OverviewData>("analytics_overview"),
  staleTime: 30_000,
});
export const contentHealthQuery = () => queryOptions({
  queryKey: analyticsKeys.content(),
  queryFn: () => rpc<ContentHealthData>("analytics_content_health"),
  staleTime: 60_000,
});
export const atlasQuery = () => queryOptions({
  queryKey: analyticsKeys.atlas(),
  queryFn: () => rpc<AtlasAnalyticsData>("analytics_atlas"),
  staleTime: 60_000,
});
export const systemHealthQuery = () => queryOptions({
  queryKey: analyticsKeys.system(),
  queryFn: () => rpc<SystemHealthData>("analytics_system_health"),
  staleTime: 60_000,
});
export const seriesQuery = (metric: "new_users" | "active_users", r: TimeRange) => queryOptions({
  queryKey: analyticsKeys.series(metric, r),
  queryFn: () => rpc<SeriesData>("analytics_timeseries", {
    p_metric: metric,
    p_from: r.from.toISOString(),
    p_to: r.to.toISOString(),
    p_bucket: r.bucket,
  }),
  staleTime: 60_000,
});

// ── V16 engagement + content performance ───────────────────────
// One bounded server-side aggregate. Distinguishes HISTORICAL EVENT
// counts (inside the selected range) from CURRENT STATE totals.
export interface RankedItem { id: string; title: string; completions?: number; players?: number; discoveries?: number }
export interface EngagementData {
  range: { from: string; to: string };
  events: Record<string, number>;
  state: Record<string, number>;
  top_stories: RankedItem[];
  top_campaigns: RankedItem[];
  top_entities: RankedItem[];
}

export const engagementQuery = (r: TimeRange) => queryOptions({
  queryKey: ["analytics", "engagement", r.from.toISOString(), r.to.toISOString()] as const,
  queryFn: () => rpc<EngagementData>("analytics_engagement_v16", {
    p_from: r.from.toISOString(),
    p_to: r.to.toISOString(),
  }),
  staleTime: 60_000,
  retry: false,
});

// ============================================================
// Campaign unlock resolver
// ------------------------------------------------------------
// Imported campaigns carry unlock IDs in the form `type:slug`
// (e.g. "figure:prophet-muhammad", "artifact:cave-of-hira").
// This module parses them and resolves the Arabic display name
// from `encyclopedia_entities`, so users never see raw IDs.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";

export type ParsedUnlock = {
  raw: string;
  /** Normalized entity_type for encyclopedia_entities (figure/city/battle/state/event/landmark/artifact). */
  type: string | null;
  /** Normalized slug, or null if unparseable. */
  slug: string | null;
};

const TYPE_ALIASES: Record<string, string> = {
  figure: "figure", character: "figure", person: "figure", scholar: "figure",
  city: "city", landmark: "landmark", place: "city",
  battle: "battle",
  state: "state", dynasty: "state", era: "state",
  event: "event",
  artifact: "artifact", relic: "artifact",
};

const TYPE_LABEL: Record<string, string> = {
  figure: "شخصية",
  city: "مدينة",
  landmark: "معلم",
  battle: "معركة",
  state: "دولة",
  event: "حدث",
  artifact: "أثر",
};

export function typeLabel(type: string | null | undefined): string {
  if (!type) return "عنصر";
  return TYPE_LABEL[type] ?? "عنصر";
}

export function parseUnlockId(raw: string): ParsedUnlock {
  if (!raw || typeof raw !== "string") return { raw: String(raw ?? ""), type: null, slug: null };
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0) {
    return { raw: trimmed, type: null, slug: normalizeEntitySlug(trimmed) || null };
  }
  const rawType = trimmed.slice(0, idx).toLowerCase().trim();
  const rest = trimmed.slice(idx + 1);
  return {
    raw: trimmed,
    type: TYPE_ALIASES[rawType] ?? null,
    slug: normalizeEntitySlug(rest) || null,
  };
}

type EncRow = {
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  metadata: unknown;
};

export type ResolvedUnlock = ParsedUnlock & {
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  found: boolean;
};

/**
 * Resolve a list of unlock IDs to encyclopedia_entities (title + summary).
 * Single query batched by slug. Safe when signed out.
 */
export function useResolvedUnlocks(ids: string[] | undefined | null) {
  const parsed = useMemo(() => (ids ?? []).map(parseUnlockId), [ids?.join("|")]);

  const slugs = useMemo(
    () => Array.from(new Set(parsed.map(p => p.slug).filter((s): s is string => !!s))),
    [parsed],
  );

  const query = useQuery({
    queryKey: ["campaign-unlocks", slugs.join("|")],
    enabled: slugs.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("entity_type, slug, title, subtitle, summary, metadata")
          .in("slug", slugs)
          .eq("enabled", true);
        if (error) return [] as Array<EncRow>;
        return (data ?? []) as Array<EncRow>;
      } catch {
        return [] as Array<EncRow>;
      }
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, EncRow>();
    for (const r of query.data ?? []) {
      m.set(`${r.entity_type}:${r.slug}`, r);
      if (!m.has(`:${r.slug}`)) m.set(`:${r.slug}`, r);
    }
    return m;
  }, [query.data]);

  const resolved: ResolvedUnlock[] = useMemo(
    () => parsed.map(p => {
      const keyed = p.type && p.slug ? byKey.get(`${p.type}:${p.slug}`) : undefined;
      const looseSlug = !keyed && p.slug ? byKey.get(`:${p.slug}`) : undefined;
      const hit = keyed ?? looseSlug;
      return {
        ...p,
        type: hit?.entity_type ?? p.type,
        title: hit?.title ?? null,
        subtitle: hit?.subtitle ?? null,
        summary: hit?.summary ?? null,
        metadata: (hit?.metadata as Record<string, unknown> | null) ?? null,
        found: !!hit,
      };
    }),
    [parsed, byKey],
  );

  return { resolved, isLoading: query.isLoading };
}

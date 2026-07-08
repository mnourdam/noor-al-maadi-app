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
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import { ensureLocalSnapshotLoaded, localEncyclopediaAll, localEncyclopediaBySlug } from "@/lib/local-first-store";

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
  body: unknown;
  metadata: unknown;
  enabled?: boolean;
};

export type ResolvedUnlock = ParsedUnlock & {
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  found: boolean;
};

import { pickCanonicalEntity } from "./encyclopedia-source";

/**
 * Resolve a list of unlock IDs to encyclopedia_entities. For each id we
 * fetch every row sharing its slug (or aliased by raw id via
 * metadata.aliases) and pick the canonical (richest) one — so a sparse
 * `artifact:cave-of-hira` falls through to the rich `landmark:cave-of-hira`.
 */
export function useResolvedUnlocks(ids: string[] | undefined | null) {
  const parsed = useMemo(() => (ids ?? []).map(parseUnlockId), [ids?.join("|")]);

  const slugs = useMemo(
    () => Array.from(new Set(parsed.map(p => p.slug).filter((s): s is string => !!s))),
    [parsed],
  );
  const rawIds = useMemo(
    () =>
      Array.from(
        new Set(
          parsed
            .map(p => p.raw)
            .filter(r => r && !slugs.includes(r)),
        ),
      ),
    [parsed, slugs],
  );

  const query = useQuery({
    queryKey: ["campaign-unlocks", slugs.join("|"), rawIds.join("|")],
    enabled: slugs.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      try {
        const seen = new Set<string>();
        const rows: EncRow[] = [];
        const push = (data: unknown) => {
          for (const r of (data as (EncRow & { id?: string })[]) ?? []) {
            const k = `${r.entity_type}:${r.slug}`;
            if (!seen.has(k)) {
              seen.add(k);
              rows.push(r);
            }
          }
        };
        await ensureLocalSnapshotLoaded();
        push(slugs.flatMap((slug) => {
          const hit = localEncyclopediaBySlug(slug) as EncRow | null;
          return hit && hit.enabled !== false ? [hit] : [];
        }));
        for (const raw of rawIds) {
          push((localEncyclopediaAll() as EncRow[]).filter((r) => {
            if (r?.enabled === false) return false;
            const aliases = (r.metadata as { aliases?: unknown } | null)?.aliases;
            return Array.isArray(aliases) && aliases.includes(raw);
          }));
        }
        return rows;
      } catch {
        return [] as EncRow[];
      }
    },
  });

  const bySlug = useMemo(() => {
    const m = new Map<string, EncRow[]>();
    for (const r of query.data ?? []) {
      const arr = m.get(r.slug) ?? [];
      arr.push(r);
      m.set(r.slug, arr);
    }
    return m;
  }, [query.data]);

  const byAlias = useMemo(() => {
    const m = new Map<string, EncRow>();
    for (const r of query.data ?? []) {
      const aliases = (r.metadata as { aliases?: unknown } | null)?.aliases;
      if (Array.isArray(aliases)) {
        for (const a of aliases) if (typeof a === "string") m.set(a, r);
      }
    }
    return m;
  }, [query.data]);

  const resolved: ResolvedUnlock[] = useMemo(
    () => parsed.map(p => {
      const matches = p.slug ? bySlug.get(p.slug) ?? [] : [];
      let hit = pickCanonicalEntity(matches, p.type);
      if (!hit && p.raw) hit = byAlias.get(p.raw) ?? null;
      return {
        ...p,
        type: hit?.entity_type ?? p.type,
        slug: hit?.slug ?? p.slug,
        title: hit?.title ?? null,
        subtitle: hit?.subtitle ?? null,
        summary: hit?.summary ?? null,
        metadata: (hit?.metadata as Record<string, unknown> | null) ?? null,
        found: !!hit,
      };
    }),
    [parsed, bySlug, byAlias],
  );

  return { resolved, isLoading: query.isLoading };
}


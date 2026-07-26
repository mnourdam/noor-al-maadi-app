import { readRedirectTargetId } from "@/lib/encyclopedia-canonical";
import {
  isDisplayableEntity,
  isRedirectedOrArchivedEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { isPublicEntity } from "@/lib/taxonomy-public";

export type EncyclopediaScoredResult = {
  e: SupabaseEncyclopediaEntity;
  s: number;
};

export function mergeEncyclopediaRowsById(
  local: SupabaseEncyclopediaEntity[],
  live: SupabaseEncyclopediaEntity[] | null,
): SupabaseEncyclopediaEntity[] {
  const byId = new Map<string, SupabaseEncyclopediaEntity>();
  for (const row of local) if (row?.id) byId.set(row.id, row);
  for (const row of live ?? []) if (row?.id) byId.set(row.id, row);
  return Array.from(byId.values());
}

type CanonicalSearchOptions = {
  rows: SupabaseEncyclopediaEntity[];
  query: string;
  authoritativeIds?: ReadonlySet<string> | null;
  typeFilter?: string;
  eraFilter?: string;
  getEra?: (entity: SupabaseEncyclopediaEntity) => string | null | undefined;
  includeUnscored?: boolean;
  max?: number;
};

function asMeta(entity: { metadata?: unknown } | null | undefined): Record<string, unknown> {
  const m = entity?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeArabicSearch(s: string): string {
  return s.toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

/**
 * Pre-normalized search surface for one entity. Building this once per row
 * (at index build time) instead of once per keystroke is the difference
 * between a 2000-row search costing ~40ms and costing <2ms.
 */
export type EntityHaystack = {
  title: string;
  subtitle: string;
  summary: string;
  slug: string;
  aliases: string[];
  titleLen: number;
};

export function buildEntityHaystack(e: SupabaseEncyclopediaEntity): EntityHaystack {
  const meta = asMeta(e);
  const metaAliases = Array.isArray((meta as { aliases?: unknown }).aliases)
    ? ((meta as { aliases: unknown[] }).aliases.filter((a) => typeof a === "string") as string[])
    : [];
  const colAliases = Array.isArray(e.aliases)
    ? (e.aliases.filter((a) => typeof a === "string") as string[])
    : [];
  const aliases: string[] = [...colAliases, ...metaAliases];
  const mergedFrom = Array.isArray((meta as { merged_from?: unknown }).merged_from)
    ? (meta as { merged_from: unknown[] }).merged_from
    : [];
  for (const item of mergedFrom) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.title === "string") aliases.push(record.title);
    if (typeof record.slug === "string") aliases.push(record.slug);
  }
  const redirectFrom = Array.isArray((meta as { redirect_from?: unknown }).redirect_from)
    ? (meta as { redirect_from: unknown[] }).redirect_from
    : [];
  for (const item of redirectFrom) {
    if (typeof item === "string") aliases.push(item);
  }
  const title = normalizeArabicSearch(e.title ?? "");
  const normalizedAliases = Array.from(
    new Set(aliases.map((a) => normalizeArabicSearch(a)).filter((a) => a.length > 0)),
  );
  return {
    title,
    subtitle: normalizeArabicSearch(e.subtitle ?? ""),
    summary: normalizeArabicSearch(e.summary ?? ""),
    slug: normalizeArabicSearch(e.slug ?? ""),
    aliases: normalizedAliases,
    titleLen: Math.min(title.length, 60),
  };
}

/** Score a pre-normalized haystack against an already-normalized query. */
export function scoreHaystack(h: EntityHaystack, nq: string): number {
  if (!nq) return 0;
  const wordStart = new RegExp(`(^|\\s)${escapeRegExp(nq)}`);
  let score = 0;
  if (h.title === nq) score += 1000;
  else if (h.title.startsWith(nq)) score += 600;
  else if (wordStart.test(h.title)) score += 450;
  else if (h.title.includes(nq)) score += 300;
  let bestAlias = 0;
  for (const a of h.aliases) {
    let s = 0;
    if (a === nq) s = 900;
    else if (a.startsWith(nq)) s = 550;
    else if (wordStart.test(a)) s = 420;
    else if (a.includes(nq)) s = 260;
    if (s > bestAlias) bestAlias = s;
  }
  if (bestAlias > 0) score = Math.max(score, bestAlias);
  if (h.subtitle.includes(nq)) score += 120;
  if (h.slug.includes(nq)) score += 80;
  if (h.summary.includes(nq)) score += 40;
  score -= h.titleLen * 0.2;
  return score;
}

export function scoreEncyclopediaEntity(e: SupabaseEncyclopediaEntity, nq: string): number {
  if (!nq) return 0;
  return scoreHaystack(buildEntityHaystack(e), nq);
}


function resolveCanonicalFromRows(
  input: SupabaseEncyclopediaEntity,
  byId: ReadonlyMap<string, SupabaseEncyclopediaEntity>,
): SupabaseEncyclopediaEntity | null {
  const seen = new Set<string>();
  let current: SupabaseEncyclopediaEntity | null = input;
  for (let hops = 0; current && hops < 16; hops++) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const targetId = readRedirectTargetId(current);
    if (!targetId) return current;
    const next = byId.get(targetId) ?? null;
    if (!next) return null;
    current = next;
  }
  return null;
}

function isFinalPublicSearchEntity(
  entity: SupabaseEncyclopediaEntity | null | undefined,
  authoritativeIds?: ReadonlySet<string> | null,
): entity is SupabaseEncyclopediaEntity {
  if (!entity) return false;
  if (authoritativeIds && !authoritativeIds.has(entity.id)) return false;
  if (entity.enabled === false) return false;
  if (readRedirectTargetId(entity)) return false;
  if (isRedirectedOrArchivedEntity(entity)) return false;

  const meta = asMeta(entity);
  if (meta.archived === true || meta.hidden_duplicate === true) return false;
  if (meta.inactive === true || meta.disabled === true) return false;
  if (meta.public === false || meta.is_public === false || meta.non_public === true) return false;
  const status = typeof meta.status === "string" ? meta.status.trim().toLowerCase() : "";
  if (["archived", "draft", "private", "inactive", "disabled"].includes(status)) return false;
  const visibility = typeof meta.visibility === "string" ? meta.visibility.trim().toLowerCase() : "";
  if (["private", "admin", "draft", "hidden"].includes(visibility)) return false;

  return isDisplayableEntity(entity) && isPublicEntity(entity);
}

/**
 * Final public search pipeline. Every raw candidate is resolved first, then
 * filtered, deduplicated by resolvedCanonicalEntity.id, sorted and rendered.
 */
export function buildCanonicalizedEncyclopediaSearch({
  rows,
  query,
  authoritativeIds = null,
  typeFilter = "all",
  eraFilter = "",
  getEra,
  includeUnscored = false,
  max,
}: CanonicalSearchOptions): EncyclopediaScoredResult[] {
  const nq = normalizeArabicSearch(query.trim());
  const byId = new Map<string, SupabaseEncyclopediaEntity>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }

  const bestByCanonicalId = new Map<string, EncyclopediaScoredResult>();
  for (const raw of rows) {
    if (!raw?.id) continue;
    const score = nq ? scoreEncyclopediaEntity(raw, nq) : 0;
    if (nq ? score <= 0 : !includeUnscored) continue;

    const resolved = resolveCanonicalFromRows(raw, byId);
    if (!isFinalPublicSearchEntity(resolved, authoritativeIds)) continue;
    if (typeFilter !== "all" && resolved.entity_type !== typeFilter) continue;
    if (eraFilter && getEra && getEra(resolved) !== eraFilter) continue;

    const prev = bestByCanonicalId.get(resolved.id);
    if (!prev || score > prev.s) {
      bestByCanonicalId.set(resolved.id, { e: resolved, s: score });
    }
  }

  const sorted = Array.from(bestByCanonicalId.values()).sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    return String(a.e.title ?? "").localeCompare(String(b.e.title ?? ""), "ar");
  });
  return typeof max === "number" ? sorted.slice(0, max) : sorted;
}

export function exactTopMatchTarget(
  e: SupabaseEncyclopediaEntity,
  nq: string,
): { to: "/encyclopedia/state/$id" | "/encyclopedia/entity/$id"; id: string } | null {
  if (!nq) return null;
  const title = normalizeArabicSearch(e.title ?? "");
  const meta = asMeta(e);
  const metaAliases = Array.isArray((meta as { aliases?: unknown }).aliases)
    ? ((meta as { aliases: unknown[] }).aliases.filter((a) => typeof a === "string") as string[])
    : [];
  const colAliases = Array.isArray(e.aliases)
    ? (e.aliases.filter((a) => typeof a === "string") as string[])
    : [];
  const aliases: string[] = Array.from(new Set([...colAliases, ...metaAliases]));
  const exactAlias = aliases.some((a) => normalizeArabicSearch(a) === nq);
  if (title === nq || exactAlias) {
    return {
      to: e.entity_type === "state" ? "/encyclopedia/state/$id" : "/encyclopedia/entity/$id",
      id: e.slug,
    };
  }
  return null;
}
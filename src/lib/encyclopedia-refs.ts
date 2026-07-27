// ============================================================
// Encyclopedia reference resolver — investigation `related_entities`
// ------------------------------------------------------------
// Related entity strings come in several shapes:
//   • bare slug        e.g. "muhammad"
//   • typed slug       e.g. "figure:muhammad"
//   • uuid             e.g. "f1a2..."
//   • legacy id / alias
//
// Historically the UI called `displayName(rawRef)` which had no
// encyclopedia awareness, so every ref fell back to the generic
// label "مرجع تاريخي" or the raw slug. This module resolves each
// ref against the offline snapshot, follows canonical redirects,
// deduplicates by canonical id, and returns a stable label +
// linkable id for the entity route.
// ============================================================

import {
  localEncyclopediaById,
  localEncyclopediaBySlug,
} from "@/lib/local-first-store";
import { resolveCanonicalLocal } from "@/lib/encyclopedia-canonical";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";

const TYPE_LABEL_AR: Record<string, string> = {
  figure: "شخصية",
  scholar: "عالم",
  state: "دولة",
  city: "مدينة",
  battle: "معركة",
  event: "حدث",
  landmark: "معلم",
  artifact: "أثر",
};

export type ResolvedEncyclopediaRef = {
  /** Original raw ref as provided by the investigation row. */
  raw: string;
  /** Canonical entity id (uuid) if resolved; otherwise null. */
  canonicalId: string | null;
  /** Canonical slug if resolved; otherwise null. */
  canonicalSlug: string | null;
  /** Best-effort Arabic type label ("شخصية", "معركة", …) or empty. */
  typeLabel: string;
  /** Canonical entity type slug ("figure", "battle", …) or empty. Drives icons. */
  entityType: string;

  /** Full display label ("شخصية · محمد ﷺ" or the entity title). */
  label: string;
  /** Whether the reference was successfully resolved to a real entity. */
  resolved: boolean;
  /** Route id/slug to use in `<Link params={{ id }}>`. Falls back to `raw`. */
  linkId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-session set of unresolved refs so a broken reference is logged
// exactly once per app load. Admins reading the console (or a wired
// diagnostics sink) can spot dangling refs without page-flood noise.
const BROKEN_REFS_SEEN = new Set<string>();
function logBrokenRef(raw: string): void {
  if (BROKEN_REFS_SEEN.has(raw)) return;
  BROKEN_REFS_SEEN.add(raw);
  try {
    // eslint-disable-next-line no-console
    console.warn("[encyclopedia-refs] unresolved related_entity:", raw);
  } catch { /* ignore */ }
}
export function getBrokenEncyclopediaRefs(): string[] {
  return [...BROKEN_REFS_SEEN];
}

export function resolveRelatedRef(rawInput: string): ResolvedEncyclopediaRef {
  const raw = String(rawInput ?? "").trim();
  const base: ResolvedEncyclopediaRef = {
    raw,
    canonicalId: null,
    canonicalSlug: null,
    typeLabel: "",
    entityType: "",

    label: "",
    resolved: false,
    linkId: raw,
  };
  if (!raw) return base;

  // Split typed prefix ("figure:muhammad") from the tail.
  let typeHint: string | null = null;
  let tail = raw;
  const idx = raw.indexOf(":");
  if (idx > 0) {
    typeHint = raw.slice(0, idx).toLowerCase();
    tail = raw.slice(idx + 1);
  }
  const normSlug = normalizeEntitySlug(tail);

  // 1. UUID lookup first (raw or tail).
  let hit =
    (UUID_RE.test(raw) ? localEncyclopediaById(raw) : null) ??
    (UUID_RE.test(tail) ? localEncyclopediaById(tail) : null) ??
    null;

  // 2. Typed slug lookup.
  if (!hit && typeHint && normSlug) hit = localEncyclopediaBySlug(normSlug, typeHint);
  // 3. Bare slug lookup.
  if (!hit && normSlug) hit = localEncyclopediaBySlug(normSlug);
  // 4. Alias / legacy id lookup.
  if (!hit) hit = localEncyclopediaById(tail) ?? localEncyclopediaById(raw);

  if (!hit) {
    // Unresolved — log once per raw ref for admin diagnostics so
    // broken references surface in dev/console without spamming.
    logBrokenRef(raw);
    // Fall back to a stable typed label so we never render the raw
    // slug or a generic placeholder for every ref.
    const t = typeHint ? TYPE_LABEL_AR[typeHint] ?? "" : "";
    return {
      ...base,
      typeLabel: t,
      label: t ? `${t} · ${tail}` : tail || "مرجع تاريخي",
    };
  }

  const canon =
    (resolveCanonicalLocal(hit as unknown as Parameters<typeof resolveCanonicalLocal>[0]) as
      | Record<string, unknown>
      | null) ?? (hit as Record<string, unknown>);
  const type = String((canon as { entity_type?: unknown }).entity_type ?? typeHint ?? "").toLowerCase();
  const typeLabel = TYPE_LABEL_AR[type] ?? "";
  const title = String((canon as { title?: unknown }).title ?? "").trim();
  const label = title
    ? (typeLabel ? `${typeLabel} · ${title}` : title)
    : (typeLabel || "مرجع تاريخي");

  return {
    raw,
    canonicalId: (canon.id as string | undefined) ?? null,
    canonicalSlug: (canon.slug as string | undefined) ?? null,
    typeLabel,
    entityType: type,

    label,
    resolved: true,
    linkId: (canon.slug as string | undefined) || (canon.id as string | undefined) || raw,
  };
}

/**
 * Resolve every ref in order and dedupe by canonical id (falling back to
 * `linkId` for unresolved refs). Preserves original order.
 */
export function resolveRelatedRefs(rawRefs: readonly string[] | null | undefined): ResolvedEncyclopediaRef[] {
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) return [];
  const out: ResolvedEncyclopediaRef[] = [];
  const seen = new Set<string>();
  for (const r of rawRefs) {
    if (typeof r !== "string" || !r.trim()) continue;
    const resolved = resolveRelatedRef(r);
    const key = resolved.canonicalId ?? `link:${resolved.linkId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

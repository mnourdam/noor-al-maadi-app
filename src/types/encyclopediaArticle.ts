// ============================================================
// Encyclopedia 2.0 — Rich Article Schema
// ------------------------------------------------------------
// These types describe the deeper encyclopedia article shape
// stored inside `encyclopedia_entities.body` (a JSON blob) and
// optionally extended by `metadata`. No DB migration required:
// future content imports populate `body` with this shape, and
// older entries (title/summary only) continue to render via the
// graceful-fallback components in `src/components/encyclopedia/`.
// ============================================================

/** Reference to another encyclopedia entity. `slug` is the canonical id
 *  (matches `encyclopedia_entities.slug`); `label` is the display name
 *  shown if no live lookup is available. `type` lets the renderer route
 *  the click without hitting the DB just to discover the entity_type. */
export interface RelatedRef {
  slug: string;
  label?: string;
  type?: EncyclopediaEntityType;
  note?: string;
}

export type EncyclopediaEntityType =
  | "figure"
  | "scholar"
  | "city"
  | "battle"
  | "state"
  | "event"
  | "landmark"
  | "artifact";

/** A single timeline event — year + short label, optional details/link. */
export interface TimelineEvent {
  year: string;            // free-form so we can write "13 BH", "2 AH", "622 م"
  title: string;
  description?: string;
  related?: RelatedRef;    // jumps to the related entity if provided
}

/** A long content section ("النشأة", "الحياة العسكرية", "الإنجازات"...).
 *  `body` may be plain text or markdown — the renderer treats it as
 *  whitespace-preserving paragraphs split on blank lines. */
export interface ContentSection {
  heading: string;
  body: string;
  icon?: string;          // optional emoji glyph
}

/** A single "quick fact" row in the side facts list. */
export interface QuickFact {
  label: string;
  value: string;
  icon?: string;
}

/** Grouped related entities, keyed by target type. All groups optional. */
export interface RelatedEntityGroups {
  figures?: RelatedRef[];
  battles?: RelatedRef[];
  events?: RelatedRef[];
  cities?: RelatedRef[];
  landmarks?: RelatedRef[];
  artifacts?: RelatedRef[];
  states?: RelatedRef[];
  scholars?: RelatedRef[];
}

/** External or scholarly source citation. */
export interface ArticleSource {
  title: string;
  author?: string;
  url?: string;
  note?: string;
}

/** Full article body. Every field is optional — components render only
 *  the sections that are present, preserving backward compatibility
 *  with shallow entries that ship only title/summary. */
export interface EncyclopediaArticle {
  overview?: string;
  timeline?: TimelineEvent[];
  sections?: ContentSection[];
  facts?: QuickFact[];
  related?: RelatedEntityGroups;
  sources?: ArticleSource[];
}

/** Best-effort parser. Accepts the raw `body` (and optionally `metadata`)
 *  from a Supabase encyclopedia entity and returns a normalized article.
 *  Tolerant to legacy shapes: if `body` is a string, it becomes `overview`;
 *  unknown keys are ignored. */
export function parseEncyclopediaArticle(
  body: unknown,
  metadata?: unknown,
): EncyclopediaArticle {
  const out: EncyclopediaArticle = {};

  // Body shape variants we accept
  if (typeof body === "string") {
    if (body.trim()) out.overview = body.trim();
  } else if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.overview === "string" && b.overview.trim()) out.overview = b.overview.trim();
    if (Array.isArray(b.timeline)) out.timeline = b.timeline.filter(isTimelineEvent);
    if (Array.isArray(b.sections)) out.sections = b.sections.filter(isContentSection);
    if (Array.isArray(b.facts))    out.facts    = b.facts.filter(isFact);
    if (Array.isArray(b.sources))  out.sources  = b.sources.filter(isSource);
    if (b.related && typeof b.related === "object") {
      out.related = normalizeRelated(b.related as Record<string, unknown>);
    }
    // Flat sibling aliases (e.g. body.related_figures) — also accepted.
    const flatRelated = normalizeFlatRelated(b);
    if (flatRelated) out.related = { ...(out.related ?? {}), ...flatRelated };
  }

  // Metadata may carry overflow facts/sources, but never overrides body fields.
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (!out.facts && Array.isArray(m.facts)) out.facts = m.facts.filter(isFact);
    if (!out.sources && Array.isArray(m.sources)) out.sources = m.sources.filter(isSource);
  }

  return out;
}

function isTimelineEvent(x: unknown): x is TimelineEvent {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.year === "string" && typeof o.title === "string";
}
function isContentSection(x: unknown): x is ContentSection {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.heading === "string" && typeof o.body === "string";
}
function isFact(x: unknown): x is QuickFact {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.label === "string" && typeof o.value === "string";
}
function isSource(x: unknown): x is ArticleSource {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.title === "string";
}
function isRef(x: unknown): x is RelatedRef {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.slug === "string";
}

function normalizeRelated(src: Record<string, unknown>): RelatedEntityGroups {
  const groups: RelatedEntityGroups = {};
  const keys: (keyof RelatedEntityGroups)[] = [
    "figures", "battles", "events", "cities", "landmarks", "artifacts", "states", "scholars",
  ];
  for (const k of keys) {
    const v = src[k];
    if (Array.isArray(v)) groups[k] = v.filter(isRef);
  }
  return groups;
}

function normalizeFlatRelated(b: Record<string, unknown>): RelatedEntityGroups | null {
  const out: RelatedEntityGroups = {};
  const map: Record<string, keyof RelatedEntityGroups> = {
    related_figures:   "figures",
    related_battles:   "battles",
    related_events:    "events",
    related_cities:    "cities",
    related_landmarks: "landmarks",
    related_artifacts: "artifacts",
    related_states:    "states",
    related_scholars:  "scholars",
  };
  let any = false;
  for (const [src, dst] of Object.entries(map)) {
    const v = b[src];
    if (Array.isArray(v)) { out[dst] = v.filter(isRef); any = true; }
  }
  return any ? out : null;
}

// ============================================================
// Stories — historical references model
// ------------------------------------------------------------
// Stored in `stories.metadata.references` as:
//   { primary: Reference[], secondary: Reference[], notes?: string }
// Kept as free-form jsonb so schema evolves without a migration;
// this module owns the canonical read/write shape.
// ============================================================

export interface StoryReference {
  title: string;
  author?: string;
  year?: string;
  url?: string;
}

export interface StoryReferences {
  primary: StoryReference[];
  secondary: StoryReference[];
  notes?: string;
}

export function readReferences(metadata: Record<string, unknown> | null | undefined): StoryReferences {
  const raw = (metadata?.["references"] ?? {}) as Partial<StoryReferences>;
  return {
    primary: Array.isArray(raw.primary) ? raw.primary : [],
    secondary: Array.isArray(raw.secondary) ? raw.secondary : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

export function writeReferences(
  metadata: Record<string, unknown> | null | undefined,
  refs: StoryReferences,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  base["references"] = {
    primary: refs.primary.filter((r) => r.title?.trim()),
    secondary: refs.secondary.filter((r) => r.title?.trim()),
    notes: refs.notes?.trim() || undefined,
  };
  return base;
}

// ------------------------------------------------------------------
// Related encyclopedia entities  (metadata.relations.encyclopedia_entities)
// Accepts either an array of strings (ids) or of { id, title_ar? } objects.
// ------------------------------------------------------------------
export interface RelatedEntity {
  id: string;
  title_ar?: string | null;
}

export function readRelatedEntities(
  metadata: Record<string, unknown> | null | undefined,
): RelatedEntity[] {
  const rel = metadata?.["relations"] as Record<string, unknown> | undefined;
  const raw = rel?.["encyclopedia_entities"];
  if (!Array.isArray(raw)) return [];
  const out: RelatedEntity[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ id: item.trim() });
    } else if (item && typeof item === "object" && typeof (item as any).id === "string") {
      out.push({ id: (item as any).id, title_ar: (item as any).title_ar ?? null });
    }
  }
  return out;
}

/** Optional reading time authored on the story (metadata.reading_time_minutes). */
export function readReadingTimeMinutes(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.["reading_time_minutes"];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}


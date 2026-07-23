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

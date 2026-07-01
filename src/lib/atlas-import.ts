// Phase 2.5 — Atlas bulk JSON import (admin-only, client-side via RLS).
//
// Reads a batch JSON, converts lat/lon → APS via the v1 affine fit, looks up
// optional encyclopedia_entity_id by slug, and upserts atlas_entities rows
// as status='review', aps_verified=false. Idempotent: a row that already
// exists is reported as `skipped` (never demoted from published).
//
// A summary is persisted in atlas_import_runs for audit + coverage reports.
import { supabase } from "@/integrations/supabase/client";
import { geoToAps } from "@/lib/atlas/transform";
import { clampAps } from "@/lib/atlas/aps";
import { isLc1VisibleAtlasKind, type AtlasEntityKind } from "@/lib/atlas-entities";

export type ImportEntity = {
  slug: string;
  name_ar: string;
  name_en?: string;
  lat: number;
  lon: number;
  kind?: AtlasEntityKind;
  era?: string | null;
  year_start?: number | null;
  year_end?: number | null;
  encyclopedia_slug?: string | null;
};

export type ImportBatch = {
  batch: string;
  default_kind: AtlasEntityKind;
  atlas_version?: string;
  notes?: string;
  entities: ImportEntity[];
};

export type RowResult = {
  slug: string;
  status: "inserted" | "skipped" | "failed";
  reason?: string;
};

export type ImportSummary = {
  batch: string;
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  rows: RowResult[];
};

function isValidBatch(input: unknown): input is ImportBatch {
  if (!input || typeof input !== "object") return false;
  const b = input as Record<string, unknown>;
  return (
    typeof b.batch === "string" &&
    typeof b.default_kind === "string" &&
    Array.isArray(b.entities)
  );
}

export function parseBatch(text: string): ImportBatch {
  const parsed = JSON.parse(text);
  if (!isValidBatch(parsed)) throw new Error("Invalid batch JSON shape");
  return parsed;
}

/** Pre-fetch existing slugs + encyclopedia map once per run. */
async function buildLookups(batch: ImportBatch) {
  const slugs = batch.entities.map((e) => e.slug);
  const encySlugs = batch.entities
    .map((e) => e.encyclopedia_slug)
    .filter((s): s is string => !!s);

  const [{ data: existing, error: existingErr }, encyclopedia] = await Promise.all([
    supabase.from("atlas_entities").select("slug").in("slug", slugs),
    encySlugs.length
      ? supabase.from("encyclopedia_entities").select("id, slug").in("slug", encySlugs)
      : Promise.resolve({ data: [] as { id: string; slug: string }[], error: null }),
  ]);
  if (existingErr) throw existingErr;
  if (encyclopedia.error) throw encyclopedia.error;

  const existingSet = new Set((existing ?? []).map((r) => r.slug));
  const encyMap = new Map<string, string>(
    (encyclopedia.data ?? []).map((r) => [r.slug, r.id]),
  );
  return { existingSet, encyMap };
}

/** Run an import. Idempotent by slug — existing rows are skipped, never updated. */
export async function runImportBatch(
  batch: ImportBatch,
  opts: { dryRun?: boolean } = {},
): Promise<ImportSummary> {
  const { existingSet, encyMap } = await buildLookups(batch);
  const rows: RowResult[] = [];
  const toInsert: Array<Record<string, unknown>> = [];

  for (const e of batch.entities) {
    try {
      if (existingSet.has(e.slug)) {
        rows.push({ slug: e.slug, status: "skipped", reason: "exists" });
        continue;
      }
      if (typeof e.lat !== "number" || typeof e.lon !== "number") {
        rows.push({ slug: e.slug, status: "failed", reason: "missing lat/lon" });
        continue;
      }
      const aps = clampAps(geoToAps(e.lon, e.lat));
      const kind = e.kind ?? batch.default_kind;
      const encyId = e.encyclopedia_slug ? encyMap.get(e.encyclopedia_slug) ?? null : null;
      toInsert.push({
        slug: e.slug,
        kind,
        name_ar: e.name_ar,
        name_en: e.name_en ?? null,
        aps_x: Math.round(aps.x),
        aps_y: Math.round(aps.y),
        lat: e.lat,
        lon: e.lon,
        geo_source: "import",
        era: e.era ?? null,
        year_start: e.year_start ?? null,
        year_end: e.year_end ?? null,
        encyclopedia_entity_id: encyId,
        atlas_version: batch.atlas_version ?? "v1",
        status: "review",
        aps_verified: false,
        metadata: { import_batch: batch.batch },
      });
      rows.push({ slug: e.slug, status: "inserted" });
    } catch (err) {
      rows.push({ slug: e.slug, status: "failed", reason: (err as Error).message });
    }
  }

  if (!opts.dryRun && toInsert.length) {
    const { error } = await supabase.from("atlas_entities").insert(toInsert as never);
    if (error) {
      // Rewrite all "inserted" markers to failed with DB reason.
      for (const r of rows) if (r.status === "inserted") {
        r.status = "failed";
        r.reason = error.message;
      }
    }
  }

  const summary: ImportSummary = {
    batch: batch.batch,
    total: batch.entities.length,
    inserted: rows.filter((r) => r.status === "inserted").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed: rows.filter((r) => r.status === "failed").length,
    rows,
  };

  if (!opts.dryRun) {
    await supabase.from("atlas_import_runs" as never).insert({
      batch: batch.batch,
      kind: batch.default_kind,
      counts: {
        total: summary.total,
        inserted: summary.inserted,
        skipped: summary.skipped,
        failed: summary.failed,
      },
      notes: batch.notes ?? null,
    } as never);
  }

  return summary;
}

/** Live coverage snapshot grouped by kind + status. */
export type CoverageRow = {
  kind: string;
  total: number;
  published: number;
  review: number;
  draft: number;
  verified: number;
};

export async function fetchCoverage(): Promise<CoverageRow[]> {
  const { data, error } = await supabase
    .from("atlas_entities")
    .select("kind, status, aps_verified")
    .limit(5000);
  if (error) throw error;
  const map = new Map<string, CoverageRow>();
  for (const row of data ?? []) {
    const k = String(row.kind);
    const r = map.get(k) ?? { kind: k, total: 0, published: 0, review: 0, draft: 0, verified: 0 };
    r.total += 1;
    if (row.status === "published") r.published += 1;
    else if (row.status === "review") r.review += 1;
    else if (row.status === "draft") r.draft += 1;
    if (row.aps_verified) r.verified += 1;
    map.set(k, r);
  }
  return Array.from(map.values()).sort((a, b) => a.kind.localeCompare(b.kind));
}

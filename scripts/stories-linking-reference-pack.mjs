// ============================================================
// Stories Linking Reference Pack — READ-ONLY extraction.
// Produces the official linking reference used when authoring
// Stories v2 JSON files. Writes nothing to the database.
// ============================================================
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/mnt/documents/stories-reference";
mkdirSync(OUT, { recursive: true });

const q = (sql) => {
  const out = execFileSync("psql", ["-At", "-c", `select coalesce(json_agg(t),'[]'::json)::text from (${sql}) t`], {
    maxBuffer: 1024 * 1024 * 512,
  }).toString();
  return JSON.parse(out);
};
const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2));
  return data;
};

const meta = (m) => (m && typeof m === "object" ? m : {});
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const clip = (v, n = 220) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);

// ── 1. Encyclopedia ────────────────────────────────────────
const rawEntities = q(`
  select id, slug, entity_type::text as entity_type, title, subtitle, summary,
         enabled, metadata,
         (body is not null) as has_body_col, body
  from public.encyclopedia_entities
`);

function redirectTarget(m) {
  for (const k of ["canonical_id", "merged_into", "converted_to", "redirect_to"]) {
    const v = str(meta(m)[k]);
    if (v) return v;
  }
  return null;
}
function isRedirectedOrArchived(row) {
  const m = meta(row.metadata);
  return Boolean(redirectTarget(m) || m.archived === true || m.hidden_duplicate === true);
}
function bodyHasContent(body) {
  if (!body) return false;
  if (typeof body === "string") return body.trim().length >= 40;
  if (typeof body !== "object") return false;
  if (typeof body.overview === "string" && body.overview.trim().length >= 40) return true;
  if (typeof body.introduction === "string" && body.introduction.trim().length >= 40) return true;
  for (const k of ["sections", "blocks", "timeline", "facts"]) {
    if (Array.isArray(body[k]) && body[k].length > 0) return true;
  }
  return false;
}
function isDisplayable(row) {
  if (row.enabled === false) return false;
  if (isRedirectedOrArchived(row)) return false;
  if (row.entity_type === "artifact") return true;
  if ((row.summary ?? "").trim().length >= 40) return true;
  return bodyHasContent(row.body);
}

const byId = new Map(rawEntities.map((r) => [r.id, r]));
function resolveCanonicalId(row) {
  const seen = new Set([row.id]);
  let cur = row;
  for (let i = 0; i < 8; i++) {
    const next = redirectTarget(meta(cur.metadata));
    if (!next || seen.has(next) || !byId.has(next)) break;
    seen.add(next);
    cur = byId.get(next);
  }
  return cur.id;
}

const displayable = rawEntities.filter(isDisplayable);
const encEntry = (r) => ({
  id: r.id,
  slug: r.slug,
  entity_type: r.entity_type,
  title: r.title,
  subtitle: str(r.subtitle),
  summary: clip(r.summary),
  world: str(meta(r.metadata).world),
  era: str(meta(r.metadata).era),
  state: str(meta(r.metadata).state),
  rarity: str(meta(r.metadata).rarity),
  has_body: bodyHasContent(r.body),
  link_target_type: "encyclopedia_entity",
  link_target_id: r.id,
  deep_link: r.entity_type === "state"
    ? `/encyclopedia/state/${r.slug}`
    : `/encyclopedia/entity/${r.slug}`,
});

const encyclopedia = {
  generated_at: new Date().toISOString(),
  rule: "enabled = true, not archived/hidden_duplicate, no canonical redirect, has real content (artifacts always allowed)",
  total: displayable.length,
  by_type: Object.fromEntries(
    [...new Set(displayable.map((r) => r.entity_type))].sort().map((t) => [t, displayable.filter((r) => r.entity_type === t).length]),
  ),
  entities: displayable.map(encEntry).sort((a, b) => a.entity_type.localeCompare(b.entity_type) || a.slug.localeCompare(b.slug)),
};
write("stories-reference-encyclopedia.json", encyclopedia);

// ── 2. Campaigns (+ chapters) ──────────────────────────────
const rawCampaigns = q(`
  select id, status, data, world_slug, era, chronological_order, key_art_path, key_art_square_path
  from public.admin_campaigns
`);
const campaignRows = rawCampaigns.filter((c) => {
  const kind = str(meta(c.data).kind);
  return kind === null || kind === "campaign";
});
const dividers = rawCampaigns.filter((c) => str(meta(c.data).kind) === "section_divider" || str(meta(c.data).kind) === "divider");

const campaigns = {
  generated_at: new Date().toISOString(),
  rule: "status = published; section dividers excluded (never linkable)",
  divider_ids_excluded: dividers.map((d) => d.id),
  total: campaignRows.filter((c) => c.status === "published").length,
  campaigns: campaignRows
    .filter((c) => c.status === "published")
    .map((c) => {
      const d = meta(c.data);
      return {
        id: c.id,
        slug: str(d.slug),
        title: str(d.title),
        subtitle: str(d.subtitle),
        world: c.world_slug ?? str(d.worldSlug),
        era: c.era ?? str(d.era),
        historical_period: str(d.historicalPeriod),
        chronological_order: c.chronological_order ?? d.chronological_order ?? null,
        difficulty: str(d.difficulty),
        has_key_art: Boolean(c.key_art_path),
        link_target_type: "campaign",
        link_target_id: c.id,
        chapters: (Array.isArray(d.chapters) ? d.chapters : []).map((ch, i) => ({
          id: str(ch?.id),
          title: str(ch?.title),
          order: typeof ch?.order === "number" ? ch.order : i,
          activity_count: Array.isArray(ch?.activities) ? ch.activities.length : 0,
          link_target_type: "campaign_chapter",
          link_target_id: str(ch?.id),
          parent_campaign_id: c.id,
        })),
      };
    })
    .sort((a, b) => (a.chronological_order ?? 1e9) - (b.chronological_order ?? 1e9)),
};
write("stories-reference-campaigns.json", campaigns);

// ── 3. Investigations ──────────────────────────────────────
const rawInv = q(`
  select id, slug, title, subtitle, description, difficulty, reward, enabled,
         related_entities, jsonb_array_length(coalesce(steps,'[]'::jsonb)) as step_count
  from public.investigations
`);
const investigations = {
  generated_at: new Date().toISOString(),
  rule: "enabled = true",
  total: rawInv.filter((r) => r.enabled).length,
  investigations: rawInv
    .filter((r) => r.enabled)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: str(r.subtitle),
      summary: clip(r.description),
      difficulty: str(r.difficulty),
      step_count: r.step_count,
      reward: r.reward ?? null,
      related_entities: Array.isArray(r.related_entities) ? r.related_entities : [],
      link_target_type: "investigation",
      link_target_id: r.id,
      deep_link: `/investigations?open=${r.slug}`,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug)),
};
write("stories-reference-investigations.json", investigations);

// ── 4. Museum (collectible artifacts) ──────────────────────
const campaignArtifactRefs = new Set();
const scanRefList = (list) => {
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    const [type, ...rest] = String(raw ?? "").split(":");
    if (type === "artifact" && rest.length) campaignArtifactRefs.add(rest.join(":").toLowerCase());
  }
};
for (const c of campaignRows) {
  const d = meta(c.data);
  scanRefList(meta(d.metadata).core_entities);
  scanRefList(meta(d.metadata).supporting_entities);
  for (const ch of Array.isArray(d.chapters) ? d.chapters : []) {
    scanRefList(ch?.rewards?.unlocks);
    for (const a of Array.isArray(ch?.rewards?.artifacts) ? ch.rewards.artifacts : []) {
      const s = typeof a === "string" ? a : a?.slug ?? a?.id;
      if (s) campaignArtifactRefs.add(String(s).toLowerCase());
    }
  }
}
const isAdminImported = (m) => {
  const x = meta(m);
  return Boolean(x.pack_id || x.source || x.atlas_id || x.imported_at || x.import_batch || x.provenance);
};
const isMuseumEnabled = (m) => meta(m).museum_enabled === true || meta(meta(m).museum).museum_enabled === true;

const artifacts = displayable.filter((r) => r.entity_type === "artifact");
const museumRows = artifacts
  .map((r) => {
    const hasCampaignRef = campaignArtifactRefs.has(String(r.slug).toLowerCase());
    const visible = isAdminImported(r.metadata) || hasCampaignRef || isMuseumEnabled(r.metadata);
    return { r, hasCampaignRef, visible };
  })
  .filter((x) => x.visible);

const museum = {
  generated_at: new Date().toISOString(),
  rule: "encyclopedia_entities.entity_type='artifact' AND (admin-imported OR campaign-referenced OR museum_enabled)",
  total: museumRows.length,
  artifacts: museumRows
    .map(({ r, hasCampaignRef }) => ({
      ...encEntry(r),
      link_target_type: "artifact",
      rarity: str(meta(r.metadata).rarity) ?? "common",
      campaign_referenced: hasCampaignRef,
      admin_imported: isAdminImported(r.metadata),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug)),
};
write("stories-reference-museum.json", museum);

// ── 5. Atlas ───────────────────────────────────────────────
const LC1 = new Set(["region", "place", "battle"]);
const rawAtlas = q(`
  select id, slug, kind::text as kind, name_ar, name_en, lat, lon, aps_x, aps_y,
         era, year_start, year_end, status::text as status, encyclopedia_entity_id
  from public.atlas_entities where status = 'published'
`);
const atlas = {
  generated_at: new Date().toISOString(),
  rule: "status = published. lc1_visible marks kinds currently rendered on /map (region, place, battle).",
  total: rawAtlas.length,
  lc1_visible_total: rawAtlas.filter((r) => LC1.has(r.kind)).length,
  entities: rawAtlas
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      kind: r.kind,
      name_ar: r.name_ar,
      name_en: str(r.name_en),
      lat: r.lat,
      lon: r.lon,
      aps: r.aps_x != null && r.aps_y != null ? { x: r.aps_x, y: r.aps_y } : null,
      era: str(r.era),
      year_start: r.year_start,
      year_end: r.year_end,
      encyclopedia_entity_id: r.encyclopedia_entity_id,
      lc1_visible: LC1.has(r.kind),
      link_target_type: "atlas_entity",
      link_target_id: r.id,
      deep_link: `/map?focus=${r.slug}`,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug)),
};
write("stories-reference-atlas.json", atlas);

// ── 6. Achievements ────────────────────────────────────────
const rawAch = q(`select id, xp, dinars, title_id, rarity, category, engine_version from public.achievement_registry`);
const achievements = {
  generated_at: new Date().toISOString(),
  rule: "achievement_registry = server-authoritative reward ledger; ids are stable link targets",
  total: rawAch.length,
  achievements: rawAch
    .map((a) => ({
      id: a.id,
      category: a.category,
      rarity: a.rarity,
      xp: a.xp,
      dinars: a.dinars,
      title_id: str(a.title_id),
      engine_version: a.engine_version,
      link_target_type: "achievement",
      link_target_id: a.id,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id)),
};
write("stories-reference-achievements.json", achievements);

// ── 7. Taxonomy ────────────────────────────────────────────
const rawTax = q(`
  select type, key, label_ar, label_en, sort_order, enabled, archived
  from public.admin_taxonomy where enabled = true and archived = false
`);
const enumsOf = (name) =>
  q(`select e.enumlabel as v from pg_type t join pg_enum e on e.enumtypid=t.oid
     join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='public' and t.typname='${name}' order by e.enumsortorder`).map((r) => r.v);

const taxonomy = {
  generated_at: new Date().toISOString(),
  worlds: rawTax.filter((t) => t.type === "world").sort((a, b) => a.sort_order - b.sort_order),
  eras: rawTax.filter((t) => t.type === "era").sort((a, b) => a.sort_order - b.sort_order),
  states: rawTax.filter((t) => t.type === "state").sort((a, b) => a.sort_order - b.sort_order),
  entity_types: rawTax.filter((t) => t.type === "entity_type").sort((a, b) => a.sort_order - b.sort_order),
  story_enums: {
    category: enumsOf("story_category"),
    rarity: enumsOf("story_rarity"),
    production_status: enumsOf("story_production_status"),
    lock_visibility: enumsOf("story_lock_visibility"),
    historical_confidence: enumsOf("story_historical_confidence"),
    time_precision: enumsOf("story_time_precision"),
    length_class: enumsOf("story_length_class"),
    snapshot_tier: enumsOf("story_snapshot_tier"),
    source_kind: enumsOf("story_source_kind"),
    relation_role: enumsOf("story_relation_role"),
    relation_target_type: enumsOf("story_relation_target_type"),
  },
};
write("stories-reference-taxonomy.json", taxonomy);

// ── 8. Existing stories ────────────────────────────────────
const rawStories = q(`
  select id, slug, title_ar, title_en, status, category::text as category,
         rarity::text as rarity, production_status::text as production_status,
         world_slug, era, story_collection_id, collection_order, display_order
  from public.stories
`);
const rawRelations = q(`select id, story_id, target_type::text as target_type, target_id, role::text as role, display_order from public.story_relations`);
const existingStories = {
  generated_at: new Date().toISOString(),
  rule: "all rows — used to prevent id/slug collisions",
  total: rawStories.length,
  reserved_ids: rawStories.map((s) => s.id).sort(),
  reserved_slugs: rawStories.map((s) => s.slug).sort(),
  stories: rawStories.map((s) => ({
    ...s,
    relations: rawRelations.filter((r) => r.story_id === s.id),
  })),
};
write("stories-reference-existing-stories.json", existingStories);

// ── 9. Collections ─────────────────────────────────────────
const rawCollections = q(`select id, slug, title_ar, title_en, summary_ar, display_order from public.story_collections`);
const collections = {
  generated_at: new Date().toISOString(),
  total: rawCollections.length,
  collections: rawCollections.map((c) => ({
    ...c,
    story_count: rawStories.filter((s) => s.story_collection_id === c.id).length,
    link_target_type: "collection",
    link_target_id: c.id,
  })),
};
write("stories-reference-collections.json", collections);

// ── 10. Resolver ───────────────────────────────────────────
const resolverEntries = [];
for (const r of rawEntities) {
  const canonicalId = resolveCanonicalId(r);
  const canonicalRow = byId.get(canonicalId);
  const canonicalDisplayable = canonicalRow ? isDisplayable(canonicalRow) : false;
  const isSelf = canonicalId === r.id;
  if (isSelf && isDisplayable(r)) continue; // healthy canonical row, nothing to resolve
  resolverEntries.push({
    from_id: r.id,
    from_slug: r.slug,
    reason: redirectTarget(meta(r.metadata))
      ? "redirect"
      : meta(r.metadata).archived === true
        ? "archived"
        : meta(r.metadata).hidden_duplicate === true
          ? "hidden_duplicate"
          : r.enabled === false
            ? "disabled"
            : "not_displayable",
    canonical_id: isSelf ? null : canonicalId,
    canonical_slug: isSelf ? null : canonicalRow?.slug ?? null,
    canonical_is_linkable: isSelf ? false : canonicalDisplayable,
  });
  for (const alias of Array.isArray(meta(r.metadata).redirect_from) ? meta(r.metadata).redirect_from : []) {
    if (typeof alias === "string" && alias.trim()) {
      resolverEntries.push({
        from_id: null,
        from_slug: alias.trim(),
        reason: "legacy_slug",
        canonical_id: canonicalId,
        canonical_slug: canonicalRow?.slug ?? null,
        canonical_is_linkable: canonicalDisplayable,
      });
    }
  }
}
write("stories-reference-resolver.json", {
  generated_at: new Date().toISOString(),
  rule: "every non-linkable or aliased encyclopedia identifier → canonical id (read-only mapping)",
  total: resolverEntries.length,
  entries: resolverEntries,
});

// ── 11. Integrity report ───────────────────────────────────
const linkableEncIds = new Set(displayable.map((r) => r.id));
const dupSlugs = Object.entries(
  displayable.reduce((acc, r) => ((acc[r.slug] = (acc[r.slug] ?? 0) + 1), acc), {}),
).filter(([, n]) => n > 1);

const chapterIds = campaigns.campaigns.flatMap((c) => c.chapters.map((ch) => ch.id));
const missingChapterIds = campaigns.campaigns.flatMap((c) =>
  c.chapters.filter((ch) => !ch.id).map((ch) => ({ campaign_id: c.id, chapter_order: ch.order })),
);
const dupChapterIds = Object.entries(
  chapterIds.filter(Boolean).reduce((acc, id) => ((acc[id] = (acc[id] ?? 0) + 1), acc), {}),
).filter(([, n]) => n > 1);

const atlasOrphans = atlas.entities.filter(
  (a) => a.encyclopedia_entity_id && !linkableEncIds.has(a.encyclopedia_entity_id),
);
const invBadRefs = investigations.investigations.flatMap((i) =>
  (i.related_entities ?? [])
    .map((x) => (typeof x === "string" ? x : x?.slug ?? x?.id))
    .filter(Boolean)
    .filter((ref) => !displayable.some((e) => e.slug === ref || e.id === ref))
    .map((ref) => ({ investigation: i.slug, missing_ref: ref })),
);
const museumRefsMissing = [...campaignArtifactRefs].filter(
  (slug) => !museum.artifacts.some((a) => a.slug.toLowerCase() === slug),
);

const integrity = {
  generated_at: new Date().toISOString(),
  counts: {
    encyclopedia_total_rows: rawEntities.length,
    encyclopedia_linkable: displayable.length,
    encyclopedia_non_linkable: rawEntities.length - displayable.length,
    campaigns_published: campaigns.total,
    campaign_chapters: chapterIds.length,
    section_dividers_excluded: dividers.length,
    investigations_enabled: investigations.total,
    museum_artifacts: museum.total,
    atlas_published: atlas.total,
    atlas_lc1_visible: atlas.lc1_visible_total,
    achievements: achievements.total,
    existing_stories: rawStories.length,
    story_collections: rawCollections.length,
    resolver_entries: resolverEntries.length,
  },
  issues: {
    duplicate_encyclopedia_slugs: dupSlugs.map(([slug, n]) => ({ slug, count: n })),
    campaign_chapters_without_id: missingChapterIds,
    duplicate_campaign_chapter_ids: dupChapterIds.map(([id, n]) => ({ id, count: n })),
    atlas_pointing_at_non_linkable_entity: atlasOrphans.map((a) => ({
      atlas_slug: a.slug,
      encyclopedia_entity_id: a.encyclopedia_entity_id,
    })),
    investigation_related_entity_refs_unresolved: invBadRefs,
    campaign_artifact_refs_without_museum_row: museumRefsMissing,
  },
};
write("stories-linking-integrity-report.json", integrity);

// ── 12. Unified pack ───────────────────────────────────────
const pack = {
  pack_version: 1,
  generated_at: new Date().toISOString(),
  read_only: true,
  note: "Official linking reference for Stories v2 authoring. Extracted from the live database without modification.",
  taxonomy,
  encyclopedia,
  campaigns,
  investigations,
  museum,
  atlas,
  achievements,
  existing_stories: existingStories,
  collections,
  resolver: { entries: resolverEntries },
  integrity,
};
write("irth-stories-linking-reference-pack.json", pack);

// ── 13. Flat CSV helper ────────────────────────────────────
const csvRows = [["target_type", "target_id", "slug", "title", "kind_or_category", "world", "era", "deep_link"]];
const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
for (const e of encyclopedia.entities)
  csvRows.push(["encyclopedia_entity", e.id, e.slug, e.title, e.entity_type, e.world, e.era, e.deep_link]);
for (const a of museum.artifacts)
  csvRows.push(["artifact", a.id, a.slug, a.title, a.rarity, a.world, a.era, a.deep_link]);
for (const c of campaigns.campaigns) {
  csvRows.push(["campaign", c.id, c.slug, c.title, c.difficulty, c.world, c.era, `/campaigns/${c.id}`]);
  for (const ch of c.chapters)
    csvRows.push(["campaign_chapter", ch.id, "", ch.title, `chapter#${ch.order}`, c.world, c.era, `/campaigns/${c.id}`]);
}
for (const i of investigations.investigations)
  csvRows.push(["investigation", i.id, i.slug, i.title, i.difficulty, "", "", i.deep_link]);
for (const a of atlas.entities)
  csvRows.push(["atlas_entity", a.id, a.slug, a.name_ar, a.kind, "", a.era, a.deep_link]);
for (const a of achievements.achievements)
  csvRows.push(["achievement", a.id, "", a.title_id ?? a.id, a.rarity, "", "", ""]);
for (const c of collections.collections)
  csvRows.push(["collection", c.id, c.slug, c.title_ar, "collection", "", "", ""]);
for (const s of rawStories)
  csvRows.push(["story", s.id, s.slug, s.title_ar, s.category, s.world_slug, s.era, `/story/${s.slug}`]);

writeFileSync(
  join(OUT, "irth-stories-linking-reference-pack.csv"),
  "\uFEFF" + csvRows.map((r) => r.map(esc).join(",")).join("\n"),
);

console.log(JSON.stringify(integrity.counts, null, 2));
console.log("issues:", JSON.stringify(Object.fromEntries(Object.entries(integrity.issues).map(([k, v]) => [k, v.length])), null, 2));

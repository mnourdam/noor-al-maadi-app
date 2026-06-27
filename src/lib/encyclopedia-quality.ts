// Content completeness scoring for encyclopedia entities.
// Pure functions — no DB calls. Used by the admin workshop UI.
//
// Weighting (totals 100):
//   overview 15 · body 25 · sections 10 · sources 10
//   aliases  5  · image 10 · atlas  10 · related 5
//   campaign 10
//
// `bodyText` and `hasSections` mirror the helpers already used in the
// workshop so a single source of truth would be ideal — kept independent
// here to avoid an import cycle with the route file.

export type ScoreInput = {
  summary?: string | null;
  body?: any;
  metadata?: any;
  atlasLinks?: number;
  campaignRefs?: number;
};

function bodyTextLen(body: any): number {
  if (!body) return 0;
  if (typeof body === "string") return body.length;
  try {
    return JSON.stringify(body).replace(/[{}\[\]",]/g, " ").replace(/\s+/g, " ").trim().length;
  } catch { return 0; }
}

function sectionsCount(body: any): number {
  if (!body || typeof body !== "object") return 0;
  if (Array.isArray(body.sections)) return body.sections.length;
  if (Array.isArray(body.blocks)) return body.blocks.length;
  return 0;
}

function sourcesCount(meta: any, body: any): number {
  const ms = Array.isArray(meta?.sources) ? meta.sources.length : 0;
  const bs = Array.isArray(body?.sources) ? body.sources.length : 0;
  return ms + bs;
}

function aliasesCount(meta: any): number {
  const arrays = [meta?.aliases, meta?.also_known_as, meta?.alt_names, meta?.names];
  let n = 0;
  for (const a of arrays) if (Array.isArray(a)) n += a.length;
  return n;
}

function hasImage(meta: any): boolean {
  const m = meta || {};
  return Boolean(m.image || m.image_url || m.hero_image || m.thumbnail);
}

function relatedCount(meta: any, body: any): number {
  const mr = Array.isArray(meta?.related) ? meta.related.length : 0;
  const br = Array.isArray(body?.related_entities) ? body.related_entities.length : 0;
  return mr + br;
}

/** Returns 0–100. */
export function scoreEntity(input: ScoreInput): number {
  const overview = (input.summary ?? "").trim().length;
  const body = bodyTextLen(input.body);
  const secs = sectionsCount(input.body);
  const srcs = sourcesCount(input.metadata, input.body);
  const al = aliasesCount(input.metadata);
  const img = hasImage(input.metadata);
  const rel = relatedCount(input.metadata, input.body);

  let s = 0;
  // overview 15
  s += overview >= 200 ? 15 : overview >= 80 ? 10 : overview >= 20 ? 5 : 0;
  // body 25
  s += body >= 1500 ? 25 : body >= 800 ? 18 : body >= 300 ? 10 : body >= 80 ? 4 : 0;
  // sections 10
  s += secs >= 4 ? 10 : secs >= 2 ? 6 : secs >= 1 ? 3 : 0;
  // sources 10
  s += srcs >= 3 ? 10 : srcs >= 1 ? 6 : 0;
  // aliases 5
  s += al >= 3 ? 5 : al >= 1 ? 3 : 0;
  // image 10
  s += img ? 10 : 0;
  // atlas 10
  s += (input.atlasLinks ?? 0) > 0 ? 10 : 0;
  // related 5
  s += rel >= 3 ? 5 : rel >= 1 ? 3 : 0;
  // campaign 10
  s += (input.campaignRefs ?? 0) > 0 ? 10 : 0;

  return Math.min(100, Math.max(0, Math.round(s)));
}

/** Returns Tailwind class fragment for a score badge. */
export function scoreColor(score: number): string {
  if (score >= 80) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (score >= 50) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-300";
}

export type QualityBucket = "green" | "yellow" | "red";
export function scoreBucket(score: number): QualityBucket {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

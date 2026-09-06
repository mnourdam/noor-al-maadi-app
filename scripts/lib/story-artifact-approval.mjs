// ============================================================
// Story release-artifact approval stamp.
// ------------------------------------------------------------
// A release preparation run that HAS the build secret regenerates
// canonical story content from live production and then writes an
// approval stamp describing exactly which artifact bytes were
// produced and verified.
//
// A release preparation run WITHOUT the build secret may only
// proceed when the committed PREGENERATED_VERIFIED artifacts still
// match that stamp byte-for-byte and are not older than the
// freshness window. Otherwise the release is blocked.
//
// The stamp NEVER contains any secret material.
// ============================================================
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const APPROVAL_PATH = resolve(process.cwd(), "release/story-artifact-approval.json");
export const BASELINE_PATH = resolve(process.cwd(), "public/baseline-content.json");
export const MEDIA_MANIFEST_PATH = resolve(process.cwd(), "public/story-media/manifest.json");

/** Maximum age of an approved artifact reused by a keyless release run. */
export const FRESHNESS_DAYS = 30;

/**
 * Hash artifact content, not its on-disk line endings.
 *
 * Windows release machines with `core.autocrlf=true` rewrite a checked-out
 * LF into CRLF, which changes the raw bytes of an otherwise untouched,
 * committed artifact. Normalising CRLF -> LF (and a lone CR -> LF) before
 * hashing keeps the gate byte-exact on content while immune to checkout
 * EOL translation. Any real edit to the artifact still changes the hash.
 */
function sha256File(path) {
  const normalized = readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function readBaselineSummary() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const c = baseline.collections ?? {};
  const counts = baseline.counts ?? {};
  const intros = counts.campaign_intro_stories ?? 0;
  return {
    version: baseline.version,
    generated_at: baseline.generated_at,
    source: baseline.source ?? "unknown",
    library_stories: counts.library_stories ?? (c.stories?.length ?? 0) - intros,
    campaign_intro_stories: intros,
    stories: c.stories?.length ?? 0,
    story_scenes: c.story_scenes?.length ?? 0,
    story_media: c.story_media?.length ?? 0,
    story_collections: c.story_collections?.length ?? 0,
    games: c.games?.length ?? 0,
  };
}

export function readMediaSummary() {
  const manifest = JSON.parse(readFileSync(MEDIA_MANIFEST_PATH, "utf8"));
  const assets = manifest.assets ?? {};
  const bytes = Object.values(assets).reduce((a, x) => a + (x.bytes ?? 0), 0);
  return { generated_at: manifest.generated_at ?? null, assets: Object.keys(assets).length, bytes };
}

export function writeApproval() {
  const stamp = {
    $comment: [
      "Approval stamp for the pre-generated Story release artifacts.",
      "Written ONLY by a release preparation run that regenerated content from live production.",
      "Never edit by hand — a keyless release run verifies these hashes before it is allowed to proceed.",
    ],
    approved_at: new Date().toISOString(),
    baseline: { ...readBaselineSummary(), sha256: sha256File(BASELINE_PATH) },
    story_media: { ...readMediaSummary(), sha256: sha256File(MEDIA_MANIFEST_PATH) },
  };
  mkdirSync(dirname(APPROVAL_PATH), { recursive: true });
  writeFileSync(APPROVAL_PATH, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
  return stamp;
}

const BLOCK_HINT =
  "  Story artifacts must first be regenerated in the secure build environment:\n" +
  "    run `npm run release:android:prepare` where SUPABASE_SERVICE_ROLE_KEY is available,\n" +
  "    commit the regenerated artifacts + release/story-artifact-approval.json, then retry here.";

/** @returns {{ok:true,stamp:object}|{ok:false,errors:string[]}} */
export function verifyApproval() {
  const errors = [];
  if (!existsSync(APPROVAL_PATH)) {
    return { ok: false, errors: ["no approved Story release artifact stamp (release/story-artifact-approval.json)"] };
  }
  if (!existsSync(BASELINE_PATH)) return { ok: false, errors: ["public/baseline-content.json is missing"] };
  if (!existsSync(MEDIA_MANIFEST_PATH)) return { ok: false, errors: ["public/story-media/manifest.json is missing"] };

  let stamp;
  try {
    stamp = JSON.parse(readFileSync(APPROVAL_PATH, "utf8"));
  } catch (e) {
    return { ok: false, errors: [`approval stamp is malformed JSON: ${e?.message ?? e}`] };
  }

  if (sha256File(BASELINE_PATH) !== stamp?.baseline?.sha256) {
    errors.push("public/baseline-content.json does not match the approved release artifact");
  }
  if (sha256File(MEDIA_MANIFEST_PATH) !== stamp?.story_media?.sha256) {
    errors.push("public/story-media/manifest.json does not match the approved release artifact");
  }
  const approvedAt = Date.parse(stamp?.approved_at ?? "");
  if (Number.isNaN(approvedAt)) errors.push("approval stamp has no valid approved_at timestamp");
  else {
    const ageDays = (Date.now() - approvedAt) / 86_400_000;
    if (ageDays > FRESHNESS_DAYS) {
      errors.push(
        `approved Story artifact is ${ageDays.toFixed(0)} days old (limit ${FRESHNESS_DAYS}) — too stale for a release`,
      );
    }
  }
  if (errors.length) return { ok: false, errors: [...errors, BLOCK_HINT] };
  return { ok: true, stamp };
}

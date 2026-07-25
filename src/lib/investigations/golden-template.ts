// ============================================================
// Golden Investigation Template — canonical identity
// ------------------------------------------------------------
// The template exists in two forms that must never drift:
//   1. A real (disabled) investigation row in the registry.
//   2. A downloadable JSON file.
// The download is generated from the live row through the normal
// export pipeline; the static file under /templates is only a
// fallback when the export RPC is unavailable.
// ============================================================

import { buildBundle, downloadFile, fetchInvestigationsForExport } from "./export";

export const GOLDEN_TEMPLATE_ID = "b8944039-68ef-0906-0be2-f48d3484f3cc";
export const GOLDEN_TEMPLATE_SLUG = "golden-template-bayt-al-hikma";
export const GOLDEN_TEMPLATE_STATIC_PATH =
  "/templates/irth-golden-investigation-template.json";
export const GOLDEN_TEMPLATE_LABEL = "قالب ذهبي";

export function isGoldenTemplate(row: { id?: string | null; slug?: string | null }): boolean {
  return row.id === GOLDEN_TEMPLATE_ID || row.slug === GOLDEN_TEMPLATE_SLUG;
}

/**
 * Download the canonical template JSON, generated from the live
 * investigation row so the DB and the file cannot diverge.
 * Falls back to the bundled static file on any failure.
 */
export async function downloadGoldenTemplate(): Promise<"live" | "static"> {
  try {
    const { rows } = await fetchInvestigationsForExport([GOLDEN_TEMPLATE_ID]);
    if (rows.length > 0) {
      const bundle = buildBundle(rows, "selection");
      downloadFile(
        "irth-golden-investigation-template.json",
        JSON.stringify(bundle, null, 2),
        "application/json",
      );
      return "live";
    }
  } catch {
    /* fall through to the static copy */
  }
  if (typeof window !== "undefined") {
    const a = document.createElement("a");
    a.href = GOLDEN_TEMPLATE_STATIC_PATH;
    a.download = "irth-golden-investigation-template.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return "static";
}

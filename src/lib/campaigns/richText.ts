// ============================================================
// Canonical rich-text coercion for campaign activity bodies.
// ------------------------------------------------------------
// The canonical schema for `contextText` (and any authored body
// text) is a STRING. Some authored/imported payloads carry an
// ARRAY of paragraphs instead. That is a data-shape drift, not a
// supported variant: every renderer, validator and editor in the
// app expects a string.
//
// This helper is the single sanctioned coercion point:
//   string  → trimmed as-is
//   array   → paragraphs joined with a blank line
//   other   → "" (nothing renderable)
// ============================================================

export function coerceRichText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((p) =>
        typeof p === "string"
          ? p
          : p && typeof p === "object"
            ? String((p as Record<string, unknown>).text ?? (p as Record<string, unknown>).body ?? "")
            : "",
      )
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

/** True when the value carries renderable text in any accepted shape. */
export function hasRichText(value: unknown): boolean {
  return coerceRichText(value).trim().length > 0;
}

/** True when the value is renderable but NOT in the canonical string shape. */
export function isNonCanonicalRichText(value: unknown): boolean {
  return value != null && typeof value !== "string" && hasRichText(value);
}

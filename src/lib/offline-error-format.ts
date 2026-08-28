// ============================================================
// Human-readable error formatting for the offline content pipeline.
// ------------------------------------------------------------
// V16 bug: `تعذّر التحديث: [object Object]`.
// The update path joined `ValidationIssue` OBJECTS into a string and
// rethrew raw PostgREST error objects, both of which stringify to
// `[object Object]`. Every user-facing failure message on the content
// update path now goes through this module.
// ============================================================

export interface FormattableIssue {
  level?: "error" | "warning";
  collection?: string;
  message?: string;
}

/** Readable Arabic line for one validation issue. */
export function formatIssue(issue: FormattableIssue | string | null | undefined): string {
  if (issue == null) return "خطأ غير معروف";
  if (typeof issue === "string") return issue;
  const message = typeof issue.message === "string" && issue.message.trim() ? issue.message.trim() : "خطأ غير معروف";
  return issue.collection ? `${issue.collection}: ${message}` : message;
}

/** Readable Arabic summary of a validation report (errors first, capped). */
export function formatIssues(
  issues: readonly (FormattableIssue | string)[] | null | undefined,
  max = 3,
): string {
  const list = Array.isArray(issues) ? issues : [];
  const errors = list.filter((i) => typeof i === "string" || i?.level !== "warning");
  const chosen = (errors.length > 0 ? errors : list).slice(0, max).map(formatIssue);
  const rest = (errors.length > 0 ? errors.length : list.length) - chosen.length;
  if (chosen.length === 0) return "فشل التحقّق من المحتوى";
  return rest > 0 ? `${chosen.join(" — ")} (+${rest})` : chosen.join(" — ");
}

/**
 * Readable message for ANY thrown value: Error, PostgREST/Supabase error
 * object, string, or arbitrary object. Never returns `[object Object]`.
 */
export function formatError(err: unknown): string {
  if (err == null) return "خطأ غير معروف";
  if (typeof err === "string") return err.trim() || "خطأ غير معروف";
  if (err instanceof Error) return err.message || err.name || "خطأ غير معروف";
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ["message", "error_description", "error", "details", "hint"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
      if (parts.length >= 2) break;
    }
    if (typeof o.code === "string" && o.code.trim()) parts.push(`(${o.code.trim()})`);
    if (parts.length > 0) return parts.join(" — ");
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json.slice(0, 300);
    } catch { /* ignore */ }
  }
  return String(err) === "[object Object]" ? "خطأ غير معروف" : String(err);
}

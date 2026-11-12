/** Validate receipt semantics, never infer confirmation from HTTP success or totals. */
export function classifyProfileDeltaReceipt(
  data: unknown,
): "granted" | "already_granted" | "unauthenticated" | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const receipt = data as Record<string, unknown>;
  if (receipt.ok === false && receipt.reason === "unauthenticated" && receipt.applied === undefined)
    return "unauthenticated";
  if (receipt.ok !== true) return undefined;
  if (receipt.applied === true && receipt.reason === undefined) return "granted";
  // Older adapters omit the optional duplicate reason; retain that established shape.
  if (
    receipt.applied === false &&
    (receipt.reason === undefined || receipt.reason === "already_applied")
  )
    return "already_granted";
  return undefined;
}

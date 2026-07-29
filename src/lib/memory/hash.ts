// Small deterministic string hash used for item ids, revisions, and
// plan keys. Not cryptographic — collision-resistant enough for the
// engine's namespaces (few thousand items per owner in the worst case).

export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

export function hashParts(...parts: (string | number | boolean | null | undefined)[]): string {
  return fnv1a(parts.map(p => String(p ?? "")).join("|"));
}

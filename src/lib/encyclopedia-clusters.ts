// Duplicate clustering for the admin Bulk Review mode.
// Groups entities by (type + normalized name key) and any alias overlap.
// Pure client-side — input is the rows already loaded by the workshop.

import { entityNameKeys, normalizeArabicName, normalizeSlugKey } from "./arabic-normalize";

export type ClusterableEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  metadata?: any;
};

export type DuplicateGroup<T extends ClusterableEntity> = {
  key: string;            // composite type::key (debug only)
  members: T[];
  primaryKey: string;     // best normalized name key
};

/**
 * Cluster entities into groups likely to be duplicates.
 * - Same entity_type required.
 * - Any shared normalized name/alias OR same normalized slug.
 * - Singletons are skipped.
 */
export function clusterDuplicates<T extends ClusterableEntity>(rows: T[]): DuplicateGroup<T>[] {
  // Map "type::key" -> Set<row id>
  const keyToIds = new Map<string, Set<string>>();
  const rowKeys = new Map<string, string[]>();

  for (const r of rows) {
    const keys = entityNameKeys({ title: r.title, subtitle: r.subtitle, metadata: r.metadata });
    if (r.title) keys.push(normalizeArabicName(r.title));
    const slugKey = normalizeSlugKey(r.slug || "");
    if (slugKey) keys.push("slug:" + slugKey);
    const unique = Array.from(new Set(keys)).filter(Boolean);
    rowKeys.set(r.id, unique);
    for (const k of unique) {
      const composite = `${r.entity_type}::${k}`;
      const set = keyToIds.get(composite) ?? new Set<string>();
      set.add(r.id);
      keyToIds.set(composite, set);
    }
  }

  // Union-find over rows by shared key buckets with size > 1.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const r of rows) parent.set(r.id, r.id);
  for (const ids of keyToIds.values()) {
    if (ids.size < 2) continue;
    const arr = Array.from(ids);
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  }

  // Collect components.
  const byRoot = new Map<string, T[]>();
  for (const r of rows) {
    const root = find(r.id);
    const arr = byRoot.get(root) ?? [];
    arr.push(r);
    byRoot.set(root, arr);
  }

  const out: DuplicateGroup<T>[] = [];
  for (const [root, members] of byRoot) {
    if (members.length < 2) continue;
    // Members must share a type — split mixed-type accidental unions.
    const byType = new Map<string, T[]>();
    for (const m of members) {
      const arr = byType.get(m.entity_type) ?? [];
      arr.push(m);
      byType.set(m.entity_type, arr);
    }
    for (const [t, group] of byType) {
      if (group.length < 2) continue;
      const primaryKey = normalizeArabicName(group[0].title);
      out.push({ key: `${t}::${primaryKey}::${root.slice(0, 6)}`, members: group, primaryKey });
    }
  }

  // Sort: biggest groups first so admins clear high-impact duplicates first.
  out.sort((a, b) => b.members.length - a.members.length);
  return out;
}

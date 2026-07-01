// Atlas duplicate detection for the admin cleanup workshop.
// Groups atlas_entities rows that are likely duplicates of each other,
// using several complementary signals — never mutates data itself.
import { normalizeArabic } from "@/lib/atlas/atlas-search";
import type { AtlasEntityRow } from "@/lib/atlas-entities";

export type DuplicateReason =
  | "normalized_title"
  | "linked_entity"
  | "fuzzy_title"
  | "coordinates";

export type AtlasDuplicateGroup = {
  key: string;
  label: string;               // human-readable group title (Arabic when possible)
  reasons: DuplicateReason[];  // why these rows were grouped
  items: AtlasEntityRow[];
};

/** Strip common noise words from a normalized Arabic title so
 *  "مدينة سمرقند" and "سمرقند" collapse to the same key. */
const NOISE_PREFIXES = ["مدينة", "بلدة", "قرية", "معركة", "غزوة", "موقعه", "موقعة", "وقعة", "اقليم", "منطقه", "منطقة", "دولة", "امارة", "إمارة", "خلافة"];

function stripNoise(nq: string): string {
  let out = nq;
  for (const w of NOISE_PREFIXES) {
    const nw = normalizeArabic(w);
    if (out.startsWith(nw + " ")) out = out.slice(nw.length + 1);
  }
  return out.trim();
}

/** Distance-based coordinate similarity in APS pixels. */
function nearby(a: AtlasEntityRow, b: AtlasEntityRow, tol = 40): boolean {
  if (a.aps_x == null || a.aps_y == null || b.aps_x == null || b.aps_y == null) return false;
  const dx = a.aps_x - b.aps_x, dy = a.aps_y - b.aps_y;
  return dx * dx + dy * dy <= tol * tol;
}

/** Cheap fuzzy: shared prefix length ≥ 4 chars on stripped normalized titles. */
function fuzzyKey(nq: string): string {
  const s = stripNoise(nq);
  return s.slice(0, 6);
}

export function findAtlasDuplicateGroups(rows: AtlasEntityRow[]): AtlasDuplicateGroup[] {
  const groups = new Map<string, AtlasDuplicateGroup>();

  const push = (key: string, label: string, reason: DuplicateReason, row: AtlasEntityRow) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, reasons: [reason], items: [] };
      groups.set(key, g);
    } else if (!g.reasons.includes(reason)) {
      g.reasons.push(reason);
    }
    if (!g.items.some((it) => it.id === row.id)) g.items.push(row);
  };

  // A. Normalized Arabic title
  for (const r of rows) {
    const nq = normalizeArabic(r.name_ar);
    if (!nq) continue;
    push(`t:${nq}`, r.name_ar, "normalized_title", r);
  }

  // B. Linked encyclopedia entity
  for (const r of rows) {
    if (!r.encyclopedia_entity_id) continue;
    push(`e:${r.encyclopedia_entity_id}`, r.name_ar, "linked_entity", r);
  }

  // C. Fuzzy title bucket (stripped prefix)
  for (const r of rows) {
    const nq = normalizeArabic(r.name_ar);
    const fk = fuzzyKey(nq);
    if (fk.length < 4) continue;
    push(`f:${fk}`, r.name_ar, "fuzzy_title", r);
  }

  // D. Same-title + close coordinates — refine fuzzy groups to only those
  //    with at least one nearby pair, otherwise drop the fuzzy-only key.
  for (const [key, g] of groups) {
    if (!key.startsWith("f:")) continue;
    if (g.items.length < 2) { groups.delete(key); continue; }
    let anyNearby = false;
    outer: for (let i = 0; i < g.items.length; i++) {
      for (let j = i + 1; j < g.items.length; j++) {
        if (nearby(g.items[i], g.items[j])) { anyNearby = true; break outer; }
      }
    }
    if (!anyNearby) groups.delete(key);
    else g.reasons.push("coordinates");
  }

  // Only real duplicate groups (2+ items).
  const out: AtlasDuplicateGroup[] = [];
  for (const g of groups.values()) if (g.items.length >= 2) out.push(g);

  // Merge groups that share items so the UI shows one cluster per real
  // duplicate set. Union-find by row id.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) { parent.set(x, x); return x; }
    const r = find(p); parent.set(x, r); return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const g of out) {
    const first = g.items[0].id;
    for (let i = 1; i < g.items.length; i++) union(first, g.items[i].id);
  }
  const merged = new Map<string, AtlasDuplicateGroup>();
  for (const g of out) {
    const root = find(g.items[0].id);
    let m = merged.get(root);
    if (!m) {
      m = { key: root, label: g.label, reasons: [...g.reasons], items: [] };
      merged.set(root, m);
    } else {
      for (const r of g.reasons) if (!m.reasons.includes(r)) m.reasons.push(r);
    }
    for (const it of g.items) if (!m.items.some((x) => x.id === it.id)) m.items.push(it);
  }

  return Array.from(merged.values())
    .filter((g) => g.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length);
}

export const DUP_REASON_AR: Record<DuplicateReason, string> = {
  normalized_title: "اسم مطابق",
  linked_entity: "نفس كيان الموسوعة",
  fuzzy_title: "اسم مقارب",
  coordinates: "إحداثيات متقاربة",
};

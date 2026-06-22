// Phase 2.7 — Historical Atlas Foundation
// Simplified, elegant regions for the encyclopedia world map.
// Coordinate space: x ∈ [0, 100], y ∈ [0, 60] — same as marker storage.
// Polygons are stylised, NOT modern political borders.

export type AtlasRegionId =
  | "andalus"
  | "maghrib"
  | "misr"
  | "hijaz"
  | "sham"
  | "iraq"
  | "anadol"
  | "fars"
  | "khurasan"
  | "ma_wara_al_nahr"
  | "hind";

export interface AtlasRegion {
  id: AtlasRegionId;
  name: string; // Arabic display name
  /** SVG polygon points in the 100x60 coordinate space. */
  polygon: string;
  /** Anchor for the region label (centroid-ish). */
  label: { x: number; y: number };
}

// Stylised, smooth-ish polygons in the 100x60 space.
// North = top (small y), South = bottom (large y).
export const ATLAS_REGIONS: AtlasRegion[] = [
  {
    id: "andalus",
    name: "الأندلس",
    polygon: "2,14 11,12 14,16 13,21 6,22 2,19",
    label: { x: 7.5, y: 17.5 },
  },
  {
    id: "maghrib",
    name: "المغرب",
    polygon: "6,26 28,24 30,30 26,34 10,33 5,30",
    label: { x: 17, y: 29 },
  },
  {
    id: "misr",
    name: "مصر",
    polygon: "30,26 40,25 42,32 39,38 32,38 29,32",
    label: { x: 35, y: 32 },
  },
  {
    id: "sham",
    name: "الشام",
    polygon: "40,22 50,21 51,29 46,32 41,30",
    label: { x: 45.5, y: 26 },
  },
  {
    id: "hijaz",
    name: "الحجاز",
    polygon: "41,33 50,32 52,42 47,49 42,48 39,40",
    label: { x: 45.5, y: 40 },
  },
  {
    id: "iraq",
    name: "العراق",
    polygon: "50,24 60,23 62,30 57,33 51,31",
    label: { x: 56, y: 28 },
  },
  {
    id: "anadol",
    name: "الأناضول",
    polygon: "42,13 60,12 62,18 56,21 46,21 42,18",
    label: { x: 52, y: 16.5 },
  },
  {
    id: "fars",
    name: "فارس",
    polygon: "58,26 70,25 72,32 65,36 58,34",
    label: { x: 65, y: 30 },
  },
  {
    id: "khurasan",
    name: "خراسان",
    polygon: "66,18 80,17 81,26 72,28 65,25",
    label: { x: 73, y: 22.5 },
  },
  {
    id: "ma_wara_al_nahr",
    name: "ما وراء النهر",
    polygon: "72,10 86,9 88,16 80,18 72,16",
    label: { x: 79, y: 13.5 },
  },
  {
    id: "hind",
    name: "الهند",
    polygon: "82,26 95,25 97,36 92,44 84,42 81,33",
    label: { x: 89, y: 34 },
  },
];

/** Major historical reference cities — small dots to orient the admin. */
export interface AtlasReference {
  name: string;
  x: number;
  y: number;
  region: AtlasRegionId;
}

export const ATLAS_REFERENCES: AtlasReference[] = [
  { name: "قرطبة",    x: 7.5,  y: 17.5, region: "andalus" },
  { name: "فاس",      x: 14,   y: 28.5, region: "maghrib" },
  { name: "القيروان", x: 24,   y: 27,   region: "maghrib" },
  { name: "القاهرة",  x: 36,   y: 30,   region: "misr" },
  { name: "دمشق",     x: 46,   y: 25,   region: "sham" },
  { name: "القدس",    x: 44,   y: 27.5, region: "sham" },
  { name: "مكة",      x: 45,   y: 41,   region: "hijaz" },
  { name: "المدينة",  x: 44.5, y: 38,   region: "hijaz" },
  { name: "بغداد",    x: 56,   y: 27.5, region: "iraq" },
  { name: "البصرة",   x: 58,   y: 31,   region: "iraq" },
  { name: "القسطنطينية", x: 47, y: 15, region: "anadol" },
  { name: "أصفهان",   x: 64,   y: 29,   region: "fars" },
  { name: "نيسابور",  x: 72,   y: 23,   region: "khurasan" },
  { name: "سمرقند",   x: 79,   y: 13.5, region: "ma_wara_al_nahr" },
  { name: "بخارى",    x: 76,   y: 15,   region: "ma_wara_al_nahr" },
  { name: "دلهي",     x: 87,   y: 31,   region: "hind" },
];

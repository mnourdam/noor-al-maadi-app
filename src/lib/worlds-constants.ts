export type WorldHub = {
  slug: string;
  glyph: string;
  order: number;
};

// Ordering + glyphs only. Titles/subtitles come from the content data.
export const WORLD_HUBS: WorldHub[] = [
  { slug: "prophetic", glyph: "🌙", order: 1 },
  { slug: "rashidun", glyph: "🕋", order: 2 },
  { slug: "umayyad", glyph: "🏛️", order: 3 },
  { slug: "andalus", glyph: "🕌", order: 4 },
  { slug: "abbasid", glyph: "📚", order: 5 },
  { slug: "fatimid", glyph: "🌌", order: 6 },
  { slug: "seljuk", glyph: "🏹", order: 7 },
  { slug: "zengid", glyph: "🛡️", order: 8 },
  { slug: "ayyubid-state", glyph: "⚔️", order: 9 },
  { slug: "mamluk-sultanate", glyph: "🗡️", order: 10 },
  { slug: "mongols", glyph: "🐎", order: 11 },
  { slug: "timurid", glyph: "🏇", order: 12 },
  { slug: "ottoman", glyph: "🌘", order: 13 },
  { slug: "safavid", glyph: "🏺", order: 14 },
];

export const WORLD_SLUGS = new Set(WORLD_HUBS.map((h) => h.slug));

// Canonical era tag per hub. Used to enforce strict world membership for
// related entities so that, e.g., prophetic-era events never appear inside
// the Ottoman world page. Hubs whose data has no era tag fall back to the
// hub slug itself.
export const WORLD_ERA: Record<string, string> = {
  prophetic: "prophetic",
  rashidun: "rashidun",
  umayyad: "umayyad",
  andalus: "andalus",
  abbasid: "abbasid",
  fatimid: "fatimid",
  seljuk: "seljuk",
  zengid: "zengid",
  "ayyubid-state": "ayyubid",
  "mamluk-sultanate": "mamluk",
  mongols: "mongols",
  timurid: "timurid",
  ottoman: "ottoman",
  safavid: "safavid",
};
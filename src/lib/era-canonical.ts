// Canonical era taxonomy for encyclopedia_entities.metadata.era.
// All raw/legacy slugs are mapped to a single canonical key, which has
// a chronological order and a single Arabic display label.

export type CanonicalEra =
  | "prophetic"
  | "rashidun"
  | "umayyad"
  | "andalus"
  | "taifa"
  | "abbasid"
  | "buyid"
  | "fatimid"
  | "seljuk"
  | "byzantine"
  | "crusades"
  | "zengid"
  | "ayyubid"
  | "mongols"
  | "mamluk"
  | "timurid"
  | "ottoman"
  | "modern";

export const CANONICAL_ERA_ORDER: CanonicalEra[] = [
  "prophetic",
  "rashidun",
  "umayyad",
  "andalus",
  "taifa",
  "abbasid",
  "buyid",
  "fatimid",
  "seljuk",
  "byzantine",
  "crusades",
  "zengid",
  "ayyubid",
  "mongols",
  "mamluk",
  "timurid",
  "ottoman",
  "modern",
];

export const CANONICAL_ERA_LABEL: Record<CanonicalEra, string> = {
  prophetic: "العهد النبوي",
  rashidun: "الخلافة الراشدة",
  umayyad: "الدولة الأموية",
  andalus: "الأندلس الإسلامية",
  taifa: "عصر ملوك الطوائف",
  abbasid: "الدولة العباسية",
  buyid: "العصر البويهي",
  fatimid: "الدولة الفاطمية",
  seljuk: "السلاجقة",
  byzantine: "العصر البيزنطي",
  crusades: "عصر الحروب الصليبية",
  zengid: "العصر الزنكي",
  ayyubid: "الأيوبيون",
  mongols: "الغزو المغولي",
  mamluk: "المماليك",
  timurid: "العصر التيموري",
  ottoman: "العثمانيون",
  modern: "العصر الحديث",
};

// Raw slug → canonical key. Keys are normalized (lowercase, hyphenated).
const RAW_TO_CANONICAL: Record<string, CanonicalEra> = {
  // Prophetic
  "seerah": "prophetic",
  "prophetic": "prophetic",
  "prophetic-era": "prophetic",
  "prophetic-makkah": "prophetic",
  "prophetic-madinah": "prophetic",
  "makkah": "prophetic",
  "madinah": "prophetic",

  // Rashidun
  "rashidun": "rashidun",
  "rashidun-era": "rashidun",
  "rashidun-caliphate": "rashidun",
  "khulafa-rashidun": "rashidun",

  // Umayyad (Damascus)
  "umayyad": "umayyad",
  "umayyad-era": "umayyad",
  "umayyad-caliphate": "umayyad",
  "umawi": "umayyad",
  "umayyad-damascus": "umayyad",

  // Andalus (everything Iberian / Maghreb-Iberian)
  "andalus": "andalus",
  "al-andalus": "andalus",
  "andalusia": "andalus",
  "andalus-umayyad": "andalus",
  "andalus-caliphate": "andalus",
  "andalusi": "andalus",
  "cordoba": "andalus",
  "cordoba-caliphate": "andalus",
  "taifa": "andalus",
  "taifa-kingdoms": "andalus",
  "murabitun": "andalus",
  "almoravid": "andalus",
  "almoravids": "andalus",
  "muwahhidun": "andalus",
  "almohad": "andalus",
  "almohads": "andalus",
  "granada": "andalus",
  "nasrid": "andalus",
  "post-granada": "andalus",
  "reconquista": "andalus",

  // Taifa (own canonical era)
  "taifa": "taifa",
  "taifa-kingdoms": "taifa",
  "taifas": "taifa",
  "muluk-al-tawaif": "taifa",

  // Abbasid
  "abbasid": "abbasid",
  "abbasid-era": "abbasid",
  "abbasid-caliphate": "abbasid",
  "abbasi": "abbasid",
  "baghdad": "abbasid",

  // Buyid
  "buyid": "buyid",
  "buyids": "buyid",
  "buwayhid": "buyid",
  "buwayhids": "buyid",
  "buyid-era": "buyid",

  // Fatimid
  "fatimid": "fatimid",
  "fatimid-era": "fatimid",
  "fatimi": "fatimid",

  // Seljuk
  "seljuk": "seljuk",
  "seljuks": "seljuk",
  "saljuq": "seljuk",
  "saljuk": "seljuk",

  // Byzantine
  "byzantine": "byzantine",
  "byzantines": "byzantine",
  "byzantium": "byzantine",
  "byzantine-era": "byzantine",
  "roman-east": "byzantine",

  // Crusades
  "crusades": "crusades",
  "crusader": "crusades",
  "crusaders": "crusades",
  "crusader-era": "crusades",

  // Zengid
  "zengid": "zengid",
  "zangid": "zengid",
  "zengi": "zengid",
  "zankid": "zengid",
  "zengid-era": "zengid",

  // Ayyubid
  "ayyubid": "ayyubid",
  "ayyubi": "ayyubid",
  "ayyubid-era": "ayyubid",

  // Mongols
  "mongols": "mongols",
  "mongol": "mongols",
  "ilkhanid": "mongols",
  "mongol-invasion": "mongols",

  // Mamluk
  "mamluk": "mamluk",
  "mamluks": "mamluk",
  "mamluki": "mamluk",
  "mamluk-era": "mamluk",

  // Timurid
  "timurid": "timurid",
  "timurids": "timurid",
  "timurid-era": "timurid",
  "timur": "timurid",
  "tamerlane": "timurid",

  // Ottoman
  "ottoman": "ottoman",
  "ottomans": "ottoman",
  "ottoman-era": "ottoman",
  "late-ottoman": "ottoman",
  "uthmani": "ottoman",

  // Modern
  "modern": "modern",
  "contemporary": "modern",
  "ww1": "modern",
  "transition": "modern",
};

function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

export function toCanonicalEra(raw: string | null | undefined): CanonicalEra | null {
  if (!raw) return null;
  const key = normalize(raw);
  if (key in RAW_TO_CANONICAL) return RAW_TO_CANONICAL[key];
  // already canonical?
  if ((CANONICAL_ERA_ORDER as string[]).includes(key)) return key as CanonicalEra;
  return null;
}

export function canonicalEraLabel(key: string | null | undefined): string {
  const c = toCanonicalEra(key);
  if (c) return CANONICAL_ERA_LABEL[c];
  return key ?? "";
}

export function eraSortIndex(key: string | null | undefined): number {
  const c = toCanonicalEra(key);
  if (!c) return 9999;
  return CANONICAL_ERA_ORDER.indexOf(c);
}

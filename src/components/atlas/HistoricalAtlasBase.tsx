// Phase 3.5 — Historical Atlas Foundation (hand-stylised SVG, manuscript aesthetic).
// Coordinate space: viewBox 0 0 100 60 (unchanged). All geography drawn around
// the existing city anchors in src/lib/atlas-regions.ts — zero data migration.
// Arabic-only labels. No external map library, no tiles, no political borders.
import { ATLAS_REGIONS } from "@/lib/atlas-regions";

// ─── Seas ────────────────────────────────────────────────────────────────────
// Painted on top of the parchment so what's left is land.
const SEAS: Record<string, string> = {
  // Atlantic strip + a touch of Bay of Biscay
  atlantic:
    "M -2,-2 L 5,-2 C 5,4 4,9 4,14 C 4,18 5,21 5,25 L 4,40 L 2,55 L -2,62 Z",
  // Western Mediterranean (Gibraltar → Sicily channel)
  med_west:
    "M 5,12 C 12,11 22,11 32,11 C 36,12 39,13 40,15 C 40,18 39,21 37,22 C 30,23 22,23 14,22 C 8,22 5,20 5,17 C 4,15 4,13 5,12 Z",
  // Eastern Mediterranean / Levantine basin (south of Anatolia, west of Levant)
  med_east:
    "M 38,20 C 42,22 46,23 50,23 C 54,23 58,22 60,21 C 61,19 60,18 58,18 C 54,17 50,17 46,17 C 43,18 40,18 38,19 Z",
  // Black Sea
  black:
    "M 46,7 C 52,6 57,7 60,8 C 62,9 62,11 60,12 C 56,13 50,13 46,12 C 44,11 44,8 46,7 Z",
  // Caspian (oblong N–S)
  caspian:
    "M 63,13 C 66,12 69,14 69,17 C 70,21 68,25 65,26 C 63,26 62,24 62,21 C 62,17 62,14 63,13 Z",
  // Red Sea (long NW–SE, narrow)
  red:
    "M 39,30 C 41,30 42,32 42,35 L 43,42 C 44,47 44,51 43,52 C 41,52 40,50 39,47 L 38,40 L 37,34 C 37,31 38,30 39,30 Z",
  // Arabian / Persian Gulf
  gulf:
    "M 52,32 C 55,32 57,34 59,36 L 62,40 C 62,42 61,43 59,42 L 56,40 L 53,36 C 51,34 51,32 52,32 Z",
  // Arabian Sea / Indian Ocean (large southern band)
  arabian_sea:
    "M 40,52 C 48,50 56,49 64,49 C 72,49 80,49 88,48 C 95,48 100,50 102,54 L 102,62 L 38,62 C 38,58 39,55 40,52 Z",
};

// ─── Rivers ──────────────────────────────────────────────────────────────────
const RIVERS: Record<string, string> = {
  nile:        "M 36,30 C 35,34 35,40 36,46 C 36,52 35,58 35,62",
  tigris:      "M 51,21 C 53,24 55,27 56,29 C 57,31 58,33 59,35",
  euphrates:   "M 49,22 C 51,25 53,28 55,30 C 56,32 57,33 58,34",
  oxus:        "M 82,17 C 78,18 74,19 70,18 C 67,17 64,16 62,15",
  indus:       "M 88,17 C 88,22 88,27 87,32 C 86,38 85,43 84,48",
  guadalquivir:"M 8,17 C 6,18 4,19 3,20",
};

// ─── Mountain glyph chains ──────────────────────────────────────────────────
const MOUNTAINS: [number, number][][] = [
  // Atlas (N. Africa)
  [[10,25.5],[13,26],[16,25.7],[19,26],[22,25.7],[25,26],[28,25.7]],
  // Taurus (S. Anatolia, above E. Med)
  [[44,17.5],[47,17.2],[50,17.5],[53,17.2],[56,17.5],[59,17.2]],
  // Zagros (W. Persia)
  [[58,23.5],[60,25],[61.5,27],[63,29],[64,31],[65,33]],
  // Hindu Kush (Khurasan / Transoxiana edge)
  [[70,19],[73,18.5],[76,19],[79,18.5],[82,19]],
];

// ─── Sea labels (Arabic, italic-ish via small-caps letterspacing) ───────────
const SEA_LABELS: { name: string; x: number; y: number; size?: number; rotate?: number }[] = [
  { name: "البحر المتوسط",  x: 22, y: 17, size: 2.0 },
  { name: "البحر الأسود",   x: 53, y: 10, size: 1.1 },
  { name: "بحر قزوين",      x: 65.5, y: 19.5, size: 1.1 },
  { name: "البحر الأحمر",   x: 40.5, y: 42, size: 1.05, rotate: 78 },
  { name: "الخليج العربي",  x: 58, y: 38, size: 1.0, rotate: 50 },
  { name: "بحر العرب",      x: 70, y: 56, size: 1.7 },
  { name: "المحيط الأطلسي", x: 2.2, y: 35, size: 1.0, rotate: -90 },
];

// ─── Region labels (soft, no borders) ───────────────────────────────────────
const REGION_LABELS: { name: string; x: number; y: number }[] = [
  { name: "الأندلس",       x: 7.5, y: 15.5 },
  { name: "المغرب",        x: 14,  y: 30 },
  { name: "إفريقية",       x: 26,  y: 30 },
  { name: "مصر",           x: 34,  y: 33 },
  { name: "الشام",         x: 46,  y: 24 },
  { name: "الحجاز",        x: 48,  y: 40 },
  { name: "نجد",           x: 52,  y: 44 },
  { name: "اليمن",         x: 49,  y: 52 },
  { name: "العراق",        x: 54,  y: 26 },
  { name: "الأناضول",      x: 50,  y: 14 },
  { name: "فارس",          x: 66,  y: 28 },
  { name: "خراسان",        x: 75,  y: 22 },
  { name: "ما وراء النهر", x: 78,  y: 12 },
  { name: "السند والهند",  x: 90,  y: 36 },
];

// ─── City anchors (real positions, Arabic only) ─────────────────────────────
const CITY_ANCHORS: { name: string; x: number; y: number; major?: boolean }[] = [
  { name: "قرطبة",      x: 7.5,  y: 17.5, major: true },
  { name: "فاس",        x: 14,   y: 28.5 },
  { name: "القيروان",   x: 24,   y: 27 },
  { name: "القاهرة",    x: 36,   y: 30,   major: true },
  { name: "القدس",      x: 44,   y: 27.5, major: true },
  { name: "دمشق",       x: 46,   y: 25,   major: true },
  { name: "المدينة",    x: 44.5, y: 38,   major: true },
  { name: "مكة",        x: 45,   y: 41,   major: true },
  { name: "بغداد",      x: 56,   y: 27.5, major: true },
  { name: "البصرة",     x: 58,   y: 31 },
  { name: "القسطنطينية",x: 47,   y: 14.5, major: true },
  { name: "أصفهان",     x: 64,   y: 29 },
  { name: "نيسابور",    x: 72,   y: 23 },
  { name: "سمرقند",     x: 79,   y: 13.5, major: true },
  { name: "بخارى",      x: 76,   y: 15,   major: true },
  { name: "دلهي",       x: 87,   y: 31,   major: true },
];

// Shared defs — included once per SVG instance. Each consumer SVG should
// include <AtlasBaseDefs/> in its own <defs>. ids are scoped to the SVG.
export function AtlasBaseDefs() {
  return (
    <>
      <pattern id="atlas-sea-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <line x1="0" y1="0" x2="0" y2="2.4" stroke="oklch(0.40 0.07 220 / 0.35)" strokeWidth="0.12" />
      </pattern>
      <radialGradient id="atlas-vignette" cx="50%" cy="50%" r="70%">
        <stop offset="55%" stopColor="oklch(0.95 0.04 80 / 0)" />
        <stop offset="100%" stopColor="oklch(0.28 0.05 40 / 0.40)" />
      </radialGradient>
      <radialGradient id="atlas-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="oklch(0.95 0.14 82 / 0.85)" />
        <stop offset="100%" stopColor="oklch(0.85 0.14 82 / 0)" />
      </radialGradient>
    </>
  );
}

export type AtlasBaseProps = {
  /** 1/scale — keeps labels and city dots crisp under zoom transforms. */
  inv?: number;
  showRivers?: boolean;
  showMountains?: boolean;
  showRegionWashes?: boolean;
  showCities?: boolean;
  showSeaLabels?: boolean;
  showRegionLabels?: boolean;
};

export function AtlasBaseLayers({
  inv = 1,
  showRivers = true,
  showMountains = true,
  showRegionWashes = true,
  showCities = true,
  showSeaLabels = true,
  showRegionLabels = true,
}: AtlasBaseProps) {
  const COAST = "oklch(0.32 0.08 50 / 0.85)";
  const SEA_FILL = "oklch(0.80 0.05 220)";
  const RIVER = "oklch(0.42 0.10 225 / 0.75)";
  const PARCHMENT = "oklch(0.91 0.06 82)";

  return (
    <g className="atlas-base">
      {/* Parchment land base */}
      <rect width="100" height="60" fill={PARCHMENT} />

      {/* Seas: fill → hatch overlay → ink coastline */}
      <g className="atlas-seas">
        {Object.entries(SEAS).map(([k, d]) => (
          <g key={k}>
            <path d={d} fill={SEA_FILL} />
            <path d={d} fill="url(#atlas-sea-hatch)" />
            <path d={d} fill="none" stroke={COAST} strokeWidth="0.2" strokeLinejoin="round" />
          </g>
        ))}
      </g>

      {/* Soft region washes (no borders) */}
      {showRegionWashes && (
        <g className="atlas-region-wash" pointerEvents="none">
          {ATLAS_REGIONS.map((r) => (
            <polygon key={r.id} points={r.polygon} fill="oklch(0.85 0.09 78 / 0.22)" />
          ))}
        </g>
      )}

      {/* Rivers */}
      {showRivers && (
        <g className="atlas-rivers" pointerEvents="none" fill="none"
           stroke={RIVER} strokeLinecap="round" strokeLinejoin="round">
          {Object.entries(RIVERS).map(([k, d]) => (
            <path key={k} d={d} strokeWidth="0.24" />
          ))}
        </g>
      )}

      {/* Mountain glyph chains */}
      {showMountains && (
        <g className="atlas-mountains" pointerEvents="none" fill="oklch(0.34 0.06 50 / 0.65)">
          {MOUNTAINS.flat().map(([x, y], i) => (
            <path key={i} d={`M ${x - 0.7},${y + 0.55} L ${x},${y - 0.55} L ${x + 0.7},${y + 0.55} Z`} />
          ))}
        </g>
      )}

      {/* Sea labels */}
      {showSeaLabels && (
        <g className="atlas-sea-labels" pointerEvents="none">
          {SEA_LABELS.map((s) => (
            <text
              key={s.name}
              x={s.x} y={s.y}
              textAnchor="middle"
              fontSize={(s.size ?? 1.2) * inv}
              fill="oklch(0.32 0.08 220 / 0.80)"
              transform={s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined}
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.12em" }}
            >{s.name}</text>
          ))}
        </g>
      )}

      {/* Region labels */}
      {showRegionLabels && (
        <g className="atlas-region-labels" pointerEvents="none">
          {REGION_LABELS.map((r) => (
            <text
              key={r.name}
              x={r.x} y={r.y}
              textAnchor="middle"
              fontSize={1.9 * inv}
              fontWeight={800}
              fill="oklch(0.30 0.08 50 / 0.78)"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
            >{r.name}</text>
          ))}
        </g>
      )}

      {/* City anchors (decorative reference dots + Arabic names) */}
      {showCities && (
        <g className="atlas-cities" pointerEvents="none">
          {CITY_ANCHORS.map((c) => {
            const r = (c.major ? 0.55 : 0.4) * inv;
            return (
              <g key={c.name} transform={`translate(${c.x} ${c.y})`}>
                <circle r={r} fill="oklch(0.95 0.06 82)" stroke="oklch(0.30 0.08 50)" strokeWidth={0.18 * inv} />
                <circle r={r * 0.4} fill="oklch(0.30 0.08 50)" />
                <text
                  x={0.9 * inv} y={0.5 * inv}
                  fontSize={(c.major ? 1.35 : 1.1) * inv}
                  fontWeight={c.major ? 700 : 500}
                  fill="oklch(0.22 0.08 50)"
                  style={{ fontFamily: "var(--font-display)" }}
                >{c.name}</text>
              </g>
            );
          })}
        </g>
      )}

      {/* Vignette over everything */}
      <rect width="100" height="60" fill="url(#atlas-vignette)" pointerEvents="none" />
    </g>
  );
}

/** Compass cartouche — HTML overlay, Arabic cardinal point. */
export function AtlasCompass({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className="text-amber-900/75">
      <circle cx="30" cy="30" r="27" fill="oklch(0.93 0.06 82)" stroke="currentColor" strokeWidth="0.6" />
      <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="0.3" />
      <path d="M30,5 L33,30 L30,55 L27,30 Z" fill="currentColor" opacity="0.8" />
      <path d="M5,30 L30,27 L55,30 L30,33 Z" fill="currentColor" opacity="0.5" />
      <text x="30" y="11" textAnchor="middle" fontSize="6" fontWeight="800" fill="currentColor"
        style={{ fontFamily: "var(--font-display)" }}>ش</text>
      <text x="30" y="56" textAnchor="middle" fontSize="6" fontWeight="800" fill="currentColor"
        style={{ fontFamily: "var(--font-display)" }}>ج</text>
    </svg>
  );
}

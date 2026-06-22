// Phase 3.6 — Historical Atlas Foundation (manuscript aesthetic, land-first).
// Coordinate space: viewBox 0 0 100 60 (unchanged — all existing city
// coordinates remain valid). Arabic-only labels. No tiles, no political
// borders. Land silhouettes hand-drawn around the existing city anchors so
// Iberia, Maghreb, Egypt, the Levant, Arabia, Anatolia, Persia, Khurasan,
// Transoxiana and Hind are recognizable before any marker appears.

// ─── Seas (large, properly shaped — what's not blue is land) ────────────────
// Each path is intentionally generous so the *negative space* — the land —
// reads as a real continent rather than a parchment void.
const SEAS: Record<string, string> = {
  // Atlantic — full left edge with Bay of Biscay notch and a bow around
  // Iberia's western flank.
  atlantic:
    "M -4,-4 L 3,-4 L 3,4 C 4,6 4,8 3,10 L 1,13 C 0,15 0,17 1,19 L 3,21 L 3,24 L 1,32 L -1,46 L -3,60 L -4,64 Z",

  // Mediterranean — single elongated basin from Gibraltar to the Levantine
  // coast, with a southern bulge for the Gulf of Sidra and a notch at the
  // Aegean. Land north of it = southern Europe; land south = Maghreb/Egypt.
  mediterranean:
    "M 3,19 \
     C 6,18 10,18 14,18.5 \
     C 20,17.5 28,17 34,17.5 \
     C 38,17.8 41,18.2 42.5,19 \
     L 43,21 \
     C 43,23 42,23.8 40,24 \
     C 34,24.5 27,25 21,24.5 \
     C 16,24 11,24.2 7,23.5 \
     C 4,23 3,21.5 3,20.5 Z",

  // Aegean inlet — small notch between Greece and Anatolia
  aegean:
    "M 41,15 C 42,15 43,16 43,17.5 L 42.5,19 L 41.5,18 C 41,17 41,16 41,15 Z",

  // Black Sea — broad ellipse north of Anatolia
  black:
    "M 44,8 \
     C 49,7 55,7 60,7.8 \
     C 63,8.5 63.5,10 62,11.5 \
     C 57,12.8 50,12.8 46,12 \
     C 43,11.2 42.5,9 44,8 Z",

  // Caspian — vertical oblong east of the Caucasus
  caspian:
    "M 63,12.5 \
     C 66,12 68.5,13 69,15 \
     C 69.5,18 69,22 67.5,24 \
     C 65.5,25 63.5,24 63,21.5 \
     C 62.5,18 62.5,14.5 63,12.5 Z",

  // Red Sea — long narrow rift, Suez (NW) → Bab al-Mandeb (SE)
  red_sea:
    "M 38,28.5 \
     C 39.5,28.5 40.5,29.5 41,31 \
     L 43,38 \
     L 45.5,46 \
     L 48,53 \
     C 48.5,55 47.5,55.5 46.5,54.5 \
     L 44,49 \
     L 41,40 \
     L 38.5,33 \
     C 37.5,31 37,29.5 38,28.5 Z",

  // Persian / Arabian Gulf — runs NW from Mesopotamia to Strait of Hormuz
  gulf:
    "M 52,31 \
     C 55,31.5 57.5,33 60,35 \
     L 63,38 L 64.5,41 \
     C 64.8,42.5 63.5,42.8 62,42 \
     L 58,39.5 L 55,37 L 52,34 \
     C 51,33 51,31.5 52,31 Z",

  // Arabian Sea / Indian Ocean — broad southern band, with Gulf of Oman
  arabian_sea:
    "M -2,54 \
     C 6,52.5 14,52 22,52.2 \
     C 30,52.5 36,52 41,52 \
     C 46,52 50,53 56,52.5 \
     C 62,52 66,50.5 70,49.5 \
     C 76,48.5 82,48 88,48.2 \
     C 94,48.5 100,49.5 102,52 \
     L 102,64 L -4,64 Z",

  // Bay of Bengal — east of India
  bengal:
    "M 96,30 C 100,32 102,40 100,48 L 98,52 L 96,48 C 95,40 95,34 96,30 Z",
};

// ─── Rivers ──────────────────────────────────────────────────────────────────
const RIVERS: Record<string, string> = {
  // Nile — from headwaters in the south up to the delta on the Med
  nile:
    "M 35,58 C 34.5,52 35,46 35.5,40 C 35.8,35 35.8,32 36,30 L 36,28.5",
  // Tigris — Anatolian highlands → Basra
  tigris:
    "M 51,17 C 53,20 54.5,23 55.5,26 C 56.5,28.5 57.5,30.5 58.5,32 L 59,33",
  // Euphrates — Anatolian highlands → joins Tigris near Basra
  euphrates:
    "M 48,17.5 C 50,21 52,24 54,27 C 55.5,29.5 57,31 58.5,32.5",
  // Indus — Hindu Kush south through Sind into Arabian Sea
  indus:
    "M 86,15 C 86,20 86.5,25 86,30 C 85.5,36 84.5,42 83,48 L 82,52",
  // Oxus / Amu Darya — Pamir → Aral region
  oxus:
    "M 85,14 C 80,15 75,16.5 70,17 C 67,17.3 64,17 62,16",
  // Guadalquivir — short stroke in Al-Andalus toward Atlantic
  guadalquivir:
    "M 9,16.5 C 7,17 5,17.5 3,18",
  // Jordan — Galilee → Dead Sea
  jordan:
    "M 44,23 L 44.2,26 L 44.5,28.5",
};

// ─── Mountain glyph chains (decorative triangles) ──────────────────────────
const MOUNTAINS: [number, number][][] = [
  // Atlas (N. Africa)
  [[8,25.5],[11,26],[14,25.8],[17,26],[20,25.8],[23,26]],
  // Taurus (S. Anatolia)
  [[44,15.5],[47,15.3],[50,15.6],[53,15.3],[56,15.6],[59,15.3]],
  // Caucasus (between Black & Caspian)
  [[58,11],[60,11.3],[62,11.5]],
  // Zagros (W. Persia)
  [[57,21],[59,23],[61,25],[63,27],[65,29],[67,31]],
  // Hindu Kush (Khurasan/Transoxiana border into Hind)
  [[78,17],[81,17.3],[84,17],[87,17.3],[90,17]],
  // Pyrenees (north Iberia)
  [[3,10],[5,10.2],[7,10],[9,10.2],[11,10]],
  // Sarawat (W. Arabia, parallel to Red Sea)
  [[45,32],[45.3,35],[45.6,38],[46,42],[46.3,46],[46.6,49]],
];

// ─── Sea labels (Arabic) ────────────────────────────────────────────────────
const SEA_LABELS: { name: string; x: number; y: number; size?: number; rotate?: number }[] = [
  { name: "البحر المتوسط",  x: 22,   y: 21,   size: 2.1 },
  { name: "البحر الأسود",   x: 53,   y: 10,   size: 1.2 },
  { name: "بحر قزوين",      x: 66,   y: 18,   size: 1.1, rotate: 78 },
  { name: "البحر الأحمر",   x: 41.5, y: 40,   size: 1.2, rotate: 72 },
  { name: "الخليج العربي",  x: 58,   y: 37,   size: 1.1, rotate: 42 },
  { name: "بحر العرب",      x: 70,   y: 58,   size: 2.0 },
  { name: "المحيط الأطلسي", x: 1.4,  y: 38,   size: 1.2, rotate: -90 },
  { name: "المحيط الهندي",  x: 95,   y: 58,   size: 1.4 },
];

// ─── Region labels (the geography the user must read instantly) ─────────────
const REGION_LABELS: { name: string; x: number; y: number; size?: number }[] = [
  { name: "الأندلس",       x: 6.5,  y: 14,   size: 1.9 },
  { name: "المغرب",        x: 14,   y: 29,   size: 1.9 },
  { name: "إفريقية",       x: 26,   y: 29,   size: 1.7 },
  { name: "مصر",           x: 34,   y: 33,   size: 2.0 },
  { name: "النوبة",        x: 36,   y: 45,   size: 1.4 },
  { name: "الشام",         x: 46,   y: 22.5, size: 1.7 },
  { name: "الحجاز",        x: 47,   y: 39,   size: 1.7 },
  { name: "نجد",           x: 52,   y: 43,   size: 1.5 },
  { name: "اليمن",         x: 50,   y: 51,   size: 1.6 },
  { name: "عُمان",         x: 60,   y: 47,   size: 1.4 },
  { name: "العراق",        x: 55,   y: 25,   size: 1.7 },
  { name: "الأناضول",      x: 52,   y: 13.5, size: 1.9 },
  { name: "فارس",          x: 67,   y: 27,   size: 1.9 },
  { name: "خراسان",        x: 75,   y: 22,   size: 1.7 },
  { name: "ما وراء النهر", x: 78,   y: 11,   size: 1.5 },
  { name: "السند",         x: 87,   y: 28,   size: 1.5 },
  { name: "الهند",         x: 92,   y: 38,   size: 2.0 },
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

// Shared defs — include once per SVG via <AtlasBaseDefs/> in its <defs>.
export function AtlasBaseDefs() {
  return (
    <>
      {/* Subtle parchment grain so land doesn't read as flat fill */}
      <pattern id="atlas-land-grain" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="oklch(0.91 0.06 82)" />
        <circle cx="0.6" cy="0.7" r="0.18" fill="oklch(0.82 0.08 70 / 0.35)" />
        <circle cx="2.1" cy="2.3" r="0.14" fill="oklch(0.78 0.07 60 / 0.30)" />
      </pattern>
      {/* Diagonal hatch overlay for seas — manuscript engraving feel */}
      <pattern id="atlas-sea-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <line x1="0" y1="0" x2="0" y2="2.4" stroke="oklch(0.40 0.07 220 / 0.32)" strokeWidth="0.12" />
      </pattern>
      {/* Soft ring of warmer parchment along coastlines */}
      <radialGradient id="atlas-coast-halo" cx="50%" cy="50%" r="60%">
        <stop offset="60%" stopColor="oklch(0.93 0.07 78 / 0)" />
        <stop offset="100%" stopColor="oklch(0.82 0.10 60 / 0.30)" />
      </radialGradient>
      <radialGradient id="atlas-vignette" cx="50%" cy="50%" r="72%">
        <stop offset="55%" stopColor="oklch(0.95 0.04 80 / 0)" />
        <stop offset="100%" stopColor="oklch(0.26 0.05 40 / 0.45)" />
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
  /** @deprecated retained for back-compat; no longer renders anything. */
  showRegionWashes?: boolean;
  showCities?: boolean;
  showSeaLabels?: boolean;
  showRegionLabels?: boolean;
};

export function AtlasBaseLayers({
  inv = 1,
  showRivers = true,
  showMountains = true,
  showCities = true,
  showSeaLabels = true,
  showRegionLabels = true,
}: AtlasBaseProps) {
  const COAST = "oklch(0.28 0.08 50 / 0.85)";
  const SEA_FILL = "oklch(0.78 0.06 220)";
  const RIVER = "oklch(0.40 0.11 225 / 0.78)";

  return (
    <g className="atlas-base">
      {/* Parchment land base (grain) — what's left after seas are painted */}
      <rect width="100" height="60" fill="url(#atlas-land-grain)" />

      {/* Soft warm coastal halo across the whole canvas (subtle warmth) */}
      <rect width="100" height="60" fill="url(#atlas-coast-halo)" pointerEvents="none" />

      {/* Seas: fill → hatch → ink coast */}
      <g className="atlas-seas">
        {Object.entries(SEAS).map(([k, d]) => (
          <g key={k}>
            <path d={d} fill={SEA_FILL} />
            <path d={d} fill="url(#atlas-sea-hatch)" />
            <path d={d} fill="none" stroke={COAST} strokeWidth="0.22" strokeLinejoin="round" />
          </g>
        ))}
      </g>

      {/* Rivers */}
      {showRivers && (
        <g className="atlas-rivers" pointerEvents="none" fill="none"
           stroke={RIVER} strokeLinecap="round" strokeLinejoin="round">
          {Object.entries(RIVERS).map(([k, d]) => (
            <path key={k} d={d} strokeWidth="0.26" />
          ))}
        </g>
      )}

      {/* Mountain glyph chains */}
      {showMountains && (
        <g className="atlas-mountains" pointerEvents="none" fill="oklch(0.34 0.06 50 / 0.62)">
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
              fill="oklch(0.30 0.10 220 / 0.85)"
              transform={s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined}
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.14em", fontStyle: "italic" }}
            >{s.name}</text>
          ))}
        </g>
      )}

      {/* Region labels — the geographic literacy layer */}
      {showRegionLabels && (
        <g className="atlas-region-labels" pointerEvents="none">
          {REGION_LABELS.map((r) => (
            <text
              key={r.name}
              x={r.x} y={r.y}
              textAnchor="middle"
              fontSize={(r.size ?? 1.7) * inv}
              fontWeight={800}
              fill="oklch(0.28 0.09 50 / 0.82)"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.12em" }}
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
                <circle r={r} fill="oklch(0.95 0.06 82)" stroke="oklch(0.28 0.08 50)" strokeWidth={0.18 * inv} />
                <circle r={r * 0.4} fill="oklch(0.28 0.08 50)" />
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

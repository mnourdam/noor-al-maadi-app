// Phase 3.7 — Continuous coastline atlas.
// Ocean is one body. Eurasia-Africa-Arabia is ONE land path painted on top
// of the ocean, so the Mediterranean opens through Gibraltar to the
// Atlantic, the Red Sea opens through Bab al-Mandeb to the Arabian Sea,
// and the Persian Gulf sits between Arabia and Persia as a real notch.
// Black Sea, Caspian and Aral remain distinct inland seas (separate blue
// shapes painted back over the land).
//
// Coordinate space: viewBox 0 0 100 60. Every city anchor below sits
// inside the land path on purpose — coordinate compatibility preserved.

// ─── ONE LAND PATH ───────────────────────────────────────────────────────────
// Clockwise from top-left. Carries the Med inlet (south Europe ↔ N Africa,
// open at Gibraltar), Red Sea inlet (W Arabia ↔ E Africa, open at Bab
// al-Mandeb), Persian Gulf notch (Persia ↔ Arabia), Sind/Makran south coast.
const EURASIA_AFRICA_ARABIA = `
  M -4,-4
  L 104,-4
  L 104,52
  C 100,53 95,53.2 90,52.8
  C 86,52.6 84,52.4 83,52
  C 82.5,47 82,42 82,37
  C 78,37 73,37 68,36.8
  C 66,36.8 64,36.4 63,35.4
  C 60,33 57,31 54.5,29.5
  C 56.5,31 59,34 61.5,37
  C 63,40 63,44 62.5,47
  C 62,49 60,51 57,52
  C 53,52.6 49,53 45.5,53.5
  C 45.8,49 46,44 44.5,39
  C 44.5,35 44.2,31.5 44.5,29.5
  L 39.5,29.5
  C 38.8,32 38.2,37 37.8,42
  C 37.4,47 37,52 37.5,57
  L 38,60
  L -4,60
  L -4,30
  C -2,27 0,25 2,22.5
  C 5,22.5 10,23 14,23
  C 22,24 30,24.5 36,26
  C 39,27 42,26.5 43,24.5
  C 43.5,21 43.6,18 44,16
  C 42,14.5 38,13.8 32,13.4
  C 26,13 20,13 14,14
  C 10,16 6,19 3,21
  C 1,18 -1,14 -2,10
  C -3,5 -4,0 -4,-2
  Z
`;

// ─── Inland seas (distinct, painted on top of land) ─────────────────────────
type Inland = { id: string; cx: number; cy: number; rx: number; ry: number; tilt?: number };
const INLAND_SEAS: Inland[] = [
  { id: "black",   cx: 53,   cy: 9.4,  rx: 10.5, ry: 2.6 },
  { id: "caspian", cx: 66,   cy: 19,   rx: 3.2,  ry: 6.8 },
  { id: "aral",    cx: 73,   cy: 12,   rx: 1.4,  ry: 1.0 },
];

// ─── Rivers (sit on top of land, plausible directions) ─────────────────────
const RIVERS: Record<string, string> = {
  // Nile — south → Mediterranean delta
  nile:        "M 35,58 C 34.5,52 35,46 35.5,40 C 35.8,35 35.8,32 36,30 L 36,28",
  // Tigris — Taurus → head of Persian Gulf
  tigris:      "M 51,16.5 C 53,20 54.5,23 55.5,26 C 56.5,28.5 57.5,30.5 58.5,32",
  // Euphrates — Taurus → joins Tigris near Basra
  euphrates:   "M 48,17 C 50,21 52,24 54,27 C 55.5,29.5 57,31 58.5,32.5",
  // Indus — Hindu Kush → Arabian Sea (Sind delta)
  indus:       "M 86,15 C 86,20 86.5,25 86,30 C 85.5,36 84.5,42 83,48 L 82,52",
  // Oxus (Amu Darya) — Pamir → Aral region
  oxus:        "M 85,14 C 80,15 75,15.5 70,15.5 C 67,15.5 64,15 62,15",
  // Guadalquivir — Al-Andalus → Atlantic
  guadalquivir:"M 9,18.5 C 7,19.5 5,20.2 3,20.8",
  // Jordan — Galilee → Dead Sea
  jordan:      "M 44,23 L 44.2,26 L 44.5,28.2",
};

// ─── Mountain glyph chains ──────────────────────────────────────────────────
const MOUNTAINS: [number, number][][] = [
  // Atlas (N. Africa)
  [[8,25.5],[11,26],[14,25.8],[17,26],[20,25.8],[23,26]],
  // Taurus (S. Anatolia)
  [[44,15.2],[47,15],[50,15.2],[53,15],[56,15.2],[59,15]],
  // Caucasus (between Black & Caspian)
  [[59,11.4],[61,11.6],[63,11.8],[65,11.6]],
  // Zagros (W. Persia, NW→SE)
  [[57,21],[59,23],[61,25],[63,27],[65,29],[67,31]],
  // Hindu Kush (Khurasan → Hind)
  [[78,17],[81,17.3],[84,17],[87,17.3],[90,17]],
  // Pyrenees (north Iberia)
  [[3,9],[5,9.2],[7,9],[9,9.2],[11,9]],
  // Sarawat (W. Arabia, parallel to Red Sea)
  [[46.5,32],[46.7,35],[46.9,38],[47,42],[47.1,46],[47.2,49]],
];

// ─── Sea labels (Arabic) ────────────────────────────────────────────────────
const SEA_LABELS: { name: string; x: number; y: number; size?: number; rotate?: number }[] = [
  { name: "البحر المتوسط",  x: 22,   y: 20,   size: 2.1 },
  { name: "البحر الأسود",   x: 53,   y: 9.6,  size: 1.2 },
  { name: "بحر قزوين",      x: 66,   y: 18,   size: 1.1, rotate: 78 },
  { name: "البحر الأحمر",   x: 41.2, y: 40,   size: 1.2, rotate: 78 },
  { name: "الخليج العربي",  x: 58,   y: 35,   size: 1.1, rotate: 45 },
  { name: "بحر العرب",      x: 66,   y: 57,   size: 2.0 },
  { name: "المحيط الأطلسي", x: -1,   y: 38,   size: 1.2, rotate: -90 },
  { name: "المحيط الهندي",  x: 92,   y: 57,   size: 1.4 },
];

// ─── Region labels ──────────────────────────────────────────────────────────
const REGION_LABELS: { name: string; x: number; y: number; size?: number }[] = [
  { name: "الأندلس",       x: 7,    y: 14,   size: 1.9 },
  { name: "المغرب",        x: 9,    y: 28,   size: 1.7 },
  { name: "إفريقية",       x: 22,   y: 29,   size: 1.7 },
  { name: "مصر",           x: 34,   y: 33,   size: 2.0 },
  { name: "النوبة",        x: 35,   y: 47,   size: 1.4 },
  { name: "الشام",         x: 46,   y: 22.5, size: 1.7 },
  { name: "الحجاز",        x: 48,   y: 39,   size: 1.7 },
  { name: "نجد",           x: 53,   y: 43,   size: 1.5 },
  { name: "اليمن",         x: 51,   y: 51,   size: 1.6 },
  { name: "عُمان",         x: 60,   y: 47,   size: 1.4 },
  { name: "العراق",        x: 55,   y: 25,   size: 1.7 },
  { name: "الأناضول",      x: 52,   y: 13,   size: 1.9 },
  { name: "فارس",          x: 67,   y: 28,   size: 1.9 },
  { name: "خراسان",        x: 74,   y: 22,   size: 1.7 },
  { name: "ما وراء النهر", x: 78,   y: 10.5, size: 1.5 },
  { name: "السند",         x: 85,   y: 31,   size: 1.5 },
  { name: "الهند",         x: 93,   y: 38,   size: 2.0 },
];

// ─── City anchors (real positions, Arabic only) ─────────────────────────────
const CITY_ANCHORS: { name: string; x: number; y: number; major?: boolean }[] = [
  { name: "قرطبة",       x: 7.5,  y: 17.5, major: true },
  { name: "فاس",         x: 14,   y: 28.5 },
  { name: "القيروان",    x: 24,   y: 27 },
  { name: "القاهرة",     x: 36,   y: 30,   major: true },
  { name: "القدس",       x: 44,   y: 27.5, major: true },
  { name: "دمشق",        x: 46,   y: 25,   major: true },
  { name: "المدينة",     x: 44.7, y: 38,   major: true },
  { name: "مكة",         x: 45.2, y: 41,   major: true },
  { name: "بغداد",       x: 56,   y: 27.5, major: true },
  { name: "البصرة",      x: 57,   y: 30.5 },
  { name: "القسطنطينية", x: 47,   y: 14.5, major: true },
  { name: "أصفهان",      x: 64,   y: 29 },
  { name: "نيسابور",     x: 72,   y: 23 },
  { name: "سمرقند",      x: 79,   y: 13.5, major: true },
  { name: "بخارى",       x: 76,   y: 15,   major: true },
  { name: "دلهي",        x: 87,   y: 31,   major: true },
];

// Shared defs — include once per SVG via <AtlasBaseDefs/>.
export function AtlasBaseDefs() {
  return (
    <>
      {/* Warm parchment with two-tone speckle for depth */}
      <pattern id="atlas-land-grain" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="oklch(0.905 0.075 80)" />
        <circle cx="0.6" cy="0.8" r="0.22" fill="oklch(0.82 0.09 65 / 0.32)" />
        <circle cx="2.6" cy="2.4" r="0.16" fill="oklch(0.78 0.08 55 / 0.28)" />
        <circle cx="1.4" cy="3.2" r="0.10" fill="oklch(0.72 0.07 50 / 0.22)" />
        <circle cx="3.4" cy="0.6" r="0.08" fill="oklch(0.70 0.07 50 / 0.20)" />
      </pattern>
      {/* Soft sea stipple — denser dots, lower contrast than hatching */}
      <pattern id="atlas-sea-hatch" width="3" height="3" patternUnits="userSpaceOnUse">
        <circle cx="0.7" cy="0.7" r="0.13" fill="oklch(0.38 0.08 225 / 0.28)" />
        <circle cx="2.2" cy="2.1" r="0.10" fill="oklch(0.38 0.08 225 / 0.22)" />
      </pattern>
      {/* Hand-drawn wave glyphs scattered across the sea */}
      <pattern id="atlas-sea-waves" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
        <path d="M 1,4 q 1.2,-0.9 2.4,0 t 2.4,0" fill="none"
              stroke="oklch(0.36 0.09 225 / 0.32)" strokeWidth="0.10" strokeLinecap="round" />
        <path d="M 4.5,7 q 0.9,-0.7 1.8,0 t 1.8,0" fill="none"
              stroke="oklch(0.36 0.09 225 / 0.24)" strokeWidth="0.09" strokeLinecap="round" />
      </pattern>
      {/* Warm coastal halo — outer glow rim under land */}
      <radialGradient id="atlas-coast-halo" cx="50%" cy="50%" r="60%">
        <stop offset="60%" stopColor="oklch(0.93 0.07 78 / 0)" />
        <stop offset="100%" stopColor="oklch(0.78 0.10 55 / 0.35)" />
      </radialGradient>
      {/* Stronger vignette for premium depth */}
      <radialGradient id="atlas-vignette" cx="50%" cy="50%" r="78%">
        <stop offset="45%" stopColor="oklch(0.95 0.04 80 / 0)" />
        <stop offset="100%" stopColor="oklch(0.22 0.05 38 / 0.55)" />
      </radialGradient>
      <radialGradient id="atlas-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="oklch(0.95 0.14 82 / 0.85)" />
        <stop offset="100%" stopColor="oklch(0.85 0.14 82 / 0)" />
      </radialGradient>
      {/* Sea depth ramp — deeper near land, lighter offshore */}
      <linearGradient id="atlas-sea-depth" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="oklch(0.75 0.07 220)" />
        <stop offset="100%" stopColor="oklch(0.69 0.08 225)" />
      </linearGradient>
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
  const COAST       = "oklch(0.24 0.08 45 / 0.92)";
  const COAST_SOFT  = "oklch(0.42 0.10 55 / 0.55)";
  const RIVER       = "oklch(0.38 0.11 225 / 0.78)";

  return (
    <g className="atlas-base">
      {/* 1. Sea base — depth gradient + stipple + wave glyphs (continuous ocean) */}
      <rect width="100" height="60" fill="url(#atlas-sea-depth)" />
      <rect width="100" height="60" fill="url(#atlas-sea-hatch)" />
      <rect width="100" height="60" fill="url(#atlas-sea-waves)" />

      {/* 2. Single landmass — soft outer halo, parchment fill, double-stroked coast */}
      <g className="atlas-land">
        {/* Outer halo — soft wide stroke gives hand-drawn warmth around coast */}
        <path d={EURASIA_AFRICA_ARABIA} fill="none"
              stroke="oklch(0.78 0.11 55 / 0.55)" strokeWidth="0.9" strokeLinejoin="round" />
        {/* Land fill */}
        <path d={EURASIA_AFRICA_ARABIA} fill="url(#atlas-land-grain)" />
        {/* Softer mid stroke for depth */}
        <path d={EURASIA_AFRICA_ARABIA} fill="none"
              stroke={COAST_SOFT} strokeWidth="0.42" strokeLinejoin="round" strokeLinecap="round" />
        {/* Sharp ink coastline on top */}
        <path d={EURASIA_AFRICA_ARABIA} fill="none"
              stroke={COAST} strokeWidth="0.18" strokeLinejoin="round" strokeLinecap="round" />
      </g>

      {/* 3. Inland seas painted back over the land */}
      <g className="atlas-inland-seas">
        {INLAND_SEAS.map((s) => (
          <g key={s.id} transform={s.tilt ? `rotate(${s.tilt} ${s.cx} ${s.cy})` : undefined}>
            <ellipse cx={s.cx} cy={s.cy} rx={s.rx + 0.18} ry={s.ry + 0.18}
                     fill="none" stroke="oklch(0.78 0.11 55 / 0.55)" strokeWidth="0.55" />
            <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill="url(#atlas-sea-depth)" />
            <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill="url(#atlas-sea-hatch)" />
            <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry}
                     fill="none" stroke={COAST_SOFT} strokeWidth="0.30" />
            <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry}
                     fill="none" stroke={COAST} strokeWidth="0.14" />
          </g>
        ))}
      </g>

      {/* 4. Warm coastal halo across the canvas */}
      <rect width="100" height="60" fill="url(#atlas-coast-halo)" pointerEvents="none" />



      {/* 5. Rivers — drawn on top of land only (they overlay everything but read as ink on parchment) */}
      {showRivers && (
        <g className="atlas-rivers" pointerEvents="none" fill="none"
           stroke={RIVER} strokeLinecap="round" strokeLinejoin="round">
          {Object.entries(RIVERS).map(([k, d]) => (
            <path key={k} d={d} strokeWidth="0.26" />
          ))}
        </g>
      )}

      {/* 6. Mountain glyph chains */}
      {showMountains && (
        <g className="atlas-mountains" pointerEvents="none" fill="oklch(0.34 0.06 50 / 0.62)">
          {MOUNTAINS.flat().map(([x, y], i) => (
            <path key={i} d={`M ${x - 0.7},${y + 0.55} L ${x},${y - 0.55} L ${x + 0.7},${y + 0.55} Z`} />
          ))}
        </g>
      )}

      {/* 7. Sea labels */}
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

      {/* 8. Region labels */}
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

      {/* 9. City anchors */}
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

      {/* 10. Vignette over everything */}
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

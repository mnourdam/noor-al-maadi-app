/**
 * Premium vector emblems for Irth avatars. Each emblem is a stylised SVG
 * sized to a 64x64 viewBox, using a parchment-gold stroke palette designed
 * to sit on a dark navy disc.
 *
 * NEVER use emoji here — these are part of the Irth visual identity.
 */
import type { ReactNode } from "react";

// Shared palette references (resolved against the Irth theme).
const GOLD = "#d4af37";
const GOLD_SOFT = "#e7c45a";
const PARCH = "#f5e6c3";
const NAVY_DEEP = "#0a1426";

interface EmblemProps {
  className?: string;
  /** Stroke width scale factor. Default 1. */
  scale?: number;
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke={GOLD}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* Tiny helper: scalloped border arc used by several emblems. */
function ScallopBorder() {
  return (
    <circle cx="32" cy="32" r="26" stroke={GOLD} strokeOpacity="0.18" strokeDasharray="1 3" strokeWidth="1" />
  );
}

// ───────────────────────────────────────────────────────────
// Emblem catalogue
// ───────────────────────────────────────────────────────────

function Banner({ accent, glyph }: { accent: string; glyph?: ReactNode }) {
  return (
    <g>
      <path d="M22 14 H42 V44 L32 50 L22 44 Z" fill={accent} fillOpacity="0.85" stroke={GOLD} />
      <path d="M22 14 H42" stroke={PARCH} strokeWidth="1" />
      <circle cx="20" cy="14" r="1.6" fill={GOLD} />
      <circle cx="44" cy="14" r="1.6" fill={GOLD} />
      <path d="M32 14 V12" stroke={GOLD} />
      {glyph}
    </g>
  );
}

const EMBLEMS: Record<string, ReactNode> = {
  banner_rashidun: (
    <Banner accent="#1f3a5f" glyph={
      <g stroke={PARCH}>
        <circle cx="32" cy="30" r="6" />
        <path d="M28 30 H36 M32 26 V34" />
      </g>
    } />
  ),
  banner_umayyad: (
    <Banner accent="#274a35" glyph={
      <g stroke={PARCH}>
        <path d="M26 22 Q32 30 26 38 M38 22 Q32 30 38 38" />
        <circle cx="32" cy="30" r="1.8" fill={PARCH} stroke="none" />
      </g>
    } />
  ),
  banner_abbasid: (
    <Banner accent="#0d0d10" glyph={
      <g stroke={GOLD_SOFT}>
        <path d="M24 24 H40 M24 30 H40 M24 36 H40" />
      </g>
    } />
  ),
  banner_andalus: (
    <Banner accent="#7a1f1f" glyph={
      <g stroke={PARCH}>
        <path d="M26 36 Q32 22 38 36" />
        <path d="M32 36 V40" />
      </g>
    } />
  ),
  banner_ayyubid: (
    <Banner accent="#b07a1f" glyph={
      <g stroke={NAVY_DEEP} fill={NAVY_DEEP}>
        <path d="M24 36 Q28 24 32 30 Q36 24 40 36 Z" />
      </g>
    } />
  ),
  banner_ottoman: (
    <Banner accent="#7a1212" glyph={
      <g stroke={PARCH}>
        <path d="M28 28 a5 5 0 1 0 0 8 a4 4 0 1 1 0 -8" />
        <path d="M36 28 L37.5 31 L40.5 31 L38 33 L39 36 L36 34.5 L33 36 L34 33 L31.5 31 L34.5 31 Z" fill={PARCH} stroke="none" />
      </g>
    } />
  ),

  // Symbols
  crescent_star: (
    <g>
      <ScallopBorder />
      <path d="M40 32 a10 10 0 1 1 -10 -10 a8 8 0 1 0 10 10 Z" fill={GOLD_SOFT} fillOpacity="0.15" stroke={GOLD} />
      <path d="M44 28 L45.6 31.5 L49.4 31.7 L46.4 34 L47.4 37.6 L44 35.4 L40.6 37.6 L41.6 34 L38.6 31.7 L42.4 31.5 Z" fill={GOLD_SOFT} stroke={GOLD} strokeWidth="1" />
    </g>
  ),
  calligraphy: (
    <g>
      <ScallopBorder />
      <path d="M18 40 Q22 24 32 28 T46 24" />
      <path d="M22 36 Q28 32 34 36" />
      <circle cx="46" cy="40" r="1.8" fill={GOLD} stroke="none" />
      <circle cx="42" cy="42" r="1.2" fill={GOLD} stroke="none" />
    </g>
  ),
  star: (
    <g>
      <ScallopBorder />
      <path d="M32 14 L36 26 L48 26 L38 33 L42 46 L32 38 L22 46 L26 33 L16 26 L28 26 Z" fill={GOLD_SOFT} fillOpacity="0.15" stroke={GOLD} />
      <circle cx="32" cy="32" r="2.2" fill={GOLD} stroke="none" />
    </g>
  ),

  // Weapons
  sword: (
    <g>
      <ScallopBorder />
      <path d="M32 12 L34 14 V40 L32 42 L30 40 V14 Z" fill={PARCH} fillOpacity="0.15" />
      <path d="M24 42 H40" />
      <path d="M28 44 H36 L34 48 H30 Z" fill={GOLD} fillOpacity="0.2" />
      <circle cx="32" cy="50" r="2" fill={GOLD} />
    </g>
  ),
  shield: (
    <g>
      <ScallopBorder />
      <path d="M32 14 L46 20 V32 Q46 44 32 50 Q18 44 18 32 V20 Z" fill={GOLD_SOFT} fillOpacity="0.12" />
      <path d="M32 22 V42 M24 30 H40" />
      <circle cx="32" cy="32" r="3" />
    </g>
  ),

  // Knowledge
  scroll: (
    <g>
      <ScallopBorder />
      <path d="M18 22 Q18 18 22 18 H42 Q46 18 46 22 Q46 26 42 26 H22" />
      <path d="M22 26 V44 Q22 48 26 48 H44 Q40 48 40 44 V28" />
      <path d="M26 32 H38 M26 36 H36 M26 40 H34" stroke={PARCH} strokeWidth="1" />
    </g>
  ),
  book: (
    <g>
      <ScallopBorder />
      <path d="M16 18 H30 Q32 18 32 20 V48 Q32 46 30 46 H16 Z" fill={PARCH} fillOpacity="0.08" />
      <path d="M48 18 H34 Q32 18 32 20 V48 Q32 46 34 46 H48 Z" fill={PARCH} fillOpacity="0.08" />
      <path d="M20 26 H28 M20 30 H28 M20 34 H28" stroke={PARCH} strokeWidth="1" />
      <path d="M36 26 H44 M36 30 H44 M36 34 H44" stroke={PARCH} strokeWidth="1" />
    </g>
  ),

  // Roles — stylised silhouettes
  scholar: (
    <g>
      <ScallopBorder />
      <circle cx="32" cy="22" r="5" />
      <path d="M22 32 H42 L40 28 H24 Z" fill={GOLD_SOFT} fillOpacity="0.15" />
      <path d="M24 32 V46 Q24 50 28 50 H36 Q40 50 40 46 V32" />
      <path d="M30 38 H34 M28 42 H36" stroke={PARCH} strokeWidth="1" />
    </g>
  ),
  explorer: (
    <g>
      <ScallopBorder />
      <path d="M22 22 H42 L40 28 H24 Z" fill={GOLD_SOFT} fillOpacity="0.18" />
      <circle cx="32" cy="32" r="5" />
      <path d="M24 50 Q24 38 32 38 Q40 38 40 50" />
      <path d="M44 22 L48 18 M20 22 L16 18" />
    </g>
  ),
  cartographer: (
    <g>
      <ScallopBorder />
      <path d="M18 22 L26 18 L38 24 L46 20 V44 L38 48 L26 42 L18 46 Z" fill={PARCH} fillOpacity="0.08" />
      <path d="M26 18 V42 M38 24 V48" stroke={GOLD_SOFT} />
      <path d="M22 30 Q30 36 38 30" stroke={GOLD_SOFT} />
      <circle cx="34" cy="32" r="1.6" fill={GOLD} stroke="none" />
    </g>
  ),
  museum_curator: (
    <g>
      <ScallopBorder />
      <path d="M14 26 L32 16 L50 26" />
      <path d="M16 26 V44 H48 V26" />
      <path d="M20 28 V42 M28 28 V42 M36 28 V42 M44 28 V42" />
      <path d="M14 46 H50" />
    </g>
  ),
  historian: (
    <g>
      <ScallopBorder />
      <circle cx="28" cy="28" r="8" />
      <path d="M34 34 L46 46" />
      <path d="M24 28 H32 M28 24 V32" stroke={PARCH} strokeWidth="1" />
    </g>
  ),
  horseman: (
    <g>
      <ScallopBorder />
      <path d="M18 42 Q22 30 32 30 Q42 30 46 42" />
      <path d="M40 30 L46 22 L46 28" />
      <path d="M26 42 V48 M38 42 V48" />
      <circle cx="32" cy="22" r="3" />
      <path d="M32 25 V30" />
    </g>
  ),

  // Places
  mosque: (
    <g>
      <ScallopBorder />
      <path d="M20 46 V32 Q20 22 32 16 Q44 22 44 32 V46 Z" fill={GOLD_SOFT} fillOpacity="0.1" />
      <path d="M32 16 V12" />
      <path d="M14 46 V36 M50 46 V36" />
      <path d="M14 36 Q14 30 18 30 M50 36 Q50 30 46 30" />
      <path d="M28 46 V38 Q28 36 32 36 Q36 36 36 38 V46" />
      <path d="M14 48 H50" />
    </g>
  ),
  castle: (
    <g>
      <ScallopBorder />
      <path d="M14 46 V24 H20 V20 H24 V24 H30 V20 H34 V24 H40 V20 H44 V24 H50 V46 Z" fill={PARCH} fillOpacity="0.08" />
      <path d="M28 46 V36 Q28 34 32 34 Q36 34 36 36 V46" />
      <path d="M14 48 H50" />
      <path d="M20 30 H22 M28 30 H30 M34 30 H36 M42 30 H44" stroke={PARCH} strokeWidth="1" />
    </g>
  ),

  // Tools
  compass: (
    <g>
      <ScallopBorder />
      <circle cx="32" cy="32" r="14" />
      <path d="M32 18 V22 M32 42 V46 M18 32 H22 M42 32 H46" />
      <path d="M32 22 L36 32 L32 42 L28 32 Z" fill={GOLD_SOFT} fillOpacity="0.25" />
      <circle cx="32" cy="32" r="1.6" fill={GOLD} stroke="none" />
    </g>
  ),
  astrolabe: (
    <g>
      <ScallopBorder />
      <circle cx="32" cy="32" r="14" />
      <circle cx="32" cy="32" r="9" />
      <path d="M18 32 H46 M32 18 V46" />
      <path d="M22 22 L42 42 M42 22 L22 42" strokeOpacity="0.5" />
      <circle cx="32" cy="32" r="1.6" fill={GOLD} stroke="none" />
    </g>
  ),
};

/**
 * Renders the SVG emblem for a given avatar id. Falls back to the default
 * crescent + star emblem when the id is unknown.
 */
export function AvatarArt({ id, className }: { id: string; className?: string }) {
  const node = EMBLEMS[id] ?? EMBLEMS.crescent_star;
  return <Frame className={className}>{node}</Frame>;
}

export function hasEmblem(id: string): boolean {
  return Boolean(EMBLEMS[id]);
}

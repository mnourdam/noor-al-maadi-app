// ============================================================
// عوالم إرث — unified world icon set.
//
// One identity, one hand: every world icon is drawn on the same
// 48×48 grid, with the same gilded gradient, the same stroke weight
// and the same medallion treatment. No emoji, no third-party icon
// packs, no generic crescents or white mosques.
//
// Each motif is specific to its world:
//   prophetic        — cave mouth + descending light of revelation
//   rashidun         — minbar of the four rightly-guided caliphs
//   umayyad          — Damascus horseshoe arcade
//   andalus          — Alhambra scalloped arch
//   abbasid          — Samarra spiral minaret + open book
//   seljuk           — Seljuk eight-point star over a drawn bow
//   zengid           — twin facing shields (the Crusade-era frontier)
//   ayyubid-state    — citadel keep with a raised sword
//   mamluk-sultanate — crossed sabres blazon
//   ottoman          — tughra-inspired swirl beneath a crescent
// ============================================================

import type { ReactNode } from "react";

const GRAD_ID = "irthWorldGold";
const GRAD_DEEP = "irthWorldDeep";

function Defs() {
  return (
    <defs>
      <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="oklch(0.95 0.12 92)" />
        <stop offset="48%" stopColor="oklch(0.80 0.14 84)" />
        <stop offset="100%" stopColor="oklch(0.55 0.11 70)" />
      </linearGradient>
      <linearGradient id={GRAD_DEEP} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="oklch(0.30 0.03 66)" />
        <stop offset="100%" stopColor="oklch(0.16 0.02 60)" />
      </linearGradient>
    </defs>
  );
}

const G = `url(#${GRAD_ID})`;
const D = `url(#${GRAD_DEEP})`;

function motif(slug: string): ReactNode {
  const line = {
    fill: "none",
    stroke: G,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (slug) {
    case "prophetic":
      return (
        <g>
          <path d="M12 34c0-8 5.4-13.5 12-13.5S36 26 36 34" {...line} />
          <path d="M12 34h24" {...line} />
          <path d="M24 8v7M17.5 10.5l2.6 4.4M30.5 10.5l-2.6 4.4" {...line} />
          <circle cx="24" cy="30" r="4.2" fill={G} opacity="0.85" />
        </g>
      );
    case "rashidun":
      return (
        <g>
          <path d="M13 36h22" {...line} />
          <path d="M16 36V29h5v-5h5v-5h5" {...line} />
          <path d="M31 19V12" {...line} />
          <circle cx="31" cy="10" r="2.4" fill={G} />
          <path d="M16 36l-3 0" {...line} />
        </g>
      );
    case "umayyad":
      return (
        <g>
          <path d="M11 35V24a5 5 0 0 1 10 0v11" {...line} />
          <path d="M21 35V21a6 6 0 0 1 12 0v14" {...line} />
          <path d="M33 35V26a4 4 0 0 1 8 0v9" {...line} />
          <path d="M9 37h32" {...line} />
          <path d="M27 12v-4" {...line} />
        </g>
      );
    case "andalus":
      return (
        <g>
          <path
            d="M14 36V22c0-5.5 4.5-10 10-10s10 4.5 10 10v14"
            {...line}
          />
          <path d="M18 36V24a6 6 0 0 1 12 0v12" {...line} />
          <path d="M19 24q2.5-3 5-0t5 0" {...line} />
          <path d="M11 37h26" {...line} />
          <circle cx="24" cy="16" r="1.8" fill={G} />
        </g>
      );
    case "abbasid":
      return (
        <g>
          <path d="M30 36V14" {...line} />
          <path d="M30 14c-5 1-7 4-6 7s4 5 8 4 5-4 4-7" {...line} />
          <path d="M12 36V20c3.5 0 6 1 7 2v16c-1-1-3.5-2-7-2z" {...line} />
          <path d="M9 38h30" {...line} />
        </g>
      );
    case "seljuk":
      return (
        <g>
          <path d="M24 9l3.6 7.4 8.2 1.1-6 5.7 1.5 8.1-7.3-3.9-7.3 3.9 1.5-8.1-6-5.7 8.2-1.1z" {...line} />
          <path d="M13 38c6-3 16-3 22 0" {...line} />
          <path d="M13 38q11-6 22 0" stroke={G} strokeWidth="1.1" fill="none" />
        </g>
      );
    case "zengid":
      return (
        <g>
          <path d="M22 11L13 14v9c0 6 4.5 10 9 12V11z" {...line} />
          <path d="M26 11l9 3v9c0 6-4.5 10-9 12V11z" {...line} />
          <path d="M24 14v20" stroke={G} strokeWidth="1.1" />
        </g>
      );
    case "ayyubid-state":
      return (
        <g>
          <path d="M12 37V21l4-3 4 3v16" {...line} />
          <path d="M28 37V21l4-3 4 3v16" {...line} />
          <path d="M20 37V26h8v11" {...line} />
          <path d="M24 24V8" {...line} />
          <path d="M20.5 12h7" {...line} />
        </g>
      );
    case "mamluk-sultanate":
      return (
        <g>
          <path d="M12 12c8 3 14 9 18 18" {...line} />
          <path d="M36 12c-8 3-14 9-18 18" {...line} />
          <path d="M10 15l4-4M38 15l-4-4" {...line} />
          <circle cx="24" cy="34" r="4" fill="none" stroke={G} strokeWidth="1.9" />
        </g>
      );
    case "ottoman":
      return (
        <g>
          <path
            d="M31 15a9 9 0 1 0 0 15 11 11 0 1 1 0-15z"
            fill={G}
            opacity="0.9"
          />
          <path d="M12 36c4-8 9-11 14-9s7 6 4 9" {...line} />
          <path d="M16 36V22M21 36V25M26 36V27" {...line} />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="24" cy="24" r="10" {...line} />
          <path d="M24 14v20M14 24h20" stroke={G} strokeWidth="1.2" />
        </g>
      );
  }
}

/**
 * World icon. Renders inside a gilded medallion so it matches the Irth
 * museum / profile emblem language.
 */
export function WorldGlyph({
  slug,
  className = "size-full",
}: {
  slug: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden="true">
      <Defs />
      <circle cx="24" cy="24" r="22.2" fill={D} />
      <circle cx="24" cy="24" r="22.2" fill="none" stroke={G} strokeWidth="1.6" opacity="0.85" />
      <circle cx="24" cy="24" r="19.4" fill="none" stroke={G} strokeWidth="0.7" opacity="0.35" />
      {motif(slug)}
    </svg>
  );
}

// Premium per-kind SVG markers for the Atlas.
//
// Redesigned as struck museum medallions: a gilded rim, a recessed dark
// field with a top sheen and a bottom inner shadow (3D depth), and a
// metallic kind symbol struck into the face. Pure paths + three shared
// gradients — no SVG filters, no JS animation — so the Android perf
// budget is untouched while the markers read at any zoom level.
import type { AtlasEntityKind } from "@/lib/atlas-entities";

const PARCHMENT = "oklch(0.92 0.04 82)";

/** Shared gradients. Must be rendered ONCE inside the atlas SVG. */
export function AtlasGlyphDefs() {
  return (
    <defs>
      <radialGradient id="atlasMedalFace" cx="50%" cy="32%" r="72%">
        <stop offset="0%" stopColor="oklch(0.34 0.03 68)" />
        <stop offset="62%" stopColor="oklch(0.22 0.03 62)" />
        <stop offset="100%" stopColor="oklch(0.14 0.02 60)" />
      </radialGradient>
      <linearGradient id="atlasMedalRim" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="oklch(0.92 0.13 88)" />
        <stop offset="45%" stopColor="oklch(0.74 0.13 82)" />
        <stop offset="100%" stopColor="oklch(0.46 0.09 70)" />
      </linearGradient>
      <linearGradient id="atlasMedalSheen" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="oklch(0.98 0.05 90)" stopOpacity="0.4" />
        <stop offset="55%" stopColor="oklch(0.98 0.05 90)" stopOpacity="0.06" />
        <stop offset="100%" stopColor="oklch(0.98 0.05 90)" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/**
 * Full marker = medallion (rim + recessed face + sheen) with the kind
 * symbol struck into it. `fill` keeps encoding the entity kind so the
 * legend, panel and pins stay colour-synchronised.
 */
export function AtlasKindGlyph({
  kind,
  size,
  fill,
  stroke,
}: {
  kind: AtlasEntityKind;
  size: number;
  fill: string;
  stroke: string;
}) {
  const r = size * 1.42;
  return (
    <g>
      {/* recessed face */}
      <circle r={r} fill="url(#atlasMedalFace)" />
      {/* gilded rim — double ring for a struck-metal edge */}
      <circle r={r} fill="none" stroke="url(#atlasMedalRim)" strokeWidth={size * 0.24} />
      <circle
        r={r - size * 0.24}
        fill="none"
        stroke="oklch(0.16 0.02 60)"
        strokeWidth={size * 0.07}
        opacity={0.7}
      />
      {/* top sheen — the 3D cue */}
      <circle r={r - size * 0.12} fill="url(#atlasMedalSheen)" />
      {/* struck symbol */}
      <g transform={`scale(${0.74})`}>
        <AtlasKindSymbol kind={kind} size={size} fill={fill} stroke={stroke} />
      </g>
    </g>
  );
}

function AtlasKindSymbol({
  kind,
  size,
  fill,
  stroke,
}: {
  kind: AtlasEntityKind;
  size: number;
  fill: string;
  stroke: string;
}) {
  const sw = size * 0.11; // refined rim — never heavy
  const INK = stroke;
  const common = {
    stroke,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };

  switch (kind) {
    // ── States / Empires — historical banner on a staff ──
    case "region": {
      const s = size * 1.05;
      return (
        <g>
          {/* staff */}
          <line x1={-s * 0.85} y1={-s} x2={-s * 0.85} y2={s * 1.1} {...common} />
          {/* banner with swallowtail */}
          <path
            d={`M ${-s * 0.85} ${-s * 0.95}
                L ${s} ${-s * 0.95}
                L ${s * 0.55} ${-s * 0.2}
                L ${s} ${s * 0.55}
                L ${-s * 0.85} ${s * 0.55} Z`}
            fill={fill}
            {...common}
          />
          <line x1={-s * 0.3} y1={-s * 0.55} x2={-s * 0.3} y2={s * 0.2} stroke={INK} strokeWidth={sw * 0.7} />
        </g>
      );
    }

    // ── Cities — crenellated gate ──
    case "place": {
      const s = size;
      const top = -s * 0.55;
      const mid = -s * 0.1;
      const base = s * 0.95;
      return (
        <g>
          <path
            d={`M ${-s} ${base}
                L ${-s} ${mid}
                L ${-s * 0.7} ${mid} L ${-s * 0.7} ${top} L ${-s * 0.4} ${top} L ${-s * 0.4} ${mid}
                L ${-s * 0.15} ${mid} L ${-s * 0.15} ${top} L ${s * 0.15} ${top} L ${s * 0.15} ${mid}
                L ${s * 0.4} ${mid} L ${s * 0.4} ${top} L ${s * 0.7} ${top} L ${s * 0.7} ${mid}
                L ${s} ${mid} L ${s} ${base} Z`}
            fill={fill}
            {...common}
          />
          {/* gate arch */}
          <path
            d={`M ${-s * 0.3} ${base} L ${-s * 0.3} ${s * 0.2}
                A ${s * 0.3} ${s * 0.3} 0 0 1 ${s * 0.3} ${s * 0.2}
                L ${s * 0.3} ${base}`}
            fill={INK}
            stroke="none"
          />
        </g>
      );
    }

    // ── Battles — crossed swords ──
    case "battle": {
      const s = size * 1.1;
      return (
        <g>
          {/* blade 1 */}
          <path d={`M ${-s} ${-s} L ${s * 0.85} ${s * 0.85}`} stroke={fill} strokeWidth={sw * 2.6} strokeLinecap="round" />
          <path d={`M ${-s} ${-s} L ${s * 0.85} ${s * 0.85}`} stroke={INK} strokeWidth={sw * 0.9} strokeLinecap="round" />
          {/* blade 2 */}
          <path d={`M ${s} ${-s} L ${-s * 0.85} ${s * 0.85}`} stroke={fill} strokeWidth={sw * 2.6} strokeLinecap="round" />
          <path d={`M ${s} ${-s} L ${-s * 0.85} ${s * 0.85}`} stroke={INK} strokeWidth={sw * 0.9} strokeLinecap="round" />
          {/* crossguards */}
          <line x1={-s * 0.85} y1={-s * 0.5} x2={-s * 0.5} y2={-s * 0.85} {...common} />
          <line x1={s * 0.85} y1={-s * 0.5} x2={s * 0.5} y2={-s * 0.85} {...common} />
          {/* pommel */}
          <circle r={s * 0.22} fill={fill} {...common} />
        </g>
      );
    }

    // ── Events — historical scroll ──
    case "event": {
      const s = size;
      return (
        <g>
          <rect
            x={-s * 0.95}
            y={-s * 0.55}
            width={s * 1.9}
            height={s * 1.1}
            rx={s * 0.15}
            fill={fill}
            {...common}
          />
          <line x1={-s * 0.55} y1={-s * 0.2} x2={s * 0.55} y2={-s * 0.2} stroke={INK} strokeWidth={sw * 0.55} />
          <line x1={-s * 0.55} y1={s * 0.15} x2={s * 0.55} y2={s * 0.15} stroke={INK} strokeWidth={sw * 0.55} />
          {/* curled ends */}
          <circle cx={-s * 0.95} cy={0} r={s * 0.32} fill={PARCHMENT} {...common} />
          <circle cx={s * 0.95} cy={0} r={s * 0.32} fill={PARCHMENT} {...common} />
        </g>
      );
    }

    // ── Landmarks / Figures — dome with crescent finial ──
    case "figure_marker": {
      const s = size;
      return (
        <g>
          {/* base */}
          <rect x={-s} y={s * 0.4} width={s * 2} height={s * 0.55} fill={fill} {...common} />
          {/* dome */}
          <path
            d={`M ${-s * 0.85} ${s * 0.4}
                A ${s * 0.85} ${s * 0.95} 0 0 1 ${s * 0.85} ${s * 0.4} Z`}
            fill={fill}
            {...common}
          />
          {/* finial */}
          <line x1={0} y1={-s * 0.55} x2={0} y2={-s * 0.1} stroke={INK} strokeWidth={sw * 0.7} />
          <circle cx={0} cy={-s * 0.7} r={s * 0.2} fill={fill} {...common} />
        </g>
      );
    }

    // ── Artifact sites — amphora silhouette ──
    case "artifact_site": {
      const s = size;
      return (
        <g>
          <path
            d={`M ${-s * 0.55} ${-s * 0.7}
                L ${s * 0.55} ${-s * 0.7}
                L ${s * 0.4} ${-s * 0.35}
                A ${s * 0.75} ${s * 0.85} 0 1 1 ${-s * 0.4} ${-s * 0.35} Z`}
            fill={fill}
            {...common}
          />
          {/* handles */}
          <path d={`M ${-s * 0.55} ${-s * 0.55} Q ${-s * 0.95} ${-s * 0.2} ${-s * 0.45} ${s * 0.05}`}
                fill="none" {...common} />
          <path d={`M ${s * 0.55} ${-s * 0.55} Q ${s * 0.95} ${-s * 0.2} ${s * 0.45} ${s * 0.05}`}
                fill="none" {...common} />
          {/* base line */}
          <line x1={-s * 0.25} y1={s * 0.9} x2={s * 0.25} y2={s * 0.9} {...common} />
        </g>
      );
    }

    // ── Campaigns / route points — banner + sword ──
    case "route_point": {
      const s = size;
      return (
        <g>
          {/* sword */}
          <line x1={s * 0.5} y1={-s * 0.9} x2={-s * 0.45} y2={s * 0.95} stroke={fill} strokeWidth={sw * 2.2} strokeLinecap="round" />
          <line x1={s * 0.5} y1={-s * 0.9} x2={-s * 0.45} y2={s * 0.95} stroke={INK} strokeWidth={sw * 0.7} strokeLinecap="round" />
          {/* banner */}
          <path
            d={`M ${-s * 0.95} ${-s * 0.85}
                L ${s * 0.1} ${-s * 0.85}
                L ${-s * 0.15} ${-s * 0.4}
                L ${s * 0.1} ${s * 0.05}
                L ${-s * 0.95} ${s * 0.05} Z`}
            fill={fill}
            {...common}
          />
        </g>
      );
    }
  }
}

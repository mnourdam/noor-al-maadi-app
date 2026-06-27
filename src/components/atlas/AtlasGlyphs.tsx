// Premium per-kind SVG glyphs for Atlas markers.
// All glyphs are designed in a centered ~3.2x3.2 unit box (so a `size` prop
// controls visual radius). Pure paths — no filters, no JS animation — to keep
// the Android perf budget intact. Stroke widths scale with the marker so they
// stay crisp at every zoom level.
import type { AtlasEntityKind } from "@/lib/atlas-entities";

const INK = "oklch(0.16 0.04 60)";
const PARCHMENT = "oklch(0.94 0.05 82)";

export function AtlasKindGlyph({
  kind,
  size,
  fill,
}: {
  kind: AtlasEntityKind;
  /** Half-extent in user units (≈ marker radius). */
  size: number;
  /** Primary fill (per-kind palette color). */
  fill: string;
}) {
  const sw = size * 0.18; // stroke scaled with glyph
  const common = {
    stroke: INK,
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

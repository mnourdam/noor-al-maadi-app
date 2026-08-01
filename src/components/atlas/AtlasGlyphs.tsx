// Atlas markers — official Irth Emblems only.
//
// RULE (frozen): no bespoke icons, no medallions drawn in code. Each atlas
// entity kind reuses the closest emblem from the official Premium Emblems
// library, rendered as an <image> inside the atlas SVG. Local-first: the
// bundled offline WebP is always the first candidate, so markers survive
// offline and inside the APK.
import type { AtlasEntityKind } from "@/lib/atlas-entities";
import { getEmblemRecord } from "@/lib/emblems/registry";
import { emblemSourceCandidates } from "@/lib/emblems/asset-manifest";
import { localEmblemPath } from "@/lib/emblems/offline-pack";
import { resolveProfileEmblem } from "@/lib/emblems/resolver";
import { atlasKindEmblemId } from "@/lib/emblems/identity-map";

/** No shared gradients are needed anymore — kept as a no-op for callers. */
export function AtlasGlyphDefs() {
  return null;
}

function emblemHref(kind: AtlasEntityKind): string | null {
  const id = atlasKindEmblemId(kind);
  // Atlas-only emblems (region/city/battle) ship in the offline pack but are
  // not player-selectable, so they have no registry record — resolve them
  // straight from the bundled pack before falling back to the registry.
  const local = localEmblemPath(id, 128);
  if (local) return local;
  const record = getEmblemRecord(id) ?? resolveProfileEmblem(id).record;
  return emblemSourceCandidates(record, 128)[0] ?? null;
}


/**
 * Full marker = the official emblem for the kind. `fill` still encodes the
 * entity kind, so the legend/panel colour sync is preserved through a thin
 * ring around the emblem instead of a recoloured symbol.
 */
export function AtlasKindGlyph({
  kind,
  size,
  fill,
}: {
  kind: AtlasEntityKind;
  size: number;
  fill: string;
  stroke?: string;
}) {
  const r = size * 1.42;
  const href = emblemHref(kind);
  return (
    <g>
      <circle r={r} fill="oklch(0.16 0.02 60)" />
      {href && (
        <image
          href={href}
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          preserveAspectRatio="xMidYMid meet"
          clipPath="inset(0 round 50%)"
          style={{ pointerEvents: "none" }}
        />
      )}
      <circle r={r} fill="none" stroke={fill} strokeWidth={size * 0.16} opacity={0.9} />
    </g>
  );
}

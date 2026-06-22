// Phase 1 — Atlas entity marker overlay (additive, neutral pins).
// Renders published+verified atlas_entities over the existing atlas SVG.
// Click → minimal popover with name, kind, era, and an encyclopedia link.
import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import {
  KIND_LABEL_AR,
  listPublishedAtlasEntities,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";
import { apsToViewBox } from "@/lib/atlas/aps";

const VB_W = 100;
const VB_H = 60;

/** Inner SVG layer — must be rendered inside the AtlasStage transform group. */
export function AtlasEntityPinsLayer({
  inv,
  onSelect,
}: {
  inv: number;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  const entities = useAtlasEntities();
  if (entities.length === 0) return null;
  return (
    <g className="layer-atlas-entities">
      {entities.map((e) => (
        <AtlasPin key={e.id} entity={e} inv={inv} onSelect={onSelect} />
      ))}
    </g>
  );
}

/** Popover renderer — sits outside the SVG, in screen-space, above the stage. */
export function AtlasEntityPopover({
  entity,
  onClose,
}: {
  entity: AtlasEntityRow | null;
  onClose: () => void;
}) {
  if (!entity) return null;
  const era = entity.era || (entity.year_start != null ? `${entity.year_start}م` : null);
  return (
    <div
      dir="rtl"
      className="pointer-events-auto absolute left-1/2 top-20 z-30 w-80 -translate-x-1/2 rounded-2xl border border-amber-900/30 bg-amber-50/95 p-4 text-amber-950 shadow-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase text-amber-700">
            {KIND_LABEL_AR[entity.kind]}
          </div>
          <h3 className="text-lg font-bold leading-tight">{entity.name_ar}</h3>
          {entity.name_en && (
            <div dir="ltr" className="font-mono text-[11px] text-amber-800/80">
              {entity.name_en}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-amber-900 hover:bg-amber-200/60"
          aria-label="إغلاق"
        >
          <X className="size-4" />
        </button>
      </div>

      {era && (
        <div className="mb-3 inline-flex rounded-full bg-amber-200/60 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
          {era}
        </div>
      )}

      {entity.encyclopedia_entity_id ? (
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: entity.encyclopedia_entity_id }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-900 px-3 py-2 text-sm font-bold text-amber-50 hover:bg-amber-800"
        >
          <ExternalLink className="size-4" />
          اقرأ في الموسوعة
        </Link>
      ) : (
        <p className="text-[12px] text-amber-900/70">
          لا يوجد ربط بالموسوعة لهذا الكيان.
        </p>
      )}
    </div>
  );
}

/** Single neutral pin. Phase 1 uses one shared visual for every kind. */
const AtlasPin = memo(function AtlasPin({
  entity,
  inv,
  onSelect,
}: {
  entity: AtlasEntityRow;
  inv: number;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  const { x, y } = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });
  // Skip if somehow outside the viewBox (defensive)
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  const r = 0.55 * inv;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entity);
      }}
    >
      {/* shadow */}
      <circle r={r + 0.2 * inv} fill="oklch(0.18 0.06 40)" opacity={0.55} />
      {/* pin body */}
      <circle
        r={r}
        fill="oklch(0.55 0.18 25)"
        stroke="oklch(0.97 0.04 80)"
        strokeWidth={0.14 * inv}
      />
      {/* center dot */}
      <circle r={r * 0.35} fill="oklch(0.97 0.06 82)" />
      {/* label */}
      <text
        y={-r - 0.5 * inv}
        textAnchor="middle"
        fontSize={1.4 * inv}
        fontWeight={800}
        fill="oklch(0.18 0.06 40)"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {entity.name_ar}
      </text>
    </g>
  );
});

/** Cached data hook. Refetches once on mount; live atlas re-renders are cheap. */
function useAtlasEntities() {
  const [data, setData] = useState<AtlasEntityRow[]>([]);
  useEffect(() => {
    let alive = true;
    listPublishedAtlasEntities()
      .then((rows) => {
        if (alive) setData(rows);
      })
      .catch(() => {
        // Empty atlas is the expected initial state; swallow errors silently.
      });
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => data, [data]);
}

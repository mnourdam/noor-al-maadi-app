// Phase 3 — Cinematic Atlas Stage
// Single full-screen SVG with pan + wheel/pinch zoom, tier-gated layers,
// viewport culling for tier 4, and progressive label disclosure.
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Calendar, Crown, Gem, Landmark, Swords, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ATLAS_REFERENCES } from "@/lib/atlas-regions";
import {
  TIER_LABEL,
  tierForScale,
  type AtlasLayers,
  type HubMarker,
  type Tier,
} from "@/lib/atlas-hubs";
import type { WorldEntityType } from "@/lib/world-map-source";

const TYPE_ICON: Record<WorldEntityType, LucideIcon> = {
  city: Building2, battle: Swords, figure: User, landmark: Landmark,
  artifact: Gem, event: Calendar, state: Crown,
};
const TYPE_FILL: Record<WorldEntityType, string> = {
  city: "oklch(0.42 0.10 60)",
  landmark: "oklch(0.55 0.14 35)",
  battle: "oklch(0.55 0.22 30)",
  figure: "oklch(0.72 0.16 60)",
  artifact: "oklch(0.65 0.18 300)",
  event: "oklch(0.62 0.14 240)",
  state: "oklch(0.78 0.18 70)",
};

const MIN_SCALE = 1;
const MAX_SCALE = 9;
const VB_W = 100;
const VB_H = 60;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

export function AtlasStage({
  layers,
  selectedId,
  onSelect,
  onTierChange,
}: {
  layers: AtlasLayers;
  selectedId: string | null;
  onSelect: (m: HubMarker | null) => void;
  onTierChange?: (t: Tier) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const tier = tierForScale(view.scale);

  useEffect(() => { onTierChange?.(tier); }, [tier, onTierChange]);

  const clamp = useCallback((v: View): View => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale));
    const w = wrapRef.current?.clientWidth ?? 1;
    const h = wrapRef.current?.clientHeight ?? 1;
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    return {
      scale: s,
      tx: Math.max(-maxX, Math.min(maxX, v.tx)),
      ty: Math.max(-maxY, Math.min(maxY, v.ty)),
    };
  }, []);

  // Pointer drag
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setView((v) => clamp({ ...v, tx: drag.current!.tx + dx, ty: drag.current!.ty + dy }));
  };
  const onPointerUp = () => { drag.current = null; };

  // Wheel zoom focused on cursor
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      setView((v) => {
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        const k = s / v.scale;
        return clamp({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp]);

  // Pinch
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch.current) { pinch.current = { dist, scale: view.scale }; return; }
      const ratio = dist / pinch.current.dist;
      setView((v) => clamp({ ...v, scale: pinch.current!.scale * ratio }));
      e.preventDefault();
    };
    const onTouchEnd = () => { pinch.current = null; };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [view.scale, clamp]);

  // Viewport bbox in SVG coords for tier-4 culling
  const bbox = (() => {
    const w = wrapRef.current?.clientWidth ?? 1;
    const h = wrapRef.current?.clientHeight ?? 1;
    // SVG units per CSS px at current scale (svg uses meet on 100x60)
    const baseUnitsPerPxX = VB_W / w;
    const baseUnitsPerPxY = VB_H / h;
    const u = Math.max(baseUnitsPerPxX, baseUnitsPerPxY) / view.scale;
    const cx = VB_W / 2 - (view.tx * u);
    const cy = VB_H / 2 - (view.ty * u);
    const halfW = (w / 2) * u;
    const halfH = (h / 2) * u;
    return { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
  })();
  const inView = (x: number, y: number, pad = 2) =>
    x >= bbox.minX - pad && x <= bbox.maxX + pad && y >= bbox.minY - pad && y <= bbox.maxY + pad;

  // Marker sizing inverse to scale for crisp glyphs
  const inv = 1 / view.scale;

  const visibleEntities = tier >= 4
    ? layers.entities.filter((e) => inView(e.coords.x, e.coords.y))
    : [];

  return (
    <div ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none cursor-grab active:cursor-grabbing map-parchment map-vignette"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none" }}
      dir="ltr"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block size-full"
      >
        <defs>
          <pattern id="atlas-sea" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.55 0.08 230 / 0.20)" strokeWidth="0.12" />
          </pattern>
          <pattern id="atlas-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0 L0 0 0 5" fill="none" stroke="oklch(0.32 0.06 50 / 0.14)" strokeWidth="0.08" />
          </pattern>
          <radialGradient id="atlas-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.95 0.14 82 / 0.85)" />
            <stop offset="100%" stopColor="oklch(0.85 0.14 82 / 0)" />
          </radialGradient>
        </defs>

        <g style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "center",
          transition: drag.current || pinch.current ? "none" : "transform 160ms ease-out",
        }}>
          <rect width={VB_W} height={VB_H} fill="url(#atlas-sea)" opacity={0.65} />
          <rect width={VB_W} height={VB_H} fill="url(#atlas-grid)" pointerEvents="none" />

          {/* Regions */}
          <g className="layer-regions">
            {layers.regions.map((r) => (
              <polygon
                key={r.id}
                points={r.polygon}
                fill="oklch(0.92 0.06 82 / 0.32)"
                stroke="oklch(0.42 0.10 60 / 0.78)"
                strokeWidth={0.18}
                strokeLinejoin="round"
              />
            ))}
            {layers.regions.map((r) => (
              <text
                key={`rl-${r.id}`}
                x={r.label.x}
                y={r.label.y}
                textAnchor="middle"
                fontSize={2.2 * inv}
                fontWeight={800}
                fill="oklch(0.30 0.08 50)"
                opacity={tier === 1 ? 1 : Math.max(0, 1 - (tier - 1) * 0.45)}
                pointerEvents="none"
                style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em", transition: "opacity 200ms" }}
              >{r.name}</text>
            ))}
          </g>

          {/* Reference anchors — always faint */}
          {tier <= 2 && (
            <g className="layer-references" pointerEvents="none" opacity={0.7}>
              {ATLAS_REFERENCES.map((c) => (
                <circle key={c.name} cx={c.x} cy={c.y} r={0.25 * inv} fill="oklch(0.30 0.06 40 / 0.55)" />
              ))}
            </g>
          )}

          {/* Cities — tier 2+ */}
          {tier >= 2 && (
            <g className="layer-cities">
              {layers.cities.map((c) => (
                <HubGlyph
                  key={c.id}
                  m={c}
                  inv={inv}
                  active={selectedId === c.id}
                  showLabel={tier >= 2}
                  onSelect={onSelect}
                  size={1.0}
                />
              ))}
            </g>
          )}

          {/* Landmarks — tier 3+ */}
          {tier >= 3 && (
            <g className="layer-landmarks">
              {layers.landmarks.map((c) => (
                <HubGlyph
                  key={c.id}
                  m={c}
                  inv={inv}
                  active={selectedId === c.id}
                  showLabel={tier >= 3}
                  onSelect={onSelect}
                  size={0.75}
                />
              ))}
            </g>
          )}

          {/* Historical entities — tier 4 */}
          {tier >= 4 && (
            <g className="layer-entities">
              {visibleEntities.map((e) => {
                const Icon = TYPE_ICON[e.entity_type];
                const fill = TYPE_FILL[e.entity_type];
                const active = selectedId === e.id;
                const r = 0.55 * inv;
                return (
                  <g key={e.id}
                    transform={`translate(${e.coords.x} ${e.coords.y})`}
                    className="cursor-pointer"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => { ev.stopPropagation(); onSelect(e); }}
                  >
                    {active && <circle r={2.2 * inv} fill="url(#atlas-glow)" />}
                    <circle r={r + 0.18 * inv} fill="oklch(0.22 0.06 40)" opacity={0.5} />
                    <circle r={r} fill={fill} stroke="oklch(0.95 0.04 80)" strokeWidth={0.1 * inv} />
                    <text
                      y={-r - 0.4 * inv}
                      textAnchor="middle"
                      fontSize={1.3 * inv}
                      fontWeight={700}
                      fill="oklch(0.18 0.06 40)"
                      style={{ fontFamily: "var(--font-display)" }}
                    >{e.title}</text>
                    {/* tiny type indicator */}
                    <Icon x={-0.6 * inv} y={-0.6 * inv} width={1.2 * inv} height={1.2 * inv} stroke="oklch(0.18 0.06 40)" strokeWidth={0.15 * inv} />
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>

      {/* Compass + tier readout */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-amber-900/30 bg-amber-50/85 px-3 py-1.5 text-[11px] font-bold text-amber-950 shadow-sm" dir="rtl">
        <span className="opacity-70">المستوى</span>
        <span>{TIER_LABEL[tier]}</span>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
        <ZoomBtn label="+" onClick={() => setView((v) => clamp({ ...v, scale: v.scale * 1.4 }))} />
        <ZoomBtn label="−" onClick={() => setView((v) => clamp({ ...v, scale: v.scale / 1.4 }))} />
        <ZoomBtn label="⟲" onClick={() => setView(IDENTITY)} />
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid size-9 place-items-center rounded-xl border border-amber-900/40 bg-amber-50/90 text-amber-950 shadow-sm hover:bg-amber-50 text-base font-bold"
    >{label}</button>
  );
}

function HubGlyph({
  m, inv, active, showLabel, onSelect, size,
}: {
  m: HubMarker; inv: number; active: boolean; showLabel: boolean;
  onSelect: (m: HubMarker) => void; size: number;
}) {
  const r = size * inv;
  const fill = m.entity_type === "landmark" ? "oklch(0.55 0.14 35)" : "oklch(0.42 0.10 60)";
  return (
    <g
      transform={`translate(${m.coords.x} ${m.coords.y})`}
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onSelect(m); }}
    >
      {active && <circle r={(size + 1.5) * inv} fill="url(#atlas-glow)" />}
      {/* hub mark: filled diamond for cities, square for landmarks */}
      {m.entity_type === "landmark" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill} stroke="oklch(0.95 0.04 80)" strokeWidth={0.12 * inv} />
      ) : (
        <g>
          <circle r={r + 0.18 * inv} fill="oklch(0.22 0.06 40)" opacity={0.55} />
          <circle r={r} fill={fill} stroke="oklch(0.96 0.04 80)" strokeWidth={0.14 * inv} />
          <circle r={r * 0.35} fill="oklch(0.96 0.06 82)" />
        </g>
      )}
      {showLabel && (
        <text
          y={-r - 0.6 * inv}
          textAnchor="middle"
          fontSize={(active ? 2 : 1.6) * inv}
          fontWeight={800}
          fill="oklch(0.20 0.06 40)"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}
        >{m.title}</text>
      )}
    </g>
  );
}

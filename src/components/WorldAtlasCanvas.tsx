// Interactive parchment world atlas — Phase 2.
// SVG canvas with pan / pinch-zoom, real markers from encyclopedia_entities.
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Swords, User, Landmark, Gem, Calendar, Crown, Plus, Minus, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorldEntity, WorldEntityType, MapCoords } from "@/lib/world-map-source";

export type MapMarker = WorldEntity & { coords: MapCoords };

const TYPE_ICON: Record<WorldEntityType, LucideIcon> = {
  city: Building2,
  battle: Swords,
  figure: User,
  landmark: Landmark,
  artifact: Gem,
  event: Calendar,
  state: Crown,
};

const TYPE_FILL: Record<WorldEntityType, string> = {
  city: "oklch(0.85 0.15 80)",
  battle: "oklch(0.6 0.22 30)",
  figure: "oklch(0.78 0.16 60)",
  landmark: "oklch(0.78 0.13 180)",
  artifact: "oklch(0.72 0.16 300)",
  event: "oklch(0.7 0.12 250)",
  state: "oklch(0.82 0.18 70)",
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

export function WorldAtlasCanvas({
  markers,
  selectedId,
  onSelect,
  editMode = false,
  previewCoords = null,
  onPlace,
}: {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (m: MapMarker | null) => void;
  editMode?: boolean;
  previewCoords?: MapCoords | null;
  onPlace?: (coords: MapCoords) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);

  const clamp = useCallback((v: View): View => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale));
    const w = wrapRef.current?.clientWidth ?? 1;
    const h = wrapRef.current?.clientHeight ?? 1;
    const maxX = (s - 1) * w / 2;
    const maxY = (s - 1) * h / 2;
    return {
      scale: s,
      tx: Math.max(-maxX, Math.min(maxX, v.tx)),
      ty: Math.max(-maxY, Math.min(maxY, v.ty)),
    };
  }, []);

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

  const zoomBy = (factor: number) => setView((v) => clamp({ ...v, scale: v.scale * factor }));
  const reset = () => setView(IDENTITY);

  // Wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => clamp({ ...v, scale: v.scale * factor }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp]);

  // Touch pinch (simple two-finger)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch.current) {
        pinch.current = { dist, scale: view.scale, cx: 0, cy: 0 };
        return;
      }
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

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-amber-900/30 map-parchment map-vignette shadow-elegant select-none" dir="ltr">
      {/* Title cartouche */}
      <div className="absolute right-3 top-3 z-10 rounded-xl border border-amber-900/40 bg-amber-50/70 px-3 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm pointer-events-none" dir="rtl">
        ⚜︎ عالم إرث ⚜︎
      </div>
      {/* Controls */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">
        <button onClick={() => zoomBy(1.3)} aria-label="تكبير" className="grid size-8 place-items-center rounded-lg border border-amber-900/40 bg-amber-50/80 text-amber-950 shadow-sm hover:bg-amber-50">
          <Plus className="size-4" />
        </button>
        <button onClick={() => zoomBy(1 / 1.3)} aria-label="تصغير" className="grid size-8 place-items-center rounded-lg border border-amber-900/40 bg-amber-50/80 text-amber-950 shadow-sm hover:bg-amber-50">
          <Minus className="size-4" />
        </button>
        <button onClick={reset} aria-label="إعادة" className="grid size-8 place-items-center rounded-lg border border-amber-900/40 bg-amber-50/80 text-amber-950 shadow-sm hover:bg-amber-50">
          <RotateCcw className="size-4" />
        </button>
      </div>
      {/* Compass */}
      <div className="absolute left-3 bottom-3 z-10 text-amber-900/70 pointer-events-none">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <path d="M20,3 L23,20 L20,37 L17,20 Z" fill="currentColor" opacity="0.7" />
          <path d="M3,20 L20,17 L37,20 L20,23 Z" fill="currentColor" opacity="0.45" />
          <text x="20" y="9" textAnchor="middle" fontSize="4" fill="currentColor" fontWeight="700">N</text>
        </svg>
      </div>

      <div
        ref={wrapRef}
        className="touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 60"
          preserveAspectRatio="xMidYMid meet"
          className="block w-full h-[420px]"
        >
          <defs>
            <pattern id="wm-grid" width="5" height="5" patternUnits="userSpaceOnUse">

              <path d="M5 0 L0 0 0 5" fill="none" stroke="oklch(0.32 0.06 50 / 0.18)" strokeWidth="0.1" />
            </pattern>
            <pattern id="wm-sea" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.55 0.08 230 / 0.22)" strokeWidth="0.15" />
            </pattern>
            <radialGradient id="wm-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.95 0.14 82 / 0.8)" />
              <stop offset="100%" stopColor="oklch(0.85 0.14 82 / 0)" />
            </radialGradient>
          </defs>

          <g
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformOrigin: "center",
              transition: drag.current ? "none" : "transform 120ms ease-out",
            }}
          >
            <rect width="100" height="60" fill="url(#wm-sea)" opacity="0.55" />
            <rect width="100" height="60" fill="url(#wm-grid)" />
            <g className="ink-stroke-light" fill="none" strokeWidth="0.2">
              <path d="M2,20 Q25,24 50,20 T98,20" />
              <path d="M2,42 Q30,46 60,42 T98,44" />
              <path d="M52,4 Q60,8 70,6 T96,4" />
            </g>

            {/* Markers */}
            {markers.map((m) => {
              const active = selectedId === markerId(m);
              const fill = TYPE_FILL[m.entity_type];
              const r = active ? 1.2 : 0.85;
              return (
                <g
                  key={markerId(m)}
                  transform={`translate(${m.coords.x} ${m.coords.y})`}
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onSelect(m); }}
                >
                  {active && <circle r={2.4} fill="url(#wm-glow)" />}
                  <circle r={r + 0.3} fill="oklch(0.22 0.06 40)" opacity={0.5} />
                  <circle r={r} fill={fill} stroke="oklch(0.95 0.04 80)" strokeWidth={0.12} />
                  {active && (
                    <text
                      y={-r - 0.6}
                      textAnchor="middle"
                      fontSize={1.8}
                      fontWeight={800}
                      fill="oklch(0.18 0.06 40)"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {m.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="absolute right-3 bottom-3 z-10 rounded-full border border-amber-900/30 bg-amber-50/80 px-3 py-1 text-[10px] text-amber-950 pointer-events-none" dir="rtl">
        {markers.length > 0
          ? `يعرض ${markers.length} موقعًا على الخريطة`
          : "لا توجد مواقع تطابق التصفية"}
      </div>
    </div>
  );
}

export function markerId(m: { entity_type: string; slug: string }): string {
  return `${m.entity_type}-${m.slug}`;
}

export { TYPE_ICON };

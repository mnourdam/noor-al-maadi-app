import { useEffect, useMemo, useRef, useState, useCallback, type PointerEvent as RPointerEvent } from "react";
import { Maximize2, Minimize2, Plus, Minus, RotateCcw, ChevronDown, ChevronUp, X, ExternalLink } from "lucide-react";
import { MAP_REGIONS, type MapRegion } from "@/lib/data";
import { entityHref } from "@/components/EncyclopediaCard";
import type { AtlasPin, AtlasPinKind, StateOverlay } from "@/lib/atlas";

// ============================================================
// AtlasViewport — zoom / pan / pinch / fullscreen / clustering
// SVG viewBox is 100x60 (matches MAP_REGIONS polygon coords).
// ============================================================

const VB_W = 100;
const VB_H = 60;
const MIN_SCALE = 1;
const MAX_SCALE = 8;

const ROUTES: { from: string; to: string }[] = [
  { from: "andalus", to: "maghrib" }, { from: "maghrib", to: "egypt" },
  { from: "egypt", to: "sham" }, { from: "sham", to: "anatolia" },
  { from: "sham", to: "iraq" }, { from: "iraq", to: "hijaz" },
  { from: "iraq", to: "khorasan" }, { from: "khorasan", to: "transoxiana" },
  { from: "khorasan", to: "hind" },
];

const KIND_LABEL: Record<AtlasPinKind, string> = {
  capital: "عواصم", city: "مدن", state: "دول",
  battle: "معارك", event: "أحداث", landmark: "معالم",
};

const KIND_COLOR: Record<AtlasPinKind, { fill: string; stroke: string }> = {
  capital:  { fill: "oklch(0.88 0.16 82)",  stroke: "oklch(0.32 0.1 40)" },
  city:     { fill: "oklch(0.95 0.04 80)",  stroke: "oklch(0.32 0.1 40)" },
  state:    { fill: "oklch(0.78 0.18 60)",  stroke: "oklch(0.3 0.12 40)" },
  battle:   { fill: "oklch(0.6 0.21 30)",   stroke: "oklch(0.25 0.1 30)" },
  event:    { fill: "oklch(0.72 0.16 300)", stroke: "oklch(0.3 0.12 300)" },
  landmark: { fill: "oklch(0.78 0.13 180)", stroke: "oklch(0.3 0.08 200)" },
};

/** Renders the marker glyph for a kind. Coord (0,0) is the pin anchor. */
function MarkerGlyph({ kind, size = 1 }: { kind: AtlasPinKind; size?: number }) {
  const c = KIND_COLOR[kind];
  const s = size;
  switch (kind) {
    case "capital":
      return (
        <g>
          <circle r={1.4 * s} fill={c.fill} opacity="0.35" />
          <path d={`M0,${-1.3 * s} L${0.4 * s},${-0.4 * s} L${1.3 * s},${-0.4 * s} L${0.6 * s},${0.2 * s} L${0.9 * s},${1.2 * s} L0,${0.55 * s} L${-0.9 * s},${1.2 * s} L${-0.6 * s},${0.2 * s} L${-1.3 * s},${-0.4 * s} L${-0.4 * s},${-0.4 * s} Z`}
            fill={c.fill} stroke={c.stroke} strokeWidth="0.15" strokeLinejoin="round" />
        </g>
      );
    case "city":
      return (
        <g>
          <path d={`M0,${1.1 * s} L${-0.7 * s},${-0.1 * s} A${0.7 * s},${0.7 * s} 0 1,1 ${0.7 * s},${-0.1 * s} Z`}
            fill={c.fill} stroke={c.stroke} strokeWidth="0.14" />
          <circle cx={0} cy={-0.25 * s} r={0.28 * s} fill={c.stroke} />
        </g>
      );
    case "state":
      return (
        <g>
          <circle r={1.5 * s} fill={c.fill} opacity="0.3" />
          <circle r={0.85 * s} fill={c.fill} stroke={c.stroke} strokeWidth="0.18" />
          <text y={0.35 * s} textAnchor="middle" fontSize={1.1 * s} fontWeight="800" fill="oklch(0.2 0.05 40)" style={{ pointerEvents: "none" }}>❖</text>
        </g>
      );
    case "battle":
      return (
        <g stroke={c.stroke} strokeWidth={0.22 * s} strokeLinecap="round">
          <circle r={1.0 * s} fill={c.fill} opacity="0.85" stroke={c.stroke} strokeWidth="0.12" />
          <line x1={-0.55 * s} y1={-0.55 * s} x2={0.55 * s} y2={0.55 * s} />
          <line x1={0.55 * s} y1={-0.55 * s} x2={-0.55 * s} y2={0.55 * s} />
        </g>
      );
    case "event":
      return (
        <g>
          <rect x={-0.85 * s} y={-0.55 * s} width={1.7 * s} height={1.1 * s} rx={0.22 * s}
            fill={c.fill} stroke={c.stroke} strokeWidth="0.14" />
          <line x1={-0.55 * s} y1={-0.2 * s} x2={0.55 * s} y2={-0.2 * s} stroke={c.stroke} strokeWidth="0.1" />
          <line x1={-0.55 * s} y1={0.05 * s} x2={0.55 * s} y2={0.05 * s} stroke={c.stroke} strokeWidth="0.1" />
          <line x1={-0.55 * s} y1={0.3 * s} x2={0.25 * s} y2={0.3 * s} stroke={c.stroke} strokeWidth="0.1" />
        </g>
      );
    case "landmark":
      return (
        <g>
          <path d={`M${-0.9 * s},${0.6 * s} L${-0.9 * s},${-0.2 * s} L0,${-0.95 * s} L${0.9 * s},${-0.2 * s} L${0.9 * s},${0.6 * s} Z`}
            fill={c.fill} stroke={c.stroke} strokeWidth="0.15" strokeLinejoin="round" />
          <line x1={-0.55 * s} y1={0.2 * s} x2={-0.55 * s} y2={0.6 * s} stroke={c.stroke} strokeWidth="0.12" />
          <line x1={0} y1={0.05 * s} x2={0} y2={0.6 * s} stroke={c.stroke} strokeWidth="0.12" />
          <line x1={0.55 * s} y1={0.2 * s} x2={0.55 * s} y2={0.6 * s} stroke={c.stroke} strokeWidth="0.12" />
        </g>
      );
  }
}

interface Cluster {
  id: string;
  x: number;
  y: number;
  pins: AtlasPin[];
}

/** Grid-bucket pins by zoom. Returns clusters; clusters with 1 pin render as a marker. */
function clusterPins(pins: AtlasPin[], scale: number): Cluster[] {
  // Cell size shrinks as you zoom in — finer detail when zoomed.
  const cell = Math.max(1.4, 4.5 / scale);
  const buckets = new Map<string, AtlasPin[]>();
  for (const p of pins) {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const k = `${cx}:${cy}`;
    const arr = buckets.get(k);
    if (arr) arr.push(p);
    else buckets.set(k, [p]);
  }
  const out: Cluster[] = [];
  for (const [k, arr] of buckets) {
    if (arr.length === 1) {
      const p = arr[0];
      out.push({ id: `c:${p.id}`, x: p.x, y: p.y, pins: arr });
    } else {
      const x = arr.reduce((a, b) => a + b.x, 0) / arr.length;
      const y = arr.reduce((a, b) => a + b.y, 0) / arr.length;
      out.push({ id: `g:${k}`, x, y, pins: arr });
    }
  }
  return out;
}

const TYPE_LABEL_AR: Record<string, string> = {
  state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
  event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
  scholar: "عالم",
};

export function AtlasViewport({
  pins, overlay, eraFilter, regionsUnlocked, selectedRegionId, onSelectRegion,
}: {
  pins: AtlasPin[];
  overlay: StateOverlay | undefined;
  eraFilter: string | null;
  regionsUnlocked: string[];
  selectedRegionId: string;
  onSelectRegion: (id: string) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);   // pan translate, in VB units
  const [ty, setTy] = useState(0);
  const [legendOpen, setLegendOpen] = useState(true);
  const [preview, setPreview] = useState<Cluster | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const regionsById = useMemo(
    () => Object.fromEntries(MAP_REGIONS.map((r) => [r.id, r])) as Record<string, MapRegion>,
    [],
  );

  // Lock body scroll in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [fullscreen]);

  const clampPan = useCallback((nx: number, ny: number, s: number) => {
    // Allow panning so the visible viewBox stays inside the map.
    const visW = VB_W / s;
    const visH = VB_H / s;
    const minX = 0;
    const maxX = VB_W - visW;
    const minY = 0;
    const maxY = VB_H - visH;
    return {
      x: Math.max(minX, Math.min(maxX, nx)),
      y: Math.max(minY, Math.min(maxY, ny)),
    };
  }, []);

  const zoomAt = useCallback((newScale: number, anchorVBx?: number, anchorVBy?: number) => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (anchorVBx == null || anchorVBy == null) {
      // Zoom around the center of the current view.
      const cx = tx + (VB_W / scale) / 2;
      const cy = ty + (VB_H / scale) / 2;
      const nx = cx - (VB_W / s) / 2;
      const ny = cy - (VB_H / s) / 2;
      const c = clampPan(nx, ny, s);
      setScale(s); setTx(c.x); setTy(c.y);
      return;
    }
    // Keep anchor under the cursor.
    const nx = anchorVBx - (anchorVBx - tx) * (scale / s);
    const ny = anchorVBy - (anchorVBy - ty) * (scale / s);
    const c = clampPan(nx, ny, s);
    setScale(s); setTx(c.x); setTy(c.y);
  }, [scale, tx, ty, clampPan]);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  // ----- Pointer & pinch handling -----
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; scale: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const screenToVB = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { x: tx + px * (VB_W / scale), y: ty + py * (VB_H / scale) };
  }, [scale, tx, ty]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchRef.current = { dist, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale };
      panRef.current = null;
    } else if (pointers.current.size === 1) {
      panRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinchRef.current.dist;
      const targetScale = pinchRef.current.scale * ratio;
      const anchor = screenToVB(pinchRef.current.cx, pinchRef.current.cy);
      zoomAt(targetScale, anchor.x, anchor.y);
    } else if (pointers.current.size === 1 && panRef.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - panRef.current.x) / rect.width * (VB_W / scale);
      const dy = (e.clientY - panRef.current.y) / rect.height * (VB_H / scale);
      const c = clampPan(panRef.current.tx - dx, panRef.current.ty - dy, scale);
      setTx(c.x); setTy(c.y);
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) panRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const anchor = screenToVB(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(scale * factor, anchor.x, anchor.y);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = screenToVB(e.clientX, e.clientY);
    zoomAt(scale * 1.8, anchor.x, anchor.y);
  };

  // Mobile double-tap (since dblclick is unreliable on touch).
  const handleTap = (clientX: number, clientY: number) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.t < 320 && Math.hypot(clientX - last.x, clientY - last.y) < 30) {
      const anchor = screenToVB(clientX, clientY);
      zoomAt(scale * 1.8, anchor.x, anchor.y);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { t: now, x: clientX, y: clientY };
    }
  };

  // Build clusters once per pins/scale change.
  const clusters = useMemo(() => clusterPins(pins, scale), [pins, scale]);

  // Marker scale: keep markers visually constant as the SVG zooms.
  const markerScale = 1 / scale;

  // Compute the viewBox string.
  const vbW = VB_W / scale;
  const vbH = VB_H / scale;
  const viewBox = `${tx} ${ty} ${vbW} ${vbH}`;

  // Container styling switches between embedded card and fullscreen overlay.
  const containerCls = fullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-[oklch(0.16_0.04_240)]"
    : "relative overflow-hidden rounded-3xl border-2 border-amber-900/30 map-parchment map-vignette shadow-elegant";

  const svgHeight = fullscreen ? "100%" : "h-[420px]";

  return (
    <div ref={wrapperRef} className={containerCls} dir="ltr">
      {/* Helper banner — explains map interaction in Arabic */}
      {!fullscreen && (
        <div
          className="border-b border-amber-900/30 bg-amber-50/70 px-3 py-1.5 text-center text-[11px] font-medium text-amber-950"
          dir="rtl"
        >
          كبّر الخريطة وحرّكها لاكتشاف المدن والمعارك والمعالم.
        </div>
      )}
      {/* Title cartouche */}
      {!fullscreen && (
        <div className="absolute right-3 top-3 z-10 rounded-xl border border-amber-900/40 bg-amber-50/70 px-3 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm" dir="rtl">
          ⚜︎ أطلس العالم الإسلامي ⚜︎
        </div>
      )}
      {fullscreen && (
        <div className="z-20 flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2 backdrop-blur" dir="rtl">
          <p className="font-display text-sm font-bold text-gold">⚜︎ أطلس العالم الإسلامي</p>
          <button onClick={() => setFullscreen(false)}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-surface/60 px-3 py-1 text-[11px] text-foreground/90">
            <Minimize2 className="size-3.5" /> خروج
          </button>
        </div>
      )}

      {/* Touch-handling wrapper */}
      <div
        className={`relative flex-1 ${fullscreen ? "" : ""}`}
        style={{ touchAction: "none", cursor: panRef.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onClick={(e) => handleTap(e.clientX, e.clientY)}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className={`block w-full ${fullscreen ? "h-full" : svgHeight}`}
        >
          <defs>
            <pattern id="atlasSeaHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.55 0.08 230 / 0.35)" strokeWidth="0.18" />
            </pattern>
            <filter id="atlasRough" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="3" />
              <feDisplacementMap in="SourceGraphic" scale="0.4" />
            </filter>
            <radialGradient id="atlasFog" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="oklch(0.95 0.02 80 / 0.85)" />
              <stop offset="100%" stopColor="oklch(0.85 0.03 70 / 0.1)" />
            </radialGradient>
          </defs>

          {/* Base parchment + sea hatch */}
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="oklch(0.93 0.04 80)" />
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#atlasSeaHatch)" opacity="0.5" />

          {/* State influence overlay */}
          {overlay && (
            <g style={{ pointerEvents: "none" }}>
              {overlay.regions.map(rid => {
                const r = regionsById[rid];
                if (!r?.polygon) return null;
                return (
                  <path key={`ovl-${rid}`} d={r.polygon}
                    fill={overlay.fill} stroke={overlay.stroke} strokeWidth="0.35"
                    strokeDasharray="0.7 0.5" filter="url(#atlasRough)" />
                );
              })}
            </g>
          )}

          {/* Seas */}
          <g className="ink-stroke-light" fill="none" strokeWidth="0.25">
            <path d="M2,18 Q20,22 38,20 T70,20 Q82,18 98,20" />
            <path d="M2,46 Q22,50 44,48 T80,48 Q90,48 98,46" />
          </g>

          {/* Routes */}
          <g>
            {ROUTES.map((rt, i) => {
              const a = regionsById[rt.from];
              const b = regionsById[rt.to];
              if (!a || !b || a.labelX == null || b.labelX == null) return null;
              const both = regionsUnlocked.includes(rt.from) && regionsUnlocked.includes(rt.to);
              return (
                <path key={i}
                  d={`M${a.labelX},${a.labelY} Q${(a.labelX! + b.labelX!) / 2},${Math.min(a.labelY!, b.labelY!) - 3} ${b.labelX},${b.labelY}`}
                  fill="none"
                  stroke={both ? "oklch(0.55 0.16 50 / 0.85)" : "oklch(0.4 0.08 50 / 0.3)"}
                  strokeWidth="0.25" strokeDasharray="0.8 0.8" />
              );
            })}
          </g>

          {/* Regions */}
          {MAP_REGIONS.map((r) => {
            const isUnlocked = regionsUnlocked.includes(r.id);
            const isActive = selectedRegionId === r.id;
            return (
              <g key={r.id} onClick={(e) => { e.stopPropagation(); onSelectRegion(r.id); }} className="cursor-pointer">
                <path d={r.polygon}
                  fill={isUnlocked
                    ? (isActive ? "oklch(0.82 0.11 75 / 0.85)" : "oklch(0.78 0.09 75 / 0.55)")
                    : "oklch(0.35 0.05 50 / 0.55)"}
                  stroke={isActive ? "oklch(0.45 0.16 50)" : "oklch(0.32 0.08 40 / 0.85)"}
                  strokeWidth={isActive ? 0.45 : 0.3}
                  filter="url(#atlasRough)" />
                {r.labelX != null && r.labelY != null && (
                  <text x={r.labelX} y={r.labelY} textAnchor="middle"
                    fontSize={2.2 / Math.sqrt(scale)}
                    fontWeight="800"
                    fill={isUnlocked ? "oklch(0.18 0.06 40)" : "oklch(0.92 0.05 80 / 0.85)"}
                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em", pointerEvents: "none" }}>
                    {r.name}
                  </text>
                )}
                {!isUnlocked && (
                  <path d={r.polygon} fill="url(#atlasFog)" opacity="0.7" style={{ pointerEvents: "none" }} />
                )}
              </g>
            );
          })}

          {/* Clusters & markers */}
          <g>
            {clusters.map((cl) => {
              if (cl.pins.length === 1) {
                const pin = cl.pins[0];
                return (
                  <g key={cl.id}
                    transform={`translate(${cl.x} ${cl.y}) scale(${markerScale})`}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setPreview(cl); }}
                  >
                    <title>{pin.entity.title}</title>
                    <MarkerGlyph kind={pin.kind} />
                  </g>
                );
              }
              // Cluster bubble
              const count = cl.pins.length;
              const r = 1.2 + Math.min(1.6, Math.log10(count) * 1.2);
              return (
                <g key={cl.id}
                  transform={`translate(${cl.x} ${cl.y}) scale(${markerScale})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Zoom in toward cluster center
                    zoomAt(scale * 1.9, cl.x, cl.y);
                  }}
                >
                  <title>اضغط للتكبير واستكشاف العناصر ({count})</title>
                  <circle r={r + 0.5} fill="oklch(0.85 0.15 80)" opacity="0.35" />
                  <circle r={r} fill="oklch(0.82 0.14 82)" stroke="oklch(0.3 0.1 40)" strokeWidth="0.15" />
                  <text y={0.45} textAnchor="middle"
                    fontSize={count > 99 ? 1.0 : 1.3}
                    fontWeight="800" fill="oklch(0.2 0.05 40)"
                    style={{ pointerEvents: "none" }}>{count}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Controls */}
        <div className="pointer-events-none absolute inset-0">
          {/* Top-left zoom stack */}
          <div className="pointer-events-auto absolute left-2 top-2 flex flex-col gap-1.5">
            <CtrlBtn label="تكبير" onClick={() => zoomAt(scale * 1.4)}><Plus className="size-4" /></CtrlBtn>
            <CtrlBtn label="تصغير" onClick={() => zoomAt(scale / 1.4)}><Minus className="size-4" /></CtrlBtn>
            <CtrlBtn label="إعادة" onClick={reset}><RotateCcw className="size-4" /></CtrlBtn>
            <CtrlBtn label={fullscreen ? "خروج" : "ملء الشاشة"} onClick={() => setFullscreen((v) => !v)}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </CtrlBtn>
          </div>

          {/* Legend */}
          <div className="pointer-events-auto absolute bottom-2 right-2 max-w-[60%]" dir="rtl">
            <div className="rounded-2xl border border-amber-900/40 bg-amber-50/80 px-2.5 py-2 text-[10px] text-amber-950 shadow-sm">
              <button onClick={() => setLegendOpen(v => !v)}
                className="flex w-full items-center justify-between gap-2 font-bold">
                <span>المفتاح</span>
                {legendOpen ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
              </button>
              {legendOpen && (
                <ul className="mt-1.5 space-y-1">
                  {(Object.keys(KIND_LABEL) as AtlasPinKind[]).map(k => (
                    <li key={k} className="flex items-center gap-1.5">
                      <svg width={14} height={14} viewBox="-2 -2 4 4">
                        <MarkerGlyph kind={k} size={1} />
                      </svg>
                      <span>{KIND_LABEL[k]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Era badge */}
          {eraFilter && (
            <div className="pointer-events-none absolute bottom-2 left-14 rounded-full border border-gold/40 bg-amber-50/80 px-2.5 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm" dir="rtl">
              عصر · {eraFilter}
            </div>
          )}

          {/* Zoom indicator */}
          <div className="pointer-events-none absolute top-2 right-1/2 translate-x-1/2 rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-amber-50">
            ×{scale.toFixed(1)}
          </div>
        </div>

        {/* Preview card */}
        {preview && preview.pins.length === 1 && (
          <PreviewCard pin={preview.pins[0]} onClose={() => setPreview(null)} />
        )}
      </div>
    </div>
  );
}

function CtrlBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full border border-amber-900/40 bg-amber-50/80 text-amber-950 shadow-sm hover:bg-amber-50 active:scale-95 transition"
    >
      {children}
    </button>
  );
}

function PreviewCard({ pin, onClose }: { pin: AtlasPin; onClose: () => void }) {
  const e = pin.entity;
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-10" dir="rtl">
      <div className="rounded-2xl border border-gold/35 bg-surface/95 p-3 shadow-elegant backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/40 text-xl">
            {e.image?.glyph ?? "✦"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gold/80">
                {TYPE_LABEL_AR[e.type] ?? e.type}
              </span>
              {pin.era && (
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] text-muted-foreground">
                  {pin.era}
                </span>
              )}
            </div>
            <p className="font-display mt-1 text-sm font-bold line-clamp-1">{e.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{e.description}</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق"
            className="grid size-7 place-items-center rounded-full border border-white/10 bg-surface-2 text-muted-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <a href={entityHref(e)}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-gold py-2 text-[12px] font-bold text-primary-foreground shadow-gold">
          <ExternalLink className="size-3.5" /> فتح في الموسوعة
        </a>
      </div>
    </div>
  );
}
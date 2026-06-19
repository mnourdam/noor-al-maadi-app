import { useEffect, useMemo, useRef, useState, useCallback, type PointerEvent as RPointerEvent } from "react";
import { Maximize2, Minimize2, Plus, Minus, RotateCcw, X, ExternalLink, Compass } from "lucide-react";
import { MAP_REGIONS, type MapRegion } from "@/lib/data";
import { entityHref } from "@/components/EncyclopediaCard";
import type { AtlasPin, AtlasPinKind, StateOverlay } from "@/lib/atlas";

// ============================================================
// AtlasViewport — exploration-first map.
// Progressive zoom tiers reveal content gradually (no clusters):
//   1× – 2.5×  → states / regions / civilizations
//   2.5× – 4.5× → capitals + major cities
//   4.5× – 6.5× → battles + pivotal events
//   6.5× +      → landmarks, mosques, libraries, rare places
// ============================================================

const VB_W = 100;
const VB_H = 60;
const MIN_SCALE = 1;
const MAX_SCALE = 20;
const ONBOARD_KEY = "irth.atlas.onboarded.v1";

const VISIBLE_AT: Record<AtlasPinKind, (s: number) => boolean> = {
  state:    () => true,
  capital:  (s) => s >= 2.5,
  city:     (s) => s >= 3,
  battle:   (s) => s >= 6,
  event:    (s) => s >= 6,
  landmark: (s) => s >= 10,
};

const LABEL_FROM: Record<AtlasPinKind, number> = {
  state: 1, capital: 2.5, city: 4, battle: 7, event: 7, landmark: 10,
};

const ROUTES: { from: string; to: string }[] = [
  { from: "andalus", to: "maghrib" }, { from: "maghrib", to: "egypt" },
  { from: "egypt", to: "sham" }, { from: "sham", to: "anatolia" },
  { from: "sham", to: "iraq" }, { from: "iraq", to: "hijaz" },
  { from: "iraq", to: "khorasan" }, { from: "khorasan", to: "transoxiana" },
  { from: "khorasan", to: "hind" },
];

const KIND_EMOJI: Record<AtlasPinKind, string> = {
  state: "🏛", capital: "★", city: "🏙", battle: "⚔", event: "📜", landmark: "🕌",
};

const KIND_COLOR: Record<AtlasPinKind, { fill: string; stroke: string; ring: string }> = {
  capital:  { fill: "oklch(0.88 0.16 82)",  stroke: "oklch(0.32 0.1 40)",  ring: "oklch(0.88 0.16 82 / 0.35)" },
  city:     { fill: "oklch(0.95 0.04 80)",  stroke: "oklch(0.32 0.1 40)",  ring: "oklch(0.95 0.04 80 / 0.45)" },
  state:    { fill: "oklch(0.78 0.18 60)",  stroke: "oklch(0.3 0.12 40)",  ring: "oklch(0.78 0.18 60 / 0.35)" },
  battle:   { fill: "oklch(0.62 0.21 30)",  stroke: "oklch(0.25 0.1 30)",  ring: "oklch(0.62 0.21 30 / 0.4)" },
  event:    { fill: "oklch(0.72 0.16 300)", stroke: "oklch(0.3 0.12 300)", ring: "oklch(0.72 0.16 300 / 0.35)" },
  landmark: { fill: "oklch(0.78 0.13 180)", stroke: "oklch(0.3 0.08 200)", ring: "oklch(0.78 0.13 180 / 0.35)" },
};

const TYPE_LABEL_AR: Record<string, string> = {
  state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
  event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
  scholar: "عالم",
};

/** Big, tappable marker — emoji glyph on a soft ring (≈44–56 px on mobile). */
function MarkerGlyph({ kind, size = 2.4 }: { kind: AtlasPinKind; size?: number }) {
  const c = KIND_COLOR[kind];
  const s = size;
  return (
    <g>
      <circle r={s * 1.15} fill={c.ring} />
      <circle r={s * 0.85} fill={c.fill} stroke={c.stroke} strokeWidth={s * 0.09} />
      <text y={s * 0.32} textAnchor="middle" fontSize={s * 0.95}
        style={{ pointerEvents: "none" }} fill="oklch(0.18 0.06 40)" fontWeight="800">
        {KIND_EMOJI[kind]}
      </text>
    </g>
  );
}

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
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [preview, setPreview] = useState<AtlasPin | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(ONBOARD_KEY)) setShowOnboard(true); } catch { /* ignore */ }
  }, []);
  const dismissOnboard = () => {
    setShowOnboard(false);
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
  };

  const regionsById = useMemo(
    () => Object.fromEntries(MAP_REGIONS.map((r) => [r.id, r])) as Record<string, MapRegion>,
    [],
  );

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [fullscreen]);

  const clampPan = useCallback((nx: number, ny: number, s: number) => {
    const visW = VB_W / s, visH = VB_H / s;
    return {
      x: Math.max(0, Math.min(VB_W - visW, nx)),
      y: Math.max(0, Math.min(VB_H - visH, ny)),
    };
  }, []);

  const zoomAt = useCallback((newScale: number, anchorVBx?: number, anchorVBy?: number) => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (anchorVBx == null || anchorVBy == null) {
      const cx = tx + (VB_W / scale) / 2;
      const cy = ty + (VB_H / scale) / 2;
      const nx = cx - (VB_W / s) / 2;
      const ny = cy - (VB_H / s) / 2;
      const c = clampPan(nx, ny, s);
      setScale(s); setTx(c.x); setTy(c.y);
      return;
    }
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
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale };
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
      const anchor = screenToVB(pinchRef.current.cx, pinchRef.current.cy);
      zoomAt(pinchRef.current.scale * ratio, anchor.x, anchor.y);
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
    zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), anchor.x, anchor.y);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = screenToVB(e.clientX, e.clientY);
    zoomAt(scale * 1.8, anchor.x, anchor.y);
  };

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

  // Tier-filtered pins (no clustering).
  const visiblePins = useMemo(
    () => pins.filter((p) => VISIBLE_AT[p.kind](scale)),
    [pins, scale],
  );

  const markerScale = 1 / scale;
  const vbW = VB_W / scale;
  const vbH = VB_H / scale;
  const viewBox = `${tx} ${ty} ${vbW} ${vbH}`;

  const tier =
    scale < 2.5 ? { n: 1, label: "العالم والدول" } :
    scale < 6   ? { n: 2, label: "العواصم والمدن" } :
    scale < 10  ? { n: 3, label: "المعارك والأحداث" } :
    scale < 15  ? { n: 4, label: "المعالم والمكتبات" } :
    scale < 18  ? { n: 5, label: "تجمّعات تاريخية كثيفة" } :
                  { n: 6, label: "وضع الاستكشاف العميق" };

  // ---- Progressive declustering ----
  // Group visible pins that fall within an overlap radius (in viewBox units).
  // Group radius shrinks as zoom increases, so pins gradually spread apart.
  const declustered = useMemo(() => {
    // overlap radius in viewBox units — shrinks with zoom so items separate when zooming in
    const radius = Math.max(0.35, 4.5 / scale);
    type Group = { ax: number; ay: number; items: AtlasPin[] };
    const groups: Group[] = [];
    for (const p of visiblePins) {
      let g = groups.find((gr) => Math.hypot(gr.ax - p.x, gr.ay - p.y) < radius);
      if (!g) { g = { ax: p.x, ay: p.y, items: [] }; groups.push(g); }
      g.items.push(p);
    }
    const out: { pin: AtlasPin; ox: number; oy: number }[] = [];
    for (const g of groups) {
      if (g.items.length === 1) {
        out.push({ pin: g.items[0], ox: 0, oy: 0 });
      } else {
        const r = radius * 0.9;
        const n = g.items.length;
        g.items.forEach((p, i) => {
          const a = (i / n) * Math.PI * 2;
          out.push({ pin: p, ox: Math.cos(a) * r, oy: Math.sin(a) * r });
        });
      }
    }
    return out;
  }, [visiblePins, scale]);

  // ---- Center camera on selected discovery ----
  useEffect(() => {
    if (!preview) return;
    const targetScale = Math.max(scale, 6);
    const nx = preview.x - (VB_W / targetScale) / 2;
    const ny = preview.y - (VB_H / targetScale) / 2;
    const c = clampPan(nx, ny, targetScale);
    setScale(targetScale); setTx(c.x); setTy(c.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.id]);

  const containerCls = fullscreen
    ? "fixed inset-0 z-[60] flex flex-col bg-[oklch(0.16_0.04_240)]"
    : "relative overflow-hidden rounded-3xl border-2 border-amber-900/30 map-parchment map-vignette shadow-elegant";

  const svgHeight = fullscreen ? "h-full" : "h-[460px]";

  return (
    <div ref={wrapperRef} className={containerCls} dir="ltr">
      {fullscreen && (
        <div className="z-20 flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2 backdrop-blur" dir="rtl">
          <p className="font-display text-sm font-bold text-gold">⚜︎ أطلس العالم الإسلامي</p>
          <button onClick={() => setFullscreen(false)}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-surface/60 px-3 py-1 text-[11px] text-foreground/90">
            <Minimize2 className="size-3.5" /> خروج
          </button>
        </div>
      )}

      <div
        className="relative flex-1"
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
          className={`block w-full ${svgHeight}`}
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

          <rect x="0" y="0" width={VB_W} height={VB_H} fill="oklch(0.93 0.04 80)" />
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#atlasSeaHatch)" opacity="0.5" />

          {overlay && (
            <g style={{ pointerEvents: "none" }}>
              {overlay.regions.map((rid) => {
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

          <g className="ink-stroke-light" fill="none" strokeWidth="0.25">
            <path d="M2,18 Q20,22 38,20 T70,20 Q82,18 98,20" />
            <path d="M2,46 Q22,50 44,48 T80,48 Q90,48 98,46" />
          </g>

          {scale < 4 && (
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
          )}

          {/* Regions */}
          {MAP_REGIONS.map((r) => {
            const isUnlocked = regionsUnlocked.includes(r.id);
            const isActive = selectedRegionId === r.id;
            const labelSize = Math.max(1.3, 2.6 / Math.sqrt(scale));
            return (
              <g key={r.id} onClick={(e) => { e.stopPropagation(); onSelectRegion(r.id); }} className="cursor-pointer">
                <path d={r.polygon}
                  fill={isUnlocked
                    ? (isActive ? "oklch(0.82 0.11 75 / 0.85)" : "oklch(0.78 0.09 75 / 0.55)")
                    : "oklch(0.35 0.05 50 / 0.55)"}
                  stroke={isActive ? "oklch(0.45 0.16 50)" : "oklch(0.32 0.08 40 / 0.85)"}
                  strokeWidth={isActive ? 0.45 : 0.3}
                  filter="url(#atlasRough)" />
                {r.labelX != null && r.labelY != null && scale < 5 && (
                  <text x={r.labelX} y={r.labelY} textAnchor="middle"
                    fontSize={labelSize}
                    fontWeight="800"
                    stroke="oklch(0.97 0.03 80 / 0.85)"
                    strokeWidth={0.4}
                    paintOrder="stroke"
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

          {/* Pins (tier-filtered, no clusters) */}
          <g>
            {declustered.map(({ pin, ox, oy }) => {
              const showLabel = scale >= LABEL_FROM[pin.kind];
              const isSelected = preview?.id === pin.id;
              const focusBoost = isSelected ? 1.2 : 1;
              const baseSize = (pin.kind === "state" ? 3.0 : pin.kind === "capital" ? 2.7 : 2.4) * focusBoost;
              return (
                <g key={pin.id}
                  transform={`translate(${pin.x + ox} ${pin.y + oy}) scale(${markerScale})`}
                  className={`cursor-pointer atlas-pin ${isSelected ? "atlas-pin-selected" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setPreview(pin); }}
                >
                  <title>{pin.entity.title}</title>
                  {/* Generous transparent hit target for mobile */}
                  <circle r={5} fill="transparent" />
                  {isSelected && (
                    <>
                      <circle r={baseSize * 1.9} fill="oklch(0.88 0.16 82 / 0.35)">
                        <animate attributeName="r"
                          values={`${baseSize * 1.5};${baseSize * 2.2};${baseSize * 1.5}`}
                          dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity"
                          values="0.55;0.15;0.55" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                      <circle r={baseSize * 1.35} fill="none"
                        stroke="oklch(0.88 0.16 82)" strokeWidth={0.35} opacity={0.9} />
                    </>
                  )}
                  <MarkerGlyph kind={pin.kind} size={baseSize} />
                  {showLabel && (
                    <text
                      x={0}
                      y={baseSize * 1.95}
                      textAnchor="middle"
                      fontSize={isSelected ? 1.95 : 1.7}
                      fontWeight="800"
                      stroke="oklch(0.97 0.03 80 / 0.95)"
                      strokeWidth={0.55}
                      paintOrder="stroke"
                      fill="oklch(0.18 0.06 40)"
                      style={{ fontFamily: "var(--font-display)", direction: "rtl", pointerEvents: "none" }}
                    >
                      {pin.entity.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Controls */}
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute left-2 top-2 flex flex-col gap-1.5">
            <CtrlBtn label="تكبير" onClick={() => zoomAt(scale * 1.4)}><Plus className="size-4" /></CtrlBtn>
            <CtrlBtn label="تصغير" onClick={() => zoomAt(scale / 1.4)}><Minus className="size-4" /></CtrlBtn>
            <CtrlBtn label="إعادة" onClick={reset}><RotateCcw className="size-4" /></CtrlBtn>
            <CtrlBtn label={fullscreen ? "خروج" : "ملء الشاشة"} onClick={() => setFullscreen((v) => !v)}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </CtrlBtn>
          </div>

          {/* Tier indicator */}
          <div className="pointer-events-none absolute top-2 right-1/2 translate-x-1/2 rounded-full border border-amber-900/30 bg-amber-50/90 px-3 py-1 text-[10px] font-bold text-amber-950 shadow-sm whitespace-nowrap" dir="rtl">
            <span className="text-amber-700">⚜︎</span> طبقة {tier.n} · {tier.label} <span className="opacity-60">×{scale.toFixed(1)}</span>
          </div>

          {/* Zoom hint when only states are visible */}
          {scale < 2.5 && !showOnboard && (
            <div className="pointer-events-none absolute bottom-2 right-2 max-w-[65%] rounded-2xl border border-amber-900/30 bg-amber-50/90 px-3 py-1.5 text-[10px] text-amber-950 shadow-sm" dir="rtl">
              كبّر الخريطة لتظهر المدن والمعارك والمعالم.
            </div>
          )}

          {eraFilter && (
            <div className="pointer-events-none absolute bottom-2 left-14 rounded-full border border-gold/40 bg-amber-50/80 px-2.5 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm" dir="rtl">
              عصر · {eraFilter}
            </div>
          )}
        </div>

        {preview && <DiscoveryCard pin={preview} onClose={() => setPreview(null)} />}

        {showOnboard && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" dir="rtl">
            <div className="max-w-sm rounded-3xl border border-gold/40 bg-surface p-5 text-center shadow-elegant">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
                <Compass className="size-6" />
              </div>
              <p className="font-display mt-3 text-base font-bold text-gold">رحلتك في أطلس الحضارة</p>
              <p className="mt-2 text-[12px] leading-6 text-foreground/85">
                كبّر الخريطة لاكتشاف المدن والمعارك والمعالم.<br />
                كلما تعمّقت في التاريخ ظهرت لك اكتشافات جديدة.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-foreground/85">
                <div className="rounded-xl border border-white/10 bg-surface-2 py-2">🏛 الدول والأقاليم</div>
                <div className="rounded-xl border border-white/10 bg-surface-2 py-2">🏙 العواصم والمدن</div>
                <div className="rounded-xl border border-white/10 bg-surface-2 py-2">⚔ المعارك والأحداث</div>
                <div className="rounded-xl border border-white/10 bg-surface-2 py-2">🕌 المعالم النادرة</div>
              </div>
              <button onClick={dismissOnboard}
                className="mt-4 w-full rounded-2xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold">
                ابدأ الاستكشاف
              </button>
            </div>
          </div>
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
      className="grid size-10 place-items-center rounded-full border border-amber-900/40 bg-amber-50/85 text-amber-950 shadow-sm hover:bg-amber-50 active:scale-95 transition"
    >
      {children}
    </button>
  );
}

function DiscoveryCard({ pin, onClose }: { pin: AtlasPin; onClose: () => void }) {
  const e = pin.entity;
  const tone = KIND_COLOR[pin.kind];
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 animate-reveal" dir="rtl">
      <div className="overflow-hidden rounded-2xl border border-gold/35 bg-surface/95 shadow-elegant backdrop-blur">
        <div
          className="relative h-24 w-full"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${tone.ring}, transparent 70%), linear-gradient(135deg, ${tone.fill}, oklch(0.2 0.05 40))`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow">
            {e.image?.glyph ?? KIND_EMOJI[pin.kind]}
          </div>
          <button onClick={onClose} aria-label="إغلاق"
            className="absolute left-2 top-2 grid size-7 place-items-center rounded-full border border-white/20 bg-black/40 text-white">
            <X className="size-3.5" />
          </button>
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-amber-50 backdrop-blur">
            {KIND_EMOJI[pin.kind]} {TYPE_LABEL_AR[e.type] ?? e.type}
          </span>
        </div>
        <div className="p-3">
          <p className="font-display text-base font-bold leading-tight">{e.title}</p>
          {e.period?.label && (
            <p className="mt-1 text-[11px] text-gold/90">{e.period.label}</p>
          )}
          <p className="mt-1.5 text-[12px] leading-6 text-foreground/85 line-clamp-2">{e.description}</p>
          <a href={entityHref(e)}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-gold py-2 text-[12px] font-bold text-primary-foreground shadow-gold">
            <ExternalLink className="size-3.5" /> افتح في الموسوعة
          </a>
        </div>
      </div>
    </div>
  );
}
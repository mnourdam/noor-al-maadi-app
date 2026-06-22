// Phase 3 — Cinematic Atlas Stage (stability-hardened, P0-A).
// Single full-screen SVG with rAF-coalesced pan, capped inertia, ResizeObserver-cached
// viewport, tier-gated layers, and memoized markers. No SVG filters, no SMIL,
// no backdrop-blur over animated layers.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Calendar, Crown, Gem, Landmark, Swords, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AtlasBaseDefs, AtlasBaseLayers } from "./HistoricalAtlasBase";
import { AtlasEntityPinsLayer } from "./AtlasEntityPins";
import { useAtlasRasterUrl } from "@/lib/atlas/atlas-source";
import type { AtlasEntityRow } from "@/lib/atlas-entities";
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
const MAX_SCALE = 50;           // deep inspection of the frozen v1 raster
const MAX_VELOCITY = 1.0;       // px/ms — caps post-flick travel (mouse only)
const MAX_INERTIA_FRAMES = 28;  // ~460ms ceiling (mouse only)
const TOUCH_PAN_GAIN = 0.22;    // touch drag sensitivity (Google-Maps feel)
const TOUCH_INERTIA = false;    // disable post-flick coast on touch
const VB_W = 100;
const VB_H = 60;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

function clampScalar(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function AtlasStage({
  layers,
  selectedId,
  onSelect,
  onTierChange,
  focusOn,
  onAtlasEntitySelect,
}: {
  layers: AtlasLayers;
  selectedId: string | null;
  onSelect: (m: HubMarker | null) => void;
  onTierChange?: (t: Tier) => void;
  /** When this object identity changes, smoothly center the view on these atlas coords. */
  focusOn?: { x: number; y: number } | null;
  /** Phase 1 — additive atlas_entities marker layer. */
  onAtlasEntitySelect?: (entity: AtlasEntityRow) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [rasterLoaded, setRasterLoaded] = useState(false);
  const tier = tierForScale(view.scale);
  // Mirror of `view` for use inside long-lived listeners/effects without
  // re-binding them on every state change.
  const viewRef = useRef<View>(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Cached wrap size — ResizeObserver, NOT a layout read per render.
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const wrapSizeRef = useRef(wrapSize);
  useEffect(() => { wrapSizeRef.current = wrapSize; }, [wrapSize]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { onTierChange?.(tier); }, [tier, onTierChange]);

  const clamp = useCallback((v: View): View => {
    const s = clampScalar(v.scale, MIN_SCALE, MAX_SCALE);
    const maxX = ((s - 1) * wrapSize.w) / 2;
    const maxY = ((s - 1) * wrapSize.h) / 2;
    return {
      scale: s,
      tx: clampScalar(v.tx, -maxX, maxX),
      ty: clampScalar(v.ty, -maxY, maxY),
    };
  }, [wrapSize]);

  // ── Interaction refs ────────────────────────────────────────────────────
  const interaction = useRef<"idle" | "drag" | "inertia" | "pinch" | "tween">("idle");
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastMove = useRef({ x: 0, y: 0, t: 0, vx: 0, vy: 0 });
  const inertiaRaf = useRef<number | null>(null);
  const pinch = useRef<
    { dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null
  >(null);

  // rAF-coalesce pan updates: store target in ref, flush at most once per frame.
  const pendingView = useRef<View | null>(null);
  const flushRaf = useRef<number | null>(null);
  const scheduleView = useCallback((next: View) => {
    pendingView.current = clamp(next);
    if (flushRaf.current != null) return;
    flushRaf.current = requestAnimationFrame(() => {
      flushRaf.current = null;
      const v = pendingView.current;
      pendingView.current = null;
      if (v) setView(v);
    });
  }, [clamp]);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current != null) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = null;
    }
    if (interaction.current === "inertia") interaction.current = "idle";
  }, []);

  // ── Pointer drag with velocity tracking ─────────────────────────────────
  const dragKind = useRef<"mouse" | "touch" | "pen">("mouse");
  const onPointerDown = (e: React.PointerEvent) => {
    // Two-finger pinch is handled by the touch listener below; ignore extra pointers.
    if (e.pointerType === "touch" && pinch.current) return;
    stopInertia();
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    interaction.current = "drag";
    dragKind.current = (e.pointerType as "mouse" | "touch" | "pen") || "mouse";
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    lastMove.current = { x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (e.pointerType === "touch" && pinch.current) {
      // A second finger landed — abandon drag, let pinch take over.
      drag.current = null;
      return;
    }
    const gain = e.pointerType === "touch" ? TOUCH_PAN_GAIN : 1;
    const dx = (e.clientX - drag.current.x) * gain;
    const dy = (e.clientY - drag.current.y) * gain;
    const now = performance.now();
    const dt = Math.max(8, now - lastMove.current.t);
    lastMove.current = {
      x: e.clientX, y: e.clientY, t: now,
      vx: 0.6 * lastMove.current.vx + 0.4 * (((e.clientX - lastMove.current.x) * gain) / dt),
      vy: 0.6 * lastMove.current.vy + 0.4 * (((e.clientY - lastMove.current.y) * gain) / dt),
    };
    scheduleView({ scale: view.scale, tx: drag.current.tx + dx, ty: drag.current.ty + dy });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    // No inertia on touch — small finger movement = small map movement, no slide.
    if (dragKind.current === "touch" || !TOUCH_INERTIA && dragKind.current !== "mouse") {
      interaction.current = "idle";
      return;
    }
    let vx = clampScalar(lastMove.current.vx, -MAX_VELOCITY, MAX_VELOCITY);
    let vy = clampScalar(lastMove.current.vy, -MAX_VELOCITY, MAX_VELOCITY);
    const speed = Math.hypot(vx, vy);
    if (speed < 0.1) { interaction.current = "idle"; return; }
    interaction.current = "inertia";
    const decay = 0.9;
    let frames = 0;
    const step = () => {
      vx *= decay; vy *= decay;
      frames++;
      if (frames >= MAX_INERTIA_FRAMES || Math.hypot(vx, vy) < 0.05) {
        inertiaRaf.current = null;
        interaction.current = "idle";
        return;
      }
      setView((v) => clamp({ ...v, tx: v.tx + vx * 16, ty: v.ty + vy * 16 }));
      inertiaRaf.current = requestAnimationFrame(step);
    };
    inertiaRaf.current = requestAnimationFrame(step);
  };

  // ── Wheel zoom focused on cursor ────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopInertia();
      const step = Math.min(0.18, Math.abs(e.deltaY) * 0.0015);
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      setView((v) => {
        const s = clampScalar(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const k = s / v.scale;
        return clamp({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp, stopInertia]);

  // ── Pinch zoom (midpoint-anchored) + two-finger pan ─────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      stopInertia();
      const rect = el.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
      const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.current = {
        dist,
        scale: viewRef.current.scale,
        midX,
        midY,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
      interaction.current = "pinch";
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2 || !pinch.current) return;
      const rect = el.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
      const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      const raw = dist / Math.max(1, pinch.current.dist);
      const damped = 1 + (raw - 1) * 0.85;
      const s = clampScalar(pinch.current.scale * damped, MIN_SCALE, MAX_SCALE);
      const k = s / pinch.current.scale;
      // Anchor zoom around the original midpoint, then translate by the midpoint delta.
      const tx = pinch.current.midX - (pinch.current.midX - pinch.current.tx) * k
        + (midX - pinch.current.midX);
      const ty = pinch.current.midY - (pinch.current.midY - pinch.current.ty) * k
        + (midY - pinch.current.midY);
      scheduleView({ scale: s, tx, ty });
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch.current = null;
        if (interaction.current === "pinch") interaction.current = "idle";
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scheduleView, stopInertia]);

  // ── Cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopInertia();
    if (flushRaf.current != null) cancelAnimationFrame(flushRaf.current);
  }, [stopInertia]);

  // ── External focus (panel → "show on map") ──────────────────────────────
  // Reads `view.scale` and `wrapSize` from refs so the effect's dep set is
  // honest (only `focusOn`), and re-running it on the SAME hub still works
  // because AtlasShell always passes a fresh object identity.
  useEffect(() => {
    if (!focusOn) return;
    stopInertia();
    interaction.current = "tween";
    const currentScale = viewRef.current.scale;
    const wrap = wrapSizeRef.current;
    // Center atlas coord (x,y) in viewBox 100x60 → CSS-space tx/ty for our transform.
    const targetScale = Math.max(currentScale, 3.5);
    const k = wrap.w / VB_W; // approx units→px (preserveAspectRatio=meet, but x dominates)
    const cssX = (focusOn.x - VB_W / 2) * k * targetScale;
    const cssY = (focusOn.y - VB_H / 2) * k * targetScale;
    setView(clamp({ scale: targetScale, tx: -cssX, ty: -cssY }));
    const t = window.setTimeout(() => {
      if (interaction.current === "tween") interaction.current = "idle";
    }, 280);
    return () => window.clearTimeout(t);
  }, [focusOn, clamp, stopInertia]);

  // ── Tier-4 viewport culling (memoized, no per-render layout read) ───────
  const bbox = useMemo(() => {
    const baseUnitsPerPxX = VB_W / wrapSize.w;
    const baseUnitsPerPxY = VB_H / wrapSize.h;
    const u = Math.max(baseUnitsPerPxX, baseUnitsPerPxY) / view.scale;
    const cx = VB_W / 2 - view.tx * u;
    const cy = VB_H / 2 - view.ty * u;
    const halfW = (wrapSize.w / 2) * u;
    const halfH = (wrapSize.h / 2) * u;
    return { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
  }, [view, wrapSize]);

  const visibleEntities = useMemo(() => {
    if (tier < 4) return [];
    const pad = 2;
    return layers.entities.filter(
      (e) =>
        e.coords.x >= bbox.minX - pad && e.coords.x <= bbox.maxX + pad &&
        e.coords.y >= bbox.minY - pad && e.coords.y <= bbox.maxY + pad,
    );
  }, [tier, layers.entities, bbox]);

  const inv = 1 / view.scale;

  // Transition: only during idle (tween/zoom-button click). Suppressed during drag/inertia/pinch.
  const useTransition =
    interaction.current === "idle" || interaction.current === "tween";

  return (
    <div
      ref={wrapRef}
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
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        <defs>
          <AtlasBaseDefs />
        </defs>

        <g style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "center",
          transition: useTransition ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          willChange: "transform",
        }}>
          {/* Phase 1 — frozen Atlas v1 raster as primary base (canonical APS surface). */}
          <image
            href={useAtlasRasterUrl()}
            x={0}
            y={0}
            width={VB_W}
            height={VB_H}
            preserveAspectRatio="none"
            onLoad={() => setRasterLoaded(true)}
            style={{ imageRendering: "auto" }}
          />
          {!rasterLoaded && (
            <AtlasBaseLayers
              inv={inv}
              showRegionLabels={tier <= 2}
              showSeaLabels={tier <= 3}
              showCities={tier >= 2}
              showMountains={tier >= 2}
            />
          )}

          {tier >= 2 && (
            <g className="layer-cities">
              {layers.cities.map((c) => (
                <HubGlyph key={c.id} m={c} inv={inv}
                  active={selectedId === c.id} showLabel onSelect={onSelect} size={1.0} />
              ))}
            </g>
          )}

          {tier >= 3 && (
            <g className="layer-landmarks">
              {layers.landmarks.map((c) => (
                <HubGlyph key={c.id} m={c} inv={inv}
                  active={selectedId === c.id} showLabel onSelect={onSelect} size={0.75} />
              ))}
            </g>
          )}

          {tier >= 4 && (
            <g className="layer-entities">
              {visibleEntities.map((e) => (
                <EntityGlyph key={e.id} m={e} inv={inv}
                  active={selectedId === e.id} onSelect={onSelect} />
              ))}
            </g>
          )}

          {/* Phase 1 — atlas_entities pin layer (always visible, no tier gate) */}
          {onAtlasEntitySelect && (
            <AtlasEntityPinsLayer inv={inv} onSelect={onAtlasEntitySelect} />
          )}
        </g>
      </svg>

      {/* Tier readout */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-amber-900/30 bg-amber-50/85 px-3 py-1.5 text-[11px] font-bold text-amber-950 shadow-sm" dir="rtl">
        <span className="opacity-70">المستوى</span>
        <span>{TIER_LABEL[tier]}</span>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
        <ZoomBtn label="+" onClick={() => { stopInertia(); setView((v) => clamp({ ...v, scale: v.scale * 1.25 })); }} />
        <ZoomBtn label="−" onClick={() => { stopInertia(); setView((v) => clamp({ ...v, scale: v.scale / 1.25 })); }} />
        <ZoomBtn label="⟲" onClick={() => { stopInertia(); setView(IDENTITY); }} />
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

// ── Memoized marker components ─────────────────────────────────────────────
const HubGlyph = memo(function HubGlyph({
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
      className={`cursor-pointer ${active ? "atlas-marker-active" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onSelect(m); }}
    >
      {active && <circle r={(size + 1.5) * inv} fill="url(#atlas-glow)" />}
      {m.entity_type === "landmark" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill}
          stroke="oklch(0.95 0.04 80)" strokeWidth={0.12 * inv} />
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
});

const EntityGlyph = memo(function EntityGlyph({
  m, inv, active, onSelect,
}: {
  m: HubMarker; inv: number; active: boolean; onSelect: (m: HubMarker) => void;
}) {
  const Icon = TYPE_ICON[m.entity_type];
  const fill = TYPE_FILL[m.entity_type];
  const r = 0.55 * inv;
  return (
    <g
      transform={`translate(${m.coords.x} ${m.coords.y})`}
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onSelect(m); }}
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
      >{m.title}</text>
      <Icon x={-0.6 * inv} y={-0.6 * inv} width={1.2 * inv} height={1.2 * inv}
        stroke="oklch(0.18 0.06 40)" strokeWidth={0.15 * inv} />
    </g>
  );
});

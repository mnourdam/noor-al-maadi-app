// Phase 2 stabilization — Atlas Stage.
// • ONLY the approved Atlas v1 raster ever renders (no legacy fallback flash).
//   Loading state is a parchment skeleton above an opaque slate backdrop.
// • Pan is live from first paint at scale=1 — bounds are computed from the
//   raster's intrinsic aspect ratio so the user always has some pan room.
// • Pinch zoom keeps the world point under the finger midpoint stable
//   (Google-Maps-style). Clamp is RELAXED during the active pinch and
//   reapplied on release to prevent horizontal drift snapping.
import { useCallback, useEffect, useRef, useState } from "react";
import { AtlasEntityPinsLayer } from "./AtlasEntityPins";
import { ATLAS_BASE_URL } from "@/lib/atlas/atlas-source";
import { ATLAS_VIEWBOX, ATLAS_ASPECT } from "@/lib/atlas/aps";
import type { AtlasEntityRow } from "@/lib/atlas-entities";

const MIN_SCALE = 1;
const MAX_SCALE = 50;
// Phase 3 — viewBox is the raster's native pixel grid (APS). No distortion
// between image and pins; both share one coordinate system.
const VB_W = ATLAS_VIEWBOX.width;
const VB_H = ATLAS_VIEWBOX.height;
const RASTER_ASPECT = ATLAS_ASPECT;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

const clampScalar = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function AtlasStage({
  entities,
  selectedId,
  onSelect,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  onSelect: (entity: AtlasEntityRow | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [rasterLoaded, setRasterLoaded] = useState(false);
  const viewRef = useRef<View>(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const [wrapSize, setWrapSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const wrapSizeRef = useRef(wrapSize);
  useEffect(() => { wrapSizeRef.current = wrapSize; }, [wrapSize]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () =>
      setWrapSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan-bound computation that accounts for the raster's intrinsic aspect
  // (xMidYMid slice). At scale 1 the SVG still fills the viewport but the
  // raster may overflow on one axis — we allow panning into that overflow,
  // so drag works immediately without requiring zoom-in first.
  const clamp = useCallback((v: View, opts?: { relax?: boolean }): View => {
    const s = clampScalar(v.scale, MIN_SCALE, MAX_SCALE);
    const w = wrapSizeRef.current.w;
    const h = wrapSizeRef.current.h;

    // Visible raster CSS extent at scale 1, given xMidYMid slice.
    const viewportAspect = w / h;
    let baseW: number, baseH: number;
    if (viewportAspect > RASTER_ASPECT) {
      // Raster filled to viewport width; overflows vertically.
      baseW = w;
      baseH = w / RASTER_ASPECT;
    } else {
      baseH = h;
      baseW = h * RASTER_ASPECT;
    }

    const scaledW = baseW * s;
    const scaledH = baseH * s;
    // Allowed translate = how far the scaled raster can slide before the
    // viewport edge passes the raster edge.
    let maxX = Math.max(0, (scaledW - w) / 2);
    let maxY = Math.max(0, (scaledH - h) / 2);

    // During active gestures we relax the clamp by ~12% so the world point
    // under the finger never snaps sideways. Reapplied tight on release.
    if (opts?.relax) {
      maxX += w * 0.12;
      maxY += h * 0.12;
    }

    return {
      scale: s,
      tx: clampScalar(v.tx, -maxX, maxX),
      ty: clampScalar(v.ty, -maxY, maxY),
    };
  }, []);

  // rAF-coalesced view flush.
  const pendingView = useRef<View | null>(null);
  const flushRaf = useRef<number | null>(null);

  const cancelAnimations = useCallback(() => {
    if (flushRaf.current != null) {
      cancelAnimationFrame(flushRaf.current);
      flushRaf.current = null;
    }
    pendingView.current = null;
  }, []);

  const scheduleView = useCallback((next: View, opts?: { relax?: boolean }) => {
    pendingView.current = clamp(next, opts);
    if (flushRaf.current != null) return;
    flushRaf.current = requestAnimationFrame(() => {
      flushRaf.current = null;
      const v = pendingView.current;
      pendingView.current = null;
      if (v) setView(v);
    });
  }, [clamp]);

  // ── Pointer drag (active from first paint, including scale=1) ─────────
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<
    { dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null
  >(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && pinch.current) return;
    cancelAnimations();
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    const v = viewRef.current;
    drag.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (e.pointerType === "touch" && pinch.current) {
      drag.current = null;
      return;
    }
    // Pan gain — tuned to feel like Google/Apple Maps: slightly
    // accelerated past 1:1 so finger drag covers ground naturally,
    // while staying well below the old overly-sensitive free-drag.
    const PAN_GAIN = 1.35;
    const dx = (e.clientX - drag.current.x) * PAN_GAIN;
    const dy = (e.clientY - drag.current.y) * PAN_GAIN;
    scheduleView({
      scale: viewRef.current.scale,
      tx: drag.current.tx + dx,
      ty: drag.current.ty + dy,
    });
  };
  const onPointerUp = () => {
    drag.current = null;
    // Re-clamp tightly on release.
    setView((v) => clamp(v));
  };

  // ── Wheel zoom (cursor-anchored) ──────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimations();
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
  }, [clamp, cancelAnimations]);

  // ── Pinch zoom + two-finger pan (Google-Maps-style anchor) ───────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      cancelAnimations();
      const rect = el.getBoundingClientRect();
      const a = e.touches[0], b = e.touches[1];
      const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
      const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.current = {
        dist: Math.max(1, dist),
        scale: viewRef.current.scale,
        midX, midY,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
      drag.current = null;
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2 || !pinch.current) return;
      const rect = el.getBoundingClientRect();
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
      const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      const ratio = dist / pinch.current.dist;
      const s = clampScalar(pinch.current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const k = s / pinch.current.scale;
      // Anchor the world point under the initial finger centroid under the
      // current centroid. Tight clamp every frame — no drift on release.
      const tx = midX - (pinch.current.midX - pinch.current.tx) * k;
      const ty = midY - (pinch.current.midY - pinch.current.ty) * k;
      scheduleView({ scale: s, tx, ty });
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch.current = null;
        // Settle tight clamp.
        setView((v) => clamp(v));
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
  }, [scheduleView, cancelAnimations, clamp]);

  useEffect(() => () => cancelAnimations(), [cancelAnimations]);

  const inv = 1 / view.scale;
  const isInteracting = drag.current != null || pinch.current != null;
  const useTransition = !isInteracting;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none", background: "oklch(0.13 0.04 255)" }}
      dir="ltr"
    >
      {/* Parchment loading skeleton — sits BELOW the raster, never the
          legacy procedural atlas. Fades out the moment the raster loads. */}
      {!rasterLoaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, oklch(0.30 0.04 80 / 0.35), transparent 70%), linear-gradient(180deg, oklch(0.16 0.04 252), oklch(0.13 0.04 255))",
          }}
        />
      )}

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        <g style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "center",
          transition: useTransition ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          willChange: "transform",
        }}>
          {/* Image at native APS size; no aspect distortion. The outer
              <svg preserveAspectRatio="xMidYMid slice"> letterboxes the
              whole frame uniformly. Pins live in the same coord space. */}
          <image
            href={ATLAS_BASE_URL}
            x={0}
            y={0}
            width={VB_W}
            height={VB_H}
            preserveAspectRatio="xMidYMid slice"
            onLoad={() => setRasterLoaded(true)}
            style={{ imageRendering: "auto", opacity: rasterLoaded ? 1 : 0, transition: "opacity 200ms ease-out" }}
          />

          <AtlasEntityPinsLayer
            entities={entities}
            selectedId={selectedId}
            inv={inv}
            scale={view.scale}
            onSelect={onSelect}
          />
        </g>
      </svg>

      {/* Zoom controls — lifted above the iOS home-bar / nav-bar. */}
      <div
        className="absolute right-4 flex flex-col gap-1.5"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <ZoomBtn label="+" onClick={() => { cancelAnimations(); setView((v) => clamp({ ...v, scale: v.scale * 1.25 })); }} />
        <ZoomBtn label="−" onClick={() => { cancelAnimations(); setView((v) => clamp({ ...v, scale: v.scale / 1.25 })); }} />
        <ZoomBtn label="⟲" onClick={() => { cancelAnimations(); setView(IDENTITY); }} />
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-amber-400/40 bg-slate-950/80 text-amber-100 shadow-md hover:bg-slate-900"
      aria-label={`zoom ${label}`}
    >
      <span className="text-base font-bold leading-none">{label}</span>
    </button>
  );
}

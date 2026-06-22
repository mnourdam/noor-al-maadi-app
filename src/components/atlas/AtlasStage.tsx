// Phase 2 — Atlas Stage.
// Frozen Atlas v1 raster + the unified `atlas_entities` marker layer. No legacy hubs.
//
// UX fixes (Phase 2 / section B):
//   • Pan is bound from first paint — drag works immediately with no warm-up zoom.
//   • Touch sensitivity capped at 0.32 (Google-Maps-ish feel).
//   • Hard edge clamp tied to the raster bounds: empty space outside the
//     atlas is never visible at any zoom.
//   • Locate-on-map cancels in-flight animation frames, guards against NaN,
//     and never blocks the render loop.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtlasBaseDefs, AtlasBaseLayers } from "./HistoricalAtlasBase";
import { AtlasEntityPinsLayer } from "./AtlasEntityPins";
import { ATLAS_BASE_URL } from "@/lib/atlas/atlas-source";
import type { AtlasEntityRow } from "@/lib/atlas-entities";

const MIN_SCALE = 1;
const MAX_SCALE = 50;
const TOUCH_PAN_GAIN = 0.32;
const VB_W = 100;
const VB_H = 60;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

const clampScalar = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function AtlasStage({
  entities,
  selectedId,
  onSelect,
  focusOn,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  onSelect: (entity: AtlasEntityRow | null) => void;
  /** New object identity → smooth-pan the view onto these viewBox coords. */
  focusOn?: { x: number; y: number } | null;
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

  // Hard edge clamp. transform-origin: center → at scale s, the raster
  // half-extent is (wrap*s)/2 and the visible half-extent is wrap/2.
  // The largest legal translate is therefore ((s-1)*wrap)/2 on each axis.
  // When s = 1 this collapses to 0 — no out-of-bounds movement is possible.
  const clamp = useCallback((v: View): View => {
    const s = clampScalar(v.scale, MIN_SCALE, MAX_SCALE);
    const w = wrapSizeRef.current.w;
    const h = wrapSizeRef.current.h;
    const maxX = Math.max(0, ((s - 1) * w) / 2);
    const maxY = Math.max(0, ((s - 1) * h) / 2);
    return {
      scale: s,
      tx: clampScalar(v.tx, -maxX, maxX),
      ty: clampScalar(v.ty, -maxY, maxY),
    };
  }, []);

  // rAF-coalesced pan flush.
  const pendingView = useRef<View | null>(null);
  const flushRaf = useRef<number | null>(null);
  const tweenRaf = useRef<number | null>(null);

  const cancelAnimations = useCallback(() => {
    if (flushRaf.current != null) {
      cancelAnimationFrame(flushRaf.current);
      flushRaf.current = null;
    }
    if (tweenRaf.current != null) {
      cancelAnimationFrame(tweenRaf.current);
      tweenRaf.current = null;
    }
    pendingView.current = null;
  }, []);

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

  // ── Pointer drag (active from first paint) ─────────────────────────────
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
    const gain = e.pointerType === "touch" ? TOUCH_PAN_GAIN : 1;
    const dx = (e.clientX - drag.current.x) * gain;
    const dy = (e.clientY - drag.current.y) * gain;
    scheduleView({
      scale: viewRef.current.scale,
      tx: drag.current.tx + dx,
      ty: drag.current.ty + dy,
    });
  };
  const onPointerUp = () => { drag.current = null; };

  // ── Wheel zoom ──────────────────────────────────────────────────────────
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

  // ── Pinch zoom + two-finger pan ────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      cancelAnimations();
      const rect = el.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
      const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.current = {
        dist,
        scale: viewRef.current.scale,
        midX, midY,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
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
      const tx = pinch.current.midX - (pinch.current.midX - pinch.current.tx) * k
        + (midX - pinch.current.midX);
      const ty = pinch.current.midY - (pinch.current.midY - pinch.current.ty) * k
        + (midY - pinch.current.midY);
      scheduleView({ scale: s, tx, ty });
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
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
  }, [scheduleView, cancelAnimations]);

  useEffect(() => () => cancelAnimations(), [cancelAnimations]);

  // ── External focus (panel → "locate on map") ───────────────────────────
  // Hardened: guards NaN, cancels in-flight animation, never blocks render.
  useEffect(() => {
    if (!focusOn) return;
    if (!Number.isFinite(focusOn.x) || !Number.isFinite(focusOn.y)) return;
    cancelAnimations();
    const wrap = wrapSizeRef.current;
    if (wrap.w <= 1 || wrap.h <= 1) return;
    const targetScale = Math.max(viewRef.current.scale, 4);
    const k = wrap.w / VB_W;
    const cssX = (focusOn.x - VB_W / 2) * k * targetScale;
    const cssY = (focusOn.y - VB_H / 2) * k * targetScale;
    const target = clamp({ scale: targetScale, tx: -cssX, ty: -cssY });
    // Single-frame settle — CSS transition handles the visual tween.
    tweenRaf.current = requestAnimationFrame(() => {
      tweenRaf.current = null;
      setView(target);
    });
  }, [focusOn, clamp, cancelAnimations]);

  const inv = 1 / view.scale;

  // CSS transition only when the user is not actively dragging/pinching.
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
      <svg
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
          <image
            href={ATLAS_BASE_URL}
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
              showRegionLabels
              showSeaLabels
              showCities={false}
              showMountains={false}
            />
          )}

          <AtlasEntityPinsLayer
            entities={entities}
            selectedId={selectedId}
            inv={inv}
            onSelect={onSelect}
          />
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
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

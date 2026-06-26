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
import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";

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
  androidMark("render:AtlasStage");
  const androidStable = isAndroidUltraStableMode();
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

  // Clamp in SVG USER UNITS (= viewBox units), since the <g> transform's
  // translate(${tx}px, ${ty}px) is interpreted by the SVG/CSS engine in user
  // units, not CSS pixels. Previously this was computed in CSS px, which
  // shrank the effective pan range to ~10% of intent (you could only reach
  // Levant ↔ Khorasan instead of the full raster).
  //
  // unitsPerPx = CSS px each viewBox unit occupies on screen (preserveAspect
  // "slice" => max of width/height ratios).
  // Visible viewBox window at scale=1 = (w / unitsPerPx) × (h / unitsPerPx).
  // At zoom s the window shrinks to (visibleW/s) × (visibleH/s).
  // Max translate (user units) so window stays inside the raster:
  //   maxTx = (s * VB_W - visibleW) / 2, clamped to ≥ 0.
  const unitsPerPxFor = useCallback((w: number, h: number) => {
    return Math.max(w / VB_W, h / VB_H);
  }, []);

  const clamp = useCallback((v: View, opts?: { relax?: boolean }): View => {
    const s = clampScalar(v.scale, MIN_SCALE, MAX_SCALE);
    const w = wrapSizeRef.current.w;
    const h = wrapSizeRef.current.h;
    const unitsPerPx = unitsPerPxFor(w, h);
    const visibleVbW = w / unitsPerPx;
    const visibleVbH = h / unitsPerPx;

    let maxX = Math.max(0, (s * VB_W - visibleVbW) / 2);
    let maxY = Math.max(0, (s * VB_H - visibleVbH) / 2);

    // Relax slightly during active gestures so the world point under the
    // finger never snaps; tight clamp reapplied on release.
    if (opts?.relax) {
      maxX += VB_W * 0.04;
      maxY += VB_H * 0.04;
    }

    return {
      scale: s,
      tx: clampScalar(v.tx, -maxX, maxX),
      ty: clampScalar(v.ty, -maxY, maxY),
    };
  }, [unitsPerPxFor]);

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
    // Pan in user units: 1 CSS px of finger movement ⇒ 1 CSS px of map
    // movement on screen ⇒ (1 / unitsPerPx) user units of translate.
    // PAN_GAIN keeps a slight Google/Apple-Maps-style acceleration.
    const w = wrapSizeRef.current.w;
    const h = wrapSizeRef.current.h;
    const unitsPerPx = unitsPerPxFor(w, h);
    const PAN_GAIN = 1.15;
    const dx = ((e.clientX - drag.current.x) * PAN_GAIN) / unitsPerPx;
    const dy = ((e.clientY - drag.current.y) * PAN_GAIN) / unitsPerPx;
    scheduleView({
      scale: viewRef.current.scale,
      tx: drag.current.tx + dx,
      ty: drag.current.ty + dy,
    }, { relax: true });
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
      const unitsPerPx = unitsPerPxFor(rect.width, rect.height);
      // Convert cursor offset from CSS px to user units to match tx/ty space.
      const px = (e.clientX - rect.left - rect.width / 2) / unitsPerPx;
      const py = (e.clientY - rect.top - rect.height / 2) / unitsPerPx;
      setView((v) => {
        const s = clampScalar(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const k = s / v.scale;
        return clamp({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp, cancelAnimations, unitsPerPxFor]);

  // ── Pinch zoom + two-finger pan (Google-Maps-style anchor) ───────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      cancelAnimations();
      const rect = el.getBoundingClientRect();
      const unitsPerPx = unitsPerPxFor(rect.width, rect.height);
      const a = e.touches[0], b = e.touches[1];
      const midX = ((a.clientX + b.clientX) / 2 - rect.left - rect.width / 2) / unitsPerPx;
      const midY = ((a.clientY + b.clientY) / 2 - rect.top - rect.height / 2) / unitsPerPx;
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
      const unitsPerPx = unitsPerPxFor(rect.width, rect.height);
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = ((a.clientX + b.clientX) / 2 - rect.left - rect.width / 2) / unitsPerPx;
      const midY = ((a.clientY + b.clientY) / 2 - rect.top - rect.height / 2) / unitsPerPx;
      const ratio = dist / pinch.current.dist;
      const s = clampScalar(pinch.current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const k = s / pinch.current.scale;
      const tx = midX - (pinch.current.midX - pinch.current.tx) * k;
      const ty = midY - (pinch.current.midY - pinch.current.ty) * k;
      scheduleView({ scale: s, tx, ty }, { relax: true });
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch.current = null;
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
  }, [scheduleView, cancelAnimations, clamp, unitsPerPxFor]);


  useEffect(() => () => cancelAnimations(), [cancelAnimations]);

  const inv = 1 / view.scale;
  // Quantize zoom into 4 tiers so pins/labels don't re-mount every frame.
  //   0 far    (states only)     scale < 1.6
  //   1 medium (+major cities)   1.6  ≤ scale < 3
  //   2 close  (+battles/events) 3    ≤ scale < 6
  //   3 deep   (everything)      scale ≥ 6
  const labelTier =
    view.scale >= 6 ? 3 : view.scale >= 3 ? 2 : view.scale >= 1.6 ? 1 : 0;
  const isInteracting = drag.current != null || pinch.current != null;
  const useTransition = !androidStable && !isInteracting;

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
            labelTier={labelTier}
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

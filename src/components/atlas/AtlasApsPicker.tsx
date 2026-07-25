// Reusable APS picker dialog — click on the atlas master image to set APS
// coordinates directly. Used by the atlas entity editor to position entities
// precisely on the artwork (canonical source of truth).
import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, MaximizeIcon, ScanSearch, X, Check } from "lucide-react";
import { ATLAS_BASE_URL } from "@/lib/atlas/atlas-source";
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

const RASTER = ATLAS_V1_PIXEL_SIZE;

export function AtlasApsPicker({
  initial,
  label,
  onClose,
  onPick,
}: {
  initial?: { x: number; y: number } | null;
  label?: string;
  onClose: () => void;
  onPick: (aps: { x: number; y: number }) => void;
}) {
  const [aps, setAps] = useState<{ x: number; y: number } | null>(initial ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapSize, setWrapSize] = useState({ w: 1, h: 1 });
  const [scale, setScale] = useState(0.06);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [cursorAps, setCursorAps] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    update();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToScreen = useCallback(() => {
    const sx = wrapSize.w / RASTER.width;
    const sy = wrapSize.h / RASTER.height;
    const s = Math.min(sx, sy) * 0.96;
    setScale(s);
    setTx((wrapSize.w - RASTER.width * s) / 2);
    setTy((wrapSize.h - RASTER.height * s) / 2);
  }, [wrapSize.w, wrapSize.h]);

  const didFit = useRef(false);
  useEffect(() => {
    if (!didFit.current && wrapSize.w > 10 && wrapSize.h > 10) {
      didFit.current = true;
      fitToScreen();
      if (initial) {
        // Center on the initial APS at a comfortable zoom.
        const s = Math.max(0.4, Math.min(1, wrapSize.w / 1800));
        setScale(s);
        setTx(wrapSize.w / 2 - initial.x * s);
        setTy(wrapSize.h / 2 - initial.y * s);
      }
    }
  }, [wrapSize, fitToScreen, initial]);

  const setOneToOne = useCallback(() => {
    const cx = wrapSize.w / 2;
    const cy = wrapSize.h / 2;
    const ax = (cx - tx) / scale;
    const ay = (cy - ty) / scale;
    setScale(1);
    setTx(cx - ax);
    setTy(cy - ay);
  }, [scale, tx, ty, wrapSize.w, wrapSize.h]);

  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.role !== "stage") return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const ax = (e.clientX - rect.left - tx) / scale;
      const ay = (e.clientY - rect.top - ty) / scale;
      if (ax >= 0 && ax < RASTER.width && ay >= 0 && ay < RASTER.height) {
        setCursorAps({ x: ax, y: ay });
      } else {
        setCursorAps(null);
      }
    }
    if (!pan.current) return;
    const dx = e.clientX - pan.current.x;
    const dy = e.clientY - pan.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
    setTx(pan.current.tx + dx);
    setTy(pan.current.ty + dy);
  };
  const onUp = (e: React.PointerEvent) => {
    const wasDrag = pan.current?.moved;
    pan.current = null;
    // Click (no drag) on the stage places the APS pin.
    const target = e.target as HTMLElement;
    if (!wasDrag && target.dataset.role === "stage") {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ax = (e.clientX - rect.left - tx) / scale;
      const ay = (e.clientY - rect.top - ty) / scale;
      if (ax >= 0 && ax < RASTER.width && ay >= 0 && ay < RASTER.height) {
        setAps({ x: Math.round(ax), y: Math.round(ay) });
      }
    }
  };

  // Wheel zoom around cursor
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const step = Math.min(0.25, Math.abs(e.deltaY) * 0.0015);
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
      setScale((prev) => {
        const next = Math.max(0.01, Math.min(8, prev * factor));
        const k = next / prev;
        setTx((tx0) => sx - (sx - tx0) * k);
        setTy((ty0) => sy - (sy - ty0) * k);
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const confirm = () => {
    if (!aps) return;
    onPick({ x: Math.round(aps.x), y: Math.round(aps.y) });
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[60] flex flex-col bg-stone-950 text-stone-100"
      onClick={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-stone-800 bg-stone-900 px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-amber-100">
            اختيار APS من الأطلس{label ? ` — ${label}` : ""}
          </h2>
          <span className="text-[11px] text-stone-400">
            انقر على الموقع المراد · اسحب للتحريك · العجلة للتكبير
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            onClick={fitToScreen}
            className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700"
          >
            <MaximizeIcon className="size-3.5" /> ملاءمة
          </button>
          <button
            onClick={setOneToOne}
            className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700"
          >
            <ScanSearch className="size-3.5" /> 1:1
          </button>
          <button
            disabled={!aps}
            onClick={confirm}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Check className="size-3.5" /> تأكيد الموقع
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-stone-800">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden bg-stone-900"
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <div
          data-role="stage"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: RASTER.width,
            height: RASTER.height,
            cursor: "crosshair",
          }}
        >
          <img
            data-role="stage"
            src={ATLAS_BASE_URL}
            width={RASTER.width}
            height={RASTER.height}
            draggable={false}
            alt="Atlas v1 master"
            style={{ display: "block", userSelect: "none" }}
          />
          {aps && (
            <div style={{ position: "absolute", left: aps.x, top: aps.y, pointerEvents: "none" }}>
              <div
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -50%) scale(${1 / scale})`,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "rgba(244,63,94,0.95)",
                    border: "2px solid #fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded bg-stone-950/85 px-2 py-1 font-mono text-[11px] text-amber-200">
          <Crosshair className="size-3.5" />
          {cursorAps ? (
            <>APS {Math.round(cursorAps.x)}, {Math.round(cursorAps.y)} · {(scale * 100).toFixed(0)}%</>
          ) : (
            <>خارج الأطلس · {(scale * 100).toFixed(0)}%</>
          )}
          {aps && (
            <span className="ml-3 text-emerald-300">
              · المختار: {aps.x}, {aps.y}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

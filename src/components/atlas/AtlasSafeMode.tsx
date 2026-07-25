// Atlas safe mode — a renderer-free fallback.
//
// Used when the interactive stage cannot run on this device (no WebGL /
// canvas / ResizeObserver, raster allocation failure, or a previous fatal
// crash on this route). It depends on NOTHING from the map pipeline: no
// AtlasStage, no pan/zoom state, no query hooks. Worst case it renders an
// empty list — it can never take the app down with it.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, RotateCcw } from "lucide-react";

type Row = {
  id: string;
  title?: string | null;
  kind?: string | null;
  era?: string | null;
  encyclopedia_entity_id?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  place: "موقع",
  battle: "معركة",
  event: "حدث",
  region: "إقليم",
  figure_marker: "شخصية",
  artifact_site: "أثر",
  route_point: "مسار",
};

export function AtlasSafeMode({
  reason,
  onRetry,
  onResetData,
}: {
  reason: "device" | "error";
  onRetry?: () => void;
  onResetData?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { ensureLocalSnapshotLoaded, localAtlasEntities } = await import(
          "@/lib/local-first-store"
        );
        await ensureLocalSnapshotLoaded();
        if (!alive) return;
        const list = (localAtlasEntities() as Row[]).filter((r) => r?.id && r?.title);
        setRows(list.slice(0, 400));
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div dir="rtl" className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-gold/15 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-surface px-3 py-1.5 text-[12px] font-bold text-gold"
          >
            <ChevronRight className="size-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground"
              >
                <RotateCcw className="size-3.5" /> إعادة المحاولة
              </button>
            )}
            {onResetData && (
              <button
                type="button"
                onClick={onResetData}
                className="rounded-full border border-gold/20 bg-surface px-3 py-1.5 text-[12px] text-muted-foreground"
              >
                إعادة ضبط بيانات الأطلس
              </button>
            )}
          </div>
        </div>
        <h1 className="mt-3 font-display text-lg font-bold text-foreground">الأطلس — الوضع المبسّط</h1>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
          {reason === "device"
            ? "تعذر تشغيل العرض التفاعلي على هذا الجهاز، ويمكنك متابعة المواقع من القائمة."
            : "تعذر تشغيل الخريطة التفاعلية الآن، ويمكنك متابعة المواقع من القائمة."}
        </p>
      </header>

      <ul className="divide-y divide-gold/10 px-4">
        {rows.map((r) => {
          const label = r.kind ? KIND_LABEL[r.kind] ?? r.kind : null;
          const body = (
            <span className="flex items-center gap-2 py-3">
              <MapPin className="size-4 shrink-0 text-gold/80" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{r.title}</span>
                {(label || r.era) && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[label, r.era].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </span>
          );
          return (
            <li key={r.id}>
              {r.encyclopedia_entity_id ? (
                <Link to="/encyclopedia/entity/$id" params={{ id: r.encyclopedia_entity_id }} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">
            لا توجد مواقع محفوظة على هذا الجهاز بعد.
          </li>
        )}
      </ul>
    </div>
  );
}

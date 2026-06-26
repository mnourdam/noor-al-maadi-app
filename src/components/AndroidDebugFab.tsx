// Floating debug FAB shown only on Android (Capacitor native) builds.
// Tap → opens /debug/input-trace where the user can Copy / Download / Clear
// the input trace JSON. Does not alter the tracer itself.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export function AndroidDebugFab() {
  const [isNative, setIsNative] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    setIsNative(Boolean(w.Capacitor?.isNativePlatform?.()));
  }, []);

  if (!isNative) return null;
  if (pathname.startsWith("/debug/input-trace")) return null;

  return (
    <Link
      to="/debug/input-trace"
      aria-label="Input Trace"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        left: "12px",
        zIndex: 99999,
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/70 bg-slate-950/90 px-3 py-2 text-[11px] font-bold text-amber-200 shadow-lg backdrop-blur-sm active:scale-95"
    >
      <Activity className="h-3.5 w-3.5" />
      Input Trace
    </Link>
  );
}

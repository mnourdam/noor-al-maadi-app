import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBack } from "@/lib/navigation";

/**
 * Thin hardware-Back adapter.
 *
 * This component contains **zero navigation decisions**. It only:
 *
 *   1. Forwards the single Capacitor `App.backButton` event to the
 *      Navigation Engine's `useBack()`.
 *   2. Hosts the exit-confirm AlertDialog and opens it when the engine
 *      dispatches `irth:navigation:exit-confirm` (Priority 5 — root
 *      route).
 *
 * All resolution (overlay dismiss → origin override → parent →
 * fallback → root-exit) happens inside `useBack()`. There is exactly
 * one decision maker and exactly one hardware listener.
 */
export function AndroidBackHandler() {
  const back = useBack();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 1) Single Capacitor listener → engine.
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      .Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;

    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", () => {
          back();
        });
        listenerHandle = handle;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[android:back] failed to register", err);
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [back]);

  // 2) Exit-confirm dialog subscribed to the engine's event.
  useEffect(() => {
    const onExit = () => setConfirmOpen(true);
    window.addEventListener("irth:navigation:exit-confirm", onExit);
    return () => window.removeEventListener("irth:navigation:exit-confirm", onExit);
  }, []);

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir="rtl" className="border-amber-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-100">
            هل تريد الخروج من التطبيق؟
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            ستُحفظ آخر رحلة لك، ويمكنك العودة في أي وقت.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => setConfirmOpen(false)}
            className="border-slate-700"
          >
            لا
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                const { App } = await import("@capacitor/app");
                App.exitApp();
              } catch {
                /* ignore */
              }
            }}
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            نعم
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Download, Megaphone, X } from "lucide-react";
import { ModalPortal } from "@/components/ModalPortal";
import { openExternalUrl } from "@/lib/notifications/action";
import {
  evaluateMandatory,
  evaluateOptional,
  pickGeneric,
  resolveAnnouncementAction,
  isCriticalGeneric,
} from "@/lib/announcements/policy";
import {
  fetchAnnouncements,
  isNativeAndroid,
  isReleaseBuild,
  openPlayStore,
  readInstalledVersion,
  ackAnnouncementServer,
} from "@/lib/announcements/store";
import {
  getLocalAcks,
  isOptionalSnoozed,
  recordLocalAck,
  snoozeOptional,
} from "@/lib/announcements/local-state";
import { MODAL_PRIORITY, canShowModal } from "@/lib/ui/modal-arbiter";
import type { AnnouncementFetch, AnnouncementRow } from "@/lib/announcements/types";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single host for the V16 announcement surfaces:
 *   - mandatory Android update blocker (fail-open, fresh verification only)
 *   - optional Android update prompt (snoozeable)
 *   - generic announcement dialog (segment-targeted server-side)
 *
 * The host never mounts more than ONE modal at a time and defers to the
 * startup arbiter for everything except the mandatory blocker.
 */
export function AnnouncementHost() {
  const navigate = useNavigate();
  const [fetchState, setFetchState] = useState<AnnouncementFetch>({ ok: false, reason: "error" });
  const [installed, setInstalled] = useState<{ code: number | null; valid: boolean }>({
    code: null,
    valid: false,
  });
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [dismissedGeneric, setDismissedGeneric] = useState<string[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [version, res] = await Promise.all([readInstalledVersion(), fetchAnnouncements()]);
      setInstalled({ code: version.versionCode, valid: version.valid });
      setFetchState(res);
    } catch {
      setFetchState({ ok: false, reason: "error" });
    } finally {
      refreshing.current = false;
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => {});
    const t = window.setInterval(() => setTick((n) => n + 1), 4000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const native = isNativeAndroid();
  const release = isReleaseBuild();

  const mandatory = useMemo(
    () =>
      evaluateMandatory({
        isNativeAndroid: native,
        isReleaseBuild: release,
        installedVersionCode: installed.code,
        installedVersionValid: installed.valid,
        fetch: fetchState,
      }),
    [native, release, installed, fetchState],
  );

  const optional = useMemo(
    () =>
      evaluateOptional({
        isNativeAndroid: native,
        installedVersionCode: installed.code,
        installedVersionValid: installed.valid,
        fetch: fetchState,
        // Session-local dismissals are checked FIRST so "لاحقًا" hides the
        // prompt immediately even if the persisted snooze write failed
        // (private mode / storage full). Mandatory blocking never consults
        // this state.
        isSnoozed: (id, code) => snoozedOptional.includes(id) || isOptionalSnoozed(id, code),
      }),
    [native, installed, fetchState, snoozedOptional],
  );


  const generic = useMemo(
    () =>
      pickGeneric(fetchState, {
        ackedIds: new Set([...getLocalAcks(), ...dismissedGeneric]),
      }),
    [fetchState, dismissedGeneric],
  );

  const openStore = useCallback(async () => {
    const ok = await openPlayStore();
    if (!ok) setStoreError("تعذّر فتح متجر Google Play. افتح المتجر يدويًا وحدّث تطبيق إرث.");
  }, []);

  const dismissGeneric = useCallback(
    async (row: AnnouncementRow) => {
      setDismissedGeneric((prev) => [...prev, row.id]);
      recordLocalAck(row.id);
      if (signedIn) await ackAnnouncementServer(row.id);
    },
    [signedIn],
  );

  if (!ready) return null;

  // ── 1. Mandatory blocker — outranks every non-fatal overlay ──────────
  if (mandatory.blocked && mandatory.row) {
    if (!canShowModal(MODAL_PRIORITY.mandatoryUpdate)) return null;
    return (
      <ModalPortal>
        <div
          dir="rtl"
          role="alertdialog"
          aria-modal="true"
          data-irth-mandatory-update=""
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#05080f]/97 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-gold/30 bg-surface p-6 text-center shadow-elegant">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/30">
              <AlertTriangle className="size-7" strokeWidth={1.6} />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-foreground">
              {mandatory.row.title || "يلزم تحديث إرث"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {mandatory.row.body || "يتوفر إصدار أحدث من إرث، ويلزم تحديث التطبيق للمتابعة."}
            </p>
            {storeError ? (
              <p className="mt-3 text-xs text-destructive">{storeError}</p>
            ) : null}
            <button
              type="button"
              onClick={() => { void openStore(); }}
              className="motion-tap mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-bold text-background"
            >
              <Download className="size-4" strokeWidth={2} />
              تحديث الآن
            </button>
          </div>
        </div>
      </ModalPortal>
    );
  }

  // Nothing below may pre-empt the launch chain / fatal recovery.
  const criticalFirst = isCriticalGeneric(generic);

  // ── 2. Critical generic announcement ────────────────────────────────
  if (criticalFirst && generic && canShowModal(MODAL_PRIORITY.criticalAnnouncement)) {
    return <GenericDialog row={generic} onDismiss={dismissGeneric} navigate={navigate} />;
  }

  // ── 3. Optional update prompt ───────────────────────────────────────
  if (optional.show && optional.row && canShowModal(MODAL_PRIORITY.optionalUpdate)) {
    const row = optional.row;
    return (
      <ModalPortal>
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          data-irth-optional-update=""
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-6"
        >
          <div className="w-full max-w-md rounded-3xl border border-gold/25 bg-surface p-6 text-center shadow-elegant">
            <h2 className="font-display text-lg font-bold text-foreground">
              {row.title || "يتوفر إصدار جديد من إرث"}
            </h2>
            {row.body ? (
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{row.body}</p>
            ) : null}
            {storeError ? <p className="mt-3 text-xs text-destructive">{storeError}</p> : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { void openStore(); }}
                className="motion-tap flex-1 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-background"
              >
                تحديث الآن
              </button>
              <button
                type="button"
                onClick={() => {
                  snoozeOptional(row.id, row.recommended_version_code ?? 0);
                  setTick((n) => n + 1);
                }}
                className="motion-tap flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground"
              >
                لاحقًا
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  // ── 4. Normal generic announcement ──────────────────────────────────
  if (generic && canShowModal(MODAL_PRIORITY.genericAnnouncement)) {
    return <GenericDialog row={generic} onDismiss={dismissGeneric} navigate={navigate} key={tick} />;
  }

  return null;
}

function GenericDialog({
  row,
  onDismiss,
  navigate,
}: {
  row: AnnouncementRow;
  onDismiss: (row: AnnouncementRow) => void | Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const action = resolveAnnouncementAction(row);
  const close = () => { void onDismiss(row); };

  return (
    <ModalPortal>
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        data-irth-announcement=""
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-6"
      >
        <div className="relative w-full max-w-md rounded-3xl border border-gold/25 bg-surface p-6 shadow-elegant">
          {row.dismissible ? (
            <button
              type="button"
              onClick={close}
              aria-label="إغلاق"
              className="absolute left-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/30">
            <Megaphone className="size-5" strokeWidth={1.6} />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-foreground">{row.title}</h2>
          {row.body ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{row.body}</p>
          ) : null}
          <div className="mt-6 flex gap-3">
            {action.kind !== "none" ? (
              <button
                type="button"
                onClick={() => {
                  void onDismiss(row);
                  if (action.kind === "internal") {
                    void navigate({ to: action.path as never });
                  } else {
                    void openExternalUrl(action.url);
                  }
                }}
                className="motion-tap flex-1 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-background"
              >
                {action.label || "عرض"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="motion-tap flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              حسنًا
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

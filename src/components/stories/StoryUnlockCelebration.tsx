// ============================================================
// StoryUnlockCelebration — centralized locked → unlocked detector
// ------------------------------------------------------------
// Unlock truth stays server-side (`evaluate_unlock_spec_v2`). This
// layer only observes the authoritative `stories-summary` query
// results and reports *transitions*:
//
//   persisted state = locked   →   fresh state = unlocked
//
// Because the previous lock state is persisted per player scope,
// the detection survives app restarts and never fires for stories
// that were already unlocked before this session. It is unlock-type
// agnostic: entity_discovered, campaign_complete, investigation_complete,
// atlas_location_visited, achievement_unlocked, player_level and
// story_complete all flow through the same signal.
//
// No rewards, no economy mutation — presentation only.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Sparkles, X } from "lucide-react";
import { ModalPortal } from "@/components/ModalPortal";
import { OverlayDismissRegistration } from "@/lib/navigation/overlay-registration";
import { supabase } from "@/integrations/supabase/client";
import type { StorySummary } from "@/lib/stories/summary";
import { getActiveOwner } from "@/lib/identity/owner";

const STATE_KEY = "irth.stories.lockstate.v1";
const SEEN_KEY = "irth.stories.unlock-celebrated.v1";
const MIGRATED_SCOPE_KEY = "irth.stories.celebration-migrated.v1";

interface Unlocked {
  id: string;
  title: string;
}

function ls(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

function readMap(key: string): Record<string, boolean> {
  const s = ls();
  if (!s) return {};
  try {
    const raw = s.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch { return {}; }
}

function writeMap(key: string, value: Record<string, boolean>): void {
  const s = ls();
  if (!s) return;
  try { s.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

/**
 * Diff the freshest `stories-summary` results against the persisted lock
 * state for this player scope and return stories that just unlocked.
 */
export const MAX_CELEBRATIONS_PER_SCAN = 3;

/**
 * Only AUTHORITATIVE rows may drive celebrations. Local/bundled fallback
 * rows (`source !== "server"`) reflect device metadata, not server unlock
 * truth: baseline seeding, catalog hydration, content sync and login
 * hydration all flip them and would otherwise fire popup storms (V16).
 */
export function authoritativeRows(rows: StorySummary[]): StorySummary[] {
  return rows.filter((r) => (r as { source?: string })?.source === "server");
}

export function detectTransitions(rowsIn: StorySummary[]): Unlocked[] {
  const rows = authoritativeRows(rowsIn);
  if (rows.length === 0) return [];
  const prev = readMap(STATE_KEY);
  const seen = readMap(SEEN_KEY);
  const out: Unlocked[] = [];

  for (const r of rows) {
    if (!r?.id) continue;
    const was = prev[r.id];
    const now = !!r.unlocked;
    
    // Safety: only trigger for genuine transitions: locked (false) -> unlocked (true)
    // If was is undefined (first boot), we establish state but don't notify.
    if (was === false && now && !seen[r.id]) {
      out.push({ id: r.id, title: r.title_ar ?? "قصة جديدة" });
    }
    prev[r.id] = now;
  }

  writeMap(STATE_KEY, prev);

  // Mass-transition guard: a legitimate session unlocks a handful of
  // stories. Anything larger is a data/hydration anomaly, so the new
  // state is recorded (above) but nothing is celebrated.
  if (out.length > MAX_CELEBRATIONS_PER_SCAN) {
    console.warn(
      `[stories] suppressed ${out.length} simultaneous unlock celebrations (mass-transition guard)`,
    );
    return [];
  }
  return out;
}

export function StoryUnlockCelebration() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [queue, setQueue] = useState<Unlocked[]>([]);
  const userIdRef = useRef<string | null>(null);
  const storageReady = useRef(false);

  // Player identity monitoring.
  useEffect(() => {
    let alive = true;
    const update = (uid: string | null) => {
      if (!alive) return;
      userIdRef.current = uid;
      // Use synchronous resolution from owner.ts
      const current = getActiveOwner();
      setOwnerKey(current);
      storageReady.current = true;
    };

    void supabase.auth.getSession().then(({ data }) => update(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      update(session?.user?.id ?? null);
      setQueue([]);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Durable ledger & Legacy Migration
  const [ledgerReady, setLedgerReady] = useState(false);
  useEffect(() => {
    if (!ownerKey) return;
    let alive = true;
    setLedgerReady(false);
    (async () => {
      // 1. Legacy Migration (Double-scoped -> Partitioned)
      const s = ls();
      if (s && s.getItem(MIGRATED_SCOPE_KEY) !== "true") {
        const legacyStateRoot = `irth.stories.lockstate.v1:`;
        const legacySeenRoot = `irth.stories.unlock-celebrated.v1:`;
        
        // Use a partition-bypass read for the legacy physical key
        const readLegacyPhysical = (logicalPrefix: string, owner: string) => {
          try {
            const physicalKey = `${logicalPrefix}${owner}::owner=${owner}`;
            const raw = s.getItem(physicalKey);
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        };

        const legacyState = readLegacyPhysical(legacyStateRoot, ownerKey);
        const legacySeen = readLegacyPhysical(legacySeenRoot, ownerKey);

        if (legacyState || legacySeen) {
          if (legacyState) {
            const current = readMap(STATE_KEY);
            writeMap(STATE_KEY, { ...legacyState, ...current });
          }
          if (legacySeen) {
            const current = readMap(SEEN_KEY);
            writeMap(SEEN_KEY, { ...legacySeen, ...current });
          }
        }
        try { s.setItem(MIGRATED_SCOPE_KEY, "true"); } catch {}
      }

      // 2. Server Ledger Sync
      const uid = userIdRef.current;
      if (uid) {
        try {
          const { fetchSeenUnlockNotices } = await import("@/lib/stories/unlock-notices");
          const ids = await fetchSeenUnlockNotices(uid);
          if (ids.length > 0) {
            const seen = readMap(SEEN_KEY);
            for (const id of ids) seen[id] = true;
            writeMap(SEEN_KEY, seen);
          }
        } catch { /* offline */ }
      }
      if (alive) setLedgerReady(true);
    })();
    return () => { alive = false; };
  }, [ownerKey]);

  // Persist "announced" durably the moment a celebration is shown, so it
  // survives reload, sign-out/sign-in and device changes.
  const persistSeen = useMemo(() => (ids: string[]) => {
    const uid = userIdRef.current;
    if (ids.length === 0) return;
    
    // 1. Mark as seen locally IMMEDIATELY (Authority for current device)
    const seen = readMap(SEEN_KEY);
    for (const id of ids) seen[id] = true;
    writeMap(SEEN_KEY, seen);

    // 2. Server sync in background
    if (!uid) return;
    void import("@/lib/stories/unlock-notices")
      .then((m) => m.markUnlockNoticesSeen(uid, ids))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ownerKey || !ledgerReady || !storageReady.current) return;
    const scan = () => {
      try {
        const caches = queryClient.getQueryCache().findAll({ queryKey: ["stories-summary"] });
        const rows: StorySummary[] = [];
        const seenIds = new Set<string>();
        for (const q of caches) {
          const data = q.state.data as StorySummary[] | undefined;
          if (!Array.isArray(data)) continue;
          for (const r of data) {
            if (!r?.id || seenIds.has(r.id)) continue;
            seenIds.add(r.id);
            rows.push(r);
          }
        }
        const fresh = detectTransitions(rows);
        if (fresh.length > 0) {
          setQueue((q) => [...q, ...fresh.filter((f) => !q.some((x) => x.id === f.id))]);
        }
      } catch { /* celebration must never break the app */ }
    };

    scan();
    const unsub = queryClient.getQueryCache().subscribe((ev) => {
      if (ev.type === "updated" && ev.query.queryKey?.[0] === "stories-summary") scan();
    });
    return () => unsub();
  }, [queryClient, ownerKey, ledgerReady, persistSeen]);

  const current = queue[0] ?? null;
  // Any interaction (open now / later / close) permanently retires the notice.
  const dismiss = useMemo(() => () => {
    setQueue((q) => {
      const head = q[0];
      if (head) persistSeen([head.id]);
      return q.slice(1);
    });
  }, [persistSeen]);


  if (!current) return null;

  return (
    <ModalPortal>
      <OverlayDismissRegistration open onClose={dismiss} label="story-unlock-celebration" />
      <div
        dir="rtl"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[220] flex justify-center p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div
          role="dialog"
          aria-live="polite"
          aria-label="تم فتح قصة جديدة"
          className="pointer-events-auto w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in rounded-3xl border border-gold/40 bg-surface/95 p-4 shadow-elegant backdrop-blur"
        >
          <button
            onClick={dismiss}
            aria-label="إغلاق"
            className="absolute end-3 top-3 rounded-full border border-white/10 p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-gold/40 bg-gold/10">
              <Sparkles className="size-5 text-gold" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-gold">تم فتح قصة جديدة</p>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{current.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                أصبحت القصة جاهزة للمشاهدة.
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                const id = current.id;
                dismiss();
                void navigate({ to: "/story/$id", params: { id } });
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-black transition hover:bg-gold/90"
            >
              <BookOpenText className="size-4" />
              مشاهدة القصة
            </button>
            <button
              onClick={dismiss}
              className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              لاحقًا
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

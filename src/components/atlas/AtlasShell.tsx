// Phase 3 — Cinematic Atlas Shell.
// Single data source: published+verified atlas_entities. The Atlas is a
// visualization layer ONLY: it provides coordinates, color, and navigation.
// All textual content (titles, summaries, subtitles) is fetched live from
// encyclopedia_entities so an article edit propagates without DB duplication.
//
// URL state: ?focus, ?kind, ?era, ?world are deep-linkable.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Info, Loader2, Map as MapIcon } from "lucide-react";
import { AtlasIntroDialog, hasDismissedAtlasIntro } from "./AtlasIntroDialog";
import { useProfile } from "@/lib/profile";
import { AtlasStage } from "./AtlasStage";
import {
  AtlasControls,
  buildAtlasFacets,
  filterAtlasEntities,
} from "./AtlasControls";
import { AtlasEntityDetailPanel } from "./AtlasEntityDetailPanel";
import { usePublishedAtlasEntities } from "@/lib/atlas-entities-query";
import { isLc1VisibleAtlasKind, type AtlasEntityKind, type AtlasEntityRow } from "@/lib/atlas-entities";
import { sortAtlasEntitiesChronological } from "@/lib/atlas/atlas-visual";
import {
  pickBestAtlasMatch,
  searchAtlasEntities,
  zoomForKind,
  type AtlasSearchHit,
} from "@/lib/atlas/atlas-search";
import { Route as MapRoute, type MapSearch } from "@/routes/map";
import { androidMark, isAndroidUltraStableMode, recordAndroidAction } from "@/lib/androidFreezeDiagnostics";
import { clearAtlasCrashMarker, releaseUiLocks } from "@/lib/atlas/atlas-recovery";

export function AtlasShell() {
  androidMark("render:Atlas");
  const androidStable = isAndroidUltraStableMode();
  const [opened, setOpened] = useState(!androidStable);

  if (!opened) {
    return <AtlasStableGate onOpen={() => { recordAndroidAction("atlas.open.explicit"); setOpened(true); }} />;
  }

  return <AtlasShellInner />;
}

function AtlasShellInner() {
  const { data: entities = [], isLoading } = usePublishedAtlasEntities();
  const { profile } = useProfile();
  const settingsDismissed = profile.settings.atlasIntroDismissed === true;
  const [introOpen, setIntroOpen] = useState(() => !hasDismissedAtlasIntro(settingsDismissed));
  const [introReopened, setIntroReopened] = useState(false);

  // URL state — single source of truth for filters + selection.
  const search = MapRoute.useSearch();
  const navigate = useNavigate({ from: MapRoute.fullPath });
  const rawKind = (search.kind ?? null) as AtlasEntityKind | null;
  // LC1: ignore deep links to hidden kinds (events/artifacts/etc.) so the
  // map doesn't render empty when an old URL specifies a now-hidden layer.
  const kind = isLc1VisibleAtlasKind(rawKind) ? rawKind : null;
  const era = search.era ?? null;
  const world = search.world ?? null;
  const q = search.q ?? "";
  const focus = search.focus ?? null;

  const setSearchParam = <K extends keyof MapSearch>(
    key: K,
    value: MapSearch[K] | null,
  ) =>
    navigate({
      to: MapRoute.fullPath,
      search: (prev: MapSearch): MapSearch => ({
        ...prev,
        [key]: value ?? undefined,
      }),
      replace: true,
    });

  const facets = useMemo(() => buildAtlasFacets(entities), [entities]);
  const filtered = useMemo(
    () =>
      sortAtlasEntitiesChronological(
        filterAtlasEntities(entities, { kind, era, world, search: q }),
      ),
    [entities, kind, era, world, q],
  );

  const entityById = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );
  const selected = focus ? entityById.get(focus) ?? null : null;

  // Visibility override: ensure the selected/focused entity is always in the
  // render list, even if the current kind/era/world filters would exclude it
  // (e.g. searching for a battle while battles are chip-filtered out, or
  // while zoomed far out where battles are normally hidden). The pin layer's
  // `active` flag then keeps it visible at any zoom tier.
  const visible = useMemo(() => {
    if (!selected) return filtered;
    if (filtered.some((e) => e.id === selected.id)) return filtered;
    return [selected, ...filtered];
  }, [filtered, selected]);

  // NOTE: We intentionally do NOT drop `focus` when it's filtered out — the
  // visibility override above keeps the selected result visible until the
  // user clears the search or closes its preview.


  // A successful interactive render clears the one-session crash marker so
  // the next launch opens the full Atlas again.
  useEffect(() => {
    const t = setTimeout(() => clearAtlasCrashMarker(), 1500);
    return () => clearTimeout(t);
  }, []);

  // The Atlas is a full-screen fixed layer. Whatever happens to it, no scroll
  // lock or pointer blocker may survive leaving the route.
  useEffect(() => () => releaseUiLocks(), []);

  // ── Search navigation ────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<AtlasSearchHit[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const focusAtlasRef = useRef(0);
  const [focusAps, setFocusAps] = useState<{ x: number; y: number; minScale?: number; nonce: number } | null>(null);

  const navigateToEntity = useCallback((e: AtlasEntityRow) => {
    setSuggestions([]); setNoMatch(false);
    setSearchParam("focus", e.id);
    if (typeof e.aps_x === "number" && typeof e.aps_y === "number") {
      focusAtlasRef.current += 1;
      setFocusAps({
        x: e.aps_x,
        y: e.aps_y,
        minScale: zoomForKind(e.kind),
        nonce: focusAtlasRef.current,
      });
      setFallbackMsg(null);
    } else {
      setFallbackMsg("هذا العنصر موجود في الموسوعة لكنه غير محدد على الخريطة بعد");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live suggestions as the user types (debounced). Empty query clears.
  useEffect(() => {
    const query = q.trim();
    if (!query) { setSuggestions([]); setNoMatch(false); return; }
    const t = setTimeout(() => {
      const hits = searchAtlasEntities(entities, query, 6);
      setSuggestions(hits);
      setNoMatch(hits.length === 0);
    }, 140);
    return () => clearTimeout(t);
  }, [q, entities]);

  const submitSearch = useCallback((raw: string) => {
    const query = raw.trim();
    setSearchParam("q", query || null);
    if (!query) { setSuggestions([]); setNoMatch(false); return; }
    const { exact, suggestions: sugg } = pickBestAtlasMatch(entities, query);
    if (exact) { navigateToEntity(exact.entity); return; }
    if (sugg.length > 0) { setSuggestions(sugg); setNoMatch(false); return; }
    setSuggestions([]); setNoMatch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, navigateToEntity]);

  // When the focused entity changes (e.g., via URL or pin click), pan to it.
  // Honours an optional ?zoom= deep-link hint, otherwise uses a type-aware
  // comfortable zoom so approximate locations aren't over-framed.
  useEffect(() => {
    if (!selected) return;
    if (typeof selected.aps_x === "number" && typeof selected.aps_y === "number") {
      focusAtlasRef.current += 1;
      const min = typeof search.zoom === "number" ? search.zoom : zoomForKind(selected.kind);
      setFocusAps({ x: selected.aps_x, y: selected.aps_y, minScale: min, nonce: focusAtlasRef.current });
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="fixed inset-0 z-40 bg-slate-950" dir="rtl">
      <Link
        to="/"
        className="pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-1 rounded-full border border-amber-400/30 bg-slate-950/80 px-3 py-1.5 text-[12px] font-bold text-amber-100 shadow-sm hover:bg-slate-900"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <ChevronRight className="size-4" /> الرئيسية
      </Link>

      {/* Floating info button — sits just to the LEFT of the bottom-right zoom stack. */}
      <button
        type="button"
        onClick={() => { setIntroReopened(true); setIntroOpen(true); }}
        aria-label="حول أطلس إرث"
        className="pointer-events-auto absolute z-30 grid size-9 place-items-center rounded-full border border-amber-400/40 bg-slate-950/85 text-amber-200 shadow-lg shadow-black/40 backdrop-blur-sm hover:bg-slate-900 hover:text-amber-100 active:scale-95 transition"
        style={{
          right: "calc(1rem + 2.75rem + 0.5rem)",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <Info className="size-4" />
      </button>

      <AtlasStage
        entities={visible}
        selectedId={focus}
        onSelect={(e) => setSearchParam("focus", e?.id ?? null)}
        focusAps={focusAps}
      />

      <AtlasControls
        facets={facets}
        kind={kind}
        era={era}
        world={world}
        search={q}
        onKind={(v) => setSearchParam("kind", v)}
        onEra={(v) => setSearchParam("era", v)}
        onWorld={(v) => setSearchParam("world", v)}
        onSearch={(v) => setSearchParam("q", v || null)}
        onSubmitSearch={submitSearch}
        suggestions={suggestions}
        noMatch={noMatch}
        onPickSuggestion={(h) => navigateToEntity(h.entity)}
      />

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-full border border-amber-400/30 bg-slate-950/80 px-4 py-2 text-[12px] text-amber-100 shadow-lg">
            <Loader2 className="ml-2 inline size-3.5 animate-spin" />
            جاري تحميل الأطلس...
          </div>
        </div>
      )}

      {fallbackMsg && (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-950/85 px-4 py-2 text-[12px] text-amber-100 shadow-lg">
          {fallbackMsg}
          <button onClick={() => setFallbackMsg(null)} className="mr-2 text-amber-300/70 hover:text-amber-100">×</button>
        </div>
      )}

      {!isLoading && entities.length > 0 && visible.length === 0 && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-950/80 px-4 py-1.5 text-[12px] text-amber-100">
          لا توجد نتائج مطابقة
        </div>
      )}

      {selected && (
        <AtlasEntityDetailPanel
          entity={selected}
          onClose={() => setSearchParam("focus", null)}
          onCenter={() => {
            if (typeof selected.aps_x === "number" && typeof selected.aps_y === "number") {
              focusAtlasRef.current += 1;
              setFocusAps({ x: selected.aps_x, y: selected.aps_y, minScale: 6, nonce: focusAtlasRef.current });
            }
          }}
        />
      )}

      <AtlasIntroDialog
        open={introOpen}
        onClose={() => { setIntroOpen(false); setIntroReopened(false); }}
        forceInteractive={introReopened}
      />
    </div>
  );
}

function AtlasStableGate({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-background px-6 text-center" dir="rtl">
      <Link
        to="/"
        className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-full border border-gold/30 bg-surface px-3 py-1.5 text-[12px] font-bold text-gold"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <ChevronRight className="size-4" /> الرئيسية
      </Link>
      <div className="max-w-sm rounded-2xl border border-gold/20 bg-surface p-5 shadow-elegant">
        <MapIcon className="mx-auto mb-3 size-9 text-gold" />
        <h1 className="font-display text-xl font-bold text-foreground">الأطلس في الوضع المستقر</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          تم تأجيل تحميل الخريطة الثقيلة لحماية التصفح والكتابة داخل تطبيق أندرويد.
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          فتح الأطلس
        </button>
      </div>
    </div>
  );
}

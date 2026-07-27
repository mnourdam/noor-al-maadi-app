import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Search, Loader2, Globe2, X as XIcon, SlidersHorizontal, ChevronDown,
  FolderOpen, CheckCircle2, Lock, Trophy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";
import { WorldFilterChip } from "@/components/WorldFilterChip";
import { CaseFileCard, type CaseRefChip } from "@/components/investigations/CaseFileCard";
import { InvestigationsHero } from "@/components/investigations/InvestigationsHero";
import { resolveRelatedRefs } from "@/lib/encyclopedia-refs";

import {
  caseNumberLabel,
  ensureCaseNumbers,
  registerInvestigationsForNumbering,
} from "@/lib/investigations/case-number";

import { INVESTIGATION_REGISTRY } from "@/lib/investigations";
import {
  useSupabaseInvestigations,
  countQuestions,
  canonicalDifficulty,
  displayDifficulty,
  DIFFICULTY_ORDER,
  type InvestigationRow,
  type InvestigationReward,
  type CanonicalDifficulty,
} from "@/lib/investigations-source";
import { fetchWorldsIndex, findHub } from "@/lib/worlds";
import {
  useWorldMembership,
  isValidWorldSlug,
  getInvestigationWorldMap,
} from "@/lib/worlds-progress";
import { PUBLIC_WORLD_ORDER, WORLD_ERA } from "@/lib/worlds-constants";
import { CANONICAL_ERA_LABEL, toCanonicalEra } from "@/lib/era-canonical";
import { useStashCurrentAsOrigin } from "@/lib/navigation";
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { safeKey } from "@/lib/text/safe-text";

// Fresh random seed per app load/session so the default order reshuffles
// on reload. Any active filter switches to a deterministic title-sort
// so results stay stable while the user tunes their filters.
const SESSION_SHUFFLE_SEED = Math.random();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Search-param write contract: `world` is OPTIONAL and is never persisted as
// an empty string. `?world=` must not survive in the URL — clearing the filter
// removes the key entirely (`world: undefined`), so no downstream consumer ever
// normalizes an empty/garbage world slug.
const investigationsSearchSchema = z.object({
  world: fallback(z.string().optional(), undefined).optional(),
});

/** Strips `?world=` from the URL rather than writing an empty value. */
const CLEAR_WORLD = { world: undefined } as const;

export const Route = createFileRoute("/investigations")({
  head: () => ({ meta: [{ title: "التحقيقات التاريخية" }] }),
  validateSearch: zodValidator(investigationsSearchSchema),
  component: InvestigationsIndex,
});

type StatusFilter = "all" | "unsolved" | "solved";

type Item =
  | { kind: "supabase"; row: InvestigationRow }
  | { kind: "legacy"; row: (typeof INVESTIGATION_REGISTRY)[number] };

function itemTitle(it: Item): string {
  return it.kind === "supabase" ? it.row.title : it.row.title;
}
function itemSubtitle(it: Item): string {
  return it.kind === "supabase" ? (it.row.subtitle ?? "") : "";
}
function itemSlug(it: Item): string {
  return it.kind === "supabase" ? it.row.slug : it.row.id;
}
function itemDifficulty(it: Item): CanonicalDifficulty | null {
  if (it.kind !== "supabase") return null;
  return canonicalDifficulty(it.row.difficulty);
}

function InvestigationsIndex() {
  useProfile(); // keep provider dep so signed-out UI still reacts to auth changes
  const canonicalProgress = useCanonicalInvestigationProgress();
  const { rows } = useSupabaseInvestigations();
  const navigate = useNavigate({ from: "/investigations" });
  const stashOrigin = useStashCurrentAsOrigin();

  // Case numbers are an identity, not a row index: register every loaded
  // row so the number a case shows here is the same number it shows on its
  // own page, on every load, forever.
  const [, bumpNumbers] = useState(0);
  useEffect(() => { void ensureCaseNumbers().then(() => bumpNumbers((n) => n + 1)); }, []);
  useEffect(() => {
    registerInvestigationsForNumbering(rows ?? []);
    bumpNumbers((n) => n + 1);
  }, [rows]);

  const rawWorld = safeKey(Route.useSearch().world);
  const worldSlug = rawWorld && isValidWorldSlug(rawWorld) && findHub(rawWorld) ? rawWorld : null;

  const { data: worldsIndex } = useQuery({
    queryKey: ["worlds-index"],
    queryFn: () => fetchWorldsIndex(),
    enabled: !!worldSlug,
    staleTime: 60_000,
  });
  const worldTitle = useMemo(() => {
    if (!worldSlug) return "";
    return worldsIndex?.find((w) => w.hub.slug === worldSlug)?.entity.title ?? worldSlug;
  }, [worldsIndex, worldSlug]);
  const { investigationSlugs, ready: membershipReady } = useWorldMembership(worldSlug);

  // Local filter state — search, era, difficulty, status. The `world`
  // URL search param stays authoritative for cross-page linking; the
  // era chip is a superset filter that maps to a world membership.
  //
  // Filter state persists in sessionStorage so opening an investigation
  // and hitting Back restores the exact filter set the user configured.
  // We intentionally use sessionStorage (not localStorage) so a fresh
  // app launch starts from the default shuffled browse experience.
  const FILTER_STORAGE_KEY = "irth.investigations.filters.v1";
  const persisted = useMemo<{ search: string; era: string; difficulty: string; status: StatusFilter }>(() => {
    try {
      if (typeof sessionStorage === "undefined") return { search: "", era: "", difficulty: "", status: "all" };
      const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return { search: "", era: "", difficulty: "", status: "all" };
      const p = JSON.parse(raw);
      return {
        search: typeof p.search === "string" ? p.search : "",
        era: typeof p.era === "string" ? p.era : "",
        difficulty: typeof p.difficulty === "string" ? p.difficulty : "",
        status: p.status === "solved" || p.status === "unsolved" ? p.status : "all",
      };
    } catch { return { search: "", era: "", difficulty: "", status: "all" }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState(persisted.search);
  const [eraKey, setEraKey] = useState<string>(persisted.era);
  const [difficulty, setDifficulty] = useState<CanonicalDifficulty | "">(
    (["easy", "medium", "hard", "very_hard"] as const).includes(persisted.difficulty as CanonicalDifficulty)
      ? (persisted.difficulty as CanonicalDifficulty)
      : "",
  );
  const [status, setStatus] = useState<StatusFilter>(persisted.status);

  // Persist filter set on every change. Cheap JSON write, session-scoped.
  useEffect(() => {
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ search, era: eraKey, difficulty, status }),
      );
    } catch { /* quota — ignore */ }
  }, [search, eraKey, difficulty, status]);

  // Investigation → world reverse map (era chips depend on this).
  const worldByInvSlug = useMemo(() => {
    if (!membershipReady && !rows) return new Map<string, string>();
    return getInvestigationWorldMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows?.length, membershipReady]);

  // Combined item list (supabase + legacy), with legacy items hidden
  // when an equivalent supabase row exists under the same slug/id.
  const items = useMemo<Item[]>(() => {
    const supabaseSlugs = new Set((rows ?? []).map((r) => r.slug));
    const legacyVisible = INVESTIGATION_REGISTRY.filter((l) => !supabaseSlugs.has(l.id));
    return [
      ...(rows ?? []).map<Item>((r) => ({ kind: "supabase", row: r })),
      ...legacyVisible.map<Item>((r) => ({ kind: "legacy", row: r })),
    ];
  }, [rows]);

  // Compute per-era counts (only public/playable eras) so we can show
  // chips ordered by PUBLIC_WORLD_ORDER and hide eras with no content.
  const eraCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      const w = worldByInvSlug.get(itemSlug(it));
      if (!w) continue;
      const era = toCanonicalEra(WORLD_ERA[w] ?? w);
      if (!era) continue;
      counts.set(era, (counts.get(era) ?? 0) + 1);
    }
    return counts;
  }, [items, worldByInvSlug]);

  const eraChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: { key: string; label: string; count: number }[] = [];
    for (const w of PUBLIC_WORLD_ORDER) {
      const era = toCanonicalEra(WORLD_ERA[w] ?? w);
      if (!era || seen.has(era)) continue;
      seen.add(era);
      const c = eraCounts.get(era) ?? 0;
      if (c === 0) continue;
      chips.push({ key: era, label: CANONICAL_ERA_LABEL[era], count: c });
    }
    return chips;
  }, [eraCounts]);

  const anyFilter =
    !!worldSlug || !!search.trim() || !!eraKey || !!difficulty || status !== "all";

  const filtered = useMemo<Item[]>(() => {
    // While waiting for world membership, avoid flashing the wrong list.
    if (worldSlug && !membershipReady) return [];
    const q = search.trim().toLocaleLowerCase();
    const list = items.filter((it) => {
      if (worldSlug) {
        if (!investigationSlugs.has(itemSlug(it))) return false;
      }
      if (eraKey) {
        const w = worldByInvSlug.get(itemSlug(it));
        const era = w ? toCanonicalEra(WORLD_ERA[w] ?? w) : null;
        if (era !== eraKey) return false;
      }
      if (difficulty) {
        const d = itemDifficulty(it);
        if (d !== difficulty) return false;
      }
      if (status !== "all") {
        const slug = itemSlug(it);
        const id = it.kind === "supabase" ? it.row.id : it.row.id;
        const done = canonicalProgress.matches(id) || canonicalProgress.matches(slug);
        if (status === "solved" && !done) return false;
        if (status === "unsolved" && done) return false;
      }
      if (q) {
        const hay = `${itemTitle(it)} ${itemSubtitle(it)}`.toLocaleLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Deterministic sort while filtering; session shuffle otherwise so the
    // default browse experience still feels lively.
    if (anyFilter) {
      list.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), "ar"));
      return list;
    }
    return shuffle(list);
    // SESSION_SHUFFLE_SEED intentionally referenced so re-mount reshuffles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    items, worldSlug, membershipReady, investigationSlugs,
    eraKey, difficulty, status, search, worldByInvSlug, canonicalProgress,
    anyFilter, SESSION_SHUFFLE_SEED,
  ]);

  const clearAll = () => {
    if (worldSlug) navigate({ search: CLEAR_WORLD });
    setSearch(""); setEraKey(""); setDifficulty(""); setStatus("all");
  };

  // Filters start collapsed: browsing the desk comes first, tuning second.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Case-desk statistics — computed from the full catalog, not the filtered
  // view, so the numbers describe the section rather than the current query.
  const stats = useMemo(() => {
    const total = items.length;
    let solved = 0;
    for (const it of items) {
      const slug = itemSlug(it);
      const id = it.row.id;
      if (canonicalProgress.matches(id) || canonicalProgress.matches(slug)) solved++;
    }
    const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
    return { total, solved, remaining: Math.max(0, total - solved), pct };
  }, [items, canonicalProgress]);

  return (
    <AppShell>
      <ReadingScale>
      <div className="case-desk-texture relative px-5 pt-6">
        <InvestigationsHero
          title="التحقيقات التاريخية"
          subtitle="اكشف القرائن، استنتج الإجابة، واربح القلوب والدنانير"
        />

        {worldSlug && (
          <div className="mb-4">
            <WorldFilterChip
              worldTitle={worldTitle}
              onClear={() => navigate({ search: CLEAR_WORLD })}
            />
          </div>
        )}

        {/* Desk statistics */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <StatCell icon={<FolderOpen className="size-3.5 text-gold" />} label="ملفات القضايا" value={String(stats.total)} />
          <StatCell icon={<CheckCircle2 className="size-3.5 text-emerald-400" />} label="المحلولة" value={String(stats.solved)} />
          <StatCell icon={<Lock className="size-3.5 text-muted-foreground" />} label="المتبقية" value={String(stats.remaining)} />
          <StatCell icon={<Trophy className="size-3.5 text-gold" />} label="نسبة الإنجاز" value={`${stats.pct}%`} />
        </div>

        {/* Filters — one collapsible card, closed by default */}
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-surface/70">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-start"
          >
            <SlidersHorizontal className="size-4 text-gold" />
            <span className="text-[12.5px] font-bold">تصفية التحقيقات</span>
            {anyFilter && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] text-gold">
                مُفعّلة
              </span>
            )}
            <ChevronDown
              className={`ms-auto size-4 text-muted-foreground transition ${filtersOpen ? "rotate-180" : ""}`}
            />
          </button>

          {filtersOpen && (
        <div className="space-y-3 border-t border-white/10 p-3">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-surface px-3 py-2">

            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالعنوان…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              aria-label="بحث في التحقيقات"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                aria-label="مسح البحث"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </label>

          {eraChips.length > 0 && (
            <ChipRow label="العصر">
              <Chip active={!eraKey} onClick={() => setEraKey("")}>الكل</Chip>
              {eraChips.map((e) => (
                <Chip key={e.key} active={eraKey === e.key} onClick={() => setEraKey(e.key)}>
                  {e.label}
                  <span className="ms-1 text-[10px] text-muted-foreground">{e.count}</span>
                </Chip>
              ))}
            </ChipRow>
          )}

          <ChipRow label="الصعوبة">
            <Chip active={!difficulty} onClick={() => setDifficulty("")}>الكل</Chip>
            {DIFFICULTY_ORDER.map((d) => (
              <Chip
                key={d}
                active={difficulty === d}
                onClick={() => setDifficulty(difficulty === d ? "" : d)}
              >
                {displayDifficulty(d)}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="الحالة">
            <Chip active={status === "all"} onClick={() => setStatus("all")}>الكل</Chip>
            <Chip active={status === "unsolved"} onClick={() => setStatus("unsolved")}>غير محلولة</Chip>
            <Chip active={status === "solved"} onClick={() => setStatus("solved")}>محلولة</Chip>
          </ChipRow>

          {anyFilter && (
            <button
              onClick={clearAll}
              className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              مسح كل عوامل التصفية
            </button>
          )}
        </div>
          )}
        </div>


        {rows === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
          </div>
        )}

        <div className="case-board space-y-3 rounded-3xl border border-white/10 p-3">
          {filtered.map((item) => {
            const caseNumber = caseNumberLabel(itemSlug(item));
            if (item.kind === "supabase") {
              const inv = item.row;
              const done =
                canonicalProgress.matches(inv.id) ||
                canonicalProgress.matches(inv.slug);
              const reward = (inv.reward ?? {}) as InvestigationReward;
              const steps = Array.isArray(inv.steps) ? inv.steps : [];
              return (
                <CaseFileCard
                  key={`s:${inv.id}`}
                  routeId={inv.slug}
                  caseNumber={caseNumber}
                  title={inv.title}
                  subtitle={inv.subtitle}
                  difficultyLabel={displayDifficulty(inv.difficulty)}
                  difficultyKey={canonicalDifficulty(inv.difficulty)}
                  stepCount={steps.length}
                  questionCount={countQuestions(steps)}
                  xp={reward.xp}
                  dinars={reward.coins}
                  hearts={reward.hearts}
                  refs={refChipsFor(inv.related_entities)}
                  done={done}
                  onNavigate={() => stashOrigin(`/investigation/${inv.slug}`)}
                />

              );
            }
            const inv = item.row;
            const done = canonicalProgress.matches(inv.id);
            return (
              <CaseFileCard
                key={`l:${inv.id}`}
                routeId={inv.id}
                caseNumber={caseNumber}
                title={inv.title}
                difficultyLabel={itemDifficulty(item) ? displayDifficulty(itemDifficulty(item)!) : null}
                xp={inv.reward.xp}
                dinars={inv.reward.dinars}
                done={done}
                onNavigate={() => stashOrigin(`/investigation/${inv.id}`)}
              />
            );
          })}


          {rows !== null && filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
              {worldSlug ? (
                <>
                  <Globe2 className="mx-auto mb-3 size-8 text-gold/70" />
                  <p className="font-display text-base font-bold text-gold">لا توجد تحقيقات متاحة في هذا العالم حاليًا</p>
                </>
              ) : anyFilter ? (
                <p className="text-sm text-muted-foreground">لا توجد تحقيقات تطابق عوامل التصفية.</p>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد تحقيقات متاحة حاليًا.</p>
              )}
            </div>
          )}
        </div>
      </div>
      </ReadingScale>
    </AppShell>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] transition ${
        active
          ? "border-gold/60 bg-gold/15 text-gold"
          : "border-white/10 bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** One tiny statistic on the case-desk strip. */
function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface/70 px-2 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1">{icon}</div>
      <p className="font-display mt-0.5 text-[13px] font-bold leading-none" dir="ltr">{value}</p>
      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * First 3 encyclopedia entities of a case, as lightweight chips. Resolution
 * is snapshot-local (no network) and unresolved refs are dropped so a card
 * never shows a raw uuid.
 */
function refChipsFor(related: readonly string[] | null | undefined): CaseRefChip[] {
  try {
    return resolveRelatedRefs(related)
      .filter((r) => r.resolved && r.label)
      .slice(0, 3)
      .map((r) => ({ entityType: r.entityType, label: r.label }));
  } catch {
    return [];
  }
}

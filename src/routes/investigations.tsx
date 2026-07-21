import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Search, ChevronLeft, Check, Coins, Star, Heart, Loader2, Globe2, X as XIcon,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";
import { WorldFilterChip } from "@/components/WorldFilterChip";

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

const investigationsSearchSchema = z.object({
  world: fallback(z.string(), "").default(""),
});

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

  const rawWorld = Route.useSearch().world;
  const worldSlug = isValidWorldSlug(rawWorld) && findHub(rawWorld) ? rawWorld : null;

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
  const [search, setSearch] = useState("");
  const [eraKey, setEraKey] = useState<string>(""); // canonical era key
  const [difficulty, setDifficulty] = useState<CanonicalDifficulty | "">("");
  const [status, setStatus] = useState<StatusFilter>("all");

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
    if (worldSlug) navigate({ search: { world: "" } });
    setSearch(""); setEraKey(""); setDifficulty(""); setStatus("all");
  };

  return (
    <AppShell>
      <ReadingScale>
      <Screen title="التحقيقات التاريخية" subtitle="اكشف القرائن، استنتج الإجابة، واربح القلوب والدنانير">

        {worldSlug && (
          <div className="mb-4">
            <WorldFilterChip
              worldTitle={worldTitle}
              onClear={() => navigate({ search: { world: "" } })}
            />
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 space-y-3">
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

        {rows === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((item) => {
            if (item.kind === "supabase") {
              const inv = item.row;
              const done =
                canonicalProgress.matches(inv.id) ||
                canonicalProgress.matches(inv.slug);
              return (
                <SupabaseRow
                  key={`s:${inv.id}`}
                  inv={inv}
                  done={done}
                  onNavigate={() => stashOrigin(`/investigation/${inv.slug}`)}
                />
              );
            }
            const inv = item.row;
            const done = canonicalProgress.matches(inv.id);
            return (
              <Link
                key={`l:${inv.id}`}
                to="/investigation/$id"
                params={{ id: inv.id }}
                onClick={() => stashOrigin(`/investigation/${inv.id}`)}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/40 bg-gold/5" : "border-white/10 bg-surface"}`}
              >
                <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
                  <Search className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-sm font-bold">{inv.title}</p>
                  <p className="mt-0.5 inline-flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-gold"><Star className="size-3" /> +{inv.reward.xp}</span>
                    <span className="inline-flex items-center gap-1 text-gold"><Coins className="size-3" /> +{inv.reward.dinars}</span>
                  </p>
                </div>
                {done ? <Check className="size-4 text-gold" /> : <ChevronLeft className="size-4 text-muted-foreground" />}
              </Link>
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
      </Screen>
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

function SupabaseRow({ inv, done, onNavigate }: { inv: InvestigationRow; done: boolean; onNavigate?: () => void }) {
  const reward = (inv.reward ?? {}) as InvestigationReward;
  const steps = Array.isArray(inv.steps) ? inv.steps : [];
  return (
    <Link
      to="/investigation/$id"
      params={{ id: inv.slug }}
      onClick={() => onNavigate?.()}
      className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/40 bg-gold/5" : "border-white/10 bg-surface"}`}
    >
      <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
        <Search className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-sm font-bold">{inv.title}</p>
        {inv.subtitle && (
          <p className="truncate text-[11px] text-muted-foreground">{inv.subtitle}</p>
        )}
        <p className="mt-0.5 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="text-amber-300">
            {displayDifficulty(inv.difficulty)} · {steps.length} خطوة · {countQuestions(steps)} سؤال
          </span>
          {reward.hearts ? <span className="inline-flex items-center gap-1 text-rose-300"><Heart className="size-3" /> +{reward.hearts}</span> : null}
          {reward.xp ? <span className="inline-flex items-center gap-1 text-gold"><Star className="size-3" /> +{reward.xp}</span> : null}
          {reward.coins ? <span className="inline-flex items-center gap-1 text-gold"><Coins className="size-3" /> +{reward.coins}</span> : null}
        </p>
      </div>
      {done ? <Check className="size-4 text-gold" /> : <ChevronLeft className="size-4 text-muted-foreground" />}
    </Link>
  );
}

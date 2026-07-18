import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search, ChevronLeft, Check, Coins, Star, Heart, Loader2, Globe2 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";
import { WorldFilterChip } from "@/components/WorldFilterChip";

import { INVESTIGATION_REGISTRY } from "@/lib/investigations";
import {
  useSupabaseInvestigations,
  countQuestions,
  type InvestigationRow,
  type InvestigationReward,
} from "@/lib/investigations-source";
import { fetchWorldsIndex, findHub } from "@/lib/worlds";
import { useWorldMembership, isValidWorldSlug } from "@/lib/worlds-progress";

// Fresh random seed per app load/session so the order reshuffles on reload.
const SESSION_SHUFFLE_SEED = Math.random();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";

const investigationsSearchSchema = z.object({
  world: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/investigations")({
  head: () => ({ meta: [{ title: "التحقيقات التاريخية" }] }),
  validateSearch: zodValidator(investigationsSearchSchema),
  component: InvestigationsIndex,
});

function InvestigationsIndex() {
  const { profile } = useProfile();
  const canonicalProgress = useCanonicalInvestigationProgress();
  const { rows } = useSupabaseInvestigations();
  const navigate = useNavigate({ from: "/investigations" });
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


  // Hide legacy items whose slug/id was overridden by a Supabase investigation.
  const supabaseSlugs = new Set((rows ?? []).map((r) => r.slug));
  const legacyVisible = INVESTIGATION_REGISTRY.filter((l) => !supabaseSlugs.has(l.id));

  // Combine into a single list and shuffle once per session (no chronological order).
  type Item =
    | { kind: "supabase"; row: InvestigationRow }
    | { kind: "legacy"; row: (typeof INVESTIGATION_REGISTRY)[number] };
  const shuffledItems = useMemo<Item[]>(() => {
    const combined: Item[] = [
      ...(rows ?? []).map((r) => ({ kind: "supabase" as const, row: r })),
      ...legacyVisible.map((r) => ({ kind: "legacy" as const, row: r })),
    ];
    const shuffled = shuffle(combined);
    if (!worldSlug) return shuffled;
    if (!membershipReady) return [];
    return shuffled.filter((it) => {
      const slug = it.kind === "supabase" ? it.row.slug : it.row.id;
      return investigationSlugs.has(slug);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows?.length, legacyVisible.length, SESSION_SHUFFLE_SEED, worldSlug, membershipReady, investigationSlugs]);

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

        {rows === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
          </div>
        )}

        <div className="space-y-3">
          {shuffledItems.map((item) => {
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

          {rows !== null && shuffledItems.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
              {worldSlug ? (
                <>
                  <Globe2 className="mx-auto mb-3 size-8 text-gold/70" />
                  <p className="font-display text-base font-bold text-gold">لا توجد تحقيقات متاحة في هذا العالم حاليًا</p>
                </>
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

function SupabaseRow({ inv, done }: { inv: InvestigationRow; done: boolean }) {
  const reward = (inv.reward ?? {}) as InvestigationReward;
  const steps = Array.isArray(inv.steps) ? inv.steps : [];
  return (
    <Link
      to="/investigation/$id"
      params={{ id: inv.slug }}
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
          <span className="text-amber-300">{steps.length} خطوة · {countQuestions(steps)} سؤال</span>
          {reward.hearts ? <span className="inline-flex items-center gap-1 text-rose-300"><Heart className="size-3" /> +{reward.hearts}</span> : null}
          {reward.xp ? <span className="inline-flex items-center gap-1 text-gold"><Star className="size-3" /> +{reward.xp}</span> : null}
          {reward.coins ? <span className="inline-flex items-center gap-1 text-gold"><Coins className="size-3" /> +{reward.coins}</span> : null}
        </p>
      </div>
      {done ? <Check className="size-4 text-gold" /> : <ChevronLeft className="size-4 text-muted-foreground" />}
    </Link>
  );
}

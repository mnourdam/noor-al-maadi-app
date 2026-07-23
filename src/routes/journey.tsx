// ============================================================
// /journey — سجل الرحلة (Journey Log, P6 Step 4)
// ------------------------------------------------------------
// The player's own historical archive. Museum tone.
// * Chronological only (newest first, grouped by day).
// * No likes, comments, reactions, shares, followers.
// * Filter by kind. Keyset pagination.
// * Signed-in only.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";
import {
  journeyKindCounts,
  listMyJourney,
  JOURNEY_KIND_ORDER,
  type JourneyEvent,
  type JourneyEventKind,
  type JourneyKindCounts,
} from "@/lib/journey/journey";
import {
  presentJourneyEvent,
  formatJourneyDate,
  formatJourneyDayHeader,
  journeyDayKey,
  categoryLabelForKind,
} from "@/lib/journey/presentation";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "سجل الرحلة — إرث" },
      {
        name: "description",
        content: "أرشيف تاريخيّ هادئ لكل ما أتممتَه واكتشفتَه في إرث — قصصك، حملاتك، تحقيقاتك، وإنجازاتك.",
      },
      { property: "og:title", content: "سجل الرحلة — إرث" },
      { property: "og:description", content: "أرشيفك التاريخي في إرث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JourneyRoute,
});

function JourneyRoute() {
  const { user } = useAccount();

  if (!user) {
    return (
      <AppShell>
        <Screen title="سجل الرحلة" subtitle="أرشيف رحلتك الشخصية في إرث.">
          <div className="mx-auto max-w-md py-8 text-center text-sm text-muted-foreground">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-full border border-gold/50 bg-gold/15 px-4 py-2 font-medium text-gold hover:bg-gold/20"
            >
              تسجيل الدخول لعرض السجل
            </Link>
          </div>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Screen
        title="سجل الرحلة"
        subtitle="أرشيف هادئ لكلّ ما أتممتَه واكتشفتَه — بلا ضجيج، ولا مقارنات."
      >
        <JourneyTimeline />
      </Screen>
    </AppShell>
  );
}

function JourneyTimeline() {
  const [items, setItems] = useState<JourneyEvent[]>([]);
  const [cursor, setCursor] = useState<{ ts: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<JourneyEventKind | null>(null);
  const [counts, setCounts] = useState<JourneyKindCounts>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (kind: JourneyEventKind | null) => {
    setLoading(true);
    setError(null);
    const res = await listMyJourney({
      kinds: kind ? [kind] : undefined,
      limit: 30,
    });
    setItems(res.items);
    setCursor(res.next_cursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  useEffect(() => {
    void journeyKindCounts().then(setCounts).catch(() => setCounts({}));
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listMyJourney({
        kinds: filter ? [filter] : undefined,
        cursor,
        limit: 30,
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.next_cursor);
    } catch {
      setError("تعذّر تحميل المزيد.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filter, loadingMore]);

  const grouped = useMemo(() => groupByDay(items), [items]);
  const totalLifetime = useMemo(
    () => Object.values(counts).reduce((a, b) => a + (b ?? 0), 0),
    [counts],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Lifetime summary — a single, quiet line. */}
      <p className="text-center text-[11px] text-muted-foreground">
        {totalLifetime > 0
          ? `${totalLifetime.toLocaleString("ar")} محطة في رحلتك حتى الآن`
          : "لم تبدأ رحلتك بعد — كل ما تتمّه سيُسجَّل هنا."}
      </p>

      {/* Filters. Chips, not tabs — no active-underline, no bounce. */}
      <div className="flex flex-wrap justify-center gap-1.5">
        <FilterChip
          active={filter === null}
          label="الكل"
          onClick={() => setFilter(null)}
        />
        {JOURNEY_KIND_ORDER.map((k) => {
          const n = counts[k] ?? 0;
          if (n === 0 && filter !== k) return null;
          return (
            <FilterChip
              key={k}
              active={filter === k}
              label={`${categoryLabelForKind(k)}${n > 0 ? ` · ${n}` : ""}`}
              onClick={() => setFilter(filter === k ? null : k)}
            />
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center text-[12px] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : items.length === 0 ? (
        <EmptyState filtered={filter !== null} />
      ) : (
        <ol className="relative space-y-6">
          {/* Vertical archive spine. Right side in RTL. */}
          <div
            aria-hidden="true"
            className="absolute right-[11px] top-1 bottom-1 w-px bg-gradient-to-b from-transparent via-gold/25 to-transparent"
          />
          {grouped.map(([day, dayItems]) => (
            <Fragment key={day}>
              <li className="relative pr-8">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  {formatJourneyDayHeader(dayItems[0].occurred_at)}
                </h2>
              </li>
              {dayItems.map((evt) => (
                <li key={evt.event_id} className="relative pr-8">
                  <JourneyRow evt={evt} />
                </li>
              ))}
            </Fragment>
          ))}
        </ol>
      )}

      {cursor && !loading && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={cn(
              "rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-foreground/80 hover:border-gold/40 hover:text-gold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
              loadingMore && "cursor-not-allowed opacity-60",
            )}
          >
            {loadingMore ? "…" : "عرض المزيد"}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        active
          ? "border-gold/50 bg-gold/15 text-gold"
          : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/25 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function JourneyRow({ evt }: { evt: JourneyEvent }) {
  const view = presentJourneyEvent(evt);
  const Icon = view.icon;
  return (
    <Link
      to={view.href}
      className={cn(
        "block rounded-lg border border-white/10 bg-black/25 p-3 transition-colors",
        "hover:border-gold/40 hover:bg-black/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Archive node on the spine (right side in RTL). */}
      <span
        aria-hidden="true"
        className="absolute right-[5px] top-4 grid size-3.5 place-items-center rounded-full border border-gold/50 bg-background"
      >
        <span className="size-1.5 rounded-full bg-gold" />
      </span>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/40 text-gold">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
            {view.category}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/95">
            {view.headline}
          </p>
          {view.detail && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {view.detail}
            </p>
          )}
          <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground/70">
            {formatJourneyDate(evt.occurred_at)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-muted-foreground">
      <ScrollText className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden="true" />
      {filtered
        ? "لا محطات من هذا النوع في سجلّك بعد."
        : "لم تُسجَّل بعد أيّة محطة. كل ما تتمّه أو تكتشفه في إرث سيظهر هنا."}
    </div>
  );
}

// ------------------------------------------------------------
// Group timeline entries by local calendar day, preserving order.
// ------------------------------------------------------------
function groupByDay(items: JourneyEvent[]): Array<[string, JourneyEvent[]]> {
  const out: Array<[string, JourneyEvent[]]> = [];
  let currentDay = "";
  let currentBucket: JourneyEvent[] | null = null;
  for (const evt of items) {
    const day = journeyDayKey(evt.occurred_at);
    if (day !== currentDay) {
      currentDay = day;
      currentBucket = [];
      out.push([day, currentBucket]);
    }
    currentBucket!.push(evt);
  }
  return out;
}

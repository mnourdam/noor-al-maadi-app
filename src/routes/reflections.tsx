// ============================================================
// My Reflections — player journal for Reflective Moment entries.
//
// Data source: canonical `listAllReflections()` from `@/lib/reflections`,
// which merges the local mirror with the server table `user_reflections`
// (natural unique key: user_id + campaign_id + activity_id). The account
// hydration path pulls the server rows into the local mirror on sign-in,
// so this view survives reinstall / new-device restore.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, ScrollText } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  listAllReflections,
  deleteReflection,
  REFLECTIONS_CHANGE_EVENT,
  type ReflectionEntry,
} from "@/lib/reflections";
import { listCampaigns } from "@/lib/campaignStorage";
import type { Campaign, CampaignActivity } from "@/types/campaign";

export const Route = createFileRoute("/reflections")({
  head: () => ({
    meta: [
      { title: "تأملاتي — إرث" },
      { name: "description", content: "سجل لحظات التأمل من رحلاتك في إرث." },
      { property: "og:title", content: "تأملاتي — إرث" },
      { property: "og:description", content: "سجل لحظات التأمل من رحلاتك في إرث." },
    ],
  }),
  component: ReflectionsJournalPage,
});

interface EnrichedEntry extends ReflectionEntry {
  campaignTitle: string;
  chapterTitle: string;
  activityPrompt: string;
}

function buildIndex(campaigns: Campaign[]) {
  const byActivity = new Map<
    string,
    { campaign: Campaign; chapterTitle: string; activity: CampaignActivity }
  >();
  for (const c of campaigns) {
    for (const ch of c.chapters ?? []) {
      for (const a of ch.activities ?? []) {
        byActivity.set(`${c.id}:${a.id}`, {
          campaign: c,
          chapterTitle: ch.title ?? "",
          activity: a,
        });
      }
    }
  }
  return byActivity;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

type FilterTab = "all" | "campaign" | "story";

function ReflectionsJournalPage() {
  const [entries, setEntries] = useState<ReflectionEntry[]>(() => listAllReflections());
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  // Refresh on external saves (Reflective Moment renderer emits this).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setEntries(listAllReflections());
    window.addEventListener(REFLECTIONS_CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(REFLECTIONS_CHANGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const campaignIndex = useMemo(() => buildIndex(listCampaigns()), []);

  const enriched: EnrichedEntry[] = useMemo(() => {
    return entries.map((e) => {
      const isStory = e.kind === "story";
      const hit = isStory ? null : campaignIndex.get(`${e.campaignId}:${e.activityId}`);
      return {
        ...e,
        campaignTitle: isStory
          ? "قصة"
          : hit?.campaign.title ?? "حملة غير معروفة",
        chapterTitle: isStory ? "" : hit?.chapterTitle ?? "",
        activityPrompt: isStory ? "" : hit?.activity.prompt ?? "",
      };
    });
  }, [entries, campaignIndex]);

  const scoped = useMemo(() => {
    if (tab === "all") return enriched;
    if (tab === "story") return enriched.filter((e) => e.kind === "story");
    return enriched.filter((e) => e.kind !== "story");
  }, [enriched, tab]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return scoped;
    const needle = q.toLowerCase();
    return scoped.filter((e) => {
      const hay = [
        e.campaignTitle,
        e.chapterTitle,
        e.activityPrompt,
        e.choiceValue ?? "",
        e.text ?? "",
      ]
        .join(" \n ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [scoped, query]);

  async function onDelete(e: ReflectionEntry) {
    await deleteReflection(e.campaignId, e.activityId);
    setEntries(listAllReflections());
  }

  return (
    <AppShell>
      <Screen title="تأملاتي" subtitle="سجل لحظات التأمل من رحلاتك في إرث">
        {/* Search */}
        <div className="relative mb-4">
          <Search
            aria-hidden
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="ابحث في تأملاتك…"
            className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 pe-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/50 focus:outline-none"
            aria-label="بحث"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-surface p-8 text-center">
            <ScrollText className="mb-3 text-muted-foreground" size={36} aria-hidden />
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? "لم تسجّل أي تأملات بعد. ستظهر هنا عند مرورك بلحظات تأمل في الحملات."
                : "لا نتائج مطابقة لبحثك."}
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {filtered.map((e) => (
              <li
                key={`${e.campaignId}:${e.activityId}`}
                className="rounded-2xl border border-gold/20 bg-gradient-to-b from-amber-900/10 via-surface/50 to-stone-900/10 p-4"
              >
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[13px] font-bold text-gold/90">
                      {e.campaignTitle}
                    </p>
                    {e.chapterTitle && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {e.chapterTitle}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(e)}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                    aria-label="حذف التأمل"
                  >
                    <Trash2 size={14} />
                  </button>
                </header>

                {e.activityPrompt && (
                  <p className="mb-2 text-[13px] italic leading-relaxed text-amber-100/80">
                    «{e.activityPrompt}»
                  </p>
                )}

                {e.choiceValue && (
                  <p className="mb-2 text-[13px] text-foreground">
                    <span className="text-muted-foreground">اختيارك: </span>
                    {e.choiceValue}
                  </p>
                )}

                {e.text && (
                  <p className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/20 p-3 text-[13px] leading-relaxed text-foreground">
                    {e.text}
                  </p>
                )}

                <footer className="mt-2 text-[10px] text-muted-foreground">
                  {formatDate(e.at)}
                </footer>
              </li>
            ))}
          </ol>
        )}
      </Screen>
    </AppShell>
  );
}

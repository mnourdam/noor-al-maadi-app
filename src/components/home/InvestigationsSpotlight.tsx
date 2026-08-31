// ============================================================
// Home — Historical Investigations spotlight
// ------------------------------------------------------------
// ONE compact premium card that establishes Historical
// Investigations as a first-class gameplay mode on Home.
//
// Placement contract: rendered immediately AFTER the Daily Quest
// section and BEFORE Daily Challenges (see src/routes/index.tsx).
//
// Data contract:
//   • Reuses `useRecommendedInvestigation()` — the SAME local-first
//     hook the HUD Hearts popover already uses. No new network
//     query is introduced; the catalogue comes from the offline
//     snapshot first and refreshes in the background.
//   • Two states only:
//       A) continue  → the last opened, still-unfinished case
//                      → CTA "متابعة القضية" → /investigation/$id
//       B) discovery → everything else
//                      → CTA "افتح ملفات التحقيق" → /investigations
//   • Empty catalogue (`total === 0`) renders NOTHING — never a
//     dead CTA.
// ============================================================

import { Link } from "@tanstack/react-router";
import { Search, ChevronLeft, Heart, Zap, ScrollText } from "lucide-react";
import { useRecommendedInvestigation } from "@/lib/investigations/recommend";
import { displayDifficulty } from "@/lib/investigations-source";
import { useStashCurrentAsOrigin } from "@/lib/navigation";

export function InvestigationsSpotlight() {
  const rec = useRecommendedInvestigation();
  const stashOrigin = useStashCurrentAsOrigin();

  // Nothing published (or catalogue not resolved yet) → render nothing.
  // Offline with a warm snapshot still resolves, so this is not a
  // "hidden while offline" state.
  if (!rec.ready || rec.total === 0) return null;

  const isContinue = rec.kind === "continue" && !!rec.row;
  const row = rec.row;

  return (
    <section className="mt-12 px-5" data-testid="home-investigations-spotlight">
      <Link
        to={isContinue ? "/investigation/$id" : "/investigations"}
        {...(isContinue ? { params: { id: row!.slug } } : {})}
        onClick={() =>
          stashOrigin(isContinue ? `/investigation/${row!.slug}` : "/investigations")
        }
        data-testid={isContinue ? "home-investigations-continue" : "home-investigations-discover"}
        className="motion-tap group relative block overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-bl from-gold/12 via-surface to-surface px-4 py-4 shadow-elegant transition hover:border-gold/60"
      >
        <div className="arabesque-layer pointer-events-none absolute inset-0 opacity-20" aria-hidden />

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shadow-gold">
            <Search className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-[0.2em] text-gold/85">
              {isContinue ? "واصل التحقيق" : "طور من أطوار اللعب"}
            </p>
            <h3 className="font-display mt-0.5 truncate text-[15px] font-bold leading-tight text-foreground">
              {isContinue ? row!.title : "التحقيقات التاريخية"}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-5 text-muted-foreground">
              {isContinue
                ? [displayDifficulty(row!.difficulty), row!.subtitle?.trim() || null]
                    .filter(Boolean)
                    .join(" · ")
                : "اكشف الخيوط، وازن الروايات، واحكم على الأدلة كمؤرخ."}
            </p>
          </div>

          <ChevronLeft className="size-5 shrink-0 text-gold/60 transition-transform group-hover:-translate-x-1" />
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          {isContinue ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground">
                <Search className="size-3.5" /> متابعة القضية
              </span>
              <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                {rec.completed.toLocaleString("en-US")}/{rec.total.toLocaleString("en-US")} قضية
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground">
                <ScrollText className="size-3.5" /> افتح ملفات التحقيق
              </span>
              <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                {rec.completed.toLocaleString("en-US")}/{rec.total.toLocaleString("en-US")} قضية
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">
                <Heart className="size-3" /> قلوب
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                <Zap className="size-3" /> XP
              </span>
            </>
          )}
        </div>
      </Link>
    </section>
  );
}

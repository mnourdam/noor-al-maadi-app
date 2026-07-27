import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, Coins, FolderOpen, Heart, Star } from "lucide-react";

export interface CaseFileCardProps {
  /** Route param for /investigation/$id — slug for Supabase rows, id for legacy. */
  routeId: string;
  /** Stable, permanent case number shown on the folder tab (e.g. "021"). */
  caseNumber: string;
  title: string;
  subtitle?: string | null;
  /** Already display-formatted difficulty label, or null when unknown. */
  difficultyLabel?: string | null;
  stepCount?: number | null;
  questionCount?: number | null;
  xp?: number | null;
  dinars?: number | null;
  hearts?: number | null;
  done: boolean;
  onNavigate?: () => void;
}

/**
 * A single investigation rendered as a filed case folder: a labelled tab, a
 * perforated pad margin, the case brief, and a rubber "تم الحل" stamp once the
 * player has solved it. Purely presentational — every value is supplied by the
 * caller so legacy and Supabase investigations render identically.
 */
export function CaseFileCard({
  routeId,
  caseNumber,
  title,
  subtitle,
  difficultyLabel,
  stepCount,
  questionCount,
  xp,
  dinars,
  hearts,
  done,
  onNavigate,
}: CaseFileCardProps) {
  const meta: string[] = [];
  if (difficultyLabel) meta.push(difficultyLabel);
  if (stepCount) meta.push(`${stepCount} خطوة`);
  if (questionCount) meta.push(`${questionCount} سؤال`);
  // Counters inside investigations are Western digits by contract — the
  // template literals above never localize, which is exactly what we want.

  return (
    <Link
      to="/investigation/$id"
      params={{ id: routeId }}
      onClick={() => onNavigate?.()}
      className={`group relative block overflow-hidden rounded-2xl border transition ${
        done
          ? "border-gold/45 shadow-[0_10px_30px_-22px_oklch(0.82_0.14_82/0.7)]"
          : "border-white/10 hover:border-gold/35"
      }`}
    >
      {/* Folder tab */}
      <div className="case-tab flex items-center gap-2 px-3 py-1.5">
        <FolderOpen className="size-3 text-gold" />
        <span className="font-display text-[10px] font-bold tracking-[0.18em] text-gold" dir="ltr">
          ملف #{caseNumber}
        </span>
        {done && (
          <span className="case-stamp ms-auto rounded px-1.5 py-0.5 text-[9px] font-bold">
            تم الحل
          </span>
        )}
      </div>

      {/* Document body */}
      <div className="case-sheet relative flex items-center gap-3 p-4">
        {/* Perforated pad margin */}
        <span
          aria-hidden
          className="case-margin absolute inset-y-3 start-0 w-px"
        />

        <div className="min-w-0 flex-1 ps-2">
          <p className="font-display truncate text-sm font-bold">{title}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>
          )}

          {meta.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-amber-300/90">
              {meta.join(" · ")}
            </p>
          )}

          <p className="mt-1 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            {hearts ? (
              <span className="inline-flex items-center gap-1 text-rose-300">
                <Heart className="size-3" /> +{hearts}
              </span>
            ) : null}
            {xp ? (
              <span className="inline-flex items-center gap-1 text-gold">
                <Star className="size-3" /> +{xp}
              </span>
            ) : null}
            {dinars ? (
              <span className="inline-flex items-center gap-1 text-gold">
                <Coins className="size-3" /> +{dinars}
              </span>
            ) : null}
          </p>
        </div>

        {done ? (
          <Check className="size-4 shrink-0 text-gold" />
        ) : (
          <ChevronLeft className="size-4 shrink-0 text-muted-foreground transition group-hover:text-gold" />
        )}
      </div>
    </Link>
  );
}


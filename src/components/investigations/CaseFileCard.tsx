import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  BookOpen, Check, ChevronLeft, Coins, Folder, FolderOpen, GraduationCap, Gem,
  Heart, Landmark, MapPin, ScrollText, Star, Swords, User,
} from "lucide-react";

/** Small entity preview shown as a chip on the folder face. */
export interface CaseRefChip {
  entityType: string;
  label: string;
}

const CHIP_ICON: Record<string, typeof BookOpen> = {
  figure: User,
  scholar: GraduationCap,
  state: Landmark,
  battle: Swords,
  city: MapPin,
  event: ScrollText,
  landmark: Landmark,
  artifact: Gem,
};

/** Traffic-light dot per canonical difficulty — read before the word is. */
const DIFFICULTY_DOT: Record<string, string> = {
  easy: "bg-emerald-400",
  medium: "bg-amber-400",
  hard: "bg-rose-400",
  very_hard: "bg-rose-500",
};

export interface CaseFileCardProps {
  /** Route param for /investigation/$id — slug for Supabase rows, id for legacy. */
  routeId: string;
  /** Stable, permanent case number shown on the folder tab (e.g. "021"). */
  caseNumber: string;
  title: string;
  subtitle?: string | null;
  /** Already display-formatted difficulty label, or null when unknown. */
  difficultyLabel?: string | null;
  /** Canonical difficulty key ("easy" | "medium" | "hard" | "very_hard"). */
  difficultyKey?: string | null;
  stepCount?: number | null;
  questionCount?: number | null;
  xp?: number | null;
  dinars?: number | null;
  hearts?: number | null;
  /** First 2–3 encyclopedia entities this case touches. */
  refs?: CaseRefChip[];
  done: boolean;
  onNavigate?: () => void;
}

/**
 * A single investigation rendered as a filed case folder: a labelled tab, a
 * perforated pad margin, the case brief, entity chips and a rubber "تم الحل"
 * stamp once solved. Opening it plays a very short (~170ms) folder-open beat
 * before the route changes, so the file feels lifted off the desk.
 */
export function CaseFileCard({
  routeId,
  caseNumber,
  title,
  subtitle,
  difficultyLabel,
  difficultyKey,
  stepCount,
  questionCount,
  xp,
  dinars,
  hearts,
  refs,
  done,
  onNavigate,
}: CaseFileCardProps) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta: string[] = [];
  if (stepCount) meta.push(`${stepCount} خطوة`);
  if (questionCount) meta.push(`${questionCount} سؤال`);
  // Counters inside investigations are Western digits by contract — the
  // template literals above never localize, which is exactly what we want.

  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    if (opening) return;
    setOpening(true);
    onNavigate?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void navigate({ to: "/investigation/$id", params: { id: routeId } });
    }, 170);
  };

  const chips = (refs ?? []).slice(0, 3);

  return (
    <a
      href={`/investigation/${routeId}`}
      onClick={go}
      className={`case-folder group relative block overflow-hidden rounded-2xl border transition ${
        opening ? "case-folder-opening" : ""
      } ${
        done
          ? "border-gold/45 shadow-[0_10px_30px_-22px_oklch(0.82_0.14_82/0.7)]"
          : "border-white/10 hover:border-gold/35"
      }`}
    >
      {/* Folder tab */}
      <div className="case-tab flex items-center gap-2 px-3 py-1.5">
        {done ? <FolderOpen className="size-3 text-gold" /> : <Folder className="size-3 text-gold" />}
        <span className="font-display text-[9px] font-bold tracking-[0.06em] text-gold/90">
          ملف القضية رقم <span dir="ltr">{caseNumber}</span>
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

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-amber-300/90">
            {difficultyLabel && (
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${DIFFICULTY_DOT[String(difficultyKey ?? "")] ?? "bg-white/40"}`}
                />
                {difficultyLabel}
              </span>
            )}
            {meta.length > 0 && <span className="truncate">{meta.join(" · ")}</span>}
          </p>

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

          {chips.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1">
              {chips.map((c, i) => {
                const Icon = CHIP_ICON[String(c.entityType || "").toLowerCase()] ?? BookOpen;
                return (
                  <span
                    key={`${c.label}:${i}`}
                    className="inline-flex max-w-[45%] items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-foreground/75"
                  >
                    <Icon className="size-3 shrink-0 text-gold/80" />
                    <span className="truncate">{c.label}</span>
                  </span>
                );
              })}
            </p>
          )}
        </div>

        {done ? (
          <Check className="size-4 shrink-0 text-gold" />
        ) : (
          <ChevronLeft className="size-4 shrink-0 text-muted-foreground transition group-hover:text-gold" />
        )}
      </div>
    </a>
  );
}

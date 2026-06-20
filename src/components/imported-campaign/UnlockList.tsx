// Renders an unlock (type:slug) as an Arabic chip with a type badge.
// Resolves IDs through the encyclopedia. Never shows raw English IDs to
// normal users — falls back to a friendly placeholder.
//
// Clicking a card variant row opens the SAME unified reveal modal used by
// the museum, so the discovery experience is identical regardless of source.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useResolvedUnlocks, typeLabel, type ResolvedUnlock } from "@/lib/campaignUnlocks";
import {
  CollectibleRevealDialog,
  type CollectibleRevealItem,
  type CollectibleRarity,
} from "@/components/CollectibleRevealDialog";

interface Props {
  ids: string[];
  /** Compact one-line pills (default) vs. card list. */
  variant?: "pill" | "card";
  /** Show raw IDs / "missing from encyclopedia" warning. Admin/dev only. */
  debug?: boolean;
  /** Optional source label shown in the unified reveal (e.g. "من حملة ..."). */
  sourceLabel?: string;
}

const TYPE_GLYPH: Record<string, string> = {
  figure: "👤", artifact: "🏺", city: "🏛️", landmark: "🏛️",
  battle: "⚔️", state: "🏳️", event: "📜",
};

function friendlyTitle(slug: string | null): string {
  if (!slug) return "مكافأة جديدة";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function rarityFor(r: ResolvedUnlock): CollectibleRarity {
  const m = r.metadata?.rarity as CollectibleRarity | undefined;
  if (m && ["common", "rare", "epic", "legendary"].includes(m)) return m;
  return ["figure", "landmark", "battle"].includes(r.type ?? "") ? "epic" : "rare";
}

export function UnlockList({ ids, variant = "pill", debug = false, sourceLabel }: Props) {
  const { resolved, isLoading } = useResolvedUnlocks(ids);
  const navigate = useNavigate();
  const [reveal, setReveal] = useState<CollectibleRevealItem | null>(null);

  if (!ids.length) return null;

  const openReveal = (r: ResolvedUnlock) => {
    const glyph = TYPE_GLYPH[r.type ?? ""] ?? "✨";
    const title = r.title ?? friendlyTitle(r.slug);
    const subtitle = r.subtitle ?? typeLabel(r.type);
    setReveal({
      rarity: rarityFor(r),
      icon: glyph,
      title,
      subtitle,
      lines: r.summary ? [r.summary] : ["عنصر من الموسوعة. افتحه لقراءة تفاصيله الكاملة."],
      sourceLabel: sourceLabel ?? "من الموسوعة",
      alreadyOwned: true,
      onOpenEncyclopedia: r.slug
        ? () => navigate({ to: "/encyclopedia/entity/$id", params: { id: r.slug! } })
        : undefined,
    });
  };

  if (variant === "card") {
    return (
      <>
        <ul className="space-y-2">
          {resolved.map((r) => {
            const label = r.found
              ? r.title!
              : isLoading
                ? "…"
                : debug
                  ? "عنصر غير موجود بالموسوعة"
                  : friendlyTitle(r.slug);
            return (
              <li key={r.raw}>
                <button
                  type="button"
                  onClick={() => openReveal(r)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right text-[12px] transition hover:border-gold/60 ${
                    r.found
                      ? "border-gold/30 bg-gold/10 text-gold"
                      : "border-gold/20 bg-gold/5 text-gold/80"
                  }`}
                >
                  <span className="text-base leading-none">🔓</span>
                  <span className="flex-1 font-bold">{label}</span>
                  <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] text-foreground/80">
                    {typeLabel(r.type)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <CollectibleRevealDialog item={reveal} onClose={() => setReveal(null)} />
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {resolved.map((r) => {
        const label = r.found
          ? r.title!
          : isLoading
            ? "…"
            : debug
              ? "عنصر غير موجود بالموسوعة"
              : friendlyTitle(r.slug);
        return (
          <span
            key={r.raw}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
              r.found
                ? "border-gold/30 bg-gold/10 text-gold"
                : "border-gold/20 bg-gold/5 text-gold/80"
            }`}
          >
            🔓 {label}
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] text-foreground/70">
              {typeLabel(r.type)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

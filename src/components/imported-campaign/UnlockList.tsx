// Renders an unlock (type:slug) as an Arabic chip with a type badge.
// Resolves IDs through the encyclopedia. Never shows raw English IDs to
// normal users — falls back to a friendly Arabic placeholder.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LockOpen, Users, Landmark, Building2, Swords, Flag, ScrollText, Gem, Sparkles } from "lucide-react";
import { useResolvedUnlocks, typeLabel, type ResolvedUnlock } from "@/lib/campaignUnlocks";
import {
  CollectibleRevealDialog,
  type CollectibleRevealItem,
  type CollectibleRarity,
} from "@/components/CollectibleRevealDialog";

interface Props {
  ids: string[];
  variant?: "pill" | "card";
  debug?: boolean;
  sourceLabel?: string;
}

const TYPE_ICON = {
  figure: Users,
  artifact: Gem,
  city: Building2,
  landmark: Landmark,
  battle: Swords,
  state: Flag,
  event: ScrollText,
} as const;

function iconFor(type: string | null | undefined) {
  return (type && (TYPE_ICON as Record<string, typeof Sparkles>)[type]) ?? Sparkles;
}

function rarityFor(r: ResolvedUnlock): CollectibleRarity {
  const m = r.metadata?.rarity as CollectibleRarity | undefined;
  if (m && ["common", "rare", "epic", "legendary"].includes(m)) return m;
  return ["figure", "landmark", "battle"].includes(r.type ?? "") ? "epic" : "rare";
}

function resolveLabel(r: ResolvedUnlock, isLoading: boolean, debug: boolean): string {
  if (r.title && r.title.trim()) return r.title;
  if (isLoading) return "جاري التحميل…";
  if (debug) return "عنصر غير موجود بالموسوعة";
  return "عنصر غير معروف";
}

export function UnlockList({ ids, variant = "pill", debug = false, sourceLabel }: Props) {
  const { resolved, isLoading } = useResolvedUnlocks(ids);
  const navigate = useNavigate();
  const [reveal, setReveal] = useState<CollectibleRevealItem | null>(null);

  if (!ids.length) return null;

  const openReveal = (r: ResolvedUnlock) => {
    const title = resolveLabel(r, isLoading, debug);
    const subtitle = r.subtitle ?? typeLabel(r.type);
    setReveal({
      rarity: rarityFor(r),
      icon: "✨",
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
            const label = resolveLabel(r, isLoading, debug);
            const Icon = iconFor(r.type);
            return (
              <li key={r.raw}>
                <button
                  type="button"
                  onClick={() => openReveal(r)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-right text-[13px] transition hover:border-gold/60 ${
                    r.found
                      ? "border-gold/40 bg-gold/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <LockOpen className="size-4 shrink-0 text-gold" strokeWidth={1.75} />
                  <span
                    className="flex-1 font-bold leading-snug text-foreground line-clamp-2"
                    title={label}
                  >
                    {label}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[10px] text-foreground/85">
                    <Icon className="size-3" strokeWidth={1.75} />
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
    <div className="flex flex-wrap gap-2 text-[12px]">
      {resolved.map((r) => {
        const label = resolveLabel(r, isLoading, debug);
        const Icon = iconFor(r.type);
        return (
          <span
            key={r.raw}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-foreground"
          >
            <LockOpen className="size-3 shrink-0 text-gold" strokeWidth={1.75} />
            <span className="truncate font-medium" title={label}>{label}</span>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] text-foreground/80">
              <Icon className="size-2.5" strokeWidth={1.75} />
              {typeLabel(r.type)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

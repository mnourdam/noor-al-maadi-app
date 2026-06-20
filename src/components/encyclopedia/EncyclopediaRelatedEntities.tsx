// Related entities — grouped, clickable chips that jump to the linked
// encyclopedia entity page. Renders only groups that have items.
import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import type { RelatedEntityGroups, RelatedRef } from "@/types/encyclopediaArticle";

const GROUP_LABEL: Record<keyof RelatedEntityGroups, string> = {
  figures:   "شخصيات مرتبطة",
  scholars:  "علماء مرتبطون",
  battles:   "معارك مرتبطة",
  events:    "أحداث مرتبطة",
  cities:    "مدن مرتبطة",
  landmarks: "معالم مرتبطة",
  artifacts: "آثار مرتبطة",
  states:    "دول مرتبطة",
};

const GROUP_GLYPH: Record<keyof RelatedEntityGroups, string> = {
  figures:   "👤",
  scholars:  "📖",
  battles:   "⚔️",
  events:    "📜",
  cities:    "🏙️",
  landmarks: "🕌",
  artifacts: "🗝️",
  states:    "🏛️",
};

export function EncyclopediaRelatedEntities({ related }: { related?: RelatedEntityGroups }) {
  if (!related) return null;
  const groupKeys = (Object.keys(related) as (keyof RelatedEntityGroups)[]).filter(
    k => Array.isArray(related[k]) && (related[k] as RelatedRef[]).length > 0,
  );
  if (groupKeys.length === 0) return null;

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-center gap-2">
        <Network className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">الكيانات المرتبطة</h2>
      </div>
      {groupKeys.map(k => (
        <div key={k}>
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-gold/85">
            <span>{GROUP_GLYPH[k]}</span>
            <span>{GROUP_LABEL[k]}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(related[k] as RelatedRef[]).map((ref, i) => (
              <Link
                key={`${ref.slug}-${i}`}
                to="/encyclopedia/entity/$id"
                params={{ id: ref.slug }}
                className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2.5 py-1 text-[11px] text-foreground/90 transition hover:border-gold/60 hover:bg-gold/10 hover:text-gold"
                title={ref.note}
              >
                <span className="truncate max-w-[200px]">{ref.label ?? ref.slug}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

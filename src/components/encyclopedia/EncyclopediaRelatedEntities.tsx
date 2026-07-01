// Related entities — grouped informational chips (non-interactive).
// Lucide icons only (no emojis), styled as small museum tags.
import { Network } from "lucide-react";
import type { RelatedEntityGroups, RelatedRef } from "@/types/encyclopediaArticle";
import { iconForType } from "@/lib/encyclopedia-icons";
import type { ComponentType, SVGProps } from "react";

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

const GROUP_TYPE: Record<keyof RelatedEntityGroups, string> = {
  figures:   "figure",
  scholars:  "scholar",
  battles:   "battle",
  events:    "event",
  cities:    "city",
  landmarks: "landmark",
  artifacts: "artifact",
  states:    "state",
};

export function EncyclopediaRelatedEntities({ related }: { related?: RelatedEntityGroups }) {
  if (!related) return null;
  const groupKeys = (Object.keys(related) as (keyof RelatedEntityGroups)[]).filter(
    (k) => Array.isArray(related[k]) && (related[k] as RelatedRef[]).length > 0,
  );
  if (groupKeys.length === 0) return null;

  return (
    <section className="mt-10 space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/10 ring-1 ring-gold/30 text-gold">
          <Network className="size-4.5" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[10px] tracking-[0.32em] text-gold/80">شبكة المعرفة</p>
          <h2 className="font-display text-lg font-bold">الكيانات المرتبطة</h2>
        </div>
      </header>
      {groupKeys.map((k) => {
        const Icon = iconForType(GROUP_TYPE[k]) as ComponentType<SVGProps<SVGSVGElement>>;
        return (
          <div key={k}>
            <p className="mb-2 inline-flex items-center gap-2 text-[11px] tracking-[0.18em] text-gold/85">
              <Icon className="size-3.5" strokeWidth={1.5} />
              <span>{GROUP_LABEL[k]}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(related[k] as RelatedRef[]).map((ref, i) => (
                <span
                  key={`${ref.slug}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/30 px-3 py-1 text-[11px] text-foreground/90 select-none"
                  title={ref.note}
                >
                  <span className="size-1 rounded-full bg-gold/70" />
                  <span className="truncate max-w-[200px]">{ref.label ?? ref.slug}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// Player-like preview of an encyclopedia entity, used inside the Admin
// Cleanup Workshop. Reuses the same EncyclopediaArticleBody renderer the
// player-facing detail page uses, so admins can see exactly how their
// JSON edits will render before saving.
import { Calendar, Database, MapPin, ScrollText, Sparkles, Tag } from "lucide-react";
import { iconForType } from "@/lib/encyclopedia-icons";
import { parseEncyclopediaArticle } from "@/types/encyclopediaArticle";
import { EncyclopediaArticleBody } from "@/components/encyclopedia/EncyclopediaArticleBody";

const TYPE_LABEL: Record<string, string> = {
  state: "دولة", figure: "شخصية", scholar: "عالم", city: "مدينة",
  battle: "معركة", event: "حدث", landmark: "معلم", artifact: "أثر",
};

export interface PreviewEntity {
  entity_type: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: any;
  metadata?: any;
}

export function EncyclopediaEntityPreview({ entity }: { entity: PreviewEntity }) {
  const meta = (entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {}) as Record<string, any>;
  const isScholar =
    entity.entity_type === "figure" &&
    (typeof meta.kind === "string" ? (meta.kind as string) : "") === "scholar";
  const typeLabel = isScholar
    ? "عالم"
    : TYPE_LABEL[entity.entity_type] ?? entity.entity_type;
  const HeroIcon = iconForType(isScholar ? "scholar" : entity.entity_type);

  const period   = typeof meta.period   === "string" ? meta.period   : null;
  const era      = typeof meta.era      === "string" ? meta.era      : null;
  const date     = typeof meta.date     === "string" ? meta.date     : null;
  const location = typeof meta.location === "string" ? meta.location : null;
  const region   = typeof meta.region   === "string" ? meta.region   : null;
  const image =
    (typeof meta.image === "string" && meta.image) ||
    (typeof meta.image_url === "string" && meta.image_url) ||
    (typeof meta.hero_image === "string" && meta.hero_image) ||
    (typeof meta.thumbnail === "string" && meta.thumbnail) ||
    null;
  const aliases: string[] = Array.isArray(meta.aliases)
    ? (meta.aliases as any[]).filter((x) => typeof x === "string" && x.trim()) as string[]
    : [];

  const chips: { icon: typeof Calendar; label: string }[] = [];
  if (period)   chips.push({ icon: ScrollText, label: period });
  if (era)      chips.push({ icon: Sparkles,   label: era });
  if (date)     chips.push({ icon: Calendar,   label: date });
  if (location) chips.push({ icon: MapPin,     label: location });
  if (region)   chips.push({ icon: Tag,        label: region });

  const article = parseEncyclopediaArticle(entity.body, entity.metadata);

  return (
    <div dir="rtl" className="rounded-2xl border border-gold/20 bg-gradient-to-b from-[#10131c] via-[#0c0f17] to-black p-4 text-foreground">
      <div className="pointer-events-none absolute" />
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-br from-[#1a1f2e] via-[#10131c] to-black p-5">
        <div className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-gold/15 blur-[60px]" />
        {image && (
          <img
            src={image}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
            loading="lazy"
          />
        )}
        <div className="relative flex flex-col items-center text-center">
          <span className="font-display text-[10px] tracking-[0.5em] text-gold/85">
            {String(typeLabel).toUpperCase()}
          </span>
          <span className="mt-3 grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-gold/25 to-gold/5 ring-1 ring-gold/35 text-gold">
            <HeroIcon className="size-7" strokeWidth={1.3} />
          </span>
          <h1 className="font-display mt-4 text-[22px] font-bold leading-tight">
            {entity.title || <span className="text-rose-300">(بدون عنوان)</span>}
          </h1>
          {entity.subtitle && (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">{entity.subtitle}</p>
          )}
          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/40 px-3 py-1 text-[11px] text-foreground/90"
                >
                  <c.icon className="size-3 text-gold/85" strokeWidth={1.6} />
                  {c.label}
                </span>
              ))}
            </div>
          )}
          <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
            <Database className="size-2.5" /> معاينة
          </span>
        </div>
      </header>

      {aliases.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] tracking-[0.32em] text-gold/80">أسماء بديلة</p>
          <div className="flex flex-wrap gap-1.5">
            {aliases.slice(0, 24).map((a, i) => (
              <span key={i} className="rounded-full border border-gold/25 bg-black/30 px-2.5 py-0.5 text-[11px] text-foreground/90">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {entity.summary && (
        <section className="mt-5">
          <article className="relative rounded-2xl border border-gold/15 bg-gradient-to-b from-surface/70 to-black/30 px-5 py-5">
            <span className="absolute -top-3 right-5 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-background px-3 py-1 text-[10px] tracking-[0.32em] text-gold/85">
              مقدمة الدوسيه
            </span>
            <p className="text-[14.5px] leading-[2] text-foreground/95">{entity.summary}</p>
          </article>
        </section>
      )}

      <EncyclopediaArticleBody article={article} />
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Compass, Lock, Network, Sparkles, Users, Swords, MapPin, BookOpen, Scroll, Crown } from "lucide-react";
import {
  buildRelations, recommend, eraName,
  type EntityRef, type Recommendation, type EntityKind,
} from "@/lib/knowledge-graph";
import { useProfile } from "@/lib/profile";
import { fogHint } from "@/lib/data";

interface Props {
  entity: EntityRef;
  /** Optional override label for the section heading. */
  title?: string;
}

function isUnlocked(kind: EntityKind, id: string, p: ReturnType<typeof useProfile>["profile"]): boolean {
  switch (kind) {
    case "character": return p.charactersUnlocked.includes(id);
    case "artifact":  return p.artifactsFound.includes(id);
    case "region":    return p.regionsUnlocked.includes(id);
    case "story":     return p.storiesRead.includes(id);
    case "battle":    return true;     // battle pages are always viewable
    case "campaign":  return true;
  }
}

function kindMeta(kind: EntityKind) {
  switch (kind) {
    case "character": return { icon: Users, label: "شخصية" };
    case "battle":    return { icon: Swords, label: "معركة" };
    case "region":    return { icon: MapPin, label: "إقليم" };
    case "story":     return { icon: Scroll, label: "قصّة" };
    case "artifact":  return { icon: Crown, label: "أثر" };
    case "campaign":  return { icon: BookOpen, label: "حملة" };
  }
}

function NodeLink({ rec, locked }: { rec: Recommendation; locked: boolean }) {
  const meta = kindMeta(rec.kind);
  const Icon = meta.icon;
  const fog = locked ? fogHint(rec.id) : null;
  const inner = (
    <div className={`group h-full rounded-2xl border p-3 text-right transition ${
      locked
        ? "border-white/10 bg-surface/70 opacity-85"
        : "border-white/10 bg-surface hover:border-gold/40 hover:bg-surface-2"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-black/35 text-xl ring-1 ring-white/5">
          {locked ? "🌫️" : rec.icon}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gold/80">
          <Icon className="size-3" /> {meta.label}
        </span>
      </div>
      <p className={`font-display mt-2 text-[12px] font-bold line-clamp-1 ${locked ? "italic text-gold/85" : ""}`}>
        {locked ? (fog?.title ?? "غامض") : rec.label}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
        {locked ? (fog?.clue ?? "في ضباب التاريخ") : rec.sublabel}
      </p>
    </div>
  );
  if (locked) return <div>{inner}</div>;
  switch (rec.kind) {
    case "character":
      return <Link to="/figure/$id" params={{ id: rec.id }}>{inner}</Link>;
    case "battle":
      return <Link to="/battle/$id" params={{ id: rec.id }}>{inner}</Link>;
    case "story":
      return <Link to="/story/$id" params={{ id: rec.id }}>{inner}</Link>;
    case "region":
      return <Link to="/map">{inner}</Link>;
    case "artifact":
      return <Link to="/collection">{inner}</Link>;
    case "campaign":
      return <Link to="/campaigns/$era" params={{ era: rec.id as any }}>{inner}</Link>;
  }
}

export function RelatedHistory({ entity, title = "شبكة التاريخ المرتبط" }: Props) {
  const { profile } = useProfile();
  const graph = useMemo(() => buildRelations(entity), [entity]);
  const recs = useMemo(() => recommend(entity, 6), [entity]);

  const chips: Recommendation[] = useMemo(() => {
    const arr: Recommendation[] = [];
    for (const c of graph.characters.slice(0, 6)) arr.push({ kind: "character", id: c.id, label: c.name, sublabel: c.title, icon: c.avatar, score: 0 });
    for (const b of graph.battles.slice(0, 4))    arr.push({ kind: "battle",    id: b.id, label: b.name, sublabel: b.subtitle, icon: b.hero, score: 0 });
    for (const r of graph.regions.slice(0, 4))    arr.push({ kind: "region",    id: r.id, label: r.name, sublabel: r.capital,  icon: r.glyph ?? "📍", score: 0 });
    for (const a of graph.artifacts.slice(0, 4))  arr.push({ kind: "artifact",  id: a.id, label: a.name, sublabel: a.typeLabel, icon: a.icon, score: 0 });
    for (const s of graph.stories.slice(0, 3))    arr.push({ kind: "story",     id: s.id, label: s.title, sublabel: `${s.readMinutes} د قراءة`, icon: "📜", score: 0 });
    return arr;
  }, [graph]);

  const eras = graph.eras;
  const totalLinks = chips.length;
  if (totalLinks === 0 && recs.length === 0) return null;

  return (
    <section className="mt-7 space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-gold" />
          <h3 className="font-display text-sm font-bold">{title}</h3>
          <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
            {totalLinks} رابط
          </span>
        </div>
        {eras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {eras.map(e => (
              <Link
                key={e}
                to="/campaigns/$era"
                params={{ era: e }}
                className="rounded-full border border-gold/25 bg-black/30 px-2.5 py-0.5 text-[10px] text-gold/85 hover:bg-gold/10"
              >
                ⌘ {eraName(e)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Knowledge web (grid) */}
      {chips.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-gold" />
            <span>سافر في الشبكة — انتقل من خيطٍ لآخر دون عودة إلى القوائم.</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {chips.map(c => (
              <NodeLink
                key={`${c.kind}:${c.id}`}
                rec={c}
                locked={!isUnlocked(c.kind, c.id, profile)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Compass className="size-4 text-gold" />
            <h4 className="font-display text-sm font-bold">قد يثير اهتمامك أيضًا</h4>
            <div className="ms-2 h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {recs.map(r => (
              <NodeLink
                key={`rec:${r.kind}:${r.id}`}
                rec={r}
                locked={!isUnlocked(r.kind, r.id, profile)}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        <Lock className="me-1 inline size-3" />
        العناصر المضبّبة تنكشف عند إتمام حملاتها أو زيارة أقاليمها.
      </p>
    </section>
  );
}

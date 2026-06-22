// Phase 2 stabilization — Small, elegant atlas marker popover.
// Replaces the old full-side sheet. Shows: kind chip, title, encyclopedia
// summary (if linked), and ONE primary action: "اقرأ في الموسوعة".
// No locate button, no admin metadata, no debug.
import { Link } from "@tanstack/react-router";
import { BookOpen, X } from "lucide-react";
import { KIND_LABEL_AR, type AtlasEntityRow } from "@/lib/atlas-entities";

export function AtlasEntityDetailPanel({
  entity,
  onClose,
}: {
  entity: AtlasEntityRow;
  onClose: () => void;
}) {
  const era =
    entity.era ||
    (entity.year_start != null
      ? entity.year_end != null && entity.year_end !== entity.year_start
        ? `${entity.year_start}–${entity.year_end}م`
        : `${entity.year_start}م`
      : null);

  const meta = (entity.metadata ?? {}) as Record<string, unknown>;
  const summary =
    (typeof meta.summary === "string" && meta.summary) ||
    (typeof meta.note === "string" && meta.note) ||
    null;

  const encId = entity.encyclopedia_entity_id ?? null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label={entity.name_ar}
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 mx-auto max-w-md
                 rounded-2xl border border-amber-400/30 text-amber-50 shadow-[0_18px_40px_rgba(0,0,0,0.55)]
                 animate-in fade-in slide-in-from-bottom-2 duration-200 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      style={{
        backgroundImage:
          "linear-gradient(180deg, oklch(0.22 0.04 252 / 0.96), oklch(0.16 0.05 255 / 0.96))",
      }}
    >
      <button
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute left-2 top-2 rounded-full p-1 text-amber-200/80 hover:bg-amber-400/10"
      >
        <X className="size-4" />
      </button>

      <div className="p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
          {KIND_LABEL_AR[entity.kind] ?? entity.kind}
          {era && <span className="mx-1.5 opacity-60">·</span>}
          {era && <span className="font-normal tracking-normal">{era}</span>}
        </p>
        <h2 className="mt-0.5 font-display text-lg font-bold leading-tight">{entity.name_ar}</h2>
        {entity.name_en && (
          <p dir="ltr" className="mt-0.5 font-mono text-[11px] text-amber-200/60">
            {entity.name_en}
          </p>
        )}

        {summary ? (
          <p className="mt-3 text-[13px] leading-relaxed text-amber-100/90 line-clamp-4">
            {summary}
          </p>
        ) : !encId ? (
          <p className="mt-3 text-[12px] leading-relaxed text-amber-200/70">
            المقالة قادمة قريباً.
          </p>
        ) : null}

        <div className="mt-4">
          {encId ? (
            <Link
              to="/encyclopedia/entity/$id"
              params={{ id: encId }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-2 text-[13px] font-bold text-slate-950 shadow hover:from-amber-300 hover:to-amber-400"
            >
              <BookOpen className="size-4" /> اقرأ في الموسوعة
            </Link>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-900/60 px-4 py-2 text-[12px] font-medium text-amber-100/70">
              <BookOpen className="size-4" /> المقالة قادمة قريباً
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

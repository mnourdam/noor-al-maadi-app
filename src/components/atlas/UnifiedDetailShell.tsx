// Phase 2 — Unified atlas detail shell.
// Single source of detail UI for every marker on /map. Irth identity:
// deep navy + warm parchment/gold. Used by `AtlasEntityDetailPanel`.
import { Link } from "@tanstack/react-router";
import { BookOpen, Compass, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function UnifiedDetailShell({
  Icon,
  kindLabel,
  title,
  subtitle,
  regionName,
  eraText,
  encyclopediaId,
  encyclopediaLabel = "اقرأ في الموسوعة",
  onClose,
  onLocate,
  summary,
  children,
}: {
  Icon: LucideIcon;
  kindLabel: string;
  title: string;
  subtitle?: string | null;
  regionName?: string | null;
  eraText?: string | null;
  /** UUID of the encyclopedia entity. When null/undefined → coming-soon state. */
  encyclopediaId?: string | null;
  encyclopediaLabel?: string;
  onClose: () => void;
  onLocate?: () => void;
  summary?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <aside
      dir="rtl"
      className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col
                 border-l border-amber-400/20 text-amber-50 shadow-[0_0_60px_rgba(0,0,0,0.6)]
                 animate-in slide-in-from-right duration-200"
      style={{
        backgroundImage:
          "linear-gradient(180deg, oklch(0.20 0.04 250) 0%, oklch(0.16 0.05 255) 60%, oklch(0.13 0.04 255) 100%)",
      }}
    >
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-amber-400/15 p-4">
        <div
          className="grid size-14 place-items-center rounded-2xl text-slate-950 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          style={{ backgroundImage: "linear-gradient(135deg, oklch(0.82 0.14 80), oklch(0.68 0.16 70))" }}
        >
          <Icon className="size-7" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] uppercase tracking-wider text-amber-300/80">
            <span className="font-bold">{kindLabel}</span>
            {regionName && (<><span aria-hidden>·</span><span>{regionName}</span></>)}
            {eraText && (<><span aria-hidden>·</span><span>{eraText}</span></>)}
          </p>
          <h2 className="font-display text-xl font-bold leading-tight text-amber-50">{title}</h2>
          {subtitle && <p dir="ltr" className="mt-0.5 font-mono text-[12px] text-amber-200/70">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="إغلاق"
          className="rounded-full p-1 text-amber-200/80 hover:bg-amber-400/10">
          <X className="size-5" />
        </button>
      </header>

      {/* Action chips */}
      <div className="flex flex-wrap gap-2 border-b border-amber-400/10 px-4 py-2.5">
        {encyclopediaId ? (
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: encyclopediaId }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-1.5 text-[12px] font-bold text-slate-950 hover:from-amber-300 hover:to-amber-400 shadow"
          >
            <BookOpen className="size-3.5" /> {encyclopediaLabel}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-amber-100/80">
            <BookOpen className="size-3.5" /> المقالة قادمة قريباً
          </span>
        )}
        {onLocate && (
          <button
            onClick={onLocate}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-900/50 px-3 py-1.5 text-[12px] font-bold text-amber-100 hover:bg-slate-900/80"
          >
            <Compass className="size-3.5" /> تموقع على الخريطة
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {summary && (
          <div
            className="rounded-xl border border-amber-400/20 p-3.5 text-[13px] leading-relaxed text-amber-950 shadow-inner"
            style={{ backgroundImage: "linear-gradient(180deg, oklch(0.95 0.04 85), oklch(0.91 0.05 80))" }}
          >
            {summary}
          </div>
        )}
        {children}
      </div>
    </aside>
  );
}

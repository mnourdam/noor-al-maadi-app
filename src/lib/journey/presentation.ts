// ============================================================
// Journey Log — presentation helpers (P6 Step 4)
// ------------------------------------------------------------
// FROZEN CONTRACT: kind → (icon, label, muted description,
// deep-link href). All strings Arabic. Museum-archive tone —
// each entry is a milestone, not a post.
// ============================================================

import { BookOpen, Swords, Compass, Award, Library, Map } from "lucide-react";
import type { ComponentType } from "react";
import type { JourneyEvent, JourneyEventKind } from "./journey";

export interface JourneyPresentation {
  icon: ComponentType<{ className?: string }>;
  category: string;           // e.g. "قصة", "حملة"
  headline: string;           // e.g. "أتممتَ قصة"
  href: string;               // deep link (internal route)
  detail?: string;            // short muted subline (rewards, score, etc.)
}

const CATEGORY: Record<JourneyEventKind, string> = {
  story_completed: "قصة",
  campaign_completed: "حملة",
  investigation_completed: "تحقيق",
  achievement_earned: "إنجاز",
  encyclopedia_discovery: "اكتشاف موسوعي",
  museum_discovery: "قطعة متحفية",
};

const HEADLINE: Record<JourneyEventKind, string> = {
  story_completed: "أتممتَ قصة",
  campaign_completed: "أتممتَ حملة",
  investigation_completed: "أنهيتَ تحقيقًا",
  achievement_earned: "نلتَ إنجازًا",
  encyclopedia_discovery: "اكتشفتَ في الموسوعة",
  museum_discovery: "أُضيفت قطعة إلى متحفك",
};

const ICON: Record<JourneyEventKind, ComponentType<{ className?: string }>> = {
  story_completed: BookOpen,
  campaign_completed: Swords,
  investigation_completed: Compass,
  achievement_earned: Award,
  encyclopedia_discovery: Map,
  museum_discovery: Library,
};

function safeNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function formatRewardDetail(xp: number | null, dinars: number | null): string | undefined {
  const parts: string[] = [];
  if (xp && xp > 0) parts.push(`+${xp} خبرة`);
  if (dinars && dinars > 0) parts.push(`+${dinars} دينار`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Presentation for a single journey event.
 * Deep-link rules — safe fallbacks when a target route is not
 * addressable directly (e.g. an achievement).
 */
export function presentJourneyEvent(evt: JourneyEvent): JourneyPresentation {
  const category = CATEGORY[evt.kind];
  const headline = HEADLINE[evt.kind];
  const icon = ICON[evt.kind];

  let href = "/profile";
  let detail: string | undefined;

  switch (evt.kind) {
    case "story_completed":
      href = `/story/${encodeURIComponent(evt.subject_id)}`;
      detail = formatRewardDetail(
        safeNum(evt.metadata.reward_xp),
        safeNum(evt.metadata.reward_dinars),
      );
      break;
    case "campaign_completed":
      href = `/campaigns/imported/${encodeURIComponent(evt.subject_id)}`;
      break;
    case "investigation_completed": {
      href = `/adventure`;
      const score = safeNum(evt.metadata.score);
      const xp = safeNum(evt.metadata.xp_earned);
      const dinars = safeNum(evt.metadata.dinars_earned);
      const parts: string[] = [];
      if (score !== null) parts.push(`النتيجة ${score}`);
      const rw = formatRewardDetail(xp, dinars);
      if (rw) parts.push(rw);
      detail = parts.length > 0 ? parts.join(" · ") : undefined;
      break;
    }
    case "achievement_earned":
      href = `/profile?tab=achievements`;
      break;
    case "encyclopedia_discovery":
      href = `/encyclopedia/entity/${encodeURIComponent(evt.subject_id)}`;
      break;
    case "museum_discovery":
      href = `/collection`;
      break;
  }

  return { icon, category, headline, href, detail };
}

/**
 * Arabic long-form date, e.g. "٢٣ يوليو ٢٠٢٦ — ٩:٤٠ ص".
 * Museum-archive tone (no "ago" phrasing).
 */
export function formatJourneyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * "٢٣ يوليو ٢٠٢٦" — used as a per-day archive header when the
 * timeline groups events by their day.
 */
export function formatJourneyDayHeader(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Local YYYY-MM-DD key for grouping events into archive days.
 */
export function journeyDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function categoryLabelForKind(kind: JourneyEventKind): string {
  return CATEGORY[kind];
}

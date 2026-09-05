// ============================================================
// Presentation helpers for personal notifications.
// One place to translate (kind, payload, count) into Arabic copy
// and a deep link — so the inbox, the bell, and future surfaces
// never drift.
// ============================================================

import type { PersonalNotificationRow } from "./personal";

export interface RenderedNotification {
  title: string;
  body?: string;
  href: string; // Deep link to the source content.
  emoji: string;
}

type AnchorPayload = {
  anchor_type?: "story" | "entity";
  anchor_id?: string;
  anchor_title?: string;
  // Legacy story keys (kept for backward compatibility with older rows).
  story_id?: string;
  story_title?: string;
};

function anchorTitle(row: PersonalNotificationRow): string {
  const p = (row.payload ?? {}) as AnchorPayload;
  const t = p.anchor_title ?? p.story_title;
  return t && t.length > 0 ? t : "المحتوى";
}

function anchorLabel(row: PersonalNotificationRow): string {
  const p = (row.payload ?? {}) as AnchorPayload;
  return p.anchor_type === "entity" ? "مادّة موسوعية" : "قصة";
}

function commentHref(row: PersonalNotificationRow): string {
  const p = (row.payload ?? {}) as AnchorPayload;
  const id = p.anchor_id ?? p.story_id;
  if (!id) return "/inbox";
  if (p.anchor_type === "entity") return `/encyclopedia/entity/${id}`;
  return `/story/${id}`;
}

export function renderNotification(row: PersonalNotificationRow): RenderedNotification {
  const title = anchorTitle(row);
  const label = anchorLabel(row);
  const on = `على ${label}: ${title}`;
  const preview = (row.payload as { comment_preview?: string }).comment_preview ?? "";
  switch (row.kind) {
    case "story_reaction_on_comment": {
      const n = row.count;
      const t =
        n <= 1
          ? "استزاد قارئ من تأمّلك."
          : `استزاد ${n} قرّاء من تأمّلك.`;
      return {
        title: t,
        body: preview ? `«${preview}»` : on,
        href: commentHref(row),
        emoji: "📖",
      };
    }
    case "comment_promoted_editor_note":
      return {
        title: "أصبحت مساهمتك ملاحظة المحرّر.",
        body: on,
        href: commentHref(row),
        emoji: "✨",
      };
    case "comment_marked_contribution":
      return {
        title: "مساهمتك قيد المراجعة التحريرية.",
        body: `${on} — سنُعلمك حين تُطبَّق.`,
        href: commentHref(row),
        emoji: "🌱",
      };
    case "comment_contribution_applied": {
      const notice = (row.payload as { public_notice?: string }).public_notice;
      return {
        title: "ساهمت في تحسين إرث.",
        body: notice
          ? `طُبِّقت مساهمتك: «${notice}»`
          : `طُبِّقت مساهمتك ${on}.`,
        href: commentHref(row),
        emoji: "🌿",
      };
    }
    case "comment_hidden": {
      const reason = (row.payload as { reason?: string }).reason;
      return {
        title: "أُخفيت إحدى مساهماتك.",
        body: reason ? `السبب: ${reason}` : on,
        href: commentHref(row),
        emoji: "🔒",
      };
    }
    case "comment_reply": {
      // One notification per reply, batched by parent comment. The deep link
      // targets the PARENT so the thread opens around the player's own words.
      const n = row.count;
      const parentId = (row.payload as { comment_id?: string }).comment_id;
      const base = commentHref(row);
      return {
        title: n <= 1 ? "ردّ أحد القرّاء على تأمّلك." : `ردّ ${n} قرّاء على تأمّلك.`,
        body: preview ? `«${preview}»` : on,
        href: parentId && base !== "/inbox" ? `${base}?comment=${parentId}` : base,
        emoji: "💬",
      };
    }
    case "comment_restored":
      return {
        title: "أُعيد إظهار مساهمتك.",
        body: on,
        href: commentHref(row),
        emoji: "↩︎",
      };
    case "story_unlocked":
      return {
        title: `فُتحت قصة جديدة: ${title}.`,
        body: "أصبحت متاحة الآن للقراءة.",
        href: commentHref(row),
        emoji: "🗝️",
      };
    default:
      return { title: "إشعار جديد.", href: "/inbox", emoji: "•" };
  }
}

export function formatRelativeAr(iso: string): string {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "";
  const diff = Date.now() - d;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} د`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `منذ ${hr} س`;
  const day = Math.round(hr / 24);
  if (day < 30) return `منذ ${day} يوم`;
  try {
    return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

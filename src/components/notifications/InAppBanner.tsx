import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { resolveCategory } from "@/lib/notifications/categories";
import { type NotificationLike, type NotificationPayload } from "@/lib/notifications/deepLink";
import { resolveNotificationAction, openExternalUrl } from "@/lib/notifications/action";
import {
  markNotificationRead,
  recordDismissed,
  subscribeToMyNotifications,
  fetchMyNotifications,
  type ServerNotification,
} from "@/lib/notifications/server";

/**
 * Cinematic in-app notification banner.
 *
 * Shown for foreground arrivals only — push notifications that arrive
 * while the OS notification tray would have handled them. The banner
 * does NOT remove anything from the Notification Center; dismissing it
 * only suppresses the floating preview.
 *
 * Trigger surfaces:
 *  - Supabase realtime insert on notification_deliveries (FCM bridge)
 *  - Custom `irth:notifications:banner` window event (push handler,
 *    admin test send, etc.)
 */

export interface BannerInput extends NotificationLike {
  id: string;
  title: string;
  body: string;
  image_url?: string | null;
  icon?: string | null;
}

const AUTO_DISMISS_MS = 5000;

export function InAppBanner() {
  const router = useRouter();
  const [current, setCurrent] = useState<BannerInput | null>(null);
  const [leaving, setLeaving] = useState(false);
  const queueRef = useRef<BannerInput[]>([]);
  const timerRef = useRef<number | null>(null);
  const lastIdsRef = useRef<Set<string>>(new Set());

  const dequeue = () => {
    const next = queueRef.current.shift() ?? null;
    setLeaving(false);
    setCurrent(next);
    if (next) {
      clearTimer();
      timerRef.current = window.setTimeout(() => dismiss(false), AUTO_DISMISS_MS);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = (recordAnalytics: boolean) => {
    setLeaving(true);
    const dismissedId = current?.id ?? null;
    window.setTimeout(() => {
      if (dismissedId && recordAnalytics) {
        recordDismissed(dismissedId).catch(() => {});
      }
      dequeue();
    }, 250);
  };

  const enqueue = (b: BannerInput) => {
    if (!b || !b.id || lastIdsRef.current.has(b.id)) return;
    lastIdsRef.current.add(b.id);
    if (lastIdsRef.current.size > 200) {
      lastIdsRef.current = new Set(Array.from(lastIdsRef.current).slice(-100));
    }
    if (!current) {
      setCurrent(b);
      clearTimer();
      timerRef.current = window.setTimeout(() => dismiss(false), AUTO_DISMISS_MS);
    } else {
      queueRef.current.push(b);
    }
  };

  // 1. Manual events (push bridge, test sends).
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<BannerInput>).detail;
      if (data && data.id) enqueue(data);
    };
    window.addEventListener("irth:notifications:banner", handler);
    return () => window.removeEventListener("irth:notifications:banner", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // 2. Realtime deliveries.
  useEffect(() => {
    let lastSeen = new Date().toISOString();
    const unsub = subscribeToMyNotifications(async () => {
      const rows = await fetchMyNotifications(20);
      const fresh = rows.find(
        (r: ServerNotification) =>
          r.created_at > lastSeen && !r.read_at && !r.dismissed_at,
      );
      if (fresh) {
        lastSeen = fresh.created_at;
        enqueue({
          id: fresh.id,
          title: fresh.title,
          body: fresh.body,
          type: fresh.type,
          category: fresh.category,
          icon: fresh.icon,
          image_url: fresh.image_url,
          deep_link: fresh.deep_link,
          payload: fresh.payload as NotificationPayload,
        });
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!current) return null;

  const cat = resolveCategory(current.category ?? current.type);
  const Icon = cat.icon;

  const onTap = () => {
    clearTimer();
    void markNotificationRead(current.id);
    // V16: canonical action contract — external links open a browser,
    // unsafe/ambiguous actions fail closed and only dismiss the banner.
    const action = resolveNotificationAction(current);
    if (action.kind !== "internal") {
      setLeaving(true);
      const url = action.kind === "external" ? action.url : null;
      window.setTimeout(() => {
        dequeue();
        if (url) void openExternalUrl(url);
      }, 200);
      return;
    }
    const to = action.path;
    const [path, hashPart] = to.split("#");
    setLeaving(true);
    window.setTimeout(() => {
      dequeue();
      router.navigate({ to: (path || "/") as "/", hash: hashPart || undefined }).catch(() => {
        if (typeof window !== "undefined") window.location.href = to;
      });
    }, 200);
  };

  return (
    <div
      dir="rtl"
      data-irth-banner-slot="top"
      className="pointer-events-none fixed left-0 right-0 z-[60] flex justify-center px-3"
      style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        onClick={onTap}
        className={[
          "pointer-events-auto group relative w-full max-w-md overflow-hidden rounded-2xl",
          "border border-gold/40 bg-gradient-to-br from-background/95 via-background/90 to-background/95",
          "shadow-[0_20px_60px_-15px_rgba(212,175,55,0.45)] backdrop-blur-xl",
          "transition-all duration-300 ease-out",
          leaving ? "-translate-y-6 opacity-0" : "translate-y-0 opacity-100",
          "animate-in slide-in-from-top-2 fade-in",
        ].join(" ")}
        aria-label={current.title}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/80 to-transparent" />
        <div className="flex items-stretch gap-3 p-3 text-right">
          {current.image_url ? (
            <img
              src={current.image_url}
              alt=""
              className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-gold/30"
              loading="lazy"
            />
          ) : (
            <div className={`grid size-14 shrink-0 place-items-center rounded-xl ${cat.accentBg} ring-1 ring-white/10`}>
              <Icon className={`size-6 ${cat.accent}`} strokeWidth={1.6} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-display text-sm font-bold text-foreground">{current.title}</p>
              <span className={`shrink-0 text-[10px] uppercase tracking-wider ${cat.accent}`}>{cat.label}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{current.body}</p>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); dismiss(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                dismiss(true);
              }
            }}
            className="grid size-7 shrink-0 place-items-center self-start rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            aria-label="إخفاء"
          >
            <X className="size-3.5" />
          </span>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-right animate-[banner-bar_5s_linear_forwards] bg-gradient-to-r from-gold/80 via-amber-300/60 to-gold/80" />
      </button>
      <style>{`@keyframes banner-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </div>
  );
}

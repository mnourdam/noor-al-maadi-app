/**
 * LivePreview — renders an Android push card and an in-app banner card
 * side by side using the current composer state. Updates live so admins
 * can see exactly how the notification will look before sending.
 *
 * Pure presentation: no server calls, no side effects.
 */

import { Bell } from "lucide-react";
import { iconByName } from "@/lib/notifications/admin/icons";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategoryKey,
} from "@/lib/notifications/categories";

export interface LivePreviewProps {
  title: string;
  body: string;
  icon?: string;
  imageUrl?: string;
  category: NotificationCategoryKey;
  priority?: "low" | "normal" | "high";
}

export function LivePreview({
  title, body, icon, imageUrl, category, priority = "normal",
}: LivePreviewProps) {
  const cat = NOTIFICATION_CATEGORIES[category] ?? NOTIFICATION_CATEGORIES.system;
  const PickedIcon = iconByName(icon) ?? cat.icon ?? Bell;
  const t = title.trim() || "عنوان الإشعار";
  const b = body.trim() || "هنا يظهر محتوى الإشعار للمستخدم.";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          معاينة Android
        </h3>
        <div dir="rtl" className="rounded-xl border border-white/10 bg-[#1c1c1e] p-3 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
              <PickedIcon className="size-5 text-white/90" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <span className="font-semibold text-white/80">إرث</span>
                <span>•</span>
                <span>الآن</span>
                {priority === "high" && (
                  <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-200">عاجل</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold">{t}</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-white/80">{b}</p>
            </div>
          </div>
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="mt-3 h-32 w-full rounded-lg object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          معاينة داخل التطبيق
        </h3>
        <div dir="rtl" className="overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-background/60 to-background/40 p-3 shadow-md">
          <div className="flex items-start gap-3">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-gold/20"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className={`grid size-14 shrink-0 place-items-center rounded-xl ${cat.accentBg} ring-1 ring-white/10`}>
                <PickedIcon className={`size-5 ${cat.accent}`} strokeWidth={1.7} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{t}</p>
              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{b}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className={`inline-flex items-center gap-1 ${cat.accent}`}>
                  <cat.icon className="size-3" /> {cat.label}
                </span>
                <span>الآن</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

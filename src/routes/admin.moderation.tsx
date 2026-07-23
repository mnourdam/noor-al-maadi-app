// ============================================================
// /admin/moderation — Moderator Queue (P6 Step 5)
// ------------------------------------------------------------
// Admin-only. Reviews reported comments, takes actions, and
// exposes an immutable audit trail per comment.
// Actions: hide · restore · remove · dismiss report · pin/unpin.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EyeOff, RotateCcw, Trash2, X, BookMarked, History, Loader2, Pin, PinOff, Sprout } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  listModeratorQueue,
  listCommentReports,
  listModerationHistory,
  moderateComment,
  dismissReport,
  actionLabelAr,
  type QueueItem,
  type ReportRow,
  type AuditRow,
  type ReportStatus,
} from "@/lib/social/moderation";
import { REPORT_REASONS } from "@/lib/social/reports";
import {
  markContribution,
  contributionErrorCopyAr,
  CONTRIBUTION_CATEGORIES,
  type ContributionCategory,
} from "@/lib/social/contributions";

export const Route = createFileRoute("/admin/moderation")({
  component: () => (
    <AdminGate>
      <AdminLayout
        title="طابور الإشراف"
        subtitle="مراجعة البلاغات على مساهمات القرّاء"
        breadcrumbs={[{ label: "الإشراف" }]}
      >
        <ModerationPage />
      </AdminLayout>
    </AdminGate>
  ),
});

function reasonLabel(r: string): string {
  return REPORT_REASONS.find((x) => x.value === r)?.labelAr ?? r;
}

function formatAr(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ModerationPage() {
  const [status, setStatus] = useState<ReportStatus | "all">("open");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, ReportRow[]>>({});
  const [history, setHistory] = useState<Record<string, AuditRow[]>>({});
  const [markOpen, setMarkOpen] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const res = await listModeratorQueue(status, reset ? null : cursor, 30);
    setLoading(false);
    if (!("ok" in res) || !res.ok) {
      toast.error("تعذّر تحميل الطابور.");
      return;
    }
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.next_cursor);
  }, [status, cursor]);

  useEffect(() => { void load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function openDetail(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!reports[id]) {
      const r = await listCommentReports(id);
      if (r.ok) setReports((p) => ({ ...p, [id]: r.items }));
    }
    if (!history[id]) {
      const h = await listModerationHistory(id);
      if (h.ok) setHistory((p) => ({ ...p, [id]: h.items }));
    }
  }

  async function act(commentId: string, action: "hide" | "restore" | "remove" | "pin_note" | "unpin_note") {
    if (busyId) return;
    if (action === "remove" && !confirm("إزالة نهائية للمساهمة؟ لا يمكن التراجع.")) return;
    setBusyId(commentId);
    const res = await moderateComment(commentId, action);
    setBusyId(null);
    if (!res.ok) {
      const map: Record<string, string> = {
        pin_cap_reached: "لا يمكن تثبيت أكثر من ثلاث ملاحظات محرّر لهذه المرساة.",
        not_visible: "لا يمكن تثبيت مساهمة غير ظاهرة.",
      };
      toast.error(map[res.reason ?? ""] ?? "فشل الإجراء.");
      return;
    }
    toast.success("تم.");
    setItems((prev) => prev.map((it) =>
      it.comment_id === commentId
        ? {
            ...it,
            comment_status: action === "hide" ? "hidden" : action === "remove" ? "removed" : action === "restore" || action === "pin_note" ? "visible" : it.comment_status,
            editors_note: action === "pin_note" ? true : action === "unpin_note" || action === "hide" || action === "remove" ? false : it.editors_note,
          }
        : it,
    ));
    if (expanded === commentId) {
      const h = await listModerationHistory(commentId);
      if (h.ok) setHistory((p) => ({ ...p, [commentId]: h.items }));
    }
  }


  async function markAsContribution(commentId: string, category: ContributionCategory) {
    if (busyId) return;
    setBusyId(commentId);
    const res = await markContribution(commentId, category);
    setBusyId(null);
    setMarkOpen(null);
    if (!res.ok) { toast.error(contributionErrorCopyAr(res.reason)); return; }
    toast.success("عُلّمت كمساهمة تحريرية. أُدرجت في طابور التحرير.");
  }

  async function dismissOne(reportId: string, commentId: string) {
    if (busyId) return;
    setBusyId(reportId);
    const res = await dismissReport(reportId);
    setBusyId(null);
    if (!res.ok) { toast.error("فشل التجاهل."); return; }
    toast.success("تجاهل البلاغ.");
    const r = await listCommentReports(commentId);
    if (r.ok) setReports((p) => ({ ...p, [commentId]: r.items }));
    const h = await listModerationHistory(commentId);
    if (h.ok) setHistory((p) => ({ ...p, [commentId]: h.items }));
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "actioned", "dismissed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-[12px] ${status === s ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 text-foreground/70 hover:border-white/20"}`}
          >
            {s === "open" ? "مفتوحة" : s === "actioned" ? "بُتَّت" : s === "dismissed" ? "متجاهَلة" : "الكل"}
          </button>
        ))}
        <div className="ml-auto text-[11px] text-muted-foreground">
          {items.length} عنصر
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
          لا توجد بلاغات في هذه الحالة.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.comment_id} className="rounded-lg border border-white/10 bg-black/25">
              <div className="flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-foreground/80">
                      {it.report_count} بلاغ
                    </span>
                    <span>· {reasonLabel(it.top_reason)}</span>
                    <span>· {formatAr(it.last_report_at)}</span>
                    {it.comment_status && (
                      <span className={`rounded-full px-2 py-0.5 ${it.comment_status === "visible" ? "bg-emerald-500/10 text-emerald-300" : it.comment_status === "hidden" ? "bg-amber-500/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}>
                        {it.comment_status === "visible" ? "ظاهرة" : it.comment_status === "hidden" ? "مخفيّة" : it.comment_status === "removed" ? "مُزالة" : it.comment_status}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[13px] text-foreground/90">
                    {it.body_text || <span className="italic text-muted-foreground">(بدون نص)</span>}
                  </p>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {it.anchor_type}:{it.anchor_id?.slice(0, 8)}… · مؤلّف {it.author_id?.slice(0, 8)}…
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void act(it.comment_id, "hide")}
                    disabled={busyId === it.comment_id || it.comment_status === "hidden" || it.comment_status === "removed"}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    <EyeOff className="size-3" /> إخفاء
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(it.comment_id, "restore")}
                    disabled={busyId === it.comment_id || it.comment_status === "visible" || it.comment_status === "removed"}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    <RotateCcw className="size-3" /> استعادة
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(it.comment_id, "remove")}
                    disabled={busyId === it.comment_id || it.comment_status === "removed"}
                    className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                  >
                    <Trash2 className="size-3" /> إزالة
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(it.comment_id, it.editors_note ? "unpin_note" : "pin_note")}
                    disabled={busyId === it.comment_id || it.comment_status !== "visible"}
                    className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-[11px] text-gold hover:bg-gold/20 disabled:opacity-40"
                    aria-label={it.editors_note ? "إلغاء تثبيت ملاحظة المحرّر" : "تثبيت كملاحظة محرّر"}
                  >
                    {it.editors_note ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                    {it.editors_note ? "إلغاء التثبيت" : "ملاحظة محرّر"}
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMarkOpen((cur) => cur === it.comment_id ? null : it.comment_id)}
                      disabled={busyId === it.comment_id || it.comment_status !== "visible"}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                      aria-label="تعليم كمساهمة"
                    >
                      <Sprout className="size-3" /> مساهمة تحريرية
                    </button>
                    {markOpen === it.comment_id && (
                      <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-md border border-emerald-500/30 bg-black/95 p-1.5 shadow-xl" dir="rtl">
                        {CONTRIBUTION_CATEGORIES.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => void markAsContribution(it.comment_id, c.key)}
                            className="block w-full rounded px-2 py-1.5 text-right text-[11px] hover:bg-emerald-500/10"
                          >
                            <div className="font-medium text-foreground">{c.label}</div>
                            <div className="text-[10px] text-muted-foreground">{c.hint}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void openDetail(it.comment_id)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-foreground/80 hover:border-white/20"
                  >
                    <History className="size-3" /> {expanded === it.comment_id ? "إغلاق" : "تفاصيل"}
                  </button>
                </div>
              </div>



              {expanded === it.comment_id && (
                <div className="grid gap-3 border-t border-white/10 p-3 md:grid-cols-2">
                  <section>
                    <h3 className="mb-1 text-[11px] font-semibold text-muted-foreground">البلاغات</h3>
                    <ul className="space-y-1.5">
                      {(reports[it.comment_id] ?? []).map((r) => (
                        <li key={r.id} className="rounded-md border border-white/10 bg-black/30 p-2 text-[12px]">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{reasonLabel(r.reason)} · {formatAr(r.created_at)}</span>
                            <span className="rounded-full bg-white/5 px-1.5 py-0.5">{r.status === "open" ? "مفتوح" : r.status === "actioned" ? "بُتَّ" : "متجاهَل"}</span>
                          </div>
                          {r.note && <p className="mt-1 whitespace-pre-wrap text-foreground/85">{r.note}</p>}
                          {r.status === "open" && (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={() => void dismissOne(r.id, it.comment_id)}
                                disabled={busyId === r.id}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] hover:border-white/20 disabled:opacity-40"
                              >
                                <X className="size-3" /> تجاهل
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                      {(reports[it.comment_id] ?? []).length === 0 && (
                        <li className="text-[11px] text-muted-foreground">لا بلاغات مسجّلة.</li>
                      )}
                    </ul>
                  </section>
                  <section>
                    <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <BookMarked className="size-3" /> سجلّ الإشراف
                    </h3>
                    <ul className="space-y-1.5">
                      {(history[it.comment_id] ?? []).map((a) => (
                        <li key={a.id} className="rounded-md border border-white/10 bg-black/30 p-2 text-[12px]">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{actionLabelAr(a.action)}</span>
                            <span>{formatAr(a.created_at)}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {a.actor_email ?? a.actor_id?.slice(0, 8) ?? "—"}
                          </div>
                          {a.reason && <p className="mt-1 text-foreground/85">{a.reason}</p>}
                        </li>
                      ))}
                      {(history[it.comment_id] ?? []).length === 0 && (
                        <li className="text-[11px] text-muted-foreground">لا إجراءات سابقة.</li>
                      )}
                    </ul>
                  </section>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void load(false)}
            className="rounded-full border border-white/10 px-3 py-1 text-[12px] hover:border-white/20"
          >
            عرض المزيد
          </button>
        </div>
      )}
    </div>
  );
}

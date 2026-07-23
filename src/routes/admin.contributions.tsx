// ============================================================
// /admin/contributions — Editorial Queue (P6 Step 7)
// ------------------------------------------------------------
// Editorial workflow, never social. Categories: fact correction,
// added context, source reference, translation nuance, other.
// Apply requires an anonymous public notice (240 chars max).
// Archive is terminal. Applied is terminal. All actions audited.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sprout, Archive, CheckCircle2, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  listContributionQueue,
  applyContribution,
  archiveContribution,
  unmarkContribution,
  categoryLabelAr,
  contributionErrorCopyAr,
  type ContributionQueueItem,
  type ContributionStatus,
} from "@/lib/social/contributions";

export const Route = createFileRoute("/admin/contributions")({
  component: () => (
    <AdminGate>
      <AdminLayout
        title="طابور التحرير — «ساهمت في تحسين إرث»"
        subtitle="مراجعة المساهمات المُحسِّنة للمحتوى"
        breadcrumbs={[{ label: "التحرير" }]}
      >
        <ContributionsPage />
      </AdminLayout>
    </AdminGate>
  ),
});

const TABS: { key: ContributionStatus | "all"; label: string }[] = [
  { key: "proposed", label: "مقترحة" },
  { key: "applied",  label: "مُطبّقة" },
  { key: "archived", label: "مؤرشفة" },
  { key: "all",      label: "الكل" },
];

function anchorHref(item: ContributionQueueItem): string {
  if (item.anchor_type === "story") return `/story/${item.anchor_id}`;
  return "#";
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
  catch { return iso; }
}

function ContributionsPage() {
  const [tab, setTab] = useState<ContributionStatus | "all">("proposed");
  const [items, setItems] = useState<ContributionQueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [editorNote, setEditorNote] = useState<string>("");

  const load = useCallback(async (status: ContributionStatus | "all", nextCursor: string | null = null) => {
    setLoading(true);
    const res = await listContributionQueue(status, nextCursor, 30);
    if ("ok" in res && res.ok) {
      setItems((prev) => nextCursor ? [...prev, ...res.items] : res.items);
      setCursor(res.next_cursor);
    } else {
      toast.error(contributionErrorCopyAr((res as { reason?: string }).reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(tab, null);
  }, [tab, load]);

  async function onApply(item: ContributionQueueItem) {
    if (!notice.trim()) { toast.error("نص الإشعار الشفّاف مطلوب."); return; }
    setBusyId(item.comment_id);
    const res = await applyContribution(item.comment_id, notice.trim(), editorNote.trim() || null);
    setBusyId(null);
    if (!res.ok) { toast.error(contributionErrorCopyAr(res.reason)); return; }
    toast.success("طُبِّقت المساهمة. أُخطر المساهم.");
    setOpenId(null); setNotice(""); setEditorNote("");
    setItems((prev) => prev.filter((i) => i.comment_id !== item.comment_id));
  }

  async function onArchive(item: ContributionQueueItem) {
    if (!confirm("أرشفة هذه المساهمة؟ لن يُخطر صاحبها.")) return;
    setBusyId(item.comment_id);
    const res = await archiveContribution(item.comment_id, editorNote.trim() || null);
    setBusyId(null);
    if (!res.ok) { toast.error(contributionErrorCopyAr(res.reason)); return; }
    toast.success("أُرشفت المساهمة.");
    setOpenId(null); setNotice(""); setEditorNote("");
    setItems((prev) => prev.filter((i) => i.comment_id !== item.comment_id));
  }

  async function onUnmark(item: ContributionQueueItem) {
    if (!confirm("إلغاء تعليم هذه المساهمة؟")) return;
    setBusyId(item.comment_id);
    const res = await unmarkContribution(item.comment_id);
    setBusyId(null);
    if (!res.ok) { toast.error(contributionErrorCopyAr(res.reason)); return; }
    toast.success("أُلغي التعليم.");
    setItems((prev) => prev.filter((i) => i.comment_id !== item.comment_id));
  }

  return (
    <div className="space-y-4" dir="rtl">
      <nav role="tablist" className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5 text-[12px]">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 transition-colors ${active ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {loading && items.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-6 text-center text-sm text-muted-foreground">
          لا مساهمات في هذه الحالة.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const open = openId === it.comment_id;
            const busy = busyId === it.comment_id;
            return (
              <li key={it.comment_id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-gold">
                      <Sprout className="size-3" aria-hidden="true" />
                      {categoryLabelAr(it.category)}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5">{it.status}</span>
                    <a href={anchorHref(it)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-gold">
                      <ExternalLink className="size-3" /> {it.anchor_type}
                    </a>
                  </div>
                  <span>{fmt(it.updated_at)}</span>
                </header>
                <p className="whitespace-pre-wrap break-words text-[13px] text-foreground/90">
                  {it.body_text || <em className="text-muted-foreground">(مساهمة محذوفة)</em>}
                </p>

                {it.status === "applied" && it.public_notice_text && (
                  <p className="mt-2 rounded-md border border-gold/20 bg-gold/[0.04] p-2 text-[12px] text-foreground/85">
                    <span className="text-gold">الإشعار الشفّاف:</span> {it.public_notice_text}
                  </p>
                )}
                {it.editor_note && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ملاحظة المحرّر: {it.editor_note}
                  </p>
                )}

                {it.status === "proposed" && (
                  <div className="mt-3 space-y-2">
                    {open ? (
                      <div className="space-y-2 rounded-md border border-white/10 bg-black/30 p-2">
                        <label className="block text-[11px] text-muted-foreground">
                          الإشعار الشفّاف (مجهول الهوية — يظهر للقراء)
                        </label>
                        <textarea
                          value={notice}
                          onChange={(e) => setNotice(e.target.value.slice(0, 240))}
                          rows={2}
                          maxLength={240}
                          className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-foreground"
                          placeholder="مثال: صُحّح تاريخ الفتح الأندلسي بناءً على إسهام قارئ."
                        />
                        <label className="block text-[11px] text-muted-foreground">
                          ملاحظة تحريرية داخلية (اختيارية)
                        </label>
                        <textarea
                          value={editorNote}
                          onChange={(e) => setEditorNote(e.target.value.slice(0, 500))}
                          rows={2}
                          className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-foreground"
                        />
                        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => { setOpenId(null); setNotice(""); setEditorNote(""); }}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground"
                          >
                            إغلاق
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onArchive(it)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            <Archive className="size-3" /> أرشفة
                          </button>
                          <button
                            type="button"
                            disabled={busy || !notice.trim()}
                            onClick={() => void onApply(it)}
                            className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 disabled:opacity-50"
                          >
                            <CheckCircle2 className="size-3" /> تطبيق
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onUnmark(it)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Undo2 className="size-3" /> إلغاء التعليم
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenId(it.comment_id); setNotice(""); setEditorNote(""); }}
                          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 font-medium text-gold hover:bg-gold/20"
                        >
                          مراجعة تحريرية
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {cursor && (
            <li className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void load(tab, cursor)}
                className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-foreground/80 hover:border-gold/40 hover:text-gold"
              >
                عرض المزيد
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, AlertTriangle, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { ModalPortal } from "@/components/ModalPortal";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalPlayerProgress } from "@/lib/resetProgress";
import { resetForIdentityChange } from "@/lib/identity/reset";
import { deleteMyAccount, DELETE_ACCOUNT_CONFIRM_PHRASE } from "@/lib/deleteAccount.functions";

const DELETED_ITEMS = [
  "الحساب وبيانات الدخول",
  "الملف الشخصي (الاسم، النبذة، الشعار)",
  "التقدم في الحملات والقصص والتحقيقات",
  "الخبرة (XP) والمستوى",
  "الإنجازات والألقاب",
  "الاكتشافات ومقتنيات المتحف",
  "الدنانير والقلوب والستريك",
  "رموز الأجهزة (Device tokens) والإشعارات",
  "الانعكاسات والملاحظات الشخصية",
  "رسائل الدعم والمساهمات المرتبطة بحسابك",
];

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const runDelete = useServerFn(deleteMyAccount);

  const canDelete = phrase.trim() === DELETE_ACCOUNT_CONFIRM_PHRASE && !busy;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    try {
      await runDelete({ data: { confirm: phrase.trim() } });
      try { await supabase.auth.signOut(); } catch { /* account already gone */ }
      clearLocalPlayerProgress();
      try { await resetForIdentityChange({ nextUserId: null, reason: "account-deleted" }); } catch { /* ignore */ }
      toast.success("تم حذف حسابك نهائيًا");
      if (typeof window !== "undefined") window.location.assign("/");
    } catch (err) {
      console.error("[account] delete failed", err);
      toast.error("تعذّر حذف الحساب. حاول مجددًا أو راسل الدعم.");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-rose-500/25 bg-rose-500/[0.04] p-4">
        <div className="mb-3 inline-flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-rose-500/15 text-rose-300">
            <AlertTriangle className="size-3.5" />
          </div>
          <p className="font-display text-sm font-bold text-rose-200">منطقة الخطر</p>
        </div>
        <button
          type="button"
          onClick={() => { setPhrase(""); setOpen(true); }}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-500/25 bg-background/40 p-3 text-right hover:border-rose-400/50"
        >
          <div className="grid size-9 place-items-center rounded-xl bg-rose-500/15 text-rose-300"><Trash2 className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-rose-200">حذف الحساب نهائيًا</p>
            <p className="text-[11px] text-muted-foreground">حذف دائم لحسابك وكل بياناتك، بدون إمكانية استرجاع.</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>
        <Link to="/account-deletion" className="mt-2 block text-center text-[11px] text-muted-foreground underline decoration-dotted">
          تفاصيل سياسة حذف الحساب
        </Link>
      </section>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog" aria-modal="true"
            onClick={() => !busy && setOpen(false)}
          >
            <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-rose-500/30 bg-surface p-5 shadow-elegant">
              <h3 className="font-display text-lg font-bold text-rose-300">حذف الحساب نهائيًا</h3>
              <p className="mt-2 text-sm leading-7 text-foreground/85">
                هذا الإجراء <strong>دائم وغير قابل للاسترجاع</strong>. لا يمكن استعادة الحساب أو أي من بياناتك بعد التنفيذ.
              </p>

              <div className="mt-3 rounded-2xl border border-white/10 bg-background/40 p-3">
                <p className="mb-2 text-[11px] font-bold text-gold">سيتم حذف:</p>
                <ul className="list-disc space-y-1 pr-5 text-[12px] leading-6 text-foreground/85">
                  {DELETED_ITEMS.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>

              <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
                لا يشمل الحذف المحتوى العام الذي لا تملكه وحدك (القصص والحملات والمحتوى المنشور)؛ تُزال فقط أي صلة بينه وبين حسابك.
              </p>

              <label className="mt-4 block text-[12px] text-foreground/85">
                للتأكيد، اكتب: <strong className="text-rose-300">{DELETE_ACCOUNT_CONFIRM_PHRASE}</strong>
              </label>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                disabled={busy}
                dir="rtl"
                placeholder={DELETE_ACCOUNT_CONFIRM_PHRASE}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-background/60 px-3 py-2 text-sm outline-none focus:border-rose-400/60"
                aria-label="عبارة تأكيد الحذف"
              />

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button disabled={busy} onClick={() => setOpen(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 disabled:opacity-50">إلغاء</button>
                <button
                  disabled={!canDelete}
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-l from-rose-600 to-rose-500 px-4 py-2 text-sm font-bold text-white shadow-elegant disabled:opacity-40"
                >
                  <Trash2 className="size-4" /> {busy ? "جارٍ الحذف…" : "حذف حسابي نهائيًا"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

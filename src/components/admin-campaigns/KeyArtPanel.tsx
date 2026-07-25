// ============================================================
// KeyArtPanel — admin control for a campaign's Key Art.
// ------------------------------------------------------------
// Sits inside the Meta tab of the campaign editor. Speaks
// exclusively to `src/lib/campaign-key-art.ts`:
//   Upload / Replace / Delete + Credit / Source.
//
// Preview uses <CampaignKeyArt />, so what admins see is exactly
// what players will see on every surface — no separate preview
// pipeline can drift from the runtime resolver.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Trash2, UploadCloud, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadCampaignKeyArt,
  deleteCampaignKeyArt,
  updateCampaignKeyArtMeta,
  type CampaignKeyArtFields,
} from "@/lib/campaign-key-art";
import { CampaignKeyArt } from "@/components/CampaignKeyArt";

interface Props {
  campaignId: string;
  title: string;
  onNotify: (kind: "ok" | "err", msg: string) => void;
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none";
const labelCls = "block text-[11px] font-semibold text-amber-300/80 mb-1";

export function KeyArtPanel({ campaignId, title, onNotify }: Props) {
  const [row, setRow] = useState<CampaignKeyArtFields | null>(null);
  const [credit, setCredit] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState<"idle" | "loading" | "uploading" | "deleting" | "saving">("loading");

  const refresh = async () => {
    setBusy("loading");
    const { data, error } = await supabase
      .from("admin_campaigns")
      .select("key_art_path, key_art_square_path, key_art_credit, key_art_source")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) {
      onNotify("err", `تعذر جلب بيانات صورة الحملة. (${error.message})`);
      setBusy("idle");
      return;
    }
    const r = (data ?? { key_art_path: null, key_art_square_path: null, key_art_credit: null, key_art_source: null }) as CampaignKeyArtFields;
    setRow(r);
    setCredit(r.key_art_credit ?? "");
    setSource(r.key_art_source ?? "");
    setBusy("idle");
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId]);

  const onPick = async (file: File | null) => {
    if (!file || !row) return;
    setBusy("uploading");
    try {
      const { fields } = await uploadCampaignKeyArt({
        campaignId,
        file,
        credit,
        source,
        previousPath: row.key_art_path,
        previousSquarePath: row.key_art_square_path,
      });
      setRow(fields);
      onNotify("ok", "تم رفع الصورة الفنية.");
    } catch (err) {
      onNotify("err", err instanceof Error ? err.message : "فشل الرفع.");
    } finally {
      setBusy("idle");
    }
  };

  const onDelete = async () => {
    if (!row?.key_art_path && !row?.key_art_square_path) return;
    if (!confirm("حذف الصورة الفنية للحملة؟ سترجع الحملة إلى تصميمها الحالي.")) return;
    setBusy("deleting");
    try {
      await deleteCampaignKeyArt(campaignId, row?.key_art_path ?? null, row?.key_art_square_path ?? null);
      await refresh();
      onNotify("ok", "تم حذف الصورة.");
    } catch (err) {
      onNotify("err", err instanceof Error ? err.message : "فشل الحذف.");
    } finally {
      setBusy("idle");
    }
  };

  const saveMeta = async () => {
    setBusy("saving");
    try {
      await updateCampaignKeyArtMeta(campaignId, credit, source);
      onNotify("ok", "تم حفظ بيانات الإسناد.");
      await refresh();
    } catch (err) {
      onNotify("err", err instanceof Error ? err.message : "فشل الحفظ.");
    } finally {
      setBusy("idle");
    }
  };

  const hasImage = !!(row?.key_art_path || row?.key_art_square_path);
  const disabled = busy !== "idle";

  return (
    <div className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-100">الصورة الفنية للحملة (Key Art)</h3>
        <span className="text-[10px] text-slate-500">اختيارية — بدونها تظهر الحملة بتصميمها الحالي.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CampaignKeyArt
          campaign={row}
          aspect="hero"
          alt={title}
          className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-slate-700 bg-slate-950"
          fallback={
            <div className="grid h-full w-full place-items-center text-center text-xs text-slate-500">
              <div>
                <ImagePlus className="mx-auto mb-1 h-6 w-6" />
                لا توجد صورة — الحملة تعرض تصميمها الحالي.
              </div>
            </div>
          }
        />
        <CampaignKeyArt
          campaign={row}
          aspect="square"
          alt={title}
          className="relative aspect-square w-full overflow-hidden rounded-md border border-slate-700 bg-slate-950"
          fallback={
            <div className="grid h-full w-full place-items-center text-[10px] text-slate-500">
              نسخة مربّعة (تُشتق تلقائيًا)
            </div>
          }
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-bold ${disabled ? "cursor-not-allowed opacity-50 border-slate-700 text-slate-400" : "border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"}`}>
          {busy === "uploading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
          {hasImage ? "استبدال الصورة" : "رفع الصورة"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => { const f = e.target.files?.[0] ?? null; e.currentTarget.value = ""; void onPick(f); }}
          />
        </label>
        {hasImage && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
          >
            {busy === "deleting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            حذف
          </button>
        )}
        <span className="text-[10px] text-slate-500">
          الأنسب: 2048×1152 (16:9). سيتم اشتقاق نسخة مربّعة تلقائيًا.
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>إسناد (Credit)</label>
          <input value={credit} onChange={(e) => setCredit(e.target.value)} className={inputCls} placeholder="اسم الفنان / الاستوديو" />
        </div>
        <div>
          <label className={labelCls}>المصدر (Source)</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} placeholder="مرجع أو رابط" />
        </div>
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={saveMeta}
            disabled={disabled || !hasImage}
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            حفظ الإسناد والمصدر
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable admin image uploader for any encyclopedia entity type.
 *
 * Handles the full pipeline:
 *   pick file → sniff MIME → process (resize + WebP + compress) → upload
 *   → persist image_url/path/credit/source → best-effort cleanup of the
 *   previous file.
 *
 * Renders nothing about the image on the public side — that's owned by
 * `SafeHeroImage` on the entity page. This component only shows a small
 * preview inside the admin form.
 */
import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload, ReplaceAll } from "lucide-react";
import {
  deleteEntityImage,
  updateEntityImageMeta,
  uploadEntityImage,
  type EntityImageFields,
} from "@/lib/encyclopedia-images";
import { formatBytes, ImageProcessingError } from "@/lib/image-processor";

export interface EncyclopediaEntityImageUploaderProps {
  entityId: string;
  entityType: string;
  entityTitle: string;
  initial: EntityImageFields;
  /** Called after any change (upload / delete / meta edit) with the new
   *  persisted fields so the parent can refresh its cached row. */
  onChange?: (next: EntityImageFields) => void;
  /** Hidden when the entity doesn't yet exist (uploader requires an id). */
  disabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";

export function EncyclopediaEntityImageUploader({
  entityId,
  entityType,
  entityTitle,
  initial,
  onChange,
  disabled,
}: EncyclopediaEntityImageUploaderProps) {
  const [fields, setFields] = useState<EntityImageFields>(initial);
  const [busy, setBusy] = useState<"idle" | "processing" | "compressing" | "uploading" | "deleting">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [credit, setCredit] = useState(initial.image_credit ?? "");
  const [source, setSource] = useState(initial.image_source ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (next: EntityImageFields) => {
    setFields(next);
    setCredit(next.image_credit ?? "");
    setSource(next.image_source ?? "");
    onChange?.(next);
  };

  const handlePicked = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    setInfo(null);
    setProgress(0);
    try {
      // Hard cap on the raw source so we never sit decoding a 100 MB TIFF.
      if (file.size > 25 * 1024 * 1024) {
        throw new ImageProcessingError("too_large", "حجم الملف كبير جدًا للمعالجة (الحد ٢٥ ميغابايت).");
      }
      setBusy("processing");
      const result = await uploadEntityImage({
        entityId,
        entityType,
        file,
        credit,
        source,
        previousPath: fields.image_path,
        processing: {
          onProgress: (r) => {
            setProgress(r);
            if (r < 0.15) setBusy("processing");
            else if (r < 0.9) setBusy("compressing");
            else setBusy("uploading");
          },
        },
      });
      commit(result.fields);
      setInfo(
        `تم حفظ الصورة بنجاح (${formatBytes(result.processed.bytes)} · ${result.processed.width}×${result.processed.height})`
          + (result.processed.degraded ? " — تعذر الوصول إلى الحد المستهدف بجودة أعلى." : ""),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر رفع الصورة. لم يتم تغيير الصورة الحالية.";
      setError(msg);
    } finally {
      setBusy("idle");
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!fields.image_url && !fields.image_path) return;
    if (!window.confirm("سيتم حذف صورة هذا الكيان نهائيًا. المتابعة؟")) return;
    setError(null); setInfo(null);
    setBusy("deleting");
    try {
      await deleteEntityImage(entityId, fields.image_path);
      commit({ image_url: null, image_path: null, image_credit: null, image_source: null });
      setInfo("تم حذف الصورة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حذف الصورة.");
    } finally {
      setBusy("idle");
    }
  };

  const handleSaveMeta = async () => {
    setError(null); setInfo(null);
    try {
      await updateEntityImageMeta(entityId, credit, source);
      commit({ ...fields, image_credit: credit.trim() || null, image_source: source.trim() || null });
      setInfo("تم حفظ حقوق/مصدر الصورة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ بيانات الصورة.");
    }
  };

  const isBusy = busy !== "idle";
  const statusLabel: Record<typeof busy, string> = {
    idle: "",
    processing: "جارِ معالجة الصورة…",
    compressing: "جارِ ضغط الصورة وتحويلها إلى WebP…",
    uploading: "جارِ رفع الصورة…",
    deleting: "جارِ حذف الصورة…",
  };

  return (
    <fieldset
      dir="rtl"
      className="rounded-lg border border-amber-500/20 bg-slate-900/40 p-3 text-slate-100"
      aria-busy={isBusy}
    >
      <legend className="px-2 text-xs font-bold text-amber-200">صورة الكيان</legend>
      {disabled ? (
        <p className="text-[11px] text-slate-400">احفظ الكيان أولًا لتتمكن من رفع صورة له.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
              {fields.image_url ? (
                <img
                  src={fields.image_url}
                  alt={`صورة مرتبطة بـ ${entityTitle}`}
                  className="size-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="grid size-full place-items-center text-slate-500">
                  <ImageIcon className="size-6" aria-hidden />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
              >
                {fields.image_url ? <ReplaceAll className="size-3.5" /> : <Upload className="size-3.5" />}
                {fields.image_url ? "استبدال الصورة" : "رفع صورة"}
              </button>
              {fields.image_url && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  حذف الصورة
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handlePicked(e.target.files?.[0])}
              />
              {!fields.image_url && (
                <span className="text-[11px] text-slate-400">لا توجد صورة مرفقة.</span>
              )}
            </div>
          </div>

          {isBusy && (
            <div className="flex items-center gap-2 text-[11px] text-amber-200">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>{statusLabel[busy]}</span>
              {progress > 0 && (
                <div className="ms-auto h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-[width]"
                    style={{ width: `${Math.min(100, Math.max(4, progress * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] text-slate-300">
              <span className="mb-1 block">حقوق الصورة</span>
              <input
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                disabled={isBusy}
                placeholder="اختياري"
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-[11px] text-slate-300">
              <span className="mb-1 block">مصدر الصورة</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isBusy}
                placeholder="اختياري (رابط أو مرجع)"
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
              />
            </label>
          </div>
          {fields.image_url && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isBusy || (credit === (fields.image_credit ?? "") && source === (fields.image_source ?? ""))}
                onClick={handleSaveMeta}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-amber-400/40 disabled:opacity-50"
              >
                حفظ الحقوق والمصدر
              </button>
            </div>
          )}

          {info && <p className="text-[11px] text-emerald-300">{info}</p>}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>
      )}
    </fieldset>
  );
}

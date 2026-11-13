import { supabase } from "@/integrations/supabase/client";
import { getActiveOwner, getIdentityEpoch, getActiveUserId } from "@/lib/identity/owner";

export const FEEDBACK_IMAGE_LIMIT = 2 * 1024 * 1024;
export const FEEDBACK_IMAGE_COUNT = 3;
export const feedbackImagesEnabled = import.meta.env.VITE_FEEDBACK_IMAGES_ENABLED === "true";
const bucket = "feedback-images";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const pathPattern = new RegExp(`^${uuid}/${uuid}/${uuid}$`, "i");
export type FeedbackImage = { id: string; path: string; mime: string; bytes: number };
export type PreparedImage = { id: string; blob: Blob; uploaded: boolean };
export type ImageMessageDraft = {
  id: string;
  body: string;
  issueId: string;
  internal: boolean;
  images: PreparedImage[];
  owner: string;
  epoch: number;
};
export function currentImageScope() {
  return `${getActiveOwner()}:${getIdentityEpoch()}`;
}
export function parseFeedbackImage(value: unknown): FeedbackImage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as FeedbackImage;
  if (
    typeof v.path !== "string" ||
    !pathPattern.test(v.path) ||
    v.id !== v.path.split("/")[2] ||
    !["image/jpeg", "image/png", "image/webp"].includes(v.mime) ||
    !Number.isInteger(v.bytes) ||
    v.bytes < 1 ||
    v.bytes > FEEDBACK_IMAGE_LIMIT
  )
    return null;
  return { id: v.id, path: v.path, mime: v.mime, bytes: v.bytes };
}
export async function validateImageFile(file: Blob): Promise<void> {
  if (file.size < 1 || file.size > FEEDBACK_IMAGE_LIMIT)
    throw new Error("حجم الصورة يجب ألا يتجاوز 2 ميغابايت");
  const h = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = h[0] === 255 && h[1] === 216 && h[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => h[i] === b);
  const webp =
    String.fromCharCode(...h.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...h.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/png" && png) ||
    (file.type === "image/webp" && webp)
  ))
    throw new Error("اختر صورة JPEG أو PNG أو WebP صالحة");
}
/** Decode then re-encode: strips metadata, rejects malformed images, bounds dimensions. */
export async function prepareFeedbackImage(file: File): Promise<PreparedImage> {
  await validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 24_000_000
    )
      throw new Error("أبعاد الصورة كبيرة جداً");
    const ratio = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر تجهيز الصورة");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("تعذر تجهيز الصورة"))),
        "image/jpeg",
        0.85,
      ),
    );
    await validateImageFile(blob);
    return { id: crypto.randomUUID(), blob, uploaded: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function makeImageDraft(
  issueId: string,
  body: string,
  internal: boolean,
  images: PreparedImage[],
): ImageMessageDraft {
  return {
    id: crypto.randomUUID(),
    issueId,
    body: body.trim(),
    internal,
    images: [...images],
    owner: getActiveOwner(),
    epoch: getIdentityEpoch(),
  };
}
async function assertScope(
  d: Pick<ImageMessageDraft, "owner" | "epoch">,
  valid: () => boolean = () => true,
) {
  if (!valid()) throw new Error("تم إغلاق المحادثة");
  if (d.owner !== getActiveOwner() || d.epoch !== getIdentityEpoch() || !getActiveUserId())
    throw new Error("تغيّر الحساب؛ أعد فتح المحادثة");
  const { data, error } = await supabase.auth.getSession();
  if (
    !valid() ||
    error ||
    data.session?.user.id !== getActiveUserId() ||
    d.owner !== getActiveOwner() ||
    d.epoch !== getIdentityEpoch()
  )
    throw new Error("تغيّر الحساب؛ أعد فتح المحادثة");
}
export async function sendFeedbackImages(
  d: ImageMessageDraft,
  valid: () => boolean = () => true,
): Promise<void> {
  if (!d.images.length || d.images.length > FEEDBACK_IMAGE_COUNT || d.body.length > 5000)
    throw new Error("رسالة غير صالحة");
  await assertScope(d, valid);
  for (const image of d.images) {
    if (image.uploaded) continue;
    await validateImageFile(image.blob);
    await assertScope(d, valid);
    const { data: path, error } = await supabase.rpc(
      "reserve_feedback_image" as never,
      {
        p_id: image.id,
        p_issue_id: d.issueId,
        p_internal: d.internal,
        p_mime: image.blob.type,
        p_bytes: image.blob.size,
      } as never,
    );
    if (error) throw error;
    if (typeof path !== "string" || path !== `${getActiveUserId()}/${d.issueId}/${image.id}`)
      throw new Error("مسار رفع غير صالح");
    await assertScope(d, valid);
    const upload = await supabase.storage
      .from(bucket)
      .upload(path, image.blob, { contentType: image.blob.type, upsert: false });
    // An uncertain previous attempt may have created this immutable reserved object.
    // Final RPC checks exact ownership, scope and stored metadata before attaching.
    if (upload.error && String(upload.error.statusCode) !== "409") throw upload.error;
    await assertScope(d, valid);
    image.uploaded = true;
  }
  await assertScope(d, valid);
  const { data, error } = await supabase.rpc(
    "reply_with_feedback_images" as never,
    {
      p_message_id: d.id,
      p_issue_id: d.issueId,
      p_body: d.body,
      p_internal: d.internal,
      p_image_ids: d.images.map((i) => i.id),
    } as never,
  );
  if (error) throw error;
  await assertScope(d, valid);
  if (data !== d.id) throw new Error("لم يتأكد إرسال الرسالة؛ أعد المحاولة بنفس المرفقات");
}
export async function downloadFeedbackImage(image: FeedbackImage): Promise<Blob> {
  if (!parseFeedbackImage(image)) throw new Error("مرفق غير صالح");
  const scope = { owner: getActiveOwner(), epoch: getIdentityEpoch() };
  await assertScope(scope);
  const { data, error } = await supabase.storage.from(bucket).download(image.path);
  if (error || !data) throw error ?? new Error("تعذر تحميل الصورة");
  await assertScope(scope);
  if (data.type !== image.mime || data.size !== image.bytes)
    throw new Error("بيانات المرفق غير متطابقة");
  await validateImageFile(data);
  await assertScope(scope);
  return data;
}

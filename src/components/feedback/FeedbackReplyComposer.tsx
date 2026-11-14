import { useEffect, useRef, useState } from "react";
import { replyToIssue } from "@/lib/feedback/api";
import {
  currentImageScope,
  feedbackImagesEnabled,
  FEEDBACK_IMAGE_COUNT,
  makeImageDraft,
  prepareFeedbackImage,
  sendFeedbackImages,
  type ImageMessageDraft,
  type PreparedImage,
} from "@/lib/feedback/images";
import {onOwnerChange} from '@/lib/identity/owner';
import {sendCanonicalFeedbackImage,CanonicalImagePending} from '@/lib/feedback/canonical-send';
/** Mount keyed by identity and thread. An uncertain image send keeps the same immutable retry ID. */
function Composer({
  issueId,
  staff = false,
  onSent,
  onTyping,
  imageProtocol = "legacy",
}: {
  issueId: string;
  imageProtocol?: "legacy" | "canonical-v1";
  staff?: boolean;
  onSent: () => void | Promise<void>;
  onTyping?: () => void;
}) {
  const [body, setBody] = useState(""),
    [internal, setInternal] = useState(false),
    [images, setImages] = useState<PreparedImage[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    draft = useRef<ImageMessageDraft | null>(null),
    origin = useRef(currentImageScope());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const alive = () => mounted.current && origin.current === currentImageScope();
  const canonical = imageProtocol === "canonical-v1";
  const imageLimit = canonical ? 1 : FEEDBACK_IMAGE_COUNT;
  async function pick(files: FileList | null) {
    if (!files || lock.current || draft.current || !["legacy", "canonical-v1"].includes(imageProtocol)) return;
    if (files.length + images.length > imageLimit) {
      setError(canonical ? "يمكن إرفاق صورة واحدة في هذا المسار" : "يمكن إرفاق 3 صور كحد أقصى");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const prepared: PreparedImage[] = [];
      for (const file of Array.from(files)) prepared.push(await prepareFeedbackImage(file));
      if (alive()) setImages((old) => [...old, ...prepared]);
    } catch (e) {
      if (alive()) setError(e instanceof Error ? e.message : "تعذر تجهيز الصور");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function send() {
    if (lock.current || !alive() || (!body.trim() && !images.length)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (images.length) {
        draft.current ??= makeImageDraft(issueId, body, internal, images);
        if (canonical) {
          await sendCanonicalFeedbackImage(draft.current, alive);
        } else if (imageProtocol === "legacy") await sendFeedbackImages(draft.current, alive);
        else throw new Error("Unknown attachment protocol");
      } else await replyToIssue(issueId, body.trim(), internal);
      if (!alive()) return;
      draft.current = null;
      setBody("");
      setImages([]);
      try {
        await onSent();
      } catch {
        if (alive()) setError("تم إرسال الرسالة؛ تعذر تحديث المحادثة الآن");
      }
    } catch (e) {
      if (alive())
        setError(
          e instanceof CanonicalImagePending
            ? "الصورة قيد المعالجة الآمنة؛ أعد المحاولة بنفس الرسالة."
            : images.length
            ? "لم يتأكد إرسال الصورة. أعد المحاولة بنفس الرسالة لتجنب التكرار."
            : e instanceof Error
              ? e.message
              : "تعذر الإرسال",
        );
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="rounded-xl border border-white/10 p-3"
    >
      <textarea
        aria-label="نص الرد"
        value={body}
        disabled={busy || !!draft.current}
        onChange={(e) => {
          setBody(e.target.value);
          onTyping?.();
        }}
        maxLength={5000}
        rows={3}
        placeholder="اكتب ردك…"
        className="w-full rounded-lg border border-white/10 bg-background/60 p-3 text-sm"
      />
      {feedbackImagesEnabled && ["legacy", "canonical-v1"].includes(imageProtocol) && (
        <label className="my-2 block text-xs">
          {canonical ? "إرفاق صورة واحدة (2 ميغابايت)" : "إرفاق صور (حتى 3 صور، 2 ميغابايت للصورة)"}
          <input
            aria-label="إرفاق صور بالمحادثة"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={!canonical}
            disabled={busy || !!draft.current}
            onChange={(e) => {
              void pick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <ul>
        {images.map((image, i) => (
          <li key={image.id} className="text-xs">
            صورة {i + 1} · {Math.ceil(image.blob.size / 1024)} كيلوبايت{" "}
            <button
              type="button"
              disabled={busy || !!draft.current}
              onClick={() => setImages(images.filter((x) => x.id !== image.id))}
              aria-label={`إزالة الصورة ${i + 1}`}
            >
              إزالة
            </button>
          </li>
        ))}
      </ul>
      {staff && (
        <label className="block text-xs">
          <input
            type="checkbox"
            checked={internal}
            disabled={busy || !!draft.current}
            onChange={(e) => setInternal(e.target.checked)}
          />{" "}
          ملاحظة داخلية (لا يراها اللاعب)
        </label>
      )}
      {error && (
        <p role="alert" className="my-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || (!body.trim() && !images.length)}
        className="mt-2 rounded bg-gold px-3 py-2 text-sm text-slate-950"
      >
        {busy ? "جاري الإرسال…" : draft.current ? "إعادة محاولة الإرسال" : "إرسال الرد"}
      </button>
    </form>
  );
}

export function FeedbackReplyComposer(props: Parameters<typeof Composer>[0]) {
 const [scope,setScope]=useState(currentImageScope);
 useEffect(()=>onOwnerChange(()=>setScope(currentImageScope())),[]);
 return <Composer key={`${scope}:${props.issueId}:${props.imageProtocol ?? 'legacy'}:${!!props.staff}`} {...props}/>;
}

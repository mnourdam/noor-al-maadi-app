import { useEffect, useRef, useState } from "react";
import {
  currentImageScope,
  downloadFeedbackImage,
  parseFeedbackImage,
} from "@/lib/feedback/images";
import { onOwnerChange } from "@/lib/identity/owner";
export function FeedbackImages({ attachments }: { attachments: unknown[] }) {
  const [scope, setScope] = useState(currentImageScope);
  useEffect(() => onOwnerChange(() => setScope(currentImageScope())), []);
  return (
    <div className="mt-2 space-y-2">
      {(Array.isArray(attachments) ? attachments : [])
        .slice(0, 3)
        .map(parseFeedbackImage)
        .filter((x) => x !== null)
        .map((image) => (
          <PrivateImage key={`${scope}:${image.id}`} image={image} />
        ))}
    </div>
  );
}
function PrivateImage({ image }: { image: NonNullable<ReturnType<typeof parseFeedbackImage>> }) {
  const [url, setUrl] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(false);
  const [scope] = useState(currentImageScope);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function load() {
    setLoading(true);
    try {
      const blob = await downloadFeedbackImage(image);
      if (!mounted.current || scope !== currentImageScope()) return;
      setUrl(URL.createObjectURL(blob));
    } catch {
      if (mounted.current && scope === currentImageScope()) setFailed(true);
    } finally {
      if (mounted.current && scope === currentImageScope()) setLoading(false);
    }
  }
  if (scope !== currentImageScope()) return null;
  return url ? (
    <img
      src={url}
      alt="صورة مرفقة بالمحادثة"
      className="max-h-96 max-w-full rounded-lg object-contain"
    />
  ) : (
    <button
      type="button"
      onClick={() => void load()}
      disabled={loading}
      className="rounded border border-gold/40 px-3 py-2 text-xs"
    >
      {loading ? "جاري تحميل الصورة…" : failed ? "تعذر التحميل؛ حاول مجدداً" : "عرض الصورة المرفقة"}
    </button>
  );
}

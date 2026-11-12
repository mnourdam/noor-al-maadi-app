import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CachedImage } from "@/components/CachedImage";
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "@/lib/identity/owner";

const scopeNow = () => JSON.stringify([getActiveOwner(), getIdentityEpoch()]);
const serverScope = () => "server";

/** Notification-only admission: the cache hook must not mount before visibility. */
export function NotificationThumbnail({ src, notificationId }: { src: string; notificationId: string }) {
  const scope = useSyncExternalStore(onOwnerChange, scopeNow, serverScope);
  return <Thumbnail key={JSON.stringify([notificationId, src, scope])} src={src} scope={scope} />;
}

function Thumbnail({ src, scope }: { src: string; scope: string }) {
  const slot = useRef<HTMLSpanElement>(null);
  const [admitted, setAdmitted] = useState(false);
  useEffect(() => {
    let alive = true;
    let observer: IntersectionObserver | undefined;
    const disconnect = () => { try { observer?.disconnect(); } catch { /* best effort cleanup */ } };
    const admit = () => {
      if (!alive || scopeNow() !== scope) return;
      setAdmitted(true);
      disconnect();
    };
    try {
      if (typeof IntersectionObserver !== "function") admit();
      else {
        observer = new IntersectionObserver((entries) => {
          if (entries.some(entry => entry.target === slot.current && entry.isIntersecting)) admit();
        }, { rootMargin: "200px 0px" });
        if (slot.current) observer.observe(slot.current);
      }
    } catch {
      // Unsupported/broken observer must not hide otherwise available thumbnails.
      disconnect();
      admit();
    }
    return () => { alive = false; disconnect(); };
  }, [scope]);

  return <span ref={slot} aria-hidden="true" className="block size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-gold/20">
    {admitted && <CachedImage src={src} alt="" className="size-14 object-cover" loading="lazy" />}
  </span>;
}

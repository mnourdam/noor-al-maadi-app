import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body and locks background scroll while open.
 * Ensures dialogs are always centered on the viewport regardless of ancestor
 * `transform` / `filter` / `perspective` containing blocks. Restores the
 * previous scroll position on close.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const { body, documentElement: html } = document;
    const scrollY = window.scrollY;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevHtmlOverflow = html.style.overflow;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";

    return () => {
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      html.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

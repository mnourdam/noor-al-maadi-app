// Auto-registers open overlays with the navigation engine's LIFO stack
// so hardware/browser Back closes the topmost overlay before any route
// navigation. Used by shadcn wrappers (Dialog / AlertDialog / Sheet /
// Drawer) so every consumer inherits the behavior for free.

import { useCallback, useEffect, useRef } from "react";
import { useOverlayDismiss } from "./engine";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * When `open` is true, pushes a dismisser onto the overlay stack that
 * calls `onClose()`. Automatically unregisters when the overlay closes
 * or unmounts.
 */
export function OverlayDismissRegistration({ open, onClose }: Props) {
  if (!open) return null;
  return <ActiveOverlayRegistration onClose={onClose} />;
}

function ActiveOverlayRegistration({ onClose }: { onClose: () => void }) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  }, [onClose]);
  const stable = useCallback(() => ref.current(), []);
  useOverlayDismiss(stable);
  return null;
}

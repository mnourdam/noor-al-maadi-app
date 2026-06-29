import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Optional override for the toggle button's accessible labels. */
  showLabel?: string;
  hideLabel?: string;
  /** Optional extra class for the outer wrapper. */
  wrapperClassName?: string;
};

/**
 * Password input with a Lucide eye/eye-off visibility toggle.
 *
 * - Trailing-side button (RTL aware via `inset-inline-end`).
 * - Preserves cursor position when toggling.
 * - 44×44 px touch target.
 * - Keeps focus on the field after toggling.
 */
export const PasswordField = React.forwardRef<HTMLInputElement, Props>(
  (
    {
      showLabel = "إظهار كلمة المرور",
      hideLabel = "إخفاء كلمة المرور",
      wrapperClassName,
      style,
      className,
      ...inputProps
    },
    forwardedRef,
  ) => {
    const [visible, setVisible] = React.useState(false);
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const selectionRef = React.useRef<{ start: number | null; end: number | null } | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [forwardedRef],
    );

    React.useLayoutEffect(() => {
      const el = innerRef.current;
      const sel = selectionRef.current;
      if (!el || !sel) return;
      try {
        el.focus({ preventScroll: true });
        if (sel.start != null && sel.end != null) {
          el.setSelectionRange(sel.start, sel.end);
        }
      } catch {
        /* some browsers throw on setSelectionRange for password — safe to ignore */
      }
      selectionRef.current = null;
    }, [visible]);

    const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const el = innerRef.current;
      if (el) {
        try {
          selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
        } catch {
          selectionRef.current = null;
        }
      }
      setVisible((v) => !v);
    };

    // Reserve room on the trailing side so the icon doesn't overlap text.
    const mergedStyle: React.CSSProperties = { paddingInlineEnd: 44, ...(style ?? {}) };

    return (
      <div className={`relative ${wrapperClassName ?? ""}`}>
        <input
          {...inputProps}
          ref={setRefs}
          type={visible ? "text" : "password"}
          className={className}
          style={mergedStyle}
        />
        <button
          type="button"
          onClick={toggle}
          tabIndex={-1}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ insetInlineEnd: 4, width: 44, height: 44 }}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    );
  },
);
PasswordField.displayName = "PasswordField";

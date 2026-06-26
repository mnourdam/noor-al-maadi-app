import * as React from "react";

import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { cn } from "@/lib/utils";

/**
 * Android-safe text inputs that mirror the proven `/android-auth-min` pattern:
 *   - On Android APK: render a plain uncontrolled <input>/<textarea>, with
 *     transform/filter/animation neutralized inline. The value is committed
 *     to the caller only on blur, Enter, or external programmatic clear —
 *     never per-keystroke. No focus class toggles, no logging, no global
 *     state churn while typing.
 *   - On web / other platforms: behave exactly like a normal controlled
 *     input (passthrough), so existing UX is preserved.
 *
 * Both components accept the same prop shape used across the codebase
 * (`onValueChange`, `onEnter`) so they are drop-in replacements for the
 * older `AndroidSafeInput` / `AndroidSafeTextarea`.
 */

type Shared = {
  onValueChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  /** Accepted for API compatibility; commit always happens on blur/Enter on Android. */
  commitMode?: "blur" | "change" | "enter";
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & Shared;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Shared;

const ANDROID_NEUTRALIZE: React.CSSProperties = {
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  transition: "none",
  animation: "none",
};

function useExternalClearSync<T extends HTMLInputElement | HTMLTextAreaElement>(
  ref: React.MutableRefObject<T | null>,
  value: unknown,
) {
  // Allow external "clear" buttons (e.g. set query to "") to reset the DOM
  // even though the field is uncontrolled. We only sync when the incoming
  // value is the empty string and differs from current DOM — never per
  // keystroke.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof value === "string" && value === "" && el.value !== "") {
      el.value = "";
    }
  }, [ref, value]);
}

export const AndroidPlainTextInput = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      onValueChange,
      onChange,
      onBlur,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      value,
      defaultValue,
      style,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [forwardedRef],
    );

    const android = isAndroidNativeApp();
    useExternalClearSync(localRef, android ? value : undefined);

    if (android) {
      const initial = (typeof value === "string" ? value : (defaultValue as string | undefined)) ?? "";
      return (
        <input
          {...props}
          ref={setRefs}
          defaultValue={initial}
          className={className}
          style={{ ...ANDROID_NEUTRALIZE, ...style }}
          onBlur={(e) => {
            onValueChange?.(e.currentTarget.value);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (!e.defaultPrevented && e.key === "Enter") {
              const v = e.currentTarget.value;
              onValueChange?.(v);
              onEnter?.(v);
            }
          }}
        />
      );
    }

    // Web: preserve existing controlled behavior.
    const handleChange = onValueChange
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          onValueChange(e.currentTarget.value);
          onChange?.(e);
        }
      : onChange;

    const handleKeyDown = onEnter
      ? (e: React.KeyboardEvent<HTMLInputElement>) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented && e.key === "Enter") onEnter(e.currentTarget.value);
        }
      : onKeyDown;

    return (
      <input
        {...props}
        ref={setRefs}
        value={value}
        defaultValue={defaultValue}
        className={cn(className)}
        style={style}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
AndroidPlainTextInput.displayName = "AndroidPlainTextInput";

export const AndroidPlainTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      onValueChange,
      onChange,
      onBlur,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      value,
      defaultValue,
      style,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [forwardedRef],
    );

    const android = isAndroidNativeApp();
    useExternalClearSync(localRef, android ? value : undefined);

    if (android) {
      const initial = (typeof value === "string" ? value : (defaultValue as string | undefined)) ?? "";
      return (
        <textarea
          {...props}
          ref={setRefs}
          defaultValue={initial}
          className={className}
          style={{ ...ANDROID_NEUTRALIZE, ...style }}
          onBlur={(e) => {
            onValueChange?.(e.currentTarget.value);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (!e.defaultPrevented && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              const v = e.currentTarget.value;
              onValueChange?.(v);
              onEnter?.(v);
            }
          }}
        />
      );
    }

    const handleChange = onValueChange
      ? (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          onValueChange(e.currentTarget.value);
          onChange?.(e);
        }
      : onChange;

    return (
      <textarea
        {...props}
        ref={setRefs}
        value={value}
        defaultValue={defaultValue}
        className={cn(className)}
        style={style}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    );
  },
);
AndroidPlainTextarea.displayName = "AndroidPlainTextarea";

import * as React from "react";

import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { cn } from "@/lib/utils";

type CommitMode = "change" | "blur" | "manual";

type SharedSafeProps = {
  value?: string | number | readonly string[];
  onValueChange?: (value: string) => void;
  commitMode?: CommitMode;
  onEnter?: (value: string) => void;
  onCompositionStateChange?: (composing: boolean) => void;
  logName?: string;
};

type AndroidSafeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> & SharedSafeProps;
type AndroidSafeTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & SharedSafeProps;

function stringifyValue(value: SharedSafeProps["value"]) {
  if (Array.isArray(value)) return value.join(",");
  if (value === undefined || value === null) return "";
  return String(value);
}

function logTextInput(name: string | undefined, event: string, detail: Record<string, unknown> = {}) {
  if (!isAndroidNativeApp()) return;
  // Never log typed text; Logcat gets event order + lengths only.
  // eslint-disable-next-line no-console
  console.info("[android:text-input]", event, { field: name ?? "field", ...detail });
}

function setAndroidInputActive(active: boolean) {
  if (typeof document === "undefined" || !isAndroidNativeApp()) return;
  const html = document.documentElement;
  if (active) {
    html.classList.add("android-input-active");
    return;
  }
  window.setTimeout(() => {
    const el = document.activeElement as HTMLElement | null;
    const stillTyping = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (!stillTyping) html.classList.remove("android-input-active");
  }, 0);
}

function logKeyboardState(name: string | undefined) {
  if (!isAndroidNativeApp() || typeof window === "undefined") return;
  const vv = window.visualViewport;
  const viewportHeight = vv?.height ?? window.innerHeight;
  const layoutHeight = window.innerHeight;
  const visible = viewportHeight < layoutHeight * 0.82;
  logTextInput(name, "keyboard visible", {
    visible,
    viewportHeight: Math.round(viewportHeight),
    innerHeight: Math.round(layoutHeight),
  });
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

function isTextInputType(type: React.InputHTMLAttributes<HTMLInputElement>["type"]) {
  const t = String(type ?? "text").toLowerCase();
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(t);
}

export const AndroidSafeInput = React.forwardRef<HTMLInputElement, AndroidSafeInputProps>(
  (
    {
      value,
      onValueChange,
      commitMode,
      onEnter,
      onCompositionStateChange,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
      className,
      logName,
      defaultValue,
      ...props
    },
    forwardedRef,
  ) => {
    const android = isAndroidNativeApp();
    const androidTextMode = android && isTextInputType(props.type);
    const effectiveCommitMode: CommitMode = commitMode ?? (androidTextMode ? "blur" : "change");
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const composingRef = React.useRef(false);
    const firstKeyRef = React.useRef(true);
    const lastLengthRef = React.useRef(stringifyValue(value).length);

    React.useLayoutEffect(() => {
      if (!androidTextMode) return;
      const el = innerRef.current;
      if (!el || document.activeElement === el) return;
      const next = stringifyValue(value);
      if (el.value !== next) {
        el.value = next;
        lastLengthRef.current = next.length;
      }
    }, [androidTextMode, value]);

    const commit = React.useCallback((next: string) => {
      onValueChange?.(next);
    }, [onValueChange]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.currentTarget.value;
      logTextInput(logName, "onChange fired", { length: next.length, composing: composingRef.current });
      if (next.length !== lastLengthRef.current) {
        lastLengthRef.current = next.length;
        logTextInput(logName, "value length changed", { length: next.length });
      }
      if (!androidTextMode || effectiveCommitMode === "change") commit(next);
      if (!androidTextMode || effectiveCommitMode === "change") onChange?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      firstKeyRef.current = true;
      logTextInput(logName, "focus", { length: event.currentTarget.value.length });
      setAndroidInputActive(true);
      window.setTimeout(() => logKeyboardState(logName), 180);
      onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const next = event.currentTarget.value;
      logTextInput(logName, "blur", { length: next.length });
      setAndroidInputActive(false);
      if (androidTextMode && effectiveCommitMode !== "change") commit(next);
      onBlur?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (firstKeyRef.current) {
        firstKeyRef.current = false;
        logTextInput(logName, "first key received", { key: event.key, composing: composingRef.current });
      }
      onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === "Enter" && !composingRef.current) onEnter?.(event.currentTarget.value);
    };

    const handleCompositionStart = (event: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = true;
      onCompositionStateChange?.(true);
      logTextInput(logName, "composition start");
      onCompositionStart?.(event);
    };

    const handleCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      onCompositionStateChange?.(false);
      logTextInput(logName, "composition end", { length: event.currentTarget.value.length });
      if (!androidTextMode || effectiveCommitMode === "change") commit(event.currentTarget.value);
      onCompositionEnd?.(event);
    };

    const valueProps = androidTextMode
      ? (value !== undefined ? { defaultValue: stringifyValue(value) } : defaultValue !== undefined ? { defaultValue } : {})
      : (value !== undefined ? { value } : defaultValue !== undefined ? { defaultValue } : {});

    return (
      <input
        {...props}
        {...valueProps}
        ref={composeRefs(innerRef, forwardedRef)}
        data-android-safe-input={androidTextMode ? "true" : undefined}
        className={cn("android-safe-input", className)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  },
);
AndroidSafeInput.displayName = "AndroidSafeInput";

export const AndroidSafeTextarea = React.forwardRef<HTMLTextAreaElement, AndroidSafeTextareaProps>(
  (
    {
      value,
      onValueChange,
      commitMode,
      onCompositionStateChange,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
      className,
      logName,
      defaultValue,
      ...props
    },
    forwardedRef,
  ) => {
    const android = isAndroidNativeApp();
    const effectiveCommitMode: CommitMode = commitMode ?? (android ? "blur" : "change");
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const composingRef = React.useRef(false);
    const firstKeyRef = React.useRef(true);
    const lastLengthRef = React.useRef(stringifyValue(value).length);

    React.useLayoutEffect(() => {
      if (!android) return;
      const el = innerRef.current;
      if (!el || document.activeElement === el) return;
      const next = stringifyValue(value);
      if (el.value !== next) {
        el.value = next;
        lastLengthRef.current = next.length;
      }
    }, [android, value]);

    const commit = React.useCallback((next: string) => {
      onValueChange?.(next);
    }, [onValueChange]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.currentTarget.value;
      logTextInput(logName, "onChange fired", { length: next.length, composing: composingRef.current });
      if (next.length !== lastLengthRef.current) {
        lastLengthRef.current = next.length;
        logTextInput(logName, "value length changed", { length: next.length });
      }
      if (!android || effectiveCommitMode === "change") commit(next);
      if (!android || effectiveCommitMode === "change") onChange?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
      firstKeyRef.current = true;
      logTextInput(logName, "focus", { length: event.currentTarget.value.length });
      setAndroidInputActive(true);
      window.setTimeout(() => logKeyboardState(logName), 180);
      onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
      const next = event.currentTarget.value;
      logTextInput(logName, "blur", { length: next.length });
      setAndroidInputActive(false);
      if (android && effectiveCommitMode !== "change") commit(next);
      onBlur?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (firstKeyRef.current) {
        firstKeyRef.current = false;
        logTextInput(logName, "first key received", { key: event.key, composing: composingRef.current });
      }
      onKeyDown?.(event);
    };

    const handleCompositionStart = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = true;
      onCompositionStateChange?.(true);
      logTextInput(logName, "composition start");
      onCompositionStart?.(event);
    };

    const handleCompositionEnd = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      onCompositionStateChange?.(false);
      logTextInput(logName, "composition end", { length: event.currentTarget.value.length });
      if (!android || effectiveCommitMode === "change") commit(event.currentTarget.value);
      onCompositionEnd?.(event);
    };

    const valueProps = android
      ? (value !== undefined ? { defaultValue: stringifyValue(value) } : defaultValue !== undefined ? { defaultValue } : {})
      : (value !== undefined ? { value } : defaultValue !== undefined ? { defaultValue } : {});

    return (
      <textarea
        {...props}
        {...valueProps}
        ref={composeRefs(innerRef, forwardedRef)}
        data-android-safe-input={android ? "true" : undefined}
        className={cn("android-safe-input", className)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  },
);
AndroidSafeTextarea.displayName = "AndroidSafeTextarea";
import * as React from "react";

import { cn } from "@/lib/utils";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";

/**
 * Android input freeze fix — phase 1.
 *
 * Earlier versions of this module wrapped <input>/<textarea> with focus/blur
 * class toggles on <html>, ancestor class walking, useLayoutEffect value
 * mirroring, composition handlers, and per-keystroke console.info logs
 * through the Capacitor bridge. On the full Irth app path that combination
 * caused the WebView to freeze after the first character on every shared
 * input (login, profile name editor, campaign/puzzle answer fields).
 *
 * The minimal Android Auth-Min route (plain <input>, no wrappers, no
 * listeners) typed normally and signed in successfully, which isolated the
 * regression to this wrapper.
 *
 * Until we rebuild a proper Android-safe input, both exports below are pure
 * passthroughs that forward props directly to a native <input>/<textarea>.
 * `onValueChange` and `onEnter` are preserved as convenience callbacks
 * because they are widely used in the codebase, but they fire from the
 * standard change/keydown events with no extra state or side effects.
 */

type SharedSafeProps = {
  onValueChange?: (value: string) => void;
  /** Legacy/no-op props kept for backwards compatibility. */
  commitMode?: "change" | "blur" | "manual";
  onEnter?: (value: string) => void;
  onCompositionStateChange?: (composing: boolean) => void;
  logName?: string;
};

type AndroidSafeInputProps = React.InputHTMLAttributes<HTMLInputElement> & SharedSafeProps;
type AndroidSafeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & SharedSafeProps;

const ANDROID_AUTH_MIN_INPUT_STYLE = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #c9c9c9",
  borderRadius: 6,
  background: "#ffffff",
  color: "#111111",
  font: "16px system-ui, sans-serif",
  lineHeight: 1.4,
  padding: "12px 14px",
  outline: "none",
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
} satisfies React.CSSProperties;

const ANDROID_AUTH_MIN_TEXTAREA_STYLE = {
  ...ANDROID_AUTH_MIN_INPUT_STYLE,
  minHeight: 120,
  resize: "vertical",
} satisfies React.CSSProperties;

export const AndroidSafeInput = React.forwardRef<HTMLInputElement, AndroidSafeInputProps>(
  (
    {
      onValueChange,
      onChange,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      onCompositionStateChange: _onCompositionStateChange,
      logName: _logName,
      className,
      ...props
    },
    ref,
  ) => {
    if (isAndroidNativeApp()) {
      const {
        value,
        defaultValue,
        style: _style,
        onFocus: _onFocus,
        onBlur: _onBlur,
        onInput: _onInput,
        onBeforeInput: _onBeforeInput,
        onCompositionStart: _onCompositionStart,
        onCompositionEnd: _onCompositionEnd,
        ...plainProps
      } = props;
      return (
        <input
          {...plainProps}
          ref={ref}
          defaultValue={(defaultValue ?? value) as string | number | readonly string[] | undefined}
          autoCorrect={plainProps.autoCorrect ?? "off"}
          autoCapitalize={plainProps.autoCapitalize ?? "none"}
          spellCheck={plainProps.spellCheck ?? false}
          style={ANDROID_AUTH_MIN_INPUT_STYLE}
        />
      );
    }

    const handleChange = onValueChange
      ? (event: React.ChangeEvent<HTMLInputElement>) => {
          onValueChange(event.currentTarget.value);
          onChange?.(event);
        }
      : onChange;

    const handleKeyDown = onEnter
      ? (event: React.KeyboardEvent<HTMLInputElement>) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === "Enter") onEnter(event.currentTarget.value);
        }
      : onKeyDown;

    return (
      <input
        {...props}
        ref={ref}
        className={cn(className)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
AndroidSafeInput.displayName = "AndroidSafeInput";

export const AndroidSafeTextarea = React.forwardRef<HTMLTextAreaElement, AndroidSafeTextareaProps>(
  (
    {
      onValueChange,
      onChange,
      commitMode: _commitMode,
      onCompositionStateChange: _onCompositionStateChange,
      logName: _logName,
      className,
      ...props
    },
    ref,
  ) => {
    if (isAndroidNativeApp()) {
      const {
        value,
        defaultValue,
        style: _style,
        onFocus: _onFocus,
        onBlur: _onBlur,
        onInput: _onInput,
        onBeforeInput: _onBeforeInput,
        onCompositionStart: _onCompositionStart,
        onCompositionEnd: _onCompositionEnd,
        ...plainProps
      } = props;
      return (
        <textarea
          {...plainProps}
          ref={ref}
          defaultValue={(defaultValue ?? value) as string | number | readonly string[] | undefined}
          autoCorrect={plainProps.autoCorrect ?? "off"}
          autoCapitalize={plainProps.autoCapitalize ?? "none"}
          spellCheck={plainProps.spellCheck ?? false}
          style={ANDROID_AUTH_MIN_TEXTAREA_STYLE}
        />
      );
    }

    const handleChange = onValueChange
      ? (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          onValueChange(event.currentTarget.value);
          onChange?.(event);
        }
      : onChange;

    return (
      <textarea
        {...props}
        ref={ref}
        className={cn(className)}
        onChange={handleChange}
      />
    );
  },
);
AndroidSafeTextarea.displayName = "AndroidSafeTextarea";

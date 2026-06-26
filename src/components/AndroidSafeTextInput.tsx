import * as React from "react";

import { AndroidTextEntryInput, AndroidTextEntryTextarea } from "@/components/AndroidTextEntry";
import { cn } from "@/lib/utils";

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
  modalTitle?: string;
  modalLabel?: string;
  androidEntryKey?: string;
};

type AndroidSafeInputProps = React.InputHTMLAttributes<HTMLInputElement> & SharedSafeProps;
type AndroidSafeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & SharedSafeProps;

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
      modalTitle,
      modalLabel,
      androidEntryKey,
      className,
      ...props
    },
    ref,
    ) => {
    return (
      <AndroidTextEntryInput
        {...props}
        ref={ref}
        className={cn(className)}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onValueChange={onValueChange}
        onEnter={onEnter}
        modalTitle={modalTitle}
        modalLabel={modalLabel}
        androidEntryKey={androidEntryKey}
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
      modalTitle,
      modalLabel,
      androidEntryKey,
      className,
      ...props
    },
    ref,
    ) => {
    return (
      <AndroidTextEntryTextarea
        {...props}
        ref={ref}
        className={cn(className)}
        onChange={onChange}
        onValueChange={onValueChange}
        modalTitle={modalTitle}
        modalLabel={modalLabel}
        androidEntryKey={androidEntryKey}
      />
    );
  },
);
AndroidSafeTextarea.displayName = "AndroidSafeTextarea";

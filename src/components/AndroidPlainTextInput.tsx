import * as React from "react";

import { AndroidTextEntryInput, AndroidTextEntryTextarea } from "@/components/AndroidTextEntry";

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
  modalTitle?: string;
  modalLabel?: string;
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & Shared;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Shared;

export const AndroidPlainTextInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, forwardedRef) => <AndroidTextEntryInput {...props} ref={forwardedRef} />,
);
AndroidPlainTextInput.displayName = "AndroidPlainTextInput";

export const AndroidPlainTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (props, forwardedRef) => <AndroidTextEntryTextarea {...props} ref={forwardedRef} />,
);
AndroidPlainTextarea.displayName = "AndroidPlainTextarea";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ROLLBACK NOTE
 * -------------
 * The standalone `/android-text-entry` handoff (full-page reload to an
 * isolated text entry screen) was wired into encyclopedia search, profile,
 * campaigns, atlas, friends, timeline and game renderers. In practice the
 * round-trip introduced freezes after Save, broke campaign/profile flows,
 * and slowed normal navigation.
 *
 * This module is now a pure passthrough. The exported components behave as
 * plain native `<input>` / `<textarea>` and forward `onValueChange` /
 * `onEnter` exactly as before. No global state, no storage handoff, no
 * route changes. Call sites that pass `androidEntryKey`, `modalTitle`,
 * `modalLabel`, or `commitMode` keep working — the props are accepted and
 * silently ignored. The only working isolated Android entry remains
 * `/android-auth-min`, gated by `AuthLink`.
 */

type Shared = {
  onValueChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  commitMode?: "blur" | "change" | "enter";
  modalTitle?: string;
  modalLabel?: string;
  androidEntryKey?: string;
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & Shared;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Shared;

export function buildAndroidTextEntryFieldKey(stableKey: string) {
  return stableKey;
}

type StoredTextEntryResult = { value: string };

export function readAndroidTextEntryResultByFieldKey(_fieldKey: string): StoredTextEntryResult | null {
  return null;
}

export function readAndroidTextEntryResult(_stableKey: string, _pathname?: string): StoredTextEntryResult | null {
  return null;
}

export function AndroidTextEntryHost() {
  return null;
}

export const AndroidTextEntryInput = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      onValueChange,
      onChange,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      modalTitle: _modalTitle,
      modalLabel: _modalLabel,
      androidEntryKey: _androidEntryKey,
      className,
      ...props
    },
    ref,
  ) => {
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
AndroidTextEntryInput.displayName = "AndroidTextEntryInput";

export const AndroidTextEntryTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      onValueChange,
      onChange,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      modalTitle: _modalTitle,
      modalLabel: _modalLabel,
      androidEntryKey: _androidEntryKey,
      className,
      ...props
    },
    ref,
  ) => {
    const handleChange = onValueChange
      ? (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          onValueChange(event.currentTarget.value);
          onChange?.(event);
        }
      : onChange;
    const handleKeyDown = onEnter
      ? (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            onEnter(event.currentTarget.value);
          }
        }
      : onKeyDown;
    return (
      <textarea
        {...props}
        ref={ref}
        className={cn(className)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
AndroidTextEntryTextarea.displayName = "AndroidTextEntryTextarea";

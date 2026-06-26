import * as React from "react";

import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { cn } from "@/lib/utils";

const REQUEST_KEY = "irth:android-text-entry:request";
const RESULT_PREFIX = "irth:android-text-entry:result:";

type StoredTextEntryRequest = {
  version: 1;
  fieldKey: string;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue: string;
  multiline: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  dir?: "rtl" | "ltr" | "auto";
  autoComplete?: string;
  returnPath: string;
};

type StoredTextEntryResult = {
  version: 1;
  fieldKey: string;
  value: string;
  savedAt: number;
};

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

function safePath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function toTextValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join("");
  return "";
}

function normalizeUseId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildAndroidTextEntryFieldKey(stableKey: string, pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  return `${pathname || "/"}:${stableKey}`;
}

function makeFieldKey(kind: "input" | "textarea", reactId: string, props: {
  androidEntryKey?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  modalTitle?: string;
  modalLabel?: string;
}) {
  if (props.androidEntryKey) return buildAndroidTextEntryFieldKey(props.androidEntryKey);
  if (typeof window === "undefined") return `${kind}:${normalizeUseId(reactId)}`;
  const explicit = props.name || props.id || props.modalTitle || props.modalLabel || props.placeholder || kind;
  return `${window.location.pathname || "/"}:${kind}:${explicit}:${normalizeUseId(reactId)}`;
}

function resultKey(fieldKey: string) {
  return `${RESULT_PREFIX}${fieldKey}`;
}

export function readAndroidTextEntryResultByFieldKey(fieldKey: string): StoredTextEntryResult | null {
  if (typeof window === "undefined") return null;
  const key = resultKey(fieldKey);
  try {
    const raw = window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
    const parsed = JSON.parse(raw) as StoredTextEntryResult;
    if (parsed?.version === 1 && parsed.fieldKey === fieldKey && typeof parsed.value === "string") return parsed;
  } catch { /* ignore malformed handoff */ }
  return null;
}

export function readAndroidTextEntryResult(stableKey: string, pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  return readAndroidTextEntryResultByFieldKey(buildAndroidTextEntryFieldKey(stableKey, pathname));
}

function openStandaloneTextEntry(request: StoredTextEntryRequest): boolean {
  if (typeof window === "undefined" || !isAndroidNativeApp()) return false;
  try {
    const raw = JSON.stringify(request);
    window.sessionStorage.setItem(REQUEST_KEY, raw);
    window.localStorage.setItem(REQUEST_KEY, raw);
    window.location.href = "/android-text-entry";
    return true;
  } catch {
    return false;
  }
}

function triggerSyntheticChange<T extends HTMLInputElement | HTMLTextAreaElement>(
  target: T | null,
  handler: React.ChangeEventHandler<T> | undefined,
) {
  if (!target || !handler) return;
  handler({ currentTarget: target, target } as React.ChangeEvent<T>);
}

export function AndroidTextEntryHost() {
  return null;
}

export const AndroidTextEntryInput = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      onValueChange,
      onChange,
      onFocus,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      modalTitle,
      modalLabel,
      androidEntryKey,
      value,
      defaultValue,
      className,
      readOnly,
      disabled,
      placeholder,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const reactId = React.useId();
    const fieldKey = React.useMemo(
      () => makeFieldKey("input", reactId, { androidEntryKey, id: props.id, name: props.name, placeholder, modalTitle, modalLabel }),
      [androidEntryKey, modalLabel, modalTitle, placeholder, props.id, props.name, reactId],
    );
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const [internalValue, setInternalValue] = React.useState(() => toTextValue(defaultValue));
    const lastOpenAtRef = React.useRef(0);
    const android = isAndroidNativeApp();

    const setRefs = React.useCallback((node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }, [forwardedRef]);

    const applyValue = React.useCallback((next: string) => {
      if (localRef.current) localRef.current.value = next;
      setInternalValue(next);
      onValueChange?.(next);
      triggerSyntheticChange(localRef.current, onChange);
    }, [onChange, onValueChange]);

    React.useEffect(() => {
      if (!android) return;
      const result = readAndroidTextEntryResultByFieldKey(fieldKey);
      if (result) applyValue(result.value);
    }, [android, applyValue, fieldKey]);

    const currentValue = toTextValue(typeof value !== "undefined" ? value : localRef.current?.value ?? internalValue);
    const openEntry = React.useCallback(() => {
      if (readOnly || disabled) return;
      const now = Date.now();
      if (now - lastOpenAtRef.current < 500) return;
      lastOpenAtRef.current = now;
      openStandaloneTextEntry({
        version: 1,
        fieldKey,
        title: modalTitle ?? "إدخال النص",
        label: modalLabel,
        placeholder,
        initialValue: currentValue,
        multiline: false,
        maxLength: props.maxLength,
        inputMode: props.inputMode,
        dir: props.dir as "rtl" | "ltr" | "auto" | undefined,
        autoComplete: props.autoComplete,
        returnPath: safePath(),
      });
    }, [currentValue, disabled, fieldKey, modalLabel, modalTitle, placeholder, props.autoComplete, props.dir, props.inputMode, props.maxLength, readOnly]);

    if (android) {
      return (
        <input
          {...props}
          ref={setRefs}
          value={typeof value !== "undefined" ? currentValue : undefined}
          defaultValue={typeof value !== "undefined" ? undefined : currentValue}
          readOnly
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          style={style}
          onPointerDown={(event) => { event.preventDefault(); openEntry(); }}
          onClick={(event) => { event.preventDefault(); openEntry(); }}
          onFocus={(event) => { event.currentTarget.blur(); openEntry(); onFocus?.(event); }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (!event.defaultPrevented && event.key === "Enter") onEnter?.(currentValue);
          }}
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
        ref={setRefs}
        value={value}
        defaultValue={defaultValue}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(className)}
        style={style}
        onChange={handleChange}
        onFocus={onFocus}
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
      onFocus,
      onKeyDown,
      onEnter,
      commitMode: _commitMode,
      modalTitle,
      modalLabel,
      androidEntryKey,
      value,
      defaultValue,
      className,
      readOnly,
      disabled,
      placeholder,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const reactId = React.useId();
    const fieldKey = React.useMemo(
      () => makeFieldKey("textarea", reactId, { androidEntryKey, id: props.id, name: props.name, placeholder, modalTitle, modalLabel }),
      [androidEntryKey, modalLabel, modalTitle, placeholder, props.id, props.name, reactId],
    );
    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [internalValue, setInternalValue] = React.useState(() => toTextValue(defaultValue));
    const lastOpenAtRef = React.useRef(0);
    const android = isAndroidNativeApp();

    const setRefs = React.useCallback((node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    }, [forwardedRef]);

    const applyValue = React.useCallback((next: string) => {
      if (localRef.current) localRef.current.value = next;
      setInternalValue(next);
      onValueChange?.(next);
      triggerSyntheticChange(localRef.current, onChange);
    }, [onChange, onValueChange]);

    React.useEffect(() => {
      if (!android) return;
      const result = readAndroidTextEntryResultByFieldKey(fieldKey);
      if (result) applyValue(result.value);
    }, [android, applyValue, fieldKey]);

    const currentValue = toTextValue(typeof value !== "undefined" ? value : localRef.current?.value ?? internalValue);
    const openEntry = React.useCallback(() => {
      if (readOnly || disabled) return;
      const now = Date.now();
      if (now - lastOpenAtRef.current < 500) return;
      lastOpenAtRef.current = now;
      openStandaloneTextEntry({
        version: 1,
        fieldKey,
        title: modalTitle ?? "إدخال النص",
        label: modalLabel,
        placeholder,
        initialValue: currentValue,
        multiline: true,
        maxLength: props.maxLength,
        dir: props.dir as "rtl" | "ltr" | "auto" | undefined,
        autoComplete: props.autoComplete,
        returnPath: safePath(),
      });
    }, [currentValue, disabled, fieldKey, modalLabel, modalTitle, placeholder, props.autoComplete, props.dir, props.maxLength, readOnly]);

    if (android) {
      return (
        <textarea
          {...props}
          ref={setRefs}
          value={typeof value !== "undefined" ? currentValue : undefined}
          defaultValue={typeof value !== "undefined" ? undefined : currentValue}
          readOnly
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          style={style}
          onPointerDown={(event) => { event.preventDefault(); openEntry(); }}
          onClick={(event) => { event.preventDefault(); openEntry(); }}
          onFocus={(event) => { event.currentTarget.blur(); openEntry(); onFocus?.(event); }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (!event.defaultPrevented && event.key === "Enter" && (event.ctrlKey || event.metaKey)) onEnter?.(currentValue);
          }}
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
        ref={setRefs}
        value={value}
        defaultValue={defaultValue}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(className)}
        style={style}
        onChange={handleChange}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
    );
  },
);
AndroidTextEntryTextarea.displayName = "AndroidTextEntryTextarea";

export const ANDROID_TEXT_ENTRY_REQUEST_KEY = REQUEST_KEY;
export const ANDROID_TEXT_ENTRY_RESULT_PREFIX = RESULT_PREFIX;
export type { StoredTextEntryRequest, StoredTextEntryResult };
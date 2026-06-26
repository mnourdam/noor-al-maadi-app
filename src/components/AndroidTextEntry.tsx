import * as React from "react";

import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { cn } from "@/lib/utils";

const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#1f1813";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";

type TextEntryRequest = {
  id: number;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue: string;
  multiline: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  dir?: "rtl" | "ltr" | "auto";
  autoComplete?: string;
  onSave: (value: string) => void;
  onCancel?: () => void;
};

type OpenOptions = Omit<TextEntryRequest, "id">;

type AndroidTextEntryWindow = Window & {
  __irthOpenAndroidTextEntry?: (options: OpenOptions) => void;
};

let nextRequestId = 1;
let activeTextEntryCleanup: (() => void) | undefined;

export function openAndroidTextEntry(options: OpenOptions): boolean {
  return openNativeAndroidTextEntry(options);
}

function openNativeAndroidTextEntry(options: OpenOptions): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !isAndroidNativeApp()) return false;
  activeTextEntryCleanup?.();
  activeTextEntryCleanup = mountNativeAndroidTextEntry({ ...options, id: nextRequestId++ }, () => {
    activeTextEntryCleanup = undefined;
  });
  return true;
}

export function AndroidTextEntryHost() {
  React.useEffect(() => {
    if (!isAndroidNativeApp()) return;
    const w = window as AndroidTextEntryWindow;
    w.__irthOpenAndroidTextEntry = (options) => {
      openNativeAndroidTextEntry(options);
    };
    return () => {
      if (w.__irthOpenAndroidTextEntry) delete w.__irthOpenAndroidTextEntry;
      activeTextEntryCleanup?.();
      activeTextEntryCleanup = undefined;
    };
  }, []);

  return null;
}

function mountNativeAndroidTextEntry(request: TextEntryRequest, onClose: () => void) {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.dir = "rtl";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("data-irth-android-text-entry", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "max(28px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))",
    background: `radial-gradient(ellipse at top, #2a1d10 0%, ${INK} 62%, #050403 100%)`,
    color: TEXT,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    overflowY: "auto",
    transform: "none",
    filter: "none",
    backdropFilter: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  } satisfies Partial<CSSStyleDeclaration>);
  overlay.style.setProperty("-webkit-overflow-scrolling", "touch");

  const styleTag = document.createElement("style");
  styleTag.textContent = `
    [data-irth-android-text-entry],
    [data-irth-android-text-entry] *,
    [data-irth-android-text-entry] *::before,
    [data-irth-android-text-entry] *::after {
      animation: none !important;
      transition: none !important;
      transform: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      contain: none !important;
      content-visibility: visible !important;
    }
    [data-irth-android-text-entry] input,
    [data-irth-android-text-entry] textarea {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-text-size-adjust: 100% !important;
    }
    [data-irth-android-text-entry] input::placeholder,
    [data-irth-android-text-entry] textarea::placeholder {
      color: #6b5a44 !important;
    }
  `;

  const wrap = document.createElement("div");
  Object.assign(wrap.style, { width: "100%", maxWidth: "430px" });

  const head = document.createElement("div");
  Object.assign(head.style, { textAlign: "center", marginBottom: "24px" });

  const logo = document.createElement("img");
  logo.src = "/assets/splash/irth-logo.png";
  logo.alt = "إرث";
  logo.width = 64;
  logo.height = 64;
  Object.assign(logo.style, { display: "inline-block", marginBottom: "12px" });
  logo.onerror = () => { logo.style.display = "none"; };

  const title = document.createElement("h1");
  title.id = "android-text-entry-title";
  title.textContent = request.title;
  Object.assign(title.style, { margin: "0", font: "800 24px system-ui, sans-serif", color: GOLD });

  head.append(logo, title);
  if (request.label) {
    const label = document.createElement("p");
    label.textContent = request.label;
    Object.assign(label.style, { margin: "7px 0 0", color: "#9a8a6e", font: "13px/1.6 system-ui, sans-serif" });
    head.append(label);
  }

  const card = document.createElement("div");
  Object.assign(card.style, {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: "16px",
    padding: "22px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,90,0.08)",
  });

  const field = request.multiline ? document.createElement("textarea") : document.createElement("input");
  if (!request.multiline) {
    (field as HTMLInputElement).type = "text";
    if (request.inputMode) field.setAttribute("inputmode", request.inputMode);
  } else {
    (field as HTMLTextAreaElement).rows = 7;
  }
  field.setAttribute("autocomplete", request.autoComplete ?? "off");
  field.setAttribute("autocorrect", "off");
  field.setAttribute("autocapitalize", "none");
  field.setAttribute("spellcheck", "false");
  field.dir = request.dir ?? "rtl";
  field.placeholder = request.placeholder ?? "";
  field.value = request.initialValue;
  if (typeof request.maxLength === "number" && request.maxLength > 0) field.maxLength = request.maxLength;
  Object.assign(field.style, {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${BORDER}`,
    borderRadius: "10px",
    background: SURFACE_2,
    color: TEXT,
    font: "16px system-ui, -apple-system, sans-serif",
    lineHeight: "1.5",
    padding: "14px 14px",
    outline: "none",
    transform: "none",
    filter: "none",
    backdropFilter: "none",
    transition: "none",
    animation: "none",
    caretColor: GOLD,
  });
  if (request.multiline) Object.assign(field.style, { minHeight: "170px", resize: "vertical" });

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "18px" });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "حفظ";
  Object.assign(saveButton.style, primaryButtonStyle);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "إلغاء";
  Object.assign(cancelButton.style, secondaryButtonStyle);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    saveButton.removeEventListener("click", save);
    cancelButton.removeEventListener("click", cancel);
    overlay.remove();
    styleTag.remove();
    document.body.style.overflow = previousOverflow;
  };
  const close = () => {
    remove();
    onClose();
  };
  function save() {
    request.onSave(field.value);
    close();
  }
  function cancel() {
    request.onCancel?.();
    close();
  }

  saveButton.addEventListener("click", save);
  cancelButton.addEventListener("click", cancel);
  actions.append(saveButton, cancelButton);
  card.append(field, actions);
  wrap.append(head, card);
  overlay.append(wrap);
  document.head.append(styleTag);
  document.body.append(overlay);

  window.setTimeout(() => field.focus({ preventScroll: true }), 80);

  return remove;
}

const primaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${GOLD}`,
  borderRadius: 10,
  background: `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)`,
  color: "#1a1208",
  font: "800 15px system-ui, sans-serif",
  padding: "13px 14px",
  boxShadow: "0 6px 18px rgba(212,175,90,0.24)",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  background: "transparent",
  color: GOLD_SOFT,
  font: "700 15px system-ui, sans-serif",
  padding: "13px 14px",
};

type Shared = {
  onValueChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  commitMode?: "blur" | "change" | "enter";
  modalTitle?: string;
  modalLabel?: string;
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & Shared;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Shared;

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
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback((node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }, [forwardedRef]);

    const android = isAndroidNativeApp();
    const currentValue = (typeof value === "string" ? value : localRef.current?.value ?? (typeof defaultValue === "string" ? defaultValue : ""));
    const lastOpenAtRef = React.useRef(0);
    const openEntry = React.useCallback(() => {
      if (readOnly || disabled) return;
      const now = Date.now();
      if (now - lastOpenAtRef.current < 350) return;
      lastOpenAtRef.current = now;
      openAndroidTextEntry({
        title: modalTitle ?? "إدخال النص",
        label: modalLabel,
        placeholder,
        initialValue: currentValue,
        multiline: false,
        maxLength: props.maxLength,
        inputMode: props.inputMode,
        dir: props.dir as "rtl" | "ltr" | "auto" | undefined,
        autoComplete: props.autoComplete,
        onSave: (next) => {
          if (localRef.current) localRef.current.value = next;
          onValueChange?.(next);
          if (onChange) {
            const target = localRef.current;
            if (target) onChange({ currentTarget: target, target } as React.ChangeEvent<HTMLInputElement>);
          }
        },
      });
    }, [currentValue, disabled, modalLabel, modalTitle, onChange, onEnter, onValueChange, placeholder, props.autoComplete, props.dir, props.inputMode, props.maxLength, readOnly]);

    if (android) {
      return (
        <input
          {...props}
          ref={setRefs}
          value={currentValue}
          readOnly
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          style={style}
          onPointerDown={(event) => {
            event.preventDefault();
            openEntry();
          }}
          onClick={(event) => {
            event.preventDefault();
            openEntry();
          }}
          onFocus={(event) => {
            event.currentTarget.blur();
            openEntry();
            onFocus?.(event);
          }}
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
    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback((node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    }, [forwardedRef]);

    const android = isAndroidNativeApp();
    const currentValue = (typeof value === "string" ? value : localRef.current?.value ?? (typeof defaultValue === "string" ? defaultValue : ""));
    const lastOpenAtRef = React.useRef(0);
    const openEntry = React.useCallback(() => {
      if (readOnly || disabled) return;
      const now = Date.now();
      if (now - lastOpenAtRef.current < 350) return;
      lastOpenAtRef.current = now;
      openAndroidTextEntry({
        title: modalTitle ?? "إدخال النص",
        label: modalLabel,
        placeholder,
        initialValue: currentValue,
        multiline: true,
        maxLength: props.maxLength,
        dir: props.dir as "rtl" | "ltr" | "auto" | undefined,
        autoComplete: props.autoComplete,
        onSave: (next) => {
          if (localRef.current) localRef.current.value = next;
          onValueChange?.(next);
          if (onChange) {
            const target = localRef.current;
            if (target) onChange({ currentTarget: target, target } as React.ChangeEvent<HTMLTextAreaElement>);
          }
        },
      });
    }, [currentValue, disabled, modalLabel, modalTitle, onChange, onEnter, onValueChange, placeholder, props.autoComplete, props.dir, props.maxLength, readOnly]);

    if (android) {
      return (
        <textarea
          {...props}
          ref={setRefs}
          value={currentValue}
          readOnly
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          style={style}
          onPointerDown={(event) => {
            event.preventDefault();
            openEntry();
          }}
          onClick={(event) => {
            event.preventDefault();
            openEntry();
          }}
          onFocus={(event) => {
            event.currentTarget.blur();
            openEntry();
            onFocus?.(event);
          }}
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

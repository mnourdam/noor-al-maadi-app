import * as React from "react";
import { createPortal } from "react-dom";

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

export function openAndroidTextEntry(options: OpenOptions): boolean {
  if (typeof window === "undefined" || !isAndroidNativeApp()) return false;
  const opener = (window as AndroidTextEntryWindow).__irthOpenAndroidTextEntry;
  if (!opener) return false;
  opener(options);
  return true;
}

export function AndroidTextEntryHost() {
  const [request, setRequest] = React.useState<TextEntryRequest | null>(null);

  React.useEffect(() => {
    if (!isAndroidNativeApp()) return;
    const w = window as AndroidTextEntryWindow;
    w.__irthOpenAndroidTextEntry = (options) => {
      setRequest({ ...options, id: nextRequestId++ });
    };
    return () => {
      if (w.__irthOpenAndroidTextEntry) delete w.__irthOpenAndroidTextEntry;
    };
  }, []);

  if (!request || typeof document === "undefined") return null;
  return createPortal(<AndroidTextEntryScreen request={request} onClose={() => setRequest(null)} />, document.body);
}

function AndroidTextEntryScreen({ request, onClose }: { request: TextEntryRequest; onClose: () => void }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const save = () => {
    const value = request.multiline ? (textareaRef.current?.value ?? "") : (inputRef.current?.value ?? "");
    request.onSave(value);
    onClose();
  };

  const cancel = () => {
    request.onCancel?.();
    onClose();
  };

  const sharedStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    background: SURFACE_2,
    color: TEXT,
    font: "16px system-ui, -apple-system, sans-serif",
    lineHeight: 1.5,
    padding: "14px 14px",
    outline: "none",
    transform: "none",
    filter: "none",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    transition: "none",
    animation: "none",
    caretColor: GOLD,
  };

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-text-entry-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "max(28px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))",
        background: `radial-gradient(ellipse at top, #2a1d10 0%, ${INK} 62%, #050403 100%)`,
        color: TEXT,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        transform: "none",
        filter: "none",
        backdropFilter: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{`
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
      `}</style>

      <div data-irth-android-text-entry style={{ width: "100%", maxWidth: 430 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/assets/splash/irth-logo.png"
            alt="إرث"
            width={64}
            height={64}
            style={{ display: "inline-block", marginBottom: 12 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <h1 id="android-text-entry-title" style={{ margin: 0, font: "800 24px system-ui, sans-serif", color: GOLD }}>
            {request.title}
          </h1>
          {request.label ? (
            <p style={{ margin: "7px 0 0", color: "#9a8a6e", font: "13px/1.6 system-ui, sans-serif" }}>{request.label}</p>
          ) : null}
        </div>

        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 22, boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,90,0.08)" }}>
          {request.multiline ? (
            <textarea
              key={request.id}
              ref={textareaRef}
              defaultValue={request.initialValue}
              rows={7}
              maxLength={request.maxLength}
              autoComplete={request.autoComplete ?? "off"}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={request.placeholder}
              dir={request.dir ?? "rtl"}
              style={{ ...sharedStyle, minHeight: 170, resize: "vertical" }}
            />
          ) : (
            <input
              key={request.id}
              ref={inputRef}
              type="text"
              defaultValue={request.initialValue}
              maxLength={request.maxLength}
              inputMode={request.inputMode ?? "text"}
              autoComplete={request.autoComplete ?? "off"}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={request.placeholder}
              dir={request.dir ?? "rtl"}
              style={sharedStyle}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
            />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
            <button type="button" onClick={save} style={primaryButtonStyle}>حفظ</button>
            <button type="button" onClick={cancel} style={secondaryButtonStyle}>إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
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

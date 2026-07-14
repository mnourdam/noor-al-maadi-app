// Singleton event bus for the branded auth dialog.
//
// Usage:
//   openAuthDialog({ kind: "signup_email_sent", email: "..." });
//   closeAuthDialog();
//
// One dialog instance renders globally (mounted in __root.tsx). Opening a
// new dialog replaces any currently-visible one — dialogs never stack.

export type AuthDialogTone = "info" | "success" | "warning" | "error";

export interface AuthDialogAction {
  label: string;
  onClick?: () => void | Promise<void>;
  /** When true, the dialog stays open while the action runs (spinner). */
  keepOpen?: boolean;
}

export interface AuthDialogOptions {
  /** Stable id used to dedupe repeated opens of the same event. */
  id?: string;
  tone?: AuthDialogTone;
  title: string;
  body: string;
  /** Optional masked email or context line shown under the body. */
  detail?: string;
  primary: AuthDialogAction;
  secondary?: AuthDialogAction;
  /** Prevents outside-click / Esc close. */
  mandatory?: boolean;
}

type Listener = (opts: AuthDialogOptions | null) => void;

const listeners = new Set<Listener>();
let current: AuthDialogOptions | null = null;
let lastId: string | null = null;

function emit() {
  for (const fn of listeners) fn(current);
}

export function subscribeAuthDialog(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

export function openAuthDialog(opts: AuthDialogOptions): void {
  // Guard against double-open of the same event id within the same session.
  if (opts.id && opts.id === lastId && current) return;
  lastId = opts.id ?? null;
  current = opts;
  emit();
}

export function closeAuthDialog(): void {
  current = null;
  emit();
}

/** Mask an email for display: `m***@gmail.com`. */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const first = name.slice(0, 1);
  return `${first}${"*".repeat(Math.max(2, name.length - 1))}${domain}`;
}

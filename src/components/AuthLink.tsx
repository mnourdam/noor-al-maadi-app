import { Link } from "@tanstack/react-router";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

type Mode = "login" | "signup" | "forgot";

type Props = {
  children: ReactNode;
  className?: string;
  ref?: string;
  mode?: Mode;
  onClick?: () => void;
} & Omit<ComponentProps<"a">, "href" | "onClick" | "ref">;

/**
 * Login/Signup link.
 * - On Android APK: full-reload navigation to standalone `/android-auth-min`
 *   (supports `?mode=login|signup|forgot`) so the proven isolated entry
 *   point boots without the main router/AppShell.
 * - Elsewhere: regular client-side <Link to="/auth"> navigation.
 */
export function AuthLink({ children, className, ref, mode, onClick, ...rest }: Props) {
  if (isAndroidNativeApp()) {
    const href = mode && mode !== "login"
      ? `/android-auth-min?mode=${mode}`
      : "/android-auth-min";
    return (
      <a
        {...rest}
        href={href}
        className={className}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault();
          try { onClick?.(); } catch { /* ignore */ }
          window.location.href = href;
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      to="/auth"
      search={ref ? { ref } : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

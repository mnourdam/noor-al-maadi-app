import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

type Mode = "login" | "signup" | "forgot";

type Props = {
  children: ReactNode;
  className?: string;
  ref?: string;
  mode?: Mode;
  onClick?: () => void;
} & Omit<ComponentProps<"a">, "href" | "onClick" | "ref">;

/**
 * Login/Signup link — always navigates to the standard `/auth` route.
 * The Android input freeze that originally required a standalone entry has
 * been fixed at the RootShell level; we no longer need a separate route.
 */
export function AuthLink({ children, className, ref, mode, onClick }: Props) {
  return (
    <Link
      to="/auth"
      search={{ ref: ref ?? undefined }}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

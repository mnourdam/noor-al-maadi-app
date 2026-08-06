import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { setAuthOrigin } from "@/lib/authOrigin";

type Mode = "login" | "signup" | "forgot";

type Props = {
  children: ReactNode;
  className?: string;
  ref?: string;
  mode?: Mode;
  /** Override the recorded post-auth destination. Defaults to the current
   *  pathname so an in-app auth prompt returns the user where they were. */
  origin?: string;
  onClick?: () => void;
} & Omit<ComponentProps<"a">, "href" | "onClick" | "ref">;

/**
 * Login/Signup link — always navigates to the standard `/auth` route.
 * Before navigating we record where the user came from so the post-auth
 * redirect (email, Google, native deep-link) can return them there.
 */
export function AuthLink({ children, className, ref, mode, origin, onClick }: Props) {
  return (
    <Link
      to="/auth"
      search={{}}
      className={className}
      onClick={() => {
        const path =
          origin ??
          (typeof window !== "undefined" ? window.location.pathname : "/profile");
        setAuthOrigin(path || "/profile");
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}

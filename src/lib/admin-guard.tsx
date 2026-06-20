import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";

export const ALLOWED_ADMIN_EMAILS = ["mnourdam@gmail.com"];
export const normalizeEmail = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";
const NORMALIZED = ALLOWED_ADMIN_EMAILS.map(normalizeEmail);

export function useAdminGuard() {
  const { user: accountUser, loadingSession } = useAccount();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (loadingSession) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const u = data.user ?? accountUser ?? null;
      const e = u?.email ?? null;
      setEmail(e);
      setAllowed(NORMALIZED.includes(normalizeEmail(e)));
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [accountUser, loadingSession]);

  return { checking, allowed, email };
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { checking, allowed, email } = useAdminGuard();
  useEffect(() => {
    document.documentElement.classList.add("admin-lite");
    return () => document.documentElement.classList.remove("admin-lite");
  }, []);
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">صفحة محصورة على المشرفين</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `الحساب الحالي (${email}) لا يملك صلاحية الوصول.` : "يرجى تسجيل الدخول بحساب مشرف."}
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

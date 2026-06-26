import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";

// Bootstrap email — retained so the original owner is unblocked even before
// the user_roles row is provisioned. The DB layer's is_user_manager() does
// the same check so the email allowlist alone is never the deciding factor.
export const ALLOWED_ADMIN_EMAILS = ["mnourdam@gmail.com"];
export const normalizeEmail = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";
const NORMALIZED = ALLOWED_ADMIN_EMAILS.map(normalizeEmail);

export type AdminCapabilities = {
  is_manager: boolean;
  is_editor: boolean;
  roles: string[];
};

const EMPTY_CAPS: AdminCapabilities = { is_manager: false, is_editor: false, roles: [] };

export function useAdminGuard() {
  const { user: accountUser, loadingSession } = useAccount();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [caps, setCaps] = useState<AdminCapabilities>(EMPTY_CAPS);

  useEffect(() => {
    if (loadingSession) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const u = data.user ?? accountUser ?? null;
      const e = u?.email ?? null;
      setEmail(e);

      if (!u) {
        setCaps(EMPTY_CAPS);
        setChecking(false);
        return;
      }

      // Fetch role capabilities from the DB (security-definer RPC).
      const { data: capsData, error: capsError } = await supabase.rpc(
        "current_user_capabilities" as never,
      );
      if (!alive) return;
      let c = (capsData as AdminCapabilities | null) ?? EMPTY_CAPS;

      // Direct fallback: read user_roles ourselves if the RPC came back empty
      // (e.g. transient PostgREST schema-cache miss). RLS on user_roles allows
      // the signed-in user to read their own rows.
      let directRoles: string[] = [];
      if (!c.is_manager && !c.is_editor && (c.roles?.length ?? 0) === 0) {
        const { data: rowsData, error: rolesErr } = await supabase
          .from("user_roles" as never)
          .select("role")
          .eq("user_id", u.id);
        if (!alive) return;
        const rows = (rowsData as { role: string }[] | null) ?? [];
        directRoles = rows.map((r) => r.role);
        if (directRoles.length) c = { ...c, roles: directRoles };
        // eslint-disable-next-line no-console
        console.info("[admin-guard] direct user_roles fallback", { directRoles, rolesErr: rolesErr?.message });
      }

      // Belt-and-braces fallbacks so a transient RPC hiccup or schema cache
      // miss doesn't lock a real admin/editor out of the panel:
      //   1. bootstrap email override (matches DB-side is_user_manager)
      //   2. roles array fallback (RPC returned roles even if flags didn't)
      const bootstrap = NORMALIZED.includes(normalizeEmail(e));
      const roles = c.roles ?? [];
      const hasManagerRole = roles.includes("owner") || roles.includes("admin");
      const hasEditorRole = hasManagerRole || roles.includes("editor");

      const resolved = {
        is_manager: !!c.is_manager || bootstrap || hasManagerRole,
        is_editor: !!c.is_editor || bootstrap || hasEditorRole,
        roles,
      };

      // eslint-disable-next-line no-console
      console.info("[admin-guard]", {
        uid: u.id,
        email: e,
        rpcError: capsError?.message ?? null,
        capsRaw: c,
        bootstrap,
        resolved,
      });

      setCaps(resolved);
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [accountUser, loadingSession]);


  const allowed = caps.is_editor; // editor and above can reach the admin shell
  return { checking, allowed, email, caps };
}


export function AdminGate({ children }: { children: ReactNode }) {
  const { checking, allowed, email, caps } = useAdminGuard();
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
    const showDebug = NORMALIZED.includes(normalizeEmail(email));
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">صفحة محصورة على المشرفين</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `الحساب الحالي (${email}) لا يملك صلاحية الوصول.` : "يرجى تسجيل الدخول بحساب مشرف."}
          </p>
          {showDebug && (
            <pre dir="ltr" className="mt-4 max-h-64 overflow-auto rounded bg-black/40 p-3 text-left text-[10px] leading-4 text-amber-200">
{JSON.stringify({ email, caps }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}


/** Manager-only gate. Editors are blocked. */
export function ManagerOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { checking, caps } = useAdminGuard();
  if (checking) return null;
  if (!caps.is_manager) return <>{fallback}</>;
  return <>{children}</>;
}

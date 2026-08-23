// Temporary in-app diagnostics screen for the Capacitor APK.
//
// Route: /admin/native-auth-diagnostics
//
// Purpose: prove exactly what the installed APK is running (embedded build
// identity), what auth configuration it resolved, and where its network
// requests actually go. No secrets, tokens, session bodies, emails, or
// passwords are ever displayed or stored.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getServerApiUrl } from "@/lib/serverApi";
import {
  isCapacitorNative,
  isNativeAuthListenerInstalled,
  isNativeAuthListenerRegistered,
  NATIVE_DEEP_LINK_SCHEME,
} from "@/lib/native-auth";
import {
  BUILD_SHA,
  BUILD_TIME,
  BUILD_TYPE,
  BUILD_TARGET,
} from "@/lib/build-info";
import { readTrace, clearTrace, type TraceEntry } from "@/lib/diag-trace";

export const Route = createFileRoute("/admin/native-auth-diagnostics")({
  component: NativeAuthDiagnostics,
});

type ProbeResult = {
  label: string;
  url?: string;
  status?: number | string;
  ok?: boolean;
  headers?: Record<string, string>;
  bodySummary?: string;
  errorName?: string;
  errorMessage?: string;
};

const BACKEND_ORIGIN = "https://irth-develop.lovable.app";

function summarizeBody(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 400 ? trimmed.slice(0, 400) + "…" : trimmed;
}

function corsHeadersFromResponse(res: { headers: { get(name: string): string | null } }): Record<string, string> {
  const wanted = [
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-allow-credentials",
    "vary",
    "content-type",
  ];
  const out: Record<string, string> = {};
  for (const h of wanted) {
    const v = res.headers.get(h);
    if (v) out[h] = v;
  }
  return out;
}

function NativeAuthDiagnostics() {
  const [native, setNative] = useState(false);
  const [origin, setOrigin] = useState("");
  const [href, setHref] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [hasUser, setHasUser] = useState<boolean | null>(null);
  const [listenerInstalled, setListenerInstalled] = useState(false);
  const [listenerRegistered, setListenerRegistered] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const [nativeTrace, setNativeTrace] = useState<TraceEntry[]>([]);
  const [signupTrace, setSignupTrace] = useState<TraceEntry[]>([]);
  const [deepLinkTrace, setDeepLinkTrace] = useState<TraceEntry[]>([]);
  const [logoutTrace, setLogoutTrace] = useState<TraceEntry[]>([]);
  const [pkceAuditTrace, setPkceAuditTrace] = useState<TraceEntry[]>([]);
  const [exportAuditTrace, setExportAuditTrace] = useState<TraceEntry[]>([]);

  const refreshTraces = useCallback(() => {
    setNativeTrace(readTrace("native-auth"));
    setSignupTrace(readTrace("signup"));
    setDeepLinkTrace(readTrace("deep-link"));
    setLogoutTrace(readTrace("logout-audit"));
    setPkceAuditTrace(readTrace("pkce-audit"));
    setExportAuditTrace(readTrace("export-audit"));
  }, []);

  useEffect(() => {
    setNative(isCapacitorNative());
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    setHref(typeof window !== "undefined" ? window.location.href : "");
    setListenerInstalled(isNativeAuthListenerInstalled());
    setListenerRegistered(isNativeAuthListenerRegistered());
    refreshTraces();
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
      setHasUser(Boolean(data.session?.user?.id));
    })();
    const t = setInterval(refreshTraces, 2000);
    return () => clearInterval(t);
  }, [refreshTraces]);

  const authEmailMode =
    (import.meta.env.VITE_AUTH_EMAIL_MODE as string | undefined) ?? "(unset)";
  const signupUrl = getServerApiUrl("/lovable/email/auth-custom/dispatch");
  const reauthUrl = getServerApiUrl("/lovable/email/auth-custom/verify-reauth");
  const recoveryUrl = getServerApiUrl("/lovable/email/auth-custom/dispatch");
  const serverApiBase = native ? BACKEND_ORIGIN : origin;
  const packageId = "app.lovable.irth";

  async function runProbe(
    label: string,
    doFetch: () => Promise<{ ok: boolean; status: number; headers: { get(n: string): string | null }; text(): Promise<string> }>,
    captureBody: boolean,
  ): Promise<ProbeResult> {
    try {
      const res = await doFetch();
      let bodySummary = "";
      if (captureBody) {
        try {
          bodySummary = summarizeBody(await res.text());
        } catch (e) {
          bodySummary = `(body read failed: ${(e as Error).message})`;
        }
      }
      return {
        label,
        status: res.status,
        ok: res.ok,
        headers: corsHeadersFromResponse(res),
        bodySummary,
      };
    } catch (e) {
      const err = e as Error;
      return {
        label,
        errorName: err.name,
        errorMessage: err.message,
      };
    }
  }

  async function probeHealth() {
    setRunning("health");
    const { serverRequest } = await import("@/lib/serverRequest");
    const url = `${BACKEND_ORIGIN}/`;
    const r = await runProbe(
      "Backend health (GET /) — native transport",
      () => serverRequest(url, { method: "GET" }),
      true,
    );
    r.url = url;
    setProbes((prev) => [r, ...prev].slice(0, 20));
    setRunning(null);
  }

  async function probeDispatchOptions() {
    setRunning("options");
    const { serverRequest } = await import("@/lib/serverRequest");
    const url = `${BACKEND_ORIGIN}/lovable/email/auth-custom/dispatch`;
    const r = await runProbe(
      "Auth dispatch OPTIONS (manual preflight) — native transport",
      () =>
        serverRequest(url, {
          method: "OPTIONS",
          headers: {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
            Origin: origin || "https://localhost",
          },
        }),
      false,
    );
    r.url = url;
    setProbes((prev) => [r, ...prev].slice(0, 20));
    setRunning(null);
  }

  async function probeDispatchPost() {
    setRunning("post");
    const { serverRequest } = await import("@/lib/serverRequest");
    const url = `${BACKEND_ORIGIN}/lovable/email/auth-custom/dispatch`;
    const r = await runProbe(
      "Auth dispatch POST (invalid payload, expect controlled 400) — native transport",
      () =>
        serverRequest(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { diagnostic: true },
        }),
      true,
    );
    r.url = url;
    setProbes((prev) => [r, ...prev].slice(0, 20));
    setRunning(null);
  }

  async function testDeepLink() {
    setRunning("deep-link");
    try {
      const url = `${NATIVE_DEEP_LINK_SCHEME}://auth/callback?code=diagnostic-test`;
      // Attempt to launch the OS deep-link. On Capacitor this dispatches
      // the intent back to MainActivity; the `appUrlOpen` listener will
      // then record its own trace entries.
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    } finally {
      setTimeout(() => {
        refreshTraces();
        setRunning(null);
      }, 1500);
    }
  }

  const rows: Array<[string, string]> = [
    ["git commit SHA", BUILD_SHA],
    ["build timestamp", BUILD_TIME],
    ["build type", BUILD_TYPE],
    ["build target", BUILD_TARGET],
    ["app version (package)", "1.0.0"],
    ["Capacitor native", String(native)],
    ["WebView origin", origin || "(none)"],
    ["current URL", href || "(none)"],
    ["package / app id", packageId],
    ["AUTH_EMAIL_MODE (server)", "server-only (see logs)"],
    ["VITE_AUTH_EMAIL_MODE", authEmailMode],
    ["server API base", serverApiBase],
    ["signup endpoint", signupUrl],
    ["recovery endpoint", recoveryUrl],
    ["reauth endpoint", reauthUrl],
    ["deep-link scheme", `${NATIVE_DEEP_LINK_SCHEME}://auth/callback`],
    ["listener installed", String(listenerInstalled)],
    ["listener registered", String(listenerRegistered)],
    ["Supabase session present", hasSession == null ? "…" : String(hasSession)],
    ["Supabase user id present", hasUser == null ? "…" : String(hasUser)],
  ];

  return (
    <div
      dir="ltr"
      style={{
        minHeight: "100vh",
        background: "#0b1424",
        color: "#e5e7eb",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        padding: 16,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 6, color: "#d4a056" }}>
        Native Auth Diagnostics
      </h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        Read-only diagnostics. No secrets displayed or persisted.
      </p>

      <Section title="Build identity & configuration">
        <Table rows={rows} />
      </Section>

      <Section title="Network probes">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Btn onClick={probeHealth} busy={running === "health"}>
            Test backend health
          </Btn>
          <Btn onClick={probeDispatchOptions} busy={running === "options"}>
            Test auth dispatch OPTIONS
          </Btn>
          <Btn onClick={probeDispatchPost} busy={running === "post"}>
            Test auth dispatch POST
          </Btn>
          <Btn onClick={testDeepLink} busy={running === "deep-link"}>
            Test native deep link
          </Btn>
        </div>
        {probes.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No probes run yet.</p>
        ) : (
          probes.map((p, i) => (
            <div
              key={i}
              style={{
                borderTop: "1px solid #1f2937",
                padding: "8px 0",
              }}
            >
              <div style={{ color: "#d4a056", fontWeight: 600 }}>{p.label}</div>
              {p.url && <div>URL: <code>{p.url}</code></div>}
              <div>Origin (request): <code>{origin}</code></div>
              {p.status !== undefined && <div>Status: <code>{String(p.status)} {p.ok ? "OK" : ""}</code></div>}
              {p.headers && Object.keys(p.headers).length > 0 && (
                <div>
                  Headers:
                  <pre style={preStyle}>{JSON.stringify(p.headers, null, 2)}</pre>
                </div>
              )}
              {p.bodySummary && (
                <div>
                  Body:
                  <pre style={preStyle}>{p.bodySummary}</pre>
                </div>
              )}
              {p.errorName && (
                <div style={{ color: "#f87171" }}>
                  Error: <code>{p.errorName}: {p.errorMessage}</code>
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      <Section title="V13 Logout State Leak Audit">
        <TraceView entries={logoutTrace} onClear={() => { clearTrace("logout-audit"); refreshTraces(); }} />
      </Section>

      <Section title="V13 PKCE & Auth Barrier Audit">
        <TraceView entries={pkceAuditTrace} onClear={() => { clearTrace("pkce-audit"); refreshTraces(); }} />
      </Section>

      <Section title="V13 Android Export Audit">
        <TraceView entries={exportAuditTrace} onClear={() => { clearTrace("export-audit"); refreshTraces(); }} />
      </Section>

      <Section title="Google OAuth trace (native-auth)">
        <TraceView entries={nativeTrace} onClear={() => { clearTrace("native-auth"); refreshTraces(); }} />
      </Section>

      <Section title="Deep-link trace">
        <TraceView entries={deepLinkTrace} onClear={() => { clearTrace("deep-link"); refreshTraces(); }} />
      </Section>

      <Section title="Signup trace">
        <TraceView entries={signupTrace} onClear={() => { clearTrace("signup"); refreshTraces(); }} />
      </Section>

      <Section title="First-launch experience (debug only)">
        <FirstLaunchDiagnostics />
      </Section>
    </div>
  );
}

function readLs(k: string): string {
  try { return localStorage.getItem(k) ?? "(unset)"; } catch { return "(err)"; }
}

function FirstLaunchDiagnostics() {
  const [, force] = useState(0);
  const isDebug = BUILD_TYPE === "debug" || import.meta.env.DEV;
  const rows: Array<[string, string]> = [
    ["cinematic opening completed version", readLs("irth.cinematic-opening.completed-version.v1")],
    ["auth state hydrated", readLs("irth.diag.auth.hydrated")],
    ["irth.firstLaunch.choice.v1", readLs("irth.firstLaunch.choice.v1")],
    ["first-launch dialog skip reason", readLs("irth.diag.firstLaunch.skipReason")],
    ["allowBackup (manifest)", "false (data_extraction_rules excludes all)"],
  ];

  function resetFirstLaunch() {
    try {
      localStorage.removeItem("irth.cinematic-opening.completed-version.v1");
      localStorage.removeItem("irth.firstLaunch.choice.v1");
      localStorage.removeItem("irth.diag.firstLaunch.skipReason");
      localStorage.removeItem("irth.diag.auth.hydrated");
    } catch { /* ignore */ }
    // Reload without clearing other user data.
    try { window.location.href = "/"; } catch { window.location.reload(); }
  }

  return (
    <>
      <Table rows={rows} />
      {isDebug ? (
        <button
          onClick={resetFirstLaunch}
          style={{
            marginTop: 12,
            background: "#d4a056",
            color: "#0b1424",
            border: "none",
            borderRadius: 6,
            padding: "10px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          إعادة اختبار تجربة أول تشغيل
        </button>
      ) : (
        <p style={{ marginTop: 8, opacity: 0.6, fontSize: 11 }}>
          Reset control is disabled in production builds.
        </p>
      )}
      <button onClick={() => force(v => v + 1)} style={{
        marginTop: 8, background: "transparent", color: "#93c5fd",
        border: "1px solid #1f2937", borderRadius: 6, padding: "4px 8px", fontSize: 12,
      }}>
        Refresh flags
      </button>
    </>
  );
}


const preStyle: React.CSSProperties = {
  background: "#111827",
  color: "#e5e7eb",
  padding: 8,
  borderRadius: 6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  fontSize: 12,
  margin: "4px 0 0",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 14, marginBottom: 8, color: "#93c5fd" }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} style={{ borderBottom: "1px solid #1f2937" }}>
            <td style={{ padding: "4px 8px 4px 0", opacity: 0.7, whiteSpace: "nowrap" }}>{k}</td>
            <td style={{ padding: "4px 0", wordBreak: "break-all" }}>
              <code>{v}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Btn({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: busy ? "#4b5563" : "#d4a056",
        color: "#0b1424",
        border: "none",
        borderRadius: 6,
        padding: "8px 12px",
        fontWeight: 600,
        cursor: busy ? "wait" : "pointer",
        fontSize: 12,
      }}
    >
      {busy ? "…" : children}
    </button>
  );
}

function TraceView({
  entries,
  onClear,
}: {
  entries: TraceEntry[];
  onClear: () => void;
}) {
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={onClear}
          style={{
            background: "transparent",
            color: "#93c5fd",
            border: "1px solid #1f2937",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No entries.</p>
      ) : (
        <pre style={preStyle}>
          {entries
            .map((e) => `${e.ts}  ${e.stage}${e.detail ? "  " + e.detail : ""}`)
            .join("\n")}
        </pre>
      )}
    </>
  );
}

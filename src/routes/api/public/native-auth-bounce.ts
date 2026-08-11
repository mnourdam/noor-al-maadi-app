// Public bounce endpoint for Google OAuth → APK deep-link hand-off.
//
// Root cause of the historical ERR_CONNECTION_CLOSED on the Chrome Custom Tab:
// calling `window.location.replace("app.lovable.irth://…")` on the top-level
// tab makes Chrome attempt an HTTP navigation to a non-HTTP scheme. The OS
// captures the intent and launches the app, but the tab itself records a
// failed load and briefly renders the ERR_CONNECTION_CLOSED page.
//
// Fix: never navigate the top-level tab to the custom scheme. Use ONLY the
// `intent://…;S.browser_fallback_url=…;end` form which Chrome recognises as
// an intent-launch URL — it hands off to Android without showing any error
// page, and if the app is somehow uninstallable, silently stays on the
// fallback (this HTML). Custom-scheme is offered ONLY as a user-tap link so
// the failed navigation, if it happens, is intentional and dismissable.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/native-auth-bounce")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = new URLSearchParams(url.search);
        params.delete("native");
        const query = params.toString();
        const cleanSearch = query ? `?${query}` : "";
        const customScheme = `app.lovable.irth://auth/callback${cleanSearch}`;
        // Intent URL keeps the tab happy: Chrome parses it, hands off to
        // Android, and never treats it as a failed HTTP navigation.
        const fallbackUrl = new URL(request.url);
        fallbackUrl.pathname = "/api/public/native-auth-bounce";
        const intentUrl =
          `intent://auth/callback${cleanSearch}` +
          `#Intent;scheme=app.lovable.irth;package=app.lovable.irth;` +
          `S.browser_fallback_url=${encodeURIComponent(fallbackUrl.toString())};S.browser_fallback_mode=1;end`;


        console.info("[native-bounce-hit]", {
          ts: new Date().toISOString(),
          platform: "server",
          stage: "bounce-endpoint",
          hasCode: params.has("code"),
          hasState: params.has("state"),
          hasError: params.has("error"),
        });
        console.info("[native-bounce] incoming", sanitizeOAuthUrl(url));
        console.info("[native-bounce] query", describeSearchParams(params));

        const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>العودة إلى إرث…</title>
<style>
  html,body { margin:0; padding:0; height:100%; background:#0b1424; color:#f3f4f6; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; display:flex; align-items:center; justify-content:center; }
  .card { width:100%; max-width:340px; padding:28px 24px; text-align:center; }
  .logo { font-size:22px; font-weight:800; letter-spacing:.5px; color:#d4a056; margin-bottom:14px; }
  .msg { font-size:15px; opacity:.9; line-height:1.6; }
  .spin { width:34px; height:34px; margin:18px auto; border-radius:50%; border:2px solid rgba(212,160,86,.25); border-top-color:#d4a056; animation:s .9s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
  a.btn { display:inline-block; margin-top:18px; padding:10px 20px; border-radius:12px; background:#d4a056; color:#0b1424; font-weight:700; text-decoration:none; font-size:14px; }
  #manual { display:none; margin-top:20px; opacity:.85; font-size:13px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">إرث</div>
    <div class="spin" aria-hidden="true"></div>
    <p class="msg">جاري العودة إلى التطبيق…</p>
    <div id="manual">
      <p>إذا لم يفتح التطبيق تلقائياً:</p>
      <a id="manual-link" class="btn" href="${escapeAttr(customScheme)}">فتح إرث</a>
    </div>
  </div>
<script>
(function(){
  try {
    var rawSearch = window.location.search || '';
    var rawHash = window.location.hash || '';
    var params = new URLSearchParams(rawSearch);
    params.delete('native');
    // Merge any hash-carried params (implicit flow) into the query so the
    // deep link carries everything gotrue-js expects.
    if (rawHash && rawHash.length > 1) {
      try {
        new URLSearchParams(rawHash.slice(1)).forEach(function(v,k){
          if (!params.has(k)) params.set(k,v);
        });
      } catch(_){}
    }
    var q = params.toString();
    var scheme = 'app.lovable.irth://auth/callback' + (q ? ('?' + q) : '');
    var fallback = window.location.origin + window.location.pathname;
    var intent = 'intent://auth/callback' + (q ? ('?' + q) : '')
      + '#Intent;scheme=app.lovable.irth;package=app.lovable.irth;'
      + 'S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
    // Update the visible manual button to include any hash-carried params.
    try {
      var mlink = document.getElementById('manual-link');
      if (mlink) mlink.setAttribute('href', scheme);
    } catch(_){}
    try {
      var shape = [];
      params.forEach(function(v,k){ shape.push(k + ':' + String(v || '').length); });
      console.log('[native-bounce] query shape', shape.join(','));
    } catch(_){}
    // Fire the intent AFTER first paint so the user sees the "returning…"
    // card and Chrome doesn't record a failed load on the initial response.
    // The intent:// URL is understood by Chrome as an OS hand-off, so it
    // never renders ERR_CONNECTION_CLOSED even when the app is briefly slow.
    function launch(){
      try { window.location.href = intent; } catch(_){}
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(launch, 60);
    } else {
      window.addEventListener('DOMContentLoaded', function(){ setTimeout(launch, 60); });
    }
    // If we're still here after ~1.4s the app didn't take over (rare — user
    // uninstalled the APK, or the intent-filter is off). Reveal the manual
    // button so they can either retry or bail cleanly.
    setTimeout(function(){
      var el = document.getElementById('manual');
      if (el) el.style.display = 'block';
    }, 1400);
  } catch(_){}
})();
</script>
</body>
</html>`;

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function sanitizeOAuthUrl(input: URL | string): string {
  const u = typeof input === "string" ? new URL(input) : new URL(input.toString());
  for (const key of Array.from(u.searchParams.keys())) {
    const value = u.searchParams.get(key) ?? "";
    if (isSensitiveOAuthKey(key)) {
      u.searchParams.set(key, `<len:${value.length}>`);
    }
  }
  if (u.hash) u.hash = "#<fragment-present>";
  return u.toString();
}

function describeSearchParams(params: URLSearchParams): string {
  const entries: string[] = [];
  params.forEach((value, key) => {
    entries.push(`${key}:${isSensitiveOAuthKey(key) ? `<len:${value.length}>` : value}`);
  });
  return entries.length ? entries.join(",") : "(none)";
}

function isSensitiveOAuthKey(key: string): boolean {
  return /(^code$|token|session|jwt|secret|refresh|access|id_token)/i.test(key);
}

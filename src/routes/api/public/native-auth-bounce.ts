// Public bounce endpoint for Google OAuth → APK deep-link hand-off.
//
// Chrome Custom Tab does NOT reliably follow a server 302 to a custom scheme
// (`app.lovable.irth://…`). To force the OS intent hand-off, we return a
// tiny HTML page that triggers both `location.replace(customScheme)` and an
// `intent://…#Intent;scheme=...;package=...;end` fallback, plus a visible
// manual link. This lives under `/api/public/*` so it works on published
// sites without any auth wall and does not go through the React SSR pipeline.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/native-auth-bounce")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = new URLSearchParams(url.search);
        params.delete("native");
        const cleanSearch = params.toString() ? `?${params.toString()}` : "";
        const customScheme = `app.lovable.irth://auth/callback${cleanSearch}`;
        const intentUrl = `intent://auth/callback${cleanSearch}#Intent;scheme=app.lovable.irth;package=app.lovable.irth;end`;

        // Never print raw OAuth codes/tokens to logs. The payload is preserved
        // below, but logs show shape + value lengths so the APK hand-off can be
        // debugged safely on real devices.
        console.info("[native-bounce] incoming", sanitizeOAuthUrl(url));
        console.info("[native-bounce] query", describeSearchParams(params));
        console.info("[native-bounce] generated", sanitizeOAuthUrl(customScheme));

        const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="refresh" content="0;url=${escapeAttr(customScheme)}" />
<title>العودة إلى إرث…</title>
<script>
(function(){
  var base='app.lovable.irth://auth/callback';
  var rawSearch=window.location.search || '';
  var rawHash=window.location.hash || '';
  var params=new URLSearchParams(rawSearch);
  params.delete('native');
  if (rawHash && rawHash.length > 1) {
    var hashBody=rawHash.slice(1);
    try {
      var hashParams=new URLSearchParams(hashBody);
      hashParams.forEach(function(value,key){
        if (!params.has(key)) params.set(key,value);
      });
    } catch(_) {}
  }
  var query=params.toString();
  var scheme=base + (query ? ('?' + query) : '');
  var intent='intent://auth/callback' + (query ? ('?' + query) : '') + '#Intent;scheme=app.lovable.irth;package=app.lovable.irth;end';
  try {
    var shape=[];
    params.forEach(function(value,key){ shape.push(key + ':' + String(value || '').length); });
    console.log('[native-bounce] browser href shape', window.location.origin + window.location.pathname + (rawSearch ? '?…' : '') + (rawHash ? '#…' : ''));
    console.log('[native-bounce] browser query/fragment merged shape', shape.join(','));
    console.log('[native-bounce] redirect shape', scheme.replace(/([?&][^=&#]+)=([^&#]*)/g, function(_, k, v){ return k + '=<len:' + String(v || '').length + '>'; }));
  } catch(_){}
  try { window.location.replace(scheme); } catch(_){}
  setTimeout(function(){
    try { window.location.href = intent; } catch(_){}
  }, 350);
  setTimeout(function(){
    var el = document.getElementById('manual');
    if (el) el.style.display = 'block';
  }, 1200);
})();
</script>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background:#0b1424; color:#f3f4f6; padding:32px; text-align:center; }
  a.btn { display:inline-block; margin-top:12px; padding:10px 18px; border-radius:10px; background:#d4a056; color:#0b1424; font-weight:700; text-decoration:none; }
  #manual { display:none; margin-top:16px; opacity:.85; font-size:14px; }
</style>
</head>
<body>
  <p>جاري العودة إلى تطبيق إرث…</p>
  <div id="manual">
    <p>إذا لم يفتح التطبيق تلقائياً:</p>
    <a class="btn" href="${escapeAttr(customScheme)}">فتح التطبيق</a>
  </div>
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

# IRTH — Web-Only Syria/Turkey Data Loading Audit (READ-ONLY)

Date: 2026-08-27. No code, config, DNS, Supabase, Cloudflare, Android or backend change was made.

## 1. Exact request path for campaigns / Stories / missions

### Web (https://playirth.com)
1. Browser loads SSR HTML from Cloudflare (Lovable Worker).
2. `ensureLocalSnapshotLoaded()` (`src/lib/local-first-store.ts`) → `loadBundledSnapshot()`
   (`src/lib/offline-snapshot.ts:636`) → **browser `fetch('/offline-snapshot.json', {cache:'force-cache'})`**.
   Same-origin, served by Cloudflare. Measured: **2.28 MB gzip / 9.5 MB raw**, single request, no ranged/chunked loading.
3. Campaigns/Stories/missions render from that in-RAM snapshot (`fetchPublishedCampaigns`, `fetchPublishedFeed`, story feed, games/daily rotation).
4. Background refresh + everything user-specific (progress, unlocks, XP, RPCs, story media signed URLs, realtime channels) → **supabase-js from the browser to `https://incqmwpchlygkzitbxlf.supabase.co`** (PostgREST, RPC, Storage, Realtime WebSocket).
5. Lovable server routes (`/api/public/*`, `/lovable/email/*`) are same-origin on web and are NOT used for campaigns/Stories/missions.

### Android V15 (Capacitor)
1. Web assets are **bundled inside the APK**, origin `https://localhost`. No `server.url`, no remote HTML.
2. `offline-snapshot.json` is **shipped inside the APK** (`android/app/src/main/assets/public/offline-snapshot.json`, verified by `scripts/verify-apk-snapshot.mjs`). Step 2 above is a **local file read — zero network**.
3. Supabase calls still use supabase-js over WebView fetch to the same `*.supabase.co` host.
4. Only `serverRequest.ts` (auth-email / native-auth bounce) uses `CapacitorHttp` against the hardcoded `https://irth-develop.lovable.app`.

### The one structural difference
> Android gets its entire content catalogue **from disk**. Web must **download it over the network** on every cold visit.
> Therefore "Android works on the same Syrian network" does **not** prove the backend is reachable from that network — Android renders the bundled snapshot whether or not Supabase/Cloudflare is reachable.

## 2. Most likely root cause (ranked)

**A. Cold-start dependency on a single 2.3 MB same-origin download (HIGH likelihood).**
Web is fully gated on `/offline-snapshot.json`. On a slow/lossy/throttled SY/TR link this request stalls or is
aborted; there is no timeout, no retry, no progressive/partial parse, and `loadBundledSnapshot()` swallows every
error (`catch { }` → returns `null`). Result: the shell loads (small HTML/JS) but campaigns/Stories/missions are
empty with **no error surfaced** — exactly the reported symptom. A VPN with a fast, unthrottled path completes the
download, so the same build "works".

**B. Supabase host reachability from SY/TR consumer ISPs (MEDIUM).**
`*.supabase.co` is a distinct host/IP/SNI from `playirth.com`. Syria is under US sanctions and Supabase/AWS
geo-blocking of Syrian IPs is plausible; TR mobile carriers also break some TLS/SNI paths. If Supabase is blocked,
web loses the refresh path *and* every dynamic/personalised read, while Android silently falls back to its bundled
snapshot and looks healthy. This alone does not explain missing campaigns (they are snapshot-backed) unless the
snapshot fetch (A) also failed.

**C. Realtime WebSocket (`wss://…supabase.co/realtime/v1`) blocked (LOW impact).**
Affects notifications/presence only, not campaigns/Stories/missions.

**Explicitly NOT the cause (confirmed from code/live):**
- CORS/origin: Supabase returns `access-control-allow-origin: https://playirth.com`; OPTIONS preflight → 200.
  `src/lib/serverCors.ts` already allows both playirth origins. **CORS is not involved.**
- Redirects: all three hosts serve 200 directly; no cross-host redirect.
- Cloudflare block of `playirth.com`: the site opens on the affected networks, so the edge is reachable.
- Service worker / PWA cache: **there is no service worker** in this project.
- The removed offline pill: purely cosmetic, removed earlier; it never gated data.

## 3. Answers

| Question | Answer |
|---|---|
| Confidence in cause A | **High (~75%)**, B ~40% (can co-occur), C low |
| CORS/origin involved? | **No** (confirmed live) |
| IPv6 / DNS / Cloudflare / transport involved? | **Requires live test.** Cloudflare serves both hosts over HTTP/2 from CDG; an IPv6-only or MTU/HTTP-3-degraded path would hurt the 2.3 MB transfer specifically |
| Would `api.playirth.com` help? | **Only if B is confirmed** — a same-brand CNAME/proxy in front of Supabase would bypass a host-level block of `*.supabase.co`. It does **nothing** for cause A. Do not build it before the test below |

## 4. The single live test that proves it (run on the Syrian/Turkish network)

Open `https://playirth.com`, DevTools → Network (or remote-debug the mobile browser), hard reload, and record:
1. `/offline-snapshot.json` — status, transfer size, time, whether it completes.
2. Any request to `incqmwpchlygkzitbxlf.supabase.co` — status vs `(failed)`.
3. In the console: `fetch('/offline-snapshot.json',{cache:'reload'}).then(r=>r.blob()).then(b=>b.size)` and
   `fetch('https://incqmwpchlygkzitbxlf.supabase.co/rest/v1/',{headers:{apikey:'<publishable>'}}).then(r=>r.status).catch(e=>e.message)`.

- Snapshot stalls/fails + Supabase OK → **cause A**.
- Snapshot OK + Supabase `TypeError: Failed to fetch` → **cause B**.
- Both fail → transport/CDN-level issue.

## 5. Safest fixes (not implemented)

- **For A (recommended first, low risk, web-only):** split the snapshot into per-collection chunks or ship a small
  "core" snapshot (campaigns + stories index) with the heavy encyclopedia/atlas loaded lazily; add a timeout +
  retry and a real error state instead of a silent `null`. Web-only change, does not touch the APK.
- **For A (zero-code interim):** none available — the payload is what it is.
- **For B:** only after confirmation — proxy Supabase through a same-origin `/api/*` Worker route or
  `api.playirth.com`. This is a large surface (auth tokens, storage, realtime) and must not alter V15 paths.
- **For C:** graceful degradation when realtime cannot connect (already non-fatal).

## 6. Classification

**CONFIRMED FROM CODE / LIVE**
- Web cold start is gated on one 2.28 MB gzip same-origin snapshot download; Android reads the same file from the APK.
- All snapshot fetch errors are silently swallowed; no timeout, retry, or user-visible error.
- Supabase CORS accepts `https://playirth.com`; preflight 200; no redirects on any host.
- No service worker; no CSP; campaign/story/mission reads are local-first, not Edge Functions.
- Android's apparent success on SY/TR networks does not prove backend reachability.

**REQUIRES LIVE NETWORK TEST (from Syria/Turkey)**
- Whether `/offline-snapshot.json` completes on those links.
- Whether `*.supabase.co` (REST + Realtime) is reachable from those ISPs.
- IPv6-only path, DNS resolution, HTTP/3 fallback, TLS/SNI filtering behaviour.

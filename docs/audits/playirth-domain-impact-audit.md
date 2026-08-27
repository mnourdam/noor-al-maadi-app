# IRTH — `playirth.com` Custom Domain Safety Audit (READ-ONLY)

Nothing was connected, changed, or configured. No DNS, no Supabase, no OAuth, no Resend, no Firebase, no Capacitor, no `main`.

---

## Main answer

**Yes — `playirth.com` can be added without affecting installed V15 Android users, on one condition: `https://irth-develop.lovable.app` must keep resolving and stay in every allow-list.**

The reason is structural, not a guess:

1. **The APK does not load its UI from any Lovable domain.** `capacitor.config.ts` sets `webDir: "dist/android"` and `server: { androidScheme: "https" }`, and **there is no `server.url`**. The V15 WebView boots bundled local assets at origin `https://localhost`. Adding a web domain cannot change what an installed APK renders.
2. **The APK *does* hardcode the Lovable hostname as its backend origin**, in three independent places, baked into the shipped V15 bundle and unchangeable without a new release:
   - `src/lib/serverApi.ts:15` — `TRUSTED_ORIGIN = 'https://irth-develop.lovable.app'`, prefixed onto **every** server-route call made from native.
   - `src/lib/native-auth.ts:36` — `NATIVE_REDIRECT_URL = 'https://irth-develop.lovable.app/api/public/native-auth-bounce'` (Google OAuth hand-off).
   - `src/lib/auth-emails.ts:22` — `WEB_CALLBACK_ORIGIN = 'https://irth-develop.lovable.app'` (signup verify / recovery links, and the native bounce built from it).

So: adding a domain is safe; **removing or repointing the old one is a V15-breaking change.** Lovable custom domains are additive — the `.lovable.app` URL keeps serving after a custom domain is connected — which is exactly what makes this safe.

---

## 1. Android V15 dependency on the current Lovable domain

Every occurrence found in the repo:

| Location | Use | Baked into V15 APK? | Breaks if the old domain stops working? |
|---|---|---|---|
| `src/lib/serverApi.ts:15` | native → backend origin for all server routes | **Yes** | **Yes — total backend failure in the APK** |
| `src/lib/native-auth.ts:36` | Google OAuth bounce endpoint | **Yes** | **Yes — Google login dies** |
| `src/lib/auth-emails.ts:22` | verify/recovery link origin + native bounce base | **Yes** | **Yes — signup & reset links dead** |
| `src/lib/share/publicOrigin.ts:27` | dev fallback for share/referral/QR origin | Only if `VITE_PUBLIC_APP_ORIGIN` unset | Shared links 404 |
| `src/lib/serverCors.ts:11-16` | CORS allow-list (`+ *.lovable.app` suffix) | server-side | n/a |
| `src/lib/email-templates/_brand.ts:13-14` | email `siteUrl` + logo URL | server-side | Broken logo / links |
| `supabase/functions/auth-email-hook/index.ts:44` | email logo URL | server-side | Broken logo |
| `src/routes/lovable/email/queue/process.ts:259` | List-Unsubscribe (env-overridable via `VITE_SITE_URL`) | server-side | Header only |
| `src/routes/admin.native-auth-diagnostics.tsx:44` | admin diagnostics target | admin only | Admin tool only |
| `src/routes/lovable/email/auth/preview.ts:29` | sample value in a preview route | no | no |
| `supabase/migrations/2026071309…sql:30` | **stale preview host** in `email_queue_dispatch()` | server-side | Already broken (see V16 audit) |
| `src/integrations/supabase/previewAuthStorage.ts:8` | preview-zone detection list | generated | see §8 note |

Per-subsystem verdict for the **installed V15 build**:

- **App runtime / content** — bundled in the APK. Unaffected. ✅
- **`server.url`** — not set. Unaffected. ✅
- **API calls** — hardcoded to the old origin. Old origin must stay. ⚠️
- **Auth / OAuth redirect / deep links** — custom scheme `app.lovable.irth://auth` + old-origin bounce. Adding a domain changes nothing. ✅ (old bounce URL must stay ⚠️)
- **Password reset / email verification** — links point at the old origin. Must stay. ⚠️
- **Media/assets, offline snapshots** — bundled (`public/offline-snapshot.json`, `public/emblems`, `public/campaign-key-art`, `public/story-covers`) plus Supabase signed URLs. Domain-independent. ✅
- **Notifications** — FCM ↔ Supabase, no web domain involved. ✅
- **WebView navigation** — no allow-list/`allowNavigation` entry exists; nothing to update. ✅

**Conclusion: adding `playirth.com` cannot break existing V15 installs. Retiring `irth-develop.lovable.app` would break them completely.**

---

## 2. Supabase Auth

Web auth builds redirects from `window.location.origin` (`auth.tsx:164,215`, `cloud-save.ts:163`, `GoogleSignInButton.tsx:86`), so a browser on `playirth.com` will request `https://playirth.com/auth/callback`. That URL is **rejected until it is added to the redirect allow-list** — Supabase silently falls back to Site URL, and the user lands on the wrong host mid-login.

Required (**add, never replace**):

- `https://playirth.com/**` and `https://www.playirth.com/**`
- Keep `https://irth-develop.lovable.app/**` — V15's bounce and email links depend on it.
- Keep `https://irth-develop.lovable.app/api/public/native-auth-bounce` explicitly.
- **Do not change Site URL yet.** Site URL is the fallback target for any redirect that fails matching; flipping it to `playirth.com` while V15 is live sends stragglers off the origin V15 expects.

**PKCE risk.** The known intermittent Android PKCE failure is *not* worsened by adding a domain — native flow never touches the web origin, it uses the hardcoded bounce + custom scheme. The real risk is **new, web-side**: PKCE verifiers live in origin-scoped localStorage, so a user who starts login on `lovable.app` and is redirected to `playirth.com` (or vice versa) has **no verifier at the destination origin** → hard `invalid request: code verifier` failure. Never mix origins inside one auth attempt, and don't add a cross-domain redirect until after the allow-list is in place and web login is verified end to end on the new origin alone.

---

## 3. Google OAuth

Auth is **Lovable Cloud managed social login**. Google's authorized redirect URI is the Supabase auth endpoint (`https://<project>.supabase.co/auth/v1/callback`), not your web domain, so:

- **Authorized redirect URIs — no change required.**
- **Authorized JavaScript origins — no change required** for this flow (no Google Identity Services JS SDK / One Tap in the codebase; `GoogleSignInButton.tsx` only calls `supabase.auth.signInWithOAuth`). If One Tap is ever added, `https://playirth.com` must be added there.
- **Consent screen** — unchanged. Optionally update the homepage/privacy URLs *after* cutover.
- **Android OAuth config** — unchanged. V15 uses the custom scheme + the hardcoded bounce; **must not be touched.**

The only thing that must change for web Google login on the new domain is the **Supabase redirect allow-list** (§2).

---

## 4. Capacitor / Android

- `capacitor.config.ts` — no `server.url`, no `allowNavigation`, no `hostname`. Nothing references any Lovable domain. **No change needed, no new build needed.**
- `AndroidManifest.xml` — only two intent filters: LAUNCHER, and `scheme="app.lovable.irth" host="auth"` with `autoVerify="false"`. **There are no App Links / `https` intent filters at all**, so `playirth.com` links will open in the browser, not the app — which is the safe default and requires no manifest change.
- If you later want `https://playirth.com/...` to open the app, that needs a new manifest intent filter + `assetlinks.json` + **a new Android release**. Optional and strictly future work.

**Verdict: the web domain can be added with zero Android changes and no new APK.**

---

## 5. Firebase / FCM

No dependency on the web domain anywhere: tokens come from `@capacitor/push-notifications`, delivery is `supabase/functions/send-notification` → FCM, click routing uses the internal `deep_link` path resolver. `google-services.json` is keyed to the package name `app.lovable.irth`, not a hostname. **Zero impact.** (Separately: external `https://` deep links already don't work — see the V16 audit, unrelated to this domain.)

---

## 6. Resend / auth emails

`WEB_CALLBACK_ORIGIN` in `auth-emails.ts:22` is a **hardcoded constant**, so today every verification and password-reset link points at `irth-develop.lovable.app` — **including for a user who signed up on `playirth.com`**. Not broken, but off-brand and confusing after launch. Same for `_brand.ts:13-14` (`siteUrl`, `logoUrl`) and the hook's logo URL.

The eventual fix must be **origin-aware, not a find-and-replace**: web callers should get `https://playirth.com/auth/callback`, while native callers must keep receiving `https://irth-develop.lovable.app/api/public/native-auth-bounce` — because that exact URL is compiled into V15. Making it a single new constant would brick password reset for every installed V15 user. Do this only after both origins are allow-listed, and only behind a platform check.

(Note: auth emails are currently not being delivered at all due to the stale dispatch URL documented in the V16 audit. Fix that first — otherwise domain email testing will produce false negatives.)

---

## 7. CORS / CSP / origins

- `src/lib/serverCors.ts:7-18` allows `localhost`, `capacitor://localhost`, the two `.lovable.app` hosts, and any `*.lovable.app` / `*.lovable.dev` suffix. **`playirth.com` is not covered.** In practice a browser on `playirth.com` calls its own server routes **same-origin**, so no preflight and no failure. It only matters if anything ever calls the backend cross-origin — and it must be added before that.
- Edge functions `send-notification` and `run-automatic-notifications` use `Access-Control-Allow-Origin: *`. Unaffected.
- **No CSP header or meta tag exists** in the project. Nothing to update.
- Supabase Storage / signed URLs are project-scoped, not origin-scoped. Unaffected.
- `serverApi.ts` `TRUSTED_ORIGIN` rejects any `VITE_PUBLIC_APP_ORIGIN` that isn't the Lovable host — this affects **native only** and must stay as-is until a V16 build.

Add later: `https://playirth.com` + `https://www.playirth.com` to `ALLOWED_ORIGINS` in `serverCors.ts`.

---

## 8. Offline / Service Worker / PWA / browser storage

- **No service worker exists** — no `serviceWorker.register`, no workbox, no `sw.js`. Nothing to invalidate or unregister. ✅
- `public/manifest.webmanifest` uses relative `start_url: "/"`, `scope: "/"`, and relative icon paths — it works on any domain unchanged. ✅
- **Browser-local storage is origin-scoped, and this is the one real user-visible consequence:** a web player who used `irth-develop.lovable.app` and then visits `playirth.com` starts with **completely empty localStorage, IndexedDB, and Cache Storage on the new origin**. There is no way to migrate it — browsers forbid cross-origin storage access.
  - **Signed-in web players**: fine. They log in again and everything re-syncs from the server (profile, economy, campaigns, stories, investigations, discoveries, collection, achievements).
  - **Guest web players**: their progress is **permanently stranded on the old origin** — `irth.guest.storyCompletions.v1`, `irth.game-completions.guest.v1`, `irth.achievements.v2.guest_unlocks`, plus any unflushed offline outbox items.
  - Also re-downloaded from scratch on the new origin: the 9.1 MB offline snapshot, image cache, audio cache. First visit will be heavy.
  - PWA: an installed PWA from the old origin is a **separate app**; users must reinstall from `playirth.com`.
  - `previewAuthStorage.ts:8` treats `lovable.app` as a preview zone; `playirth.com` will not match, so it takes the normal production storage path — correct, but worth an explicit smoke test of session persistence on the new origin.
  - **Android is unaffected** — the APK's origin stays `https://localhost` regardless.

**Mitigation to plan (not now):** before cutover, show a one-time banner on the old origin urging guests to create an account so their progress becomes server-backed.

---

## 9. SEO / canonical

Current state: **no `robots.txt`, no `sitemap.xml`** in `public/`. Route metadata is per-route `head()`; Open Graph URLs are not hardcoded to a domain, and share URLs derive from `VITE_PUBLIC_APP_ORIGIN` / `resolvePublicOrigin()`.

Recommended future setup (do not implement yet):
1. Make `playirth.com` the **Primary** domain in Lovable so `www` and the `.lovable.app` URL redirect to it — *only after* V15's hardcoded backend paths have been proven to survive that redirect, or you will break the APK. Verify specifically that `/api/public/native-auth-bounce` and `/lovable/email/*` still respond correctly (a 301 on a POST route is a real risk).
2. Add `public/robots.txt` + a generated `sitemap.xml` on the canonical host.
3. Add `<link rel="canonical">` per route pointing at `https://playirth.com/...`.
4. Set absolute `og:url` / `og:image` on the canonical host in leaf routes.
5. Register both hosts in Search Console, submit the sitemap, and use a Change of Address once the redirect is confirmed.
6. Set `VITE_PUBLIC_APP_ORIGIN=https://playirth.com` **for the web build only** — the Android build must keep the Lovable origin until a V16 release ships.

Both domains serving identical content without a canonical is a duplicate-content problem; that's the reason to do step 1 and 3 together, but only after the compatibility window closes.

---

## 10. Safe rollout procedure

**Your compatibility-first approach is correct.** One correction: step "make it primary/canonical" is not purely a web decision — the redirect it enables is the single thing that can reach out and touch V15, because V15 calls `/api/public/*` and `/lovable/email/*` on the old host. Treat "connect the domain" and "make it primary" as two separate, separately-tested phases.

**Phase 0 — prerequisites**
1. Fix the auth-email dispatch URL (V16 audit) so email tests are meaningful.
2. Buy `playirth.com`; add both apex and `www` in Lovable. Do not set Primary.
3. Snapshot current Supabase Site URL + redirect allow-list before touching anything.

**Phase 1 — additive config**
4. Add `https://playirth.com/**` and `https://www.playirth.com/**` to the Supabase redirect allow-list. **Remove nothing.** Leave Site URL as-is.
5. Leave Google Cloud Console, Firebase, Resend, Capacitor, and the manifest untouched.

**Phase 2 — connect and verify web**
6. Connect the domain, wait for DNS + SSL (`Active`).
7. On `playirth.com`: full app smoke test, Google login, email signup + verification, password reset, share/referral links, offline browsing, PWA install, notifications permission.
8. **Immediately re-verify the old origin still serves** `/api/public/native-auth-bounce` and `/lovable/email/auth-custom/dispatch` with a 200 (not a redirect).

**Phase 3 — Android regression (mandatory gate)**
9. On a **real device with the Play Store V15 build** (not a fresh dev build): cold start, Google login, logout/login, email signup, password reset, push receive + tap, offline play, campaign/story progress sync. Any failure here stops the rollout.

**Phase 4 — soak**
10. Run both domains in parallel for at least one to two weeks. Watch auth error rates and `email_send_log`.

**Phase 5 — canonical (only after V16 ships)**
11. Ship V16 with origin-aware email links and an env-driven backend origin, so the app no longer hardcodes the Lovable host.
12. Only then set `playirth.com` Primary, add canonical/sitemap/robots, and do the Search Console Change of Address.
13. Keep `irth-develop.lovable.app` connected and responding **as long as any V15 install exists in the field** — realistically forever, or until you force-upgrade users.

---

## Required conclusion

**Risk to current V15 Android users: LOW** — provided the old domain is only *added to*, never replaced, repointed, or redirected. It rises to **HIGH** the moment `irth-develop.lovable.app` stops serving `/api/public/*` and `/lovable/email/*` with a direct 200.

**Can `playirth.com` be connected safely without releasing a new Android version? YES** — the APK bundles its own web assets and has no `server.url`; connecting a web domain is invisible to it.

**Must the old Lovable URL remain configured for V15 compatibility? YES** — unconditionally. Three constants compiled into the shipped V15 bundle (`serverApi.ts:15`, `native-auth.ts:36`, `auth-emails.ts:22`) point at it, and installed apps can never be changed retroactively.

**Configuration changes required before connection**
1. Supabase redirect allow-list: add `https://playirth.com/**` and `https://www.playirth.com/**`.
2. Purchase the domain and add both apex and `www` in Lovable (do not set Primary).
3. Fix the auth-email dispatch URL first, so email flows are actually testable.
4. *(Web build only, later)* `VITE_PUBLIC_APP_ORIGIN=https://playirth.com`.
5. *(Before any cross-origin call)* add both new hosts to `ALLOWED_ORIGINS` in `src/lib/serverCors.ts`.
6. Google Cloud Console: **nothing** (managed social login redirects through Supabase).

**Configuration that must NOT be removed or changed yet**
- `https://irth-develop.lovable.app` as a live, connected, non-redirecting domain.
- That host in the Supabase redirect allow-list, including `/api/public/native-auth-bounce`.
- Supabase **Site URL** at its current value.
- `TRUSTED_ORIGIN` in `serverApi.ts`, `NATIVE_REDIRECT_URL` in `native-auth.ts`, `WEB_CALLBACK_ORIGIN` in `auth-emails.ts`.
- The `app.lovable.irth://auth` intent filter and `appId`.
- Google OAuth client config, Firebase project/`google-services.json`, Resend sending domain.
- Everything in `capacitor.config.ts`.
- `*.lovable.app` entries and suffix rule in `serverCors.ts`.

**Tests required before going live**
- Web on `playirth.com`: Google login (fresh + returning), email signup + verification link, password reset, logout/login, session persistence after refresh.
- Web: share/referral link + QR generation produces a reachable URL.
- Web: offline browsing after first load, PWA install, notification permission prompt.
- Old origin still returns 200 (not 3xx) on `/api/public/native-auth-bounce` and `/lovable/email/auth-custom/dispatch`.
- **Play Store V15 build on a real device**: Google login, email signup, password reset, push receive + tap, offline play, progress sync — before *and* after the domain goes live.
- Guest-storage check: confirm a guest on `playirth.com` starts clean and that this is acceptable, or ship the "create an account" banner first.
- Repeat the Android device pass a second time before setting `playirth.com` as Primary.

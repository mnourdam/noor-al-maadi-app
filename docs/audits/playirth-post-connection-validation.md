# IRTH — playirth.com Post-Connection Validation (read-only + one additive fix)

Date: 2026-08-27 · V15 Android live on Google Play · Scope: web/domain configuration only.

## 1. Live status (measured)

| URL | Result |
|---|---|
| https://playirth.com | 200, app loads, primary |
| https://www.playirth.com | 302 → https://playirth.com/ (correct canonicalization) |
| https://irth-develop.lovable.app | **302/307 → https://playirth.com/...** (no longer serves directly) |

Lovable reports both custom domains `active`, `playirth.com` has `primary: true` (the star = primary/canonical domain; every other project domain 30x-redirects to it).

Redirects preserve path **and** query:
`/api/public/native-auth-bounce?code=ABC&type=signup` → `https://playirth.com/api/public/native-auth-bounce?code=ABC&type=signup`.
POST/OPTIONS return **307** (method + body preserved).

## 2. V15 impact — the one real risk (NOT fixed, requires your decision)

V15 still hardcodes the old host in `serverApi.ts` (`TRUSTED_ORIGIN`), `native-auth.ts` (`NATIVE_REDIRECT_URL` bounce), `auth-emails.ts` (`WEB_CALLBACK_ORIGIN`). Connecting the domain did not change app code — but **making playirth.com primary made the old host a redirector instead of a direct server.**

- Native Google login: SAFE. The bounce is a browser GET; 302 preserves `?code`, the browser follows, the app scheme fires.
- Static/web assets: SAFE.
- **`CapacitorHttp` POSTs (signup / password reset / email change / verify-reauth): AT RISK.** These now receive a 307 cross-host redirect. Android's `HttpURLConnection` (used by Capacitor HTTP) has unreliable 307-with-body follow behavior and may drop the `Authorization` header across hosts. If it does not follow, V15 signup/reset returns a non-2xx and fails.

Not reproducible from here — it needs one physical V15 device test. Until that test passes, **primary should be reverted to `irth-develop.lovable.app`** (Project Settings → Domains → set the Lovable URL primary), which restores direct serving on the old host while `playirth.com` keeps working.

I did not change primary — that is a dashboard action and it carries V15 consequences either way.

## 3. Supabase redirect allow-list — no change needed (verified empirically)

Probed `/auth/v1/verify?redirect_to=…`:

| redirect_to | Honored? |
|---|---|
| https://playirth.com/auth/callback | YES — already allow-listed |
| https://www.playirth.com/auth/callback | YES — already allow-listed |
| https://irth-develop.lovable.app/auth/callback | YES — preserved |
| https://evil.example.com/x | rejected → fell back to site_url = `https://irth-develop.lovable.app` |

`site_url` is still the old host → V15 fallback behavior unchanged. **Nothing added, nothing removed.**

## 4. Google login on playirth.com

`/auth/v1/authorize?provider=google&redirect_to=https://playirth.com/auth/callback` → 302 to Google with
`redirect_uri=https://incqmwpchlygkzitbxlf.supabase.co/auth/v1/callback`.
Google only ever sees the Supabase callback → **no Google Cloud Console change required**. PKCE stays on one origin (playirth.com), no cross-domain hop, no loop.

## 5. Auth emails / reset links

Dispatch remains broken for the previously documented reason (dead preview hostname in `email_queue_dispatch()`), unrelated to the domain. Correct future destination for web links is `https://playirth.com/auth/callback` and `/reset-password`; `WEB_CALLBACK_ORIGIN` must keep pointing at the old host until V16 ships an env-driven origin. No change made.

## 6. "غير متصل — محتوى محفوظ" — root cause found, NOT domain-related

The pill is present in the **server-rendered HTML of both domains** (`curl` on playirth.com and on the old URL both contain it). Cause: `useIsOffline()` in `src/components/fallbacks.tsx:180` initializes with `typeof navigator !== "undefined" ? !navigator.onLine : false`. In the Cloudflare Worker SSR runtime `navigator` **is** defined but `navigator.onLine` is `undefined` → `!undefined === true` → the pill renders server-side. It disappears on hydration.

Browser test on playirth.com: `navigator.onLine === true`, no offline pill after hydration, Supabase REST reachable, no CORS errors, snapshot sync ran normally. So: **SSR/first-paint + crawler artifact, not a domain, CORS or connectivity issue.** Not fixed here because it is not domain-specific (a one-line `false` default fixes it; say the word).

## 7. CORS / origins — one additive change applied

`src/lib/serverCors.ts`: added `https://playirth.com` and `https://www.playirth.com` to `ALLOWED_ORIGINS`. Nothing removed; the legacy origin now carries a "never remove" comment. Edge functions already use `*`. Web calls from playirth.com are same-origin, so this is future-proofing only — zero V15 exposure.

## 8. Local state across origins

Different origins ⇒ separate `localStorage` and IndexedDB. Signed-in users re-sync server-backed state (profile, economy, campaigns, stories, achievements). **Guest-only progress does not migrate** and cannot be migrated safely cross-origin. Recommended notice on playirth.com for former web guests: "سجّل الدخول لاستعادة تقدّمك — التقدّم كضيف مرتبط بالموقع القديم."

## 9 & 10. www + primary decision

`www` → apex redirect is correct and harmless (pre-auth navigation only). Canonical public web origin should be `https://playirth.com`.

**Can playirth.com be primary without affecting the old URL? NO** — in Lovable, primary implies the others redirect, and that is exactly what is happening now. So: keep `playirth.com` connected and marketed as canonical, but set primary back to `irth-develop.lovable.app` until the V15 device test above is green or V16 ships.

## Answers

- Did connecting playirth.com affect V15? **YES — indirectly**, via the primary switch turning the old host into a redirector.
- Can current V15 continue safely? **CONDITIONAL** — safe for launch, browsing, Google login, content; at risk for signup/reset/reauth POSTs until either the device test passes or primary is reverted.
- Is the old Lovable URL still mandatory? **YES.**
- Can playirth.com safely be the public/canonical domain now? **CONDITIONAL** — yes as the public URL; not yet as Lovable "primary".

## Remaining actions

1. Revert primary to `irth-develop.lovable.app` (or run the device test first).
2. Physical V15 device test: signup + password reset + email change while the old host 307-redirects.
3. Optional one-line SSR fix for the offline pill.
4. V16: make the origin env-driven (`serverApi.ts`, `auth-emails.ts`, `native-auth.ts`) so primary can move permanently.

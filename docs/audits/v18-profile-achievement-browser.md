# Isolated actual Profile achievement browser lane (runtime pending)

Base `49d15957`. This test-only lane mounts the existing exported Profile route component, achievements tab/detail, AppShell, ModalPortal, real driver/engine/registry/view-model/museum projection, language store and production CSS/fonts. It does not copy or reimplement the selection or detail UI. EngineBoot is not mounted. No production behavior changes.

## Isolation

- Explicit synthetic account/router boundary and deterministic checked `user_collection` reads. SDK mutation/unknown-call paths increment a counter and throw, even if a caller catches the exception. Claims/repair and unrelated service calls likewise fail. The real signed-in engine reset reads only a synthetic achievement receipt for a distinct synthetic owner; no earning cycle or real SDK is loaded.
- Actual Supabase/integration modules are prohibited by the build. The build asserts that required real route/projection modules participated. Unrelated HUD/poller/account/avatar/backdrop and non-achievement-tab dependencies are stubbed; the unrelated page sections remain Arabic. Decorative texture/favicon are omitted.
- No environment loading or public-directory copy. Output must be an empty, non-symlink `/tmp/irth-profile-achievement-<unique>/assets` directory. Build imports only repository/dependency code, styles and fonts.
- Runtime serves only the generated manifest paths on 127.0.0.1 with a fresh browser profile. Exact-origin GET-only allowlist; queries, credentials, unknown paths, external HTTP and WebSocket access blocked. Service workers disabled. Any blocked request, page error, console error or unexpected mutation fails acceptance.
- Repair-branch-only path-scoped CI, read-only contents and no persisted checkout credentials. Same official tooling versions as existing browser lane: Node24, Python3.12, Playwright1.62.0. No host security configuration change.
- Artifacts contain sanitized JSON results only, no raw browser logs/screenshots/profile/database/account data. Failed runtime exceptions produce generic failure JSON, not raw captured build stderr.

## Intended acceptance (not yet executed)

1. Real nine-to-ten ownership refresh increases earned count by exactly one and changes detail90%→100%, with explicit reward-unconfirmed warning and no authoritative receipt.
2. The current actual dialog retains its DOM across ar/en changes, exposes the matching accessible title/lang/dir, and renders complete canonical title/description and controls at360/390/768px without horizontal overflow.
3. Owner switch removes prior ownership evidence without inventing a close-on-owner-change contract: actual Profile retains the selected achievement ID.
4. A distinct synthetic owner with an already-claimed receipt hydrates the real mirror and shows the unlock date instead of the unconfirmed warning. No grant/mutation or museum engine progress is generated.

No full-app navigation, hosted Auth/RLS, real player data, native focus/Escape/Back/TalkBack, image upload, reward granting, or release acceptance is asserted. Only the existing legacy modal behavior is exercised. The tests must fail rather than patch production behavior if a layout issue appears.

## Local validation

Static Vite build succeeded with the actual route/projection modules, styles and fonts. Eight Node build/workflow guards and two pure Python request/asset guards pass; Python syntax checked. No local browser/server or CI execution performed. Runtime remains pending independent review and authorized publication.

Review refinement: detail geometry requires a positive element box and at least one positive text-range rectangle before containment checks. Workflow triggers include AppShell/styles and package manifests (the bundled fonts are @fontsource dependencies), so relevant layout/font changes rerun the lane. Runtime remains unexecuted.

## Integrated static validation
The final reviewed fixture and nonempty geometry/trigger correction were integrated locally. The actual-module static Vite bundle, eight Node build guards and two Python safety guards passed again on the integrated checkout. No HTTP server or browser was launched; all nine browser acceptance groups remain unexecuted.

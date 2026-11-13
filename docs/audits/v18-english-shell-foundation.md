# English shell preview foundation (not full English support)

## Scope

Adds a typed `ar | en` UI dictionary and reactive, device-local preference, plus an explicitly labeled language chooser in AppShell. It translates the six bottom-navigation labels, navigation accessibility name, and primary HUD accessible labels. The chooser describes the exact preview boundary in either language. No existing route, tutorial target, player identity, content ID or answer key changes.

Arabic remains the default and server-rendered language. `useSyncExternalStore` always supplies Arabic for SSR/hydration; after hydration, the client preference is reflected reactively. Storage is read lazily, not at module import. Invalid saved values fall back to Arabic. Explicit changes persist to `irth.device.uiLanguage.v1`, already a shared/device key under existing partition rules. Failed or silently dropped writes retain a session-only preference. Storage events update other mounted subscribers; unreadable events do not discard that session choice. No profile/auth/network operation is introduced.

## Mixed-language and native boundaries

Only translated navigation and chooser islands use their selected `lang` and direction. Primary HUD controls expose the selected language for their accessible labels; existing numeric values and timer formatting are untouched. HUD popovers are explicitly Arabic/RTL, and AppShell page content is explicitly Arabic/RTL. Personal inbox and other untranslated UI remain Arabic. English selection does not claim the page, campaigns, museum, encyclopedia, profile, historical or religious content is translated.

Document `html` language/direction, root renderer, native shell and stylesheet are unchanged. In particular, no React HTML/body wrapper is introduced into Capacitor. Switching language does not remount page content or reset gameplay. No Riyadh day key, date calculation, reward, currency, stats or persistence policy is changed. No sacred text or gameplay material is translated.

## Verification

Two isolated jsdom suites exercise the real chooser, locale store, AppShell navigation and HUD label wiring. Router/profile/stat/notification/Popover infrastructure is mocked where unrelated to language; this is not a real player/account or native test. Cases cover dictionary parity; reactive switching; device-only persistence; unsupported locales; throwing/silent storage; subsequent subscribers; cross-tab/clear/invalid/unreadable/sessionStorage events; subscriber cleanup; SSR Arabic with stored English plus hydration without recoverable mismatch; preserved nav/tutorial IDs, Arabic content boundaries and mount count; and primary HUD labels with unchanged stat/timer values and Arabic popovers.

Runtime locale choice is not trusted application data. The public setter rejects unsupported values. The device-key classification uses the real identity-partition classifier in tests, without changing or installing partition rules.

This foundation remains a preview, not whole-product English acceptance. Actual responsive visual review, native device language switching and broader translation require separate review. No deployment or V18 release approval is implied.

Local verification on base `75872a66`: **13/13** new focused tests, both `tsc --noEmit` and `tsc --project tsconfig.outbox.json --noEmit`, and **1,854/1,854** offline tests across **91 files** passed. Diff whitespace check passed. No browser/native visual or production build acceptance is claimed by these gates.

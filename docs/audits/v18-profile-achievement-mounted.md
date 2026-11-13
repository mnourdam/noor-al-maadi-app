# Mounted Profile achievement presentation acceptance

Test-only candidate based on `75e39c3e`; no production implementation changes.

The fixture renders the actual `Route.options.component` from `src/routes/profile.tsx`, including its achievements tab, ID-backed detail selection and existing `ModalPortal`. The achievement driver, registry, view-model, museum ownership projection and device language store remain real. An SDK fixture supplies synthetic session/collection rows. The profile/account, router hooks, emblem hook, shell/decorative components and unrelated mutation services are isolated mocks. The achievement engine is not booted; the persisted-record getter supplies controlled receipts. This is not full navigation, actual Auth, backend policy, earned-reward or native acceptance.

Five cases cover:

1. Nine confirmed synthetic museum items show 90% in the actual detail. A collection-change refresh to ten increments the actual total earned display by exactly one, shows 100%, and displays the explicit reward-unconfirmed warning with no invented unlock date.
2. An open detail changes its canonical title/description between Arabic and English through the real language store without replacing its dialog DOM. Arabic tab/progress chrome remains Arabic. This is localized achievement text, not full English Profile.
3. An already-claimed record shows its unlock date without the ownership-only warning.
4. An unknown deep-link ID creates no dialog; a known ID opens the actual detail and navigation consumes only the achievement parameter, preserving the achievements tab.
5. A delayed former-owner collection response cannot restore museum ownership in an open detail after an owner switch.

All cases assert no claim, historical repair, SDK mutation, or profile-setting write. The engine museum snapshot remains unchanged. No reward, notification or authoritative receipt is generated. These assertions concern the mounted route, not application boot processes omitted from the fixture.

Remaining gates: styled browser layout, actual routing and identity integration, native Back/TalkBack/picker behavior, effective backend RLS, and production acceptance. The existing custom achievement dialog does not acquire focus-trap/Escape or explicit English-language semantics through these tests; those capabilities are not claimed. No test changes production behavior or translation content.

Validation on this test-only candidate: 5/5 mounted tests passed after final assertion/SDK-spy review corrections. The three-file mounted + existing museum + language set passed 27/27 before those strengthening-only corrections. Both application and outbox TypeScript checks passed after the final correction; `git diff --check` passed. No browser/server/backend was run.

Coordinator independently reread the final two-file fixture/audit and reran 5/5 cases successfully after the SDK CRUD-spy and awaited-render refinements. Integrated checkpoint `93147609` passed both TypeScript projects and **1,980/1,980** offline tests across **108 files**, plus source-drift checks and synthetic Android SPA compilation. These gates do not expand the mocked-boundary acceptance described above.

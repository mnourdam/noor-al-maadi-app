# Minimal public Profile/museum browser acceptance subset

Base local checkpoint `e866fa6f499b177470ead31ab1593f1a5dd5b9c5` has exact public `d677360b` tree `5425b934`. The local wrapper is not the remote commit. Existing completed-reread/decode files stay unchanged.

## Scope and provenance

Exactly 24 changed paths: nine production files, eight browser-lane files, three focused tests, three historical audits and this audit. Eight production files are exact reviewed copies; messages.ts adds only the 30 reviewed achievement keys plus close, with a narrowly truthful preview disclosure. No AppShell/HUD/store/engine/museum projection/definitions, reward arithmetic, eligibility, persistence or backend changes.

| Path | Source revision | Blob |
|---|---|---|
| `src/routes/profile.tsx` | `49d15957` | `72816d7bee861c0e216825e3e268093f7037e2fb` |
| `src/lib/achievements/v2/chrome.ts` | `49d15957` | `4374ad3ed8e7abd4845633009e8d83cc57d567a3` |
| `src/lib/achievements/v2/driver.tsx` | `49d15957` | `82bab1fba859058bf19b004c9a99c2c3c1d291a2` |
| `src/lib/achievements/v2/i18n.ts` | `49d15957` | `f2d55a437947ccc0f37ea4611297e67184227355` |
| `src/lib/achievements/v2/locale/ar.ts` | `49d15957` | `502b0d2ea93bd24608b6eb3b79390a1dd6bed952` |
| `src/lib/achievements/v2/locale/en.ts` | `49d15957` | `55636f72e97544812cd6618fe70076093e2eeae4` |
| `src/lib/achievements/v2/registry.ts` | `49d15957` | `bc8b291860e60fd81a65ed3a1fbbfa90584d770a` |
| `src/lib/achievements/v2/viewModel.ts` | `49d15957` | `1146a59e27df021577de06d8dc3434069a227376` |
| `tests/offline/outbox-achievement-language.test.tsx` | `49d15957` | `d719ea9b676f9cfd19dc477ad3b5b4cc597fe99a` |
| `tests/offline/outbox-profile-achievement-mounted.test.tsx` | `49d15957` | `4d61eb217be528f7a57d1fc8bb7773a4bc77add4` |
| `docs/audits/v18-achievement-english-presentation.md` | `49d15957` | `06d5d36a6dcfe0b412ffa628d077853bb1142857` |
| `docs/audits/v18-profile-achievement-chrome.md` | `49d15957` | `a9cc43a62f26a18a3442180897e72759acec6b8f` |
| `docs/audits/v18-profile-achievement-mounted.md` | `49d15957` | `66991132e8675d04b9648b71c31a24e514367b06` |
| `.github/workflows/v18-profile-achievement-browser.yml` | `81c97a99` | `9f321c9398dceaf609ba5089acad7bdfe4e2cad0` |
| `docs/audits/v18-profile-achievement-browser.md` | `81c97a99` | `f0ca24d5672c71607c9bad314b4ff123d3cace1a` |
| `tests/offline/browser/build-profile-achievement.mjs` | `81c97a99` | `6b5b106764dfe30dbb46bd522155817ab792f39a` |
| `tests/offline/browser/profile-achievement-boundary.ts` | `81c97a99` | `d4e9405db97585a4cd0e5d5c04cca3164481ca8d` |
| `tests/offline/browser/profile-achievement-browser.py` | `81c97a99` | `4fd7a306d2b2487903461de5c5ffc04b248a3651` |
| `tests/offline/browser/profile-achievement-fixture.tsx` | `81c97a99` | `f20a95ab69cf2a45643d6b1945cefcf9ac13223a` |
| `tests/offline/browser/test-profile-achievement-build.mjs` | `81c97a99` | `1e5ca43d8671eec279058f319de6da4c3af2c972` |
| `tests/offline/browser/test-profile-achievement-safety.py` | `81c97a99` | `0060ce5cd63aa7a9974ca16628cfe7a37873345c` |

`src/lib/ui-language/messages.ts` selectively assembled as described; no unrelated HUD/reread dictionary additions.

## Acceptance boundaries

The prepared nine groups require reactive English title/description and generated controls; they cannot honestly run on the old Arabic-only detail implementation. ID-backed detail selection is kept with that reviewed presentation stack. Museum ownership alone must retain the unconfirmed reward warning; synthetic claimed-owner receipt uses real engine hydration, not a grant. Existing access/claim gates remain unchanged.

The actual Profile route, AppShell, projection and styled dialog are mounted; account/router/SDK and unrelated HUD/components are synthetic boundaries. This does not prove full-app navigation, production policies, native modal accessibility or full-English content. Copied historical audits are provenance, not fresh evidence for this subset.

## Fresh validation

Pending independent subset review, focused tests, static bundle/guards and both TypeScript projects. Browser runtime has not run on this subset.

## Diagnostic follow-up within the same manifest
The runner/workflow/safety test were initially copied from the listed reviewed blobs, then amended with the now-reviewed reread failure-retention pattern: fixed stage/category labels and numeric counts only, primary-error-preserving cleanup, original nonzero status after printing JSON, always-upload existing JSON and context-managed executable discovery. Provenance rows describe original inputs, not byte identity for these three amended files. Nine acceptance groups, assertions, timeouts and origin filters remain unchanged. Pure tests cover fixed diagnostics and actual shell exit preservation. No runtime result is claimed.

Reviewer-requested tightening: admitted asset request failures are now counted and must be zero, alongside existing blocked/page-error guards. Favicon and arabesque204 responses remain explicitly synthetic decoration.

## Fresh subset gates
Both independent reviews CLEAR: original source/provenance and selective 88-key achievement English/31-key UI additions, plus final diagnostic/asset-failure delta. Four focused suites pass 46/46 (mounted Profile, achievement language, museum ownership, identity fence); eight Node and five Python guards pass. Actual-module static bundle and both TypeScript projects pass sequentially. This is fresh evidence for this subset, not inherited wider private test totals. Full subset aggregate and all nine Chromium runtime groups are not yet claimed.

The first full subset aggregate recorded 1,952 PASS/1 FAIL across104files: existing outbox-ui-language expected the superseded preview disclosure verbatim. Its single expectation now checks the exact new truthful full disclosure, retaining preference persistence, subscription, parity and all other assertions. This additional test-only path is selectively adjusted rather than importing unrelated later tests. No production correction was needed; rerun pending.

## Final isolated aggregate
After the exact-disclosure expectation correction, the first rerun was interrupted by an execution-environment disconnect before any terminal result. Its log is retained; it is neither a PASS nor a test failure. The recovered clean `20eff28e` rerun completed successfully: **1,953/1,953 tests across104files**, exit0. Final audit-only update does not alter tested source. All nine browser groups remain runtime-pending on this exact subset; no local browser/server or publication performed.

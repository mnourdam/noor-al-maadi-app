# Dormant campaign display overlay candidate

Base: GitHub branch `v18-01a-outbox-recovery` verified at `db94374784158ff1fd75a55358a3731eaa324a69` before isolated clone.

## Scope
New TypeScript module only, not imported by application/renderers and no locale activation. No API, DB, storage, answer, reward or progress changes. Supports deriving a separate display view for `multiple_choice`, `reading_then_question`, `decision_choice` only. Other activity types remain Arabic. No renderer replaces its `activity` with this object. Scoring continues using original canonical activity/options and existing shuffle `toOriginal` mapping.

The function takes an actual complete campaign **row**, not a lossy `Campaign` UI projection. It recomputes source text hashes and full-entity composite hashes for campaign → chapters → activities. Every translated unit in the complete campaign scope must match and have explicit separately bound release evidence. Real pilot drafts have an unimplemented mapping and are not compatible with this new mapping version: they require complete revalidation, not a version string substitution.

The complete 168-unit regeneration matches the Python v2 manifest seven-field projection aggregate digest `1bde72f025d55513d1a893f9dc06631ae78304f018e5e1e78a7648ae8d04a1ee` when using the original unimplemented mapping version. This verifies exact hash parity for this pinned snapshot. Sparse arrays, lone surrogates, astral object keys and fractional/unsafe numeric input are deliberately refused because Python and JavaScript serialization can diverge. This narrows support instead of weakening guards.

## Required caller behavior before any later integration
- Invalid/unsupported canonical source or unknown activity rejects before a safe Arabic view can be constructed. Any later caller must catch rejection and preserve its existing canonical UI, never replace it with a blank/error screen.
- Preserve current full canonical row; a matching old snapshot is not proof of current live content.
- Invoke again whenever source changes. Source, translation bundle and release evidence all use synchronous detached deep-frozen snapshots before any await. Async work uses that immutable snapshot to avoid internally mixed versions; renderer integration must separately discard obsolete async results.
- Pass release evidence from trusted release configuration, never trust approval supplied inside content/downloaded translations.
- Keep source canonical IDs/index for callbacks. Render returned labels as escaped text, never raw HTML.
- This is a narrow display adapter, not approval to mix untranslated activity types into an activated campaign. Whole-language/campaign rollout remains blocked until all activity adapters, non-Arabic-bearing display fields, factual review and full rendering coverage are completed.
- Existing string-answer/order/matching/free-text/crossword pathways are not implemented. This does not test rewards, account persistence or Android rendering.

## Verification
10 Vitest tests pass on real bundled campaign source and synthetic release-approved labels; focused TypeScript compilation and full repository `tsc --noEmit` pass. Tests cover exact manifest parity, fail-closed approvals, no canonical mutation, actual existing shuffle mapping, full-entity staleness, duplicate/missing units, mapping mismatch, empty translation, concurrent source mutation, empty/duplicate identities and serializer refusal.

Historical snapshot remains October 7, 2026. Linguistic AI review is not native-human or historical certification. No real translated gameplay, live-source acceptance or Android acceptance claimed. Two independent reviews accepted dormant-only staging, not activation.

## Chapter-to-question information coverage gate
A prior player report said chapter reading omitted Gabriel/revelation details required by its questions. That report is a review lead, NOT proof that the current source has this defect. Release evidence must now explicitly include `information_coverage: reviewed_no_known_gaps`, bound to the exact bundle, current source and mapping version. Review must compare each question and expected answer against the preceding accessible chapter/context reading. If required information is missing, mark the source gap, identify the exact chapter/activity and suspend approval; do not fabricate history or insert unsupported facts. Current synthetic fixtures set this field solely to test the gate, not to assert actual campaign coverage. Real coverage review remains pending.

Independent review caught and prompted fixes for an asynchronous approval/translation mutation race and unsupported serializer boundaries. Regression tests now cover them; two independent re-reviews confirmed those fixes.

## V17 regression follow-up
Historical owner test report dated 6 September 2026 was treated as regression guidance, not current acceptance. Its checklist cites 355b899 while adjacent context points to c32c3beb RC; neither proves this V18 build. Current code inspection independently confirms `ARRANGE_HINT_COST = 20` in `ActivityRenderer.tsx`, used for affordability, displayed error and `trySpendDinars`; MCQ reveals after the second wrong attempt and continues via `viaReveal: true`. Ordering-help eligibility excludes previously pinned IDs and caps at n−1, independent of live correctness. Those existing algorithms are unchanged here.

Added regression: synthetic translated labels in en/fr/ur/id/tr, including duplicate labels, retain canonical selections for attempts 0/1/2 and stable per-attempt shuffled ordering; original answers, reward fields, hint text and activity data remain unchanged. Existing ordering-help economy/correctness-independence and MCQ shuffle tests explicitly run via `vitest.pilot-regression.config.ts`: **4 files, 58 tests passed**. The overlay file now has 11 tests. Earlier complete default configured run before this additional test passed **161 files, 2,424 tests**, exit 0; full repository tsc passed. No full rerun count of 2,425 is claimed.

Remaining acceptance: actual renderer rerender without state reset on locale switch, wrong/correct/reveal transitions, rapid hint presses charging once, balance below current price, cap reached, leave/resume, guest/login owner isolation and Android UI. Ordering display remains unsupported by this adapter, so translated ordering hint behavior is NOT claimed tested. Never infer all-language hint pricing from synthetic display-only tests or old V17 prices.

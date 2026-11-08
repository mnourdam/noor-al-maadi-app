# P1-05A-03R — Frozen historical evidence

`outbox-real-profile-authority.original.tsx.txt` is a byte-identical copy of the original local 14-case diagnostic file, before the independently authorized reclassification. SHA-256:

`26231ae26edf64d21628682e0b71473bc511c4bcb7a8943b1e42a22958b2f077`

Original source path: `tests/offline/outbox-real-profile-authority.test.tsx`. The two generated case names at original lines 170–194 were:

- `REPRO retained unfenced addPoints callback crosses identity Alice to Bob`
- `REPRO retained unfenced addPoints callback crosses identity ABA`

Original assertions (lines 190–191):

```ts
expect(h.api.profile.points).toBe(aba ? 107 : 207);
expect(saved().points).toBe(aba ? 107 : 207);
```

They intentionally reproduced the vulnerability: Alice's retained addPoints(7) changed Bob's 200 into 207, or a later Alice generation's 100 into 107. These were evidence of a bug, not the desired acceptance contract. The independently authorized regression cases now require 200/100 and unchanged full Profile, storage bytes and persistence evidence. Their names begin `REGRESSION retained addPoints callback cannot cross identity`.

The remaining twelve cases and the original harness are byte-identical outside the two-case block. The archive's `.txt` extension and location under docs are outside the existing Vitest include patterns. The active `.test.tsx` file still runs all fourteen cases in the unchanged official test configuration; none were skipped, removed, marked todo/xfail or excluded.

## Reproduce both directions

From the repository root, with dependencies installed:

```sh
npm run test:outbox -- tests/offline/outbox-real-profile-authority.test.tsx
node tests/offline/profile-capabilities-counterfactual.mjs
```

The first command must pass 14/14 with the A-03 production fix. The second is an explicit counterfactual diagnostic: it uses a temporary loader to read only profile.tsx and profile-writer.ts from pre-A-03 commit `237a1c7928eb62fe52dec12963c5e35318a85dc0`, keeping the active test file, mocks, identity module and other dependencies the same. It must exit **1**, with exactly the two new regression cases failing (actual207/107 vs required200/100), and twelve other cases passing. That expected diagnostic failure is not part of, or an exception to, the official green gate.

The diagnostic never checks out, replaces or writes working source or changes the official Vitest configuration. Its generated configuration is confined to an owned temporary directory; it also verifies working source bytes before/after. No network or production services are used.

The complete A-03/A-03R decision, final counts, positive controls, remaining cross-tab/authority limits and commit scope are recorded in `docs/audits/v18-01a-p1-05a-03-creation-bound-capabilities.md`. Original reports A-01/C-01 are retained unchanged.

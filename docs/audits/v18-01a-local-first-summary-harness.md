# Historical local-first summary coverage restored

The historical four-case suite was outside normal outbox CI. An isolated copy of exact committed source reproduced four failures with its original fixture. Diagnostic-only instrumentation in that disposable copy showed the incomplete identity mock lacked `getActiveOwner`; supplying just owner/epoch methods then exposed `GuestStorageError: partition_unavailable`. The guest evidence reader correctly requires the real identity partition, so empty fallback results were caused by the stale fixture, not justification to weaken production storage checks.

The test now uses actual identity reset, a synthetic guest owner and `installIdentityPartition`. Teardown restores the partition, storage, timers and navigator property. Existing synthetic content, network mocks and all original assertions are unchanged: 116 local stories, 114 covers, always-unlocked stories, and full local fallback for hanging, rejected and error-response RPCs. No production, authentication, eligibility or offline behavior changed.

Focused result: 4/4 PASS. The suite is now explicitly included in `vitest.outbox.config.ts` so normal repair-branch regression CI exercises it. This is mocked-backend/in-memory-baseline acceptance, not native device, real-network or production catalog evidence. Independent review and aggregate validation are required before publication.

Coordinator aggregate verification: both TypeScript projects PASS and normal CI-config test command PASS, 1,672 tests across 76 files. Independent harness/config/audit review CLEAR. These are local/fixture checks, not native or production acceptance.

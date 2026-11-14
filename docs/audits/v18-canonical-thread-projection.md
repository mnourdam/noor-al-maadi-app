# Isolated actual thread API integration

Scope: the actual application `getIssueThread` helper and real SDK call `get_feedback_issue_thread` after the actual composer publishes. The test-only SQL overlay extends the existing disposable schema and latest checked-in function contract. No production migration, API helper, flag, hosted policy or data is changed. This is not fully mounted route, full authentication-provider or Android acceptance.

## Source binding and authorization finding

The baseline function is extracted verbatim from `supabase/migrations/20260829110009_7cc3b4e1-d8dc-4f2d-8963-e5bf3e343160.sql`; its exact function-text SHA-256 is `51790fb38fd7d70b39582c55274ae76839cd47ca1aee351661c67e8ca9f45f0b`. Actual PGlite executes that function as a counterfactual: the `reporter_id <> uid` condition permits a thread with a NULL reporter because SQL IF does not treat NULL as true. The original schema permits NULL reporter identities. This is a reproduced checked-in source behavior, not evidence of a hosted exploit, deployed version or production fix.

The isolated copy uses reporter `IS DISTINCT FROM` and staff `IS TRUE` / `IS NOT TRUE`, explicit forbidden/unauthenticated SQLSTATE42501 and absent SQLSTATEP0002. A missing issue is not a successful empty thread; current staff may read an existing orphan thread, while nonstaff cannot. The result retains the baseline issue/message JSON shape, internal visibility and chronological ordering, adding only a stable id tie-break and an explicit `canonical_attachments_v1` field computed through the actor-authorized current-publication descriptor. Legacy `attachments` remain unchanged. Unauthorized/retired canonical descriptors are not emitted. The production source finding remains an activation blocker.

## Real message boundary

The fixture adds the missing product response columns with synthetic defaults, not a claim of applying the full production migrations. An AFTER INSERT publication trigger mirrors only client-request-backed publications into actual `feedback_messages`, atomically binding exact message/issue/uploader author/body/internal scope. Existing service-only fixture attempts are not mirrored. There is no silent ON CONFLICT overwrite: an existing conflicting message aborts publication, tested with zero publication and unchanged conflicting body. Exact replay retains one message. Current actor authority still comes from the reviewed sender/publication checks; the mirror is not an authority grant.

The browser invokes actual `getIssueThread` rather than `fixture_canonical_messages`. It consumes the actor response directly in the actual shared message component, alongside legacy public/internal rows. The build verifies transformation of the actual API module and SDK without source substitution. Route guards allow the exact actual RPC endpoint; no fake path translation or service credential reaches the browser. The synthetic server projection is not evidence that the hosted production endpoint already returns canonical fields.

## Controls and pending runtime

Expanded actual PGlite controls pass the original NULL-reporter counterfactual, corrected missing/orphan/current-staff decisions, exact author/internal projection, immutable publication replay and collision rollback. Existing 26 Python boundary controls, browser output-path guard, TypeScript check and scrubbed actual Vite fixture build pass. Local Chromium is not launched.

Prepared native assertions validate complete issue/message key sets, exact ordered legacy ids/attachments/authors, canonical uploader attribution and internal flag, current staff versus recipient visibility, unrelated/absent/orphan denial, role-loss through the actual thread RPC, and retirement removing canonical descriptors. All three existing actual composer browser scenarios now consume the real helper/SDK projection and assert response status/count/legacy retention. Corrected remote execution remains pending; no new browser result is claimed here.

The controlled role checks are observations, not proof of serialization against concurrent role/recipient changes. Synthetic roles/schema defaults, production terminal-writer evidence/leases, full cleanup drain, decoder resource containment, full thread-status lifecycle, full routes/auth-provider and Android remain open. Existing browser interception proves fresh network behavior, not normal cache invalidation or physical erasure. Production activation stays OFF.

## First thread trial and exact dispatch correction

Run `43585666750` at source `8ac6` stopped after the first owner browser had measured actual thread refresh and canonical pixels, before the first subsequent native helper thread request. Artifact `14110337357`, ZIP SHA-256 `de7ef18260bd2626d4fe8a677595934234597aed3088962105fbee7c3df077cf`, retains 265 sequential records. This is partial browser progress, not full thread acceptance.

A concrete source defect was the experiment's exact RPC helper allowlist still containing only `fixture_worker` and `fixture_finalize`. New native `get_feedback_issue_thread` calls were rejected locally before HTTP dispatch. The correction adds that single exact name; no SQL, app, browser assertion or authority policy changes. A no-network test invokes the actual helper with a recorded transport, proves exact actor POST/path/payload and decoded response, and rejects unlisted/case/path/query lookalikes before any request. Corrected remote execution remains pending.

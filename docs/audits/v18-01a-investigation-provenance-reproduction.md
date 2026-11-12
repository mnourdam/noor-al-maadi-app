# V18 investigation reward provenance: isolated PostgreSQL reproduction

## Verified result

GitHub Actions run [43211006217](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43211006217), source commit `5f4bf49f`, job `131158291285`, completed **PASS_REPRODUCED: 11 checks** on disposable PostgreSQL **17.6**.

Evidence artifact: `13941286664`. Downloaded artifact ZIP SHA-256:

```text
1328e97ee001f8dd9b9a0ac7929a15f029fa05b11e0d5b4d5f197e208ec83dd1
```

PASS_REPRODUCED means the expected provenance failures occurred in the isolated fixture. It does **not** mean the application was fixed, deployed, or found exploitable in a verified live catalog.

## What the engine demonstrated

- **Positive grant/replay controls:** a fresh completion granted the exact synthetic catalog reward. Replaying the completed investigation did not grant the economy again.
- **Client-writable evidence:** an authenticated-role owner inserted an arbitrary `reward_snapshot` through the extracted own-row policy. The unchanged completion function then consumed its artifact as restoration evidence and inserted that artifact into the synthetic collection table.
- **Delta-ID collision:** a client-inserted ledger row with the chosen delta ID and a different payload remained unchanged. A fresh completion using that ID stamped completion and a catalog-derived reward snapshot, but returned `reward_granted=false`; profile balances remained unchanged. This is not a false `reward_granted=true` receipt. It demonstrates that a stored completion/snapshot is not sufficient evidence that the reward entered the wallet.
- **Owner-isolation control:** a cross-owner progress insert was rejected with SQLSTATE `42501`. The reproduced evidence problem is permissive own-row production of evidence, not absence of the tested owner boundary.

## Source and execution boundary

The fixture hashes complete migration files before extracting the latest checked-in `complete_investigation_v2` definition and the progress/ledger policies and grants. A later completion-function definition requires renewed review. Its implementation and safety tests live under `tests/sql/v18-investigation-provenance/`; the dedicated workflow is `.github/workflows/v18-investigation-provenance.yml`.

The run used a fresh, marker-checked, named disposable database and synthetic users, profiles, investigations and collection dependencies. The collection table is not a reconstruction of every live foreign key or trigger. `auth.uid()` reads an explicitly forgeable SQL setting for fixture owner binding: this is **not JWT authentication acceptance**. The engine checks do not establish deployed migration state, the full live catalog, browser behavior or Android/device behavior. No hosted backend, real player balance, production migration or application caller was changed by this reproduction.

## Consequence for legacy bootstrap

These rows cannot, by themselves, establish a trusted economic starting balance or grant-inclusion history:

1. An owner can manufacture a reward snapshot through the tested evidence-writing policy.
2. A legitimately content-shaped snapshot can coexist with no corresponding wallet grant after a conflicting ledger identity.
3. A present ledger row can carry a client-selected payload unrelated to the completion being reconstructed.

Therefore neither summing snapshots, treating completion flags as paid grants, nor assuming ledger-ID presence proves the matching reward was applied is a justified legacy-bootstrap procedure. The reproduction does not prove every historical row is invalid; it proves those rows alone cannot distinguish the relevant valid and invalid histories. Revoking future client writes would not retroactively authenticate existing history. Current content rewards also cannot reconstruct historical terms or prior wallet inclusion.

A future migration needs an independently trustworthy eligibility/evidence source, immutable entitlement lineage and inclusion records, atomic conflict handling, and exclusion of competing writers. The current completion RPC's caller-supplied completion assertion is not independent proof of gameplay. The separate isolated authority prototype does not supply missing historical evidence. No baseline is inferred, imported or activated here.

## Subsequent isolated counterfactual outcome

Run [43212060229](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43212060229), job `131161908208`, source `2fe0956a14c605c53403f049c45bba4c9e3449b6`, passed on PostgreSQL 17.6 with **72 assertion records**. The original eleven reproduction checks execute and pass before the guarded counterfactual is installed. This is not 72 independent end-to-end scenarios: the count includes individual privilege, unchanged-state and control assertions.

Artifact `13941457776` ZIP SHA-256:

```text
51b98b93eb850e9608ad8dde4900c21c48a351ae683c6336bcac5f094d3bc3c1
```

Saved evidence: [v18-investigation-counterfactual-43212060229.json](evidence/v18-investigation-counterfactual-43212060229.json). Independent reconciliation confirmed all 72 labels and matched the pinned migration/extracted-function/fixture hashes and guarded SQL hash against the reviewed source. The guarded SQL hash is `c2892ee56707002289806ec87504e357ce29f19eea04814803079a90c9c5085f`.

The isolated guarded producer requires a protected, admin-issued **synthetic approval** with frozen reward terms. It rejects absent approval, existing unverified completion, and both conflicting and exact-looking legacy ledger rows without adopting them. Valid issuance and exact replay pass; editing current content afterward does not rewrite the prior receipt or regrant.

Concurrency evidence is actual overlapping PostgreSQL transactions: the first call retains its profile-row lock while a second connection starts. The harness observes the second backend waiting on a lock with the first backend identified by `pg_blocking_pids` before releasing the first transaction. Both calls return identical receipts; assertions verify exactly **+10 XP, +3 dinars, unchanged hearts**, and one delta, completion, collectible and protected issuance record. This is not merely two sequential calls or a sleep-based race assumption.

Admin-only fault triggers after delta insertion and after protected issuance insertion each force transaction failure. The later fault occurs after a non-null collectible has been inserted. Before/after snapshots of profiles, progress, deltas, collection, approvals and issuance remain identical, demonstrating rollback across those six fixture tables. Authenticated mutation privileges and direct-delete attempts are denied on the loaded economic/evidence tables; execution of the two loaded legacy producers is disabled.

**Boundaries remain unchanged:** the approval issuer is synthetic, and a trustworthy production gameplay-eligibility issuer is still unknown. Owner binding uses the forgeable SQL claims shim, not verified JWTs. Writer exclusion covers only the tables and producers loaded in this fixture, not every production RPC, trigger, service role, local/offline writer or deployed schema. No legacy balances are imported, no live vulnerability status is established, and no app repair, production migration or activation follows from this counterfactual PASS.

## Status

**Reproduction verified; production repair and migration remain unimplemented.** Any proposed producer hardening needs its own review, negative controls, concurrency/rollback evidence and explicit cutover decisions. This audit is an evidence milestone, not release approval.

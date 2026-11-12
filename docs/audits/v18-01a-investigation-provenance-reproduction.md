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

## Status

**Reproduction verified; production repair and migration remain unimplemented.** Any proposed producer hardening needs its own review, negative controls, concurrency/rollback evidence and explicit cutover decisions. This audit is an evidence milestone, not release approval.

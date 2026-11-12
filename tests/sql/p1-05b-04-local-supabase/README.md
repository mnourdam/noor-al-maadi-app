# P1-05B-04: disposable LOCAL Supabase integration

This harness does **not** certify hosted staging or permit production deployment.
It does not activate the protocol, migrate a player, or execute repository migrations.
The SQL proposal remains unchanged in `docs/proposals`.

## Isolation and evidence

- Runs only in a disposable GitHub Actions job, on the V18 working branch.
- Creates a new RUNNER_TEMP directory/project and isolated CLI HOME. It neither
  reads nor copies the repository's Supabase config, environment or migrations.
- Sets explicit workdir **and cwd**, disables generated migrations/seeds, never
  logs in, links a project, requests hosted credentials or uses project secrets.
- Requires exact `http://127.0.0.1:55421` and
  `postgresql://postgres:<local-password>@127.0.0.1:55422/postgres` endpoints;
  rejects query strings, fragments, alternate hosts/ports and API userinfo.
- Verifies expected local Docker container names, project labels and exposed
  ports before any SQL/API probe. Docker is bound to the runner's Unix socket.
  Requests are loopback-only; CLI-managed listeners may bind all interfaces on
  the disposable runner. This is not a claim of loopback-only Docker listeners.
- Creates four synthetic users through real local Auth, obtains real access JWTs,
  and exercises the actual PostgREST role switch and Supabase `auth.uid()`.
  Does not reuse the P1-05B-03 fixtures that define synthetic roles/auth.uid.
- Verifies exact false-authority DTOs, own-row/cross-owner RLS, write ACL denial,
  anonymous/service-role denial and rejection of destination UID arguments.
- Tests controlled ACL, RLS and UID-overload relaxations, then restores them.
  The UPDATE-grant control proves the ACL-denial predicate detects its absence;
  a 204 may update zero rows under RLS and is not proof of an unauthorized mutation.
  Negative results must be specific permission/cache errors, never generic
  HTTP failures. Positive gate checks distinguish broken transport from denial.
- Preserves full-row synthetic sentinel bytes across proposal/application/probes;
  this is **not** a snapshot of real player economy tables.
- Captures actual local role attributes/memberships/default ACLs, table owner/RLS,
  function ACLs, unchanged auth.uid definition, proposal hash and image digests.
- CLI output/status and Auth responses stay captured privately, never printed
  or uploaded. The artifact allowlists only `acceptance.json`, which contains
  named checks and redacted catalog/image evidence, not credentials or user JWTs.
- Cleanup targets the exact fresh project only, without backups. No `stop --all`.

## Pinned tools and verified commands

Official action `supabase/setup-cli` tag `v3.2.0` resolves to
`689adcfb80d947100a1eab127289b97d1fb07b13` (verified via `git ls-remote`).
CLI is pinned to **2.122.1**, not a floating v2 tag or v3 default.
The published npm integrity observed for this version was
`sha512-uorIJ5Cu8qeJtudBmj1eoFrQzriy7TRPtNM9Kiwb5BDOR7xPGIr1cSBaNCjUncJfKl3swuUrfVJsWz0+ywmEMA==`.

Verified with this exact binary locally: `--version`, `start --help`,
`stop --help`, `status --help`, and `init` in a separate temporary directory.
No local stack was started. `start --exclude` supports the ten excluded services
listed in `harness.py`; Postgres, GoTrue, PostgREST and Kong remain. Health-check
failures are not ignored. CLI-selected image versions/digests are recorded from
Docker at run time; the harness does not claim immutable image digest pinning.

Sources:
- https://github.com/supabase/setup-cli
- https://github.com/supabase/cli/releases/tag/v2.122.1
- https://supabase.com/docs/reference/cli/introduction
- https://supabase.com/docs/guides/deployment/ci/testing
- https://supabase.com/docs/reference/self-hosting-auth

## Local validation without Docker

```sh
python3 -m unittest discover -s tests/sql/p1-05b-04-local-supabase -p 'test_*.py' -v
```

Static tests are guard/harness checks only. Creating this workflow or passing
those checks is not integration PASS; an actual successful CI run is required.
Even after that, hosted staging acceptance remains pending and production NO-GO.

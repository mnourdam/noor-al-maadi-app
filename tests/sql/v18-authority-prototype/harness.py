#!/usr/bin/env python3
"""Disposable real-PostgreSQL proof only. The SQL auth shim is NOT JWT acceptance."""
from __future__ import annotations
import json
import os
from pathlib import Path
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent
DB = "v18_authority_fixture"
PORT = 55432
MARKER = "v18-authority-disposable-fixture-only-v1"
ALICE = "10000000-0000-4000-8000-000000000001"
BOB = "10000000-0000-4000-8000-000000000002"


def connection_options(environ=None):
    env = os.environ if environ is None else environ
    expected = {"PGHOST": "127.0.0.1", "PGPORT": str(PORT), "PGDATABASE": DB,
                "PGUSER": "postgres", "PGPASSWORD": "synthetic-authority-job-only"}
    for key, value in expected.items():
        if env.get(key) != value:
            raise ValueError("disposable database connection configuration mismatch: " + key)
    # Never let libpq service/options select another endpoint or run setup SQL.
    for key in ("PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGHOSTADDR", "PGPASSFILE"):
        if env.get(key):
            raise ValueError("unexpected libpq override: " + key)
    return dict(host="127.0.0.1", port=PORT, dbname=DB, user="postgres",
                password=expected["PGPASSWORD"], connect_timeout=10,
                options="-c statement_timeout=15000 -c lock_timeout=10000", sslmode="disable")


class Harness:
    def __init__(self):
        import psycopg
        self.pg = psycopg
        self.options = connection_options()
        self.checks = []
        self.phase = "initialize disposable fixture"
        self.admin = psycopg.connect(**self.options, autocommit=True)
        db, address, port, version = self.admin.execute(
            "select current_database(),inet_server_addr()::text,inet_server_port(),current_setting('server_version_num')::int"
        ).fetchone()
        # Docker bridge server address need not be loopback. Client destination is fixed above.
        if db != DB or port != 5432 or version != 170006:
            raise ValueError("unexpected disposable PostgreSQL identity/version")
        present = self.admin.execute("select count(*) from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%'").fetchone()[0]
        public_tables = self.admin.execute("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f')").fetchone()[0]
        if present or public_tables:
            raise ValueError("requires a fresh empty synthetic database")
        self.admin.execute("create schema fixture_boundary")
        self.admin.execute("create table fixture_boundary.marker(marker text primary key)")
        self.admin.execute("insert into fixture_boundary.marker values(%s)", (MARKER,))

    def assert_marker(self, conn):
        if conn.execute("select current_database()").fetchone()[0] != DB:
            raise ValueError("database changed")
        if conn.execute("select marker from fixture_boundary.marker").fetchall() != [(MARKER,)]:
            raise ValueError("fixture marker missing")

    def check(self, condition, label):
        self.phase = label
        if not condition:
            raise AssertionError(label)
        self.checks.append(label)

    def connect(self):
        conn = self.pg.connect(**self.options, autocommit=True)
        self.assert_marker(conn)
        return conn

    def seed(self, owner=ALICE, purpose="genesis", entries=None):
        import uuid
        source, seal = uuid.uuid4(), uuid.uuid4()
        self.admin.execute("select v18_proto_private.seed_source(%s,%s,%s)", (owner, source, purpose))
        facts = []
        for subject, term in entries or [("genesis", "genesis-v1")]:
            fact = uuid.uuid4()
            self.admin.execute("select v18_proto_private.seed_fact(%s,%s,%s,%s)", (source, fact, subject, term))
            facts.append(fact)
        self.admin.execute("select v18_proto_private.seal_source(%s,%s)", (source, seal))
        return source, seal, facts

    def call(self, name, args, owner=ALICE, role="v18_proto_authenticated", conn=None):
        from psycopg import sql
        owned = conn is None
        c = self.connect() if owned else conn
        try:
            with c.transaction():
                c.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))
                c.execute("select set_config('request.jwt.claim.sub',%s,true)", (owner or "",))
                placeholders = sql.SQL(',').join(sql.Placeholder() for _ in args)
                return c.execute(sql.SQL("select v18_proto_api.{}({})").format(sql.Identifier(name), placeholders), args).fetchone()[0]
        finally:
            if owned:
                c.close()

    def snapshot(self):
        from psycopg import sql
        state = {}
        for table in ("sources", "facts", "seals", "catalog", "accounts", "operations", "consumption"):
            rows = self.admin.execute(sql.SQL("select to_jsonb(t) from v18_proto_private.{} t").format(sql.Identifier(table))).fetchall()
            state[table] = sorted((r[0] for r in rows), key=lambda r: json.dumps(r, sort_keys=True))
        return state

    def rejected(self, action, label, states=("P0001",), message=None):
        self.phase = label
        before = self.snapshot()
        try:
            action()
        except self.pg.Error as error:
            self.check(error.sqlstate in states, label + ": expected SQLSTATE")
            if message:
                self.check(message in str(error), label + ": expected failure reason")
        else:
            raise AssertionError(label + ": unexpectedly accepted")
        self.check(self.snapshot() == before, label + ": exact authority state unchanged")

    def race(self, calls):
        # Hold the first real mutation uncommitted. Prove the contender is
        # waiting on its backend lock before releasing it, not merely racing threads.
        import time
        if len(calls) != 2:
            raise ValueError("requires exactly two contenders")
        contender_ready = threading.Event()
        contender_pid = []
        def contender():
            with self.connect() as conn:
                contender_pid.append(conn.info.backend_pid)
                contender_ready.set()
                try:
                    return ("ok", self.call(*calls[1], conn=conn))
                except self.pg.Error as error:
                    return (error.sqlstate, error.diag.message_primary)
        with self.connect() as holder, ThreadPoolExecutor(max_workers=1) as pool:
            with holder.transaction():
                first = self.call(*calls[0], conn=holder)
                future = pool.submit(contender)
                if not contender_ready.wait(5):
                    raise AssertionError("contender did not connect")
                deadline = time.monotonic() + 5
                observed = False
                while time.monotonic() < deadline:
                    waiting = self.admin.execute(
                        "select wait_event_type,pg_blocking_pids(pid) from pg_stat_activity where pid=%s",
                        (contender_pid[0],),
                    ).fetchone()
                    if waiting and waiting[0] == "Lock" and holder.info.backend_pid in waiting[1]:
                        observed = True
                        break
                    if future.done():
                        break
                    time.sleep(0.02)
                self.check(observed, "real concurrent contender observed blocked by uncommitted first transaction")
            second = future.result(timeout=15)
            return [("ok", first), second]

    def run(self):
        import uuid
        self.assert_marker(self.admin)
        source = ROOT / "prototype.sql"
        text = source.read_text()
        self.admin.execute(text)
        self.assert_marker(self.admin)
        self.check(self.admin.execute("select count(*) from v18_proto_private.accounts").fetchone()[0] == 0,
                   "no implicit genesis account")
        # Independent old-model fixture deliberately remains writable: exclusion
        # applies only to the new schema, not the existing player economy.
        self.admin.execute("create table public.synthetic_legacy_profile(owner_id uuid primary key, xp bigint)")
        self.admin.execute("grant select,insert,update on public.synthetic_legacy_profile to v18_proto_authenticated")
        with self.connect() as c:
            with c.transaction():
                c.execute("set local role v18_proto_authenticated")
                c.execute("insert into public.synthetic_legacy_profile values(%s,123)", (ALICE,))
        self.check(self.admin.execute("select xp from public.synthetic_legacy_profile where owner_id=%s", (ALICE,)).fetchone()[0] == 123,
                   "legacy synthetic writer remains writable; no universal exclusion claim")
        _, seal, basefacts = self.seed(entries=[("genesis", "genesis-v1"), ("earned-before-bootstrap", "reward-v1")])
        _, factseal, facts = self.seed(purpose="facts", entries=[("later-A", "reward-v1"), ("later-B", "reward-v1")])
        self.rejected(lambda: self.call("apply_fact", (facts[0], uuid.uuid4(), 0)), "missing genesis")
        self.rejected(lambda: self.call("bootstrap", (seal,), owner=BOB), "foreign genesis")
        receipt = self.call("bootstrap", (seal,))
        before = self.snapshot()
        self.check(self.call("bootstrap", (seal,)) == receipt and self.snapshot() == before,
                   "exact bootstrap replay preserves baseline")
        self.rejected(lambda: self.call("apply_fact", (basefacts[1], uuid.uuid4(), 0)), "baseline entitlement alias denied")
        request = uuid.uuid4()
        first = self.call("apply_fact", (facts[0], request, 0))
        before = self.snapshot()
        self.check(self.call("apply_fact", (facts[0], request, 0)) == first and self.snapshot() == before,
                   "lost-response exact retry is idempotent")
        self.rejected(lambda: self.call("apply_fact", (facts[0], request, 1)), "request expected revision immutable", message="prototype:request-conflict")
        self.rejected(lambda: self.call("apply_fact", (facts[1], request, 0)), "request fact immutable", message="prototype:request-conflict")
        self.rejected(lambda: self.call("apply_fact", (facts[1], uuid.uuid4(), 0)), "stale fresh request", message="prototype:stale-revision")
        self.call("apply_fact", (facts[1], uuid.uuid4(), 1))
        before = self.snapshot()
        self.check(self.call("apply_fact", (facts[0], request, 0)) == first and self.snapshot() == before,
                   "replay after later revision returns stored receipt")
        alias_source = uuid.uuid4()
        self.admin.execute("select v18_proto_private.seed_source(%s,%s,'facts')", (ALICE, alias_source))
        self.rejected(lambda: self.admin.execute("select v18_proto_private.seed_fact(%s,%s,'later-A','reward-v1')", (alias_source, uuid.uuid4())),
                      "new fact ID cannot reissue consumed entitlement at issuance", ("23505",))
        self.rejected(lambda: self.admin.execute("select v18_proto_private.seed_fact(%s,%s,'earned-before-bootstrap','reward-v1')", (alias_source, uuid.uuid4())),
                      "new fact ID cannot reissue baseline entitlement at issuance", ("23505",))
        # Distinct sources avoid serializing solely on the source advisory lock.
        _, _, left = self.seed(purpose="facts", entries=[("race-A", "reward-v1")])
        _, _, right = self.seed(purpose="facts", entries=[("race-B", "reward-v1")])
        result = self.race([("apply_fact", (f, uuid.uuid4(), 2)) for f in (left[0], right[0])])
        self.check(sum(r[0] == "ok" for r in result) == 1 and sum(r[0] == "P0001" and r[1] == "prototype:stale-revision" for r in result) == 1,
                   "two concurrent expected-revision writes yield exactly one commit")
        _, _, retry = self.seed(purpose="facts", entries=[("same-request-race", "reward-v1")])
        same = (retry[0], uuid.uuid4(), 3)
        before_count = len(self.snapshot()["operations"])
        result = self.race([("apply_fact", same), ("apply_fact", same)])
        self.check(result[0][0] == result[1][0] == "ok" and result[0][1] == result[1][1] and
                   len(self.snapshot()["operations"]) == before_count + 1,
                   "concurrent exact request retry commits one operation")
        self.check(self.admin.execute("select revision,xp,dinars from v18_proto_private.accounts where owner=%s", (ALICE,)).fetchone() == (4,150,65),
                   "exact balance and revision after baseline plus four once-only grants")
        self.check(isinstance(first["revision"], str) and isinstance(first["xp"], str) and isinstance(first["dinars"], str),
                   "bigint receipt fields are exact decimal strings")
        _, bobseal, _ = self.seed(owner=BOB)
        self.call("bootstrap", (bobseal,), owner=BOB)
        _, _, bobfacts = self.seed(owner=BOB, purpose="facts", entries=[("bob-reward", "reward-v1")])
        bobreceipt = self.call("apply_fact", (bobfacts[0], request, 0), owner=BOB)
        self.check(bobreceipt["owner"] == BOB and bobreceipt["request_id"] == str(request),
                   "same request ID across owners remains independently scoped")
        concurrent_owner = str(uuid.uuid4())
        _, concurrent_seal, _ = self.seed(owner=concurrent_owner)
        before_accounts = len(self.snapshot()["accounts"])
        bootstrap_race = self.race([("bootstrap", (concurrent_seal,), concurrent_owner)] * 2)
        self.check(bootstrap_race[0] == bootstrap_race[1] and bootstrap_race[0][0] == "ok" and len(self.snapshot()["accounts"]) == before_accounts + 1,
                   "concurrent bootstrap has one account and identical original receipt")
        independent_owner = str(uuid.uuid4())
        _, initial_seal, _ = self.seed(owner=independent_owner)
        self.call("bootstrap", (initial_seal,), owner=independent_owner)
        _, alternate_seal, alternate_facts = self.seed(owner=independent_owner, entries=[("alternate-genesis", "genesis-v1"), ("independently-issued-reward", "reward-v1")])
        self.rejected(lambda: self.call("bootstrap", (alternate_seal,), owner=independent_owner),
                      "alternate genesis never replaces admitted baseline", message="prototype:baseline-conflict")
        self.rejected(lambda: self.call("apply_fact", (alternate_facts[1], uuid.uuid4(), 0), owner=independent_owner),
                      "alternate genesis reward cannot become a new operation", message="prototype:source-not-operation")
        self.alias_consumption_checks()
        self.security_checks(seal, facts[0])
        self.rollback_checks()
        self.tamper_checks()
        return {"status": "PASS", "postgres_version": "17.6", "checks": self.checks,
                "scope": "isolated schema, synthetic issuer, forgeable SQL claims; NOT JWT or production acceptance"}

    def security_checks(self, seal, fact):
        from psycopg import sql
        import uuid
        for role in ("v18_proto_anon", "v18_proto_service"):
            self.rejected(lambda r=role: self.call("bootstrap", (seal,), role=r),
                          role + " bootstrap ACL denied", ("42501",))
        self.rejected(lambda: self.call("bootstrap", (seal,), owner=""), "absent owner claims denied")
        self.rejected(lambda: self.call("apply_fact", (fact, uuid.uuid4(), 0), owner=BOB), "foreign fact denied")
        for role in ("v18_proto_authenticated", "v18_proto_anon", "v18_proto_service"):
            for trusted in ("v18_proto_issuer", "v18_proto_executor"):
                self.check(not self.admin.execute("select pg_has_role(%s,%s,'MEMBER')", (role, trusted)).fetchone()[0],
                           role + " cannot assume " + trusted)
            for table in ("sources", "facts", "seals", "catalog", "accounts", "operations", "consumption"):
                for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                    self.check(not self.admin.execute("select has_table_privilege(%s,%s,%s)",
                               (role, "v18_proto_private." + table, privilege)).fetchone()[0],
                               role + " lacks effective " + privilege + " on " + table)
                for privilege in ("INSERT", "UPDATE"):
                    self.check(not self.admin.execute("select has_any_column_privilege(%s,%s,%s)",
                               (role, "v18_proto_private." + table, privilege)).fetchone()[0],
                               role + " lacks effective column " + privilege + " on " + table)
                def raw_delete(r=role, t=table):
                    with self.connect() as c:
                        with c.transaction():
                            c.execute(sql.SQL("set local role {}").format(sql.Identifier(r)))
                            c.execute(sql.SQL("delete from v18_proto_private.{} where false").format(sql.Identifier(t)))
                self.rejected(raw_delete, role + " raw delete denied on " + table, ("42501",))
            def forge(r=role):
                with self.connect() as c:
                    with c.transaction():
                        c.execute(sql.SQL("set local role {}").format(sql.Identifier(r)))
                        c.execute("select v18_proto_private.seed_source(%s,%s,'genesis')", (ALICE, uuid.uuid4()))
            self.rejected(forge, role + " cannot mint protected evidence", ("42501",))
        self.check(self.admin.execute("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='v18_proto_api' and p.proname in ('bootstrap','apply_fact')").fetchone()[0] == 2,
                   "no alternate exposed owner-argument overload")
        catalog = self.admin.execute("select p.proname,p.prosecdef,p.proconfig,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='v18_proto_api' order by p.proname").fetchall()
        self.check(all(r[1] and r[3] == "v18_proto_executor" and r[2] and any(v == 'search_path=pg_catalog' for v in r[2]) for r in catalog),
                   "API security-definer owner and pg_catalog search path")
        roles = self.admin.execute("select rolname,rolsuper,rolcanlogin,rolbypassrls from pg_roles where rolname in ('v18_proto_issuer','v18_proto_executor')").fetchall()
        self.check(len(roles) == 2 and all(not any(row[1:]) for row in roles),
                   "trusted roles are NOLOGIN non-superuser without BYPASSRLS")
        for trusted, schema in (("v18_proto_issuer", "v18_proto_private"), ("v18_proto_executor", "v18_proto_api")):
            with self.admin.transaction(force_rollback=True):
                self.admin.execute(sql.SQL("set local role {}").format(sql.Identifier(trusted)))
                self.admin.execute(sql.SQL("create function {}.fixture_default_acl_probe() returns int language sql as 'select 1'").format(sql.Identifier(schema)))
                self.admin.execute("reset role")
                for role in ("v18_proto_authenticated", "v18_proto_anon", "v18_proto_service"):
                    self.check(not self.admin.execute("select has_function_privilege(%s,%s,'EXECUTE')", (role, schema + ".fixture_default_acl_probe()")).fetchone()[0],
                               trusted + " new function default ACL denies " + role)
        for table in ("sources", "facts", "seals", "catalog"):
            for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                self.check(not self.admin.execute("select has_table_privilege('v18_proto_executor',%s,%s)", ("v18_proto_private." + table, privilege)).fetchone()[0],
                           "RPC executor cannot " + privilege + " issuer " + table)
        # A malicious caller search_path cannot replace qualified private tables.
        with self.connect() as c:
            with c.transaction():
                c.execute("create temporary table accounts(dummy int)")
                c.execute("set local search_path=pg_temp,public")
                c.execute("set local role v18_proto_authenticated")
                c.execute("select set_config('request.jwt.claim.sub',%s,true)", (ALICE,))
                self.check(c.execute("select v18_proto_api.bootstrap(%s)", (seal,)).fetchone()[0] is not None,
                           "temporary shadow table cannot redirect bootstrap")

    def alias_consumption_checks(self):
        from psycopg import sql
        import uuid
        # Deliberately weaken issuance uniqueness inside a rollback-only admin
        # transaction to independently challenge the consumption invariant.
        for subject in ("earned-before-bootstrap", "later-A"):
            with self.admin.transaction(force_rollback=True):
                constraints = self.admin.execute("select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='v18_proto_private.facts'::regclass and contype='u'").fetchall()
                names = [name for name, definition in constraints if all(field in definition for field in ("owner", "issuer", "kind", "subject", "term"))]
                if len(names) != 1:
                    raise AssertionError("lineage uniqueness constraint not identified")
                self.admin.execute(sql.SQL("alter table v18_proto_private.facts drop constraint {}").format(sql.Identifier(names[0])))
                _, _, aliases = self.seed(purpose="facts", entries=[(subject, "reward-v1")])
                self.rejected(lambda: self.call("apply_fact", (aliases[0], uuid.uuid4(), 4), conn=self.admin),
                              "consumption independently blocks aliased " + subject, message="prototype:entitlement-consumed")

    def rollback_checks(self):
        from psycopg import sql
        import uuid
        self.admin.execute("""create function fixture_boundary.reject_mutation() returns trigger
          language plpgsql security definer set search_path=pg_catalog as $$
          begin raise exception 'fixture_fault_injection'; end $$""")
        self.admin.execute("revoke all on function fixture_boundary.reject_mutation() from public")
        for table, event in (("operations", "INSERT"), ("consumption", "INSERT"), ("accounts", "UPDATE")):
            _, _, facts = self.seed(purpose="facts", entries=[("fault-" + table, "reward-v1")])
            self.admin.execute(sql.SQL("create trigger fixture_fault after {} on v18_proto_private.{} for each row execute function fixture_boundary.reject_mutation()").format(sql.SQL(event), sql.Identifier(table)))
            try:
                self.rejected(lambda: self.call("apply_fact", (facts[0], uuid.uuid4(), 4)),
                              "injected fault after " + table + " rolls back all seven tables", message="fixture_fault_injection")
            finally:
                self.admin.execute(sql.SQL("drop trigger fixture_fault on v18_proto_private.{}").format(sql.Identifier(table)))
        self.admin.execute("drop function fixture_boundary.reject_mutation()")

    def tamper_checks(self):
        import uuid
        self.rejected(lambda: self.call("bootstrap", (uuid.uuid4(),)), "unknown seal denied")
        _, fact_seal, _ = self.seed(owner=BOB, purpose="facts", entries=[("not-genesis", "reward-v1")])
        self.rejected(lambda: self.call("bootstrap", (fact_seal,), owner=BOB), "fact journal cannot bootstrap")
        _, another_seal, _ = self.seed(entries=[("another-genesis", "genesis-v1")])
        self.rejected(lambda: self.call("bootstrap", (another_seal,)), "existing baseline cannot be replaced")
        # Tampering is performed only by the fixture superuser, in transactions
        # that always roll back. It is not a production fault API or trust claim.
        owner = str(uuid.uuid4())
        source, seal, facts = self.seed(owner=owner, entries=[("genesis", "genesis-v1"), ("history", "reward-v1")])
        cases = [
            ("hash corruption", "update v18_proto_private.facts set event_hash=repeat('a',64) where fact_id=%s", (facts[1],), "prototype:invalid-journal"),
            ("sequence gap", "update v18_proto_private.facts set seq=3 where fact_id=%s", (facts[1],), "prototype:invalid-journal"),
            ("missing sealed tail fact", "delete from v18_proto_private.facts where fact_id=%s", (facts[1],), "prototype:incomplete-journal"),
            ("foreign fact owner", "update v18_proto_private.facts set owner=%s where fact_id=%s", (BOB, facts[1]), "prototype:invalid-journal"),
            ("forged fact issuer", "update v18_proto_private.facts set issuer='forged' where fact_id=%s", (facts[1],), "prototype:invalid-journal"),
            ("seal entry count", "update v18_proto_private.seals set entry_count=3 where seal_id=%s", (seal,), "prototype:incomplete-journal"),
            ("seal through sequence", "update v18_proto_private.seals set through_seq=3 where seal_id=%s", (seal,), "prototype:incomplete-journal"),
            ("seal root", "update v18_proto_private.seals set root_hash=repeat('b',64) where seal_id=%s", (seal,), "prototype:incomplete-journal"),
            ("seal owner", "update v18_proto_private.seals set owner=%s where seal_id=%s", (BOB, seal), "prototype:foreign-evidence"),
        ]
        for label, statement, args, reason in cases:
            with self.admin.transaction(force_rollback=True):
                self.admin.execute("alter table v18_proto_private.facts disable trigger user")
                self.admin.execute("alter table v18_proto_private.seals disable trigger user")
                self.admin.execute(statement, args)
                self.rejected(lambda: self.call("bootstrap", (seal,), owner=owner, conn=self.admin),
                              label + " bootstrap rejection", message=reason)
        with self.admin.transaction(force_rollback=True):
            self.admin.execute("alter table v18_proto_private.consumption disable trigger user")
            admitted_seal = self.admin.execute("select baseline_seal from v18_proto_private.accounts where owner=%s", (ALICE,)).fetchone()[0]
            self.admin.execute("delete from v18_proto_private.consumption where owner=%s and baseline_seal=%s and kind='reward'", (ALICE, admitted_seal))
            self.rejected(lambda: self.call("bootstrap", (admitted_seal,), conn=self.admin),
                          "bootstrap replay with missing inclusion marker denied", message="prototype:inconsistent-baseline-inclusion")
        with self.admin.transaction(force_rollback=True):
            self.admin.execute("alter table v18_proto_private.facts disable trigger user")
            tail = uuid.uuid4()
            self.admin.execute("""insert into v18_proto_private.facts
              select %s,source_id,owner,issuer,3,'unsealed-extra-tail',term,kind,xp_delta,dinars_delta,event_hash,''
              from v18_proto_private.facts where fact_id=%s""", (tail, facts[1]))
            self.admin.execute("update v18_proto_private.facts f set event_hash=v18_proto_private.fact_digest(f) where fact_id=%s", (tail,))
            self.rejected(lambda: self.call("bootstrap", (seal,), owner=owner, conn=self.admin),
                          "correctly hashed extra tail cannot masquerade as complete seal", message="prototype:incomplete-journal")
        missing_owner = str(uuid.uuid4())
        _, no_genesis, _ = self.seed(owner=missing_owner, entries=[("reward-only", "reward-v1")])
        self.rejected(lambda: self.call("bootstrap", (no_genesis,), owner=missing_owner),
                      "positive balance without explicit genesis denied", message="prototype:invalid-genesis")
        negative_owner = str(uuid.uuid4())
        entries = [("genesis", "genesis-v1")] + [("spend-" + str(i), "purchase-v1") for i in range(8)] + [("recover-" + str(i), "reward-v1") for i in range(3)]
        _, prefix_seal, _ = self.seed(owner=negative_owner, entries=entries)
        self.rejected(lambda: self.call("bootstrap", (prefix_seal,), owner=negative_owner),
                      "negative intermediate prefix denied even with positive final balance", message="prototype:invalid-prefix-balance")
        with self.admin.transaction(force_rollback=True):
            self.admin.execute("alter table v18_proto_private.catalog disable trigger user")
            self.admin.execute("update v18_proto_private.catalog set xp_delta=9223372036854775807 where term='genesis-v1'")
            overflow_owner = str(uuid.uuid4())
            _, overflow_seal, _ = self.seed(owner=overflow_owner, entries=[("genesis", "genesis-v1"), ("overflow", "reward-v1")])
            self.rejected(lambda: self.call("bootstrap", (overflow_seal,), owner=overflow_owner, conn=self.admin),
                          "prefix bigint overflow denied before cast", message="prototype:invalid-prefix-balance")
        _, _, reward = self.seed(purpose="facts", entries=[("overflow-apply", "reward-v1")])
        _, _, purchase = self.seed(purpose="facts", entries=[("underflow-apply", "purchase-v1")])
        for label, statement, fact in [
            ("balance overflow", "update v18_proto_private.accounts set xp=9223372036854775807 where owner=%s", reward[0]),
            ("balance underflow", "update v18_proto_private.accounts set dinars=0 where owner=%s", purchase[0]),
            ("revision overflow", "update v18_proto_private.accounts set revision=9223372036854775807 where owner=%s", reward[0]),
        ]:
            with self.admin.transaction(force_rollback=True):
                self.admin.execute(statement, (ALICE,))
                revision = 9223372036854775807 if label == "revision overflow" else 4
                self.rejected(lambda: self.call("apply_fact", (fact, uuid.uuid4(), revision), conn=self.admin),
                              label + " atomic rejection", message="prototype:invalid-result-balance")


def main():
    output = ROOT / "acceptance.json"
    # Never let a stale success file masquerade as this run's outcome.
    if output.exists():
        output.unlink()
    harness = None
    try:
        harness = Harness()
        report = harness.run()
        if len(report["checks"]) < 100:
            raise AssertionError("incomplete acceptance check set")
        output.write_text(json.dumps(report, indent=2) + "\n")
        print("PASS: " + str(len(report["checks"])) + " isolated engine checks; NOT JWT/production acceptance")
    except Exception as error:
        # SQL errors may carry values. Report only type and SQLSTATE, never
        # connection parameters, raw SQL exception strings or record payloads.
        report = {"status": "FAIL", "error_type": type(error).__name__,
                  "sqlstate": getattr(error, "sqlstate", None),
                  "completed_checks": harness.checks if harness else [],
                  "phase": harness.phase if harness else "connect and verify fresh fixture",
                  "scope": "isolated synthetic fixture only"}
        output.write_text(json.dumps(report, indent=2) + "\n")
        print("FAIL: isolated authority acceptance did not complete")
        raise SystemExit(1)
    finally:
        if harness is not None:
            harness.admin.close()

if __name__ == "__main__":
    main()

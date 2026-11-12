#!/usr/bin/env python3
"""Disposable local-stack acceptance ONLY; never hosted staging/deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request
import uuid

CLI_VERSION = "2.122.1"
API_PORT, DB_PORT = 55421, 55422
EXCLUDE = "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
PROJECT_RE = re.compile(r"irth-v18-ci-[0-9]+-[0-9]+\Z")
ROOT = Path(__file__).resolve().parents[3]
PROPOSAL = ROOT / "docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql"

class Failure(Exception):
    """Only static, credential-free messages may be placed here."""

def require(condition, message):
    if not condition:
        raise Failure(message)

def endpoint(value, scheme, port, path="", credentials=False):
    require(isinstance(value, str) and not any(ord(c) <= 32 for c in value), "missing or malformed endpoint")
    try:
        url = urllib.parse.urlsplit(value)
        valid = (url.scheme == scheme and url.hostname == "127.0.0.1" and url.port == port
                 and url.path == path and not url.query and not url.fragment)
        if credentials:
            valid = valid and url.username == "postgres" and bool(url.password)
        else:
            valid = valid and url.username is None and url.password is None
    except (ValueError, TypeError):
        valid = False
    require(valid, "endpoint is not the exact disposable loopback target")
    return url

def status_fields(status):
    # Explicitly support documented flat legacy and nested CLI status layouts.
    require(isinstance(status, dict), "malformed local status object")
    def get(flat, section, key):
        nested = status.get(section, {})
        require(isinstance(nested, dict), "malformed local status section")
        legacy, modern = status.get(flat), nested.get(key)
        require(not (legacy and modern and legacy != modern), "conflicting local status fields")
        value = legacy or modern
        require(isinstance(value, str) and bool(value), "missing local status field")
        return value
    return {"api": get("API_URL", "api", "url"), "db": get("DB_URL", "db", "url"),
            "anon": get("ANON_KEY", "auth", "anon_key"),
            "service": get("SERVICE_ROLE_KEY", "auth", "service_role_key")}

def configure(text, project):
    require(PROJECT_RE.fullmatch(project), "invalid disposable project identifier")
    text, count = re.subn(r'^project_id = .*$', f'project_id = "{project}"', text, count=1, flags=re.M)
    require(count == 1, "generated config missing project identifier")
    def set_value(section, key, value):
        nonlocal text
        pattern = r'(?ms)(^\[' + re.escape(section) + r'\]\n)(.*?)(?=^\[|\Z)'
        match = re.search(pattern, text)
        require(match is not None, "generated config missing required section")
        body, n = re.subn(r'^' + re.escape(key) + r' = .*$', f'{key} = {value}', match.group(2), count=1, flags=re.M)
        if not n:
            body = f'{key} = {value}\n' + body
        text = text[:match.start()] + match.group(1) + body + text[match.end():]
    set_value("api", "port", str(API_PORT))
    set_value("api", "schemas", '["public"]')
    set_value("api", "auto_expose_new_tables", "true")
    set_value("db", "port", str(DB_PORT))
    set_value("db", "shadow_port", "55420")
    set_value("db.migrations", "enabled", "false")
    set_value("db.seed", "enabled", "false")
    parsed = tomllib.loads(text)
    require(parsed["project_id"] == project and parsed["db"]["major_version"] == 17, "unexpected generated config")
    return text

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Failure("HTTP redirect forbidden")

class Harness:
    def __init__(self):
        require(os.environ.get("GITHUB_ACTIONS") == "true", "stack operations require disposable GitHub Actions runner")
        base = Path(os.environ["RUNNER_TEMP"]).resolve()
        require(base.is_dir(), "runner temp missing")
        run, attempt = os.environ.get("GITHUB_RUN_ID", ""), os.environ.get("GITHUB_RUN_ATTEMPT", "")
        self.project = f"irth-v18-ci-{run}-{attempt}"
        require(PROJECT_RE.fullmatch(self.project), "invalid run identity")
        self.work = base / self.project
        self.evidence = base / "v18-local-supabase-evidence"
        self.evidence.mkdir(mode=0o700, exist_ok=True)
        self.report = {"scope": "LOCAL SUPABASE STACK ONLY; NOT hosted staging or production approval",
                       "cli_version": CLI_VERSION, "cases": [], "result": "FAIL"}
        self.fields = None
        self.endpoints_verified = False
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith(("SUPABASE_", "PG")) and k not in ("DATABASE_URL", "DB_URL")}
        for key in ("DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG"):
            self.env.pop(key, None)
        self.env["DOCKER_HOST"] = "unix:///var/run/docker.sock"
        self.env["HOME"] = str(self.work / "private-home")
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def command(self, args, input=None, timeout=120):
        # Never forward subprocess output. CLI start/status can print credentials.
        try:
            result = subprocess.run(args, input=input, text=True, capture_output=True,
                                    env=self.env, cwd=self.work, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired):
            raise Failure("local command unavailable or timed out") from None
        if result.returncode != 0:
            self.report["command_failure"] = {"label": Path(args[0]).name + "_" + args[1], "exit_code": result.returncode}
            raise Failure("local command failed; raw output withheld")
        return result.stdout

    def cli(self, *args, timeout=120):
        return self.command(["supabase", *args, "--workdir", str(self.work)], timeout=timeout)

    def isolation(self):
        require(self.work.is_dir() and not self.work.is_symlink(), "invalid disposable workdir")
        cfg = tomllib.loads((self.work / "supabase/config.toml").read_text())
        require(cfg["project_id"] == self.project and cfg["api"]["port"] == API_PORT
                and cfg["db"]["port"] == DB_PORT, "disposable config drift")
        require(not (self.work / "supabase/.temp/project-ref").exists(), "linked project forbidden")
        require(not list((self.work / "supabase/migrations").glob("*.sql")), "unexpected migrations")
        require(not cfg["db"]["migrations"]["enabled"] and not cfg["db"]["seed"]["enabled"], "implicit SQL execution forbidden")
        require(self.fields is not None, "missing local status")
        endpoint(self.fields["api"], "http", API_PORT)
        endpoint(self.fields["db"], "postgresql", DB_PORT, "/postgres", credentials=True)

    def containers(self):
        records = []
        for component, internal, external in (("db", "5432/tcp", DB_PORT), ("kong", "8000/tcp", API_PORT), ("auth", None, None), ("rest", None, None)):
            name = f"supabase_{component}_{self.project}"
            data = json.loads(self.command(["docker", "inspect", name]))[0]
            require(data["Name"] == "/" + name, "container name mismatch")
            require(data["Config"]["Labels"].get("com.supabase.cli.project") == self.project, "container project label mismatch")
            require(data["State"]["Running"], "container not running")
            if internal:
                bindings = data["NetworkSettings"]["Ports"].get(internal) or []
                require(any(x["HostPort"] == str(external) for x in bindings), "container endpoint port mismatch")
            image = json.loads(self.command(["docker", "image", "inspect", data["Image"]]))[0]
            records.append({"component": component, "image": data["Config"]["Image"],
                            "image_id": data["Image"], "repo_digests": image.get("RepoDigests", [])})
        self.report["containers"] = records
        self.endpoints_verified = True

    def sql(self, sql):
        require(self.endpoints_verified, "container identity not verified")
        self.isolation()
        url = endpoint(self.fields["db"], "postgresql", DB_PORT, "/postgres", credentials=True)
        env = self.env.copy()
        env["PGPASSWORD"] = urllib.parse.unquote(url.password)
        # Pin both name/address: libpq cannot select an ambient service or remote.
        env["PGHOSTADDR"] = "127.0.0.1"
        try:
            result = subprocess.run(["psql", "-X", "-qAt", "-h", "127.0.0.1", "-p", str(DB_PORT),
                                     "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                                    input=sql, text=True, capture_output=True, env=env, timeout=45)
        except (OSError, subprocess.TimeoutExpired):
            raise Failure("local SQL unavailable or timed out") from None
        if result.returncode != 0:
            self.report["command_failure"] = {"label": "psql_acceptance", "exit_code": result.returncode}
            raise Failure("local SQL acceptance failed; raw output withheld")
        return result.stdout.strip()

    def request(self, path, token=None, payload=None, method="GET", apikey=None):
        require(self.endpoints_verified, "container identity not verified")
        self.isolation()
        require(path.startswith(("/auth/v1/", "/rest/v1/")) and not path.startswith("//"), "invalid API path")
        headers = {"apikey": apikey or self.fields["anon"], "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(self.fields["api"] + path, data=data, headers=headers, method=method)
        try:
            with self.http.open(req, timeout=20) as response:
                code, body = response.status, response.read()
        except urllib.error.HTTPError as error:
            code, body = error.code, error.read()
        except (urllib.error.URLError, TimeoutError):
            raise Failure("local API transport failure") from None
        try:
            return code, json.loads(body) if body else None
        except (ValueError, UnicodeError):
            raise Failure("non-JSON API response") from None

    def check(self, condition, name):
        require(condition, name)
        self.report["cases"].append(name)

    def gate(self, token, body=None):
        return self.request("/rest/v1/rpc/get_economic_protocol_gate_v1", token,
                            {} if body is None else body, "POST")

    def denied(self, response):
        code, body = response
        return code in (401, 403) and isinstance(body, dict) and body.get("code") == "42501"

    def probe(self):
        self.check(self.sql("SELECT current_database()='postgres' AND inet_server_port()=5432;") == "t", "actual disposable database")
        self.check(self.sql("SELECT count(*) FROM auth.users;") == "0", "fresh Auth user catalog")
        self.check(self.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';") == "0", "fresh public schema")
        # Real Auth, no SQL-created users, fabricated JWTs or overwritten auth.uid.
        users, tokens = [], []
        for name in ("alice", "bob", "v17", "new"):
            password = secrets.token_urlsafe(32)
            email = f"{name}@irth-v18.invalid"
            code, user = self.request("/auth/v1/admin/users", self.fields["service"],
                                      {"email": email, "password": password, "email_confirm": True}, "POST",
                                      self.fields["service"])
            self.check(code in (200, 201) and isinstance(user, dict) and "id" in user, "Auth creates synthetic " + name)
            user_id = str(uuid.UUID(user["id"]))
            code, session = self.request("/auth/v1/token?grant_type=password", payload={"email": email, "password": password}, method="POST")
            self.check(code == 200 and session.get("user", {}).get("id") == user_id and bool(session.get("access_token")), "Auth issues real JWT for " + name)
            users.append(user_id); tokens.append(session["access_token"])
        self.sql("""CREATE SCHEMA gate_test_evidence;
          REVOKE ALL ON SCHEMA gate_test_evidence FROM PUBLIC,anon,authenticated,service_role;
          CREATE TABLE gate_test_evidence.sentinel(id int PRIMARY KEY, payload jsonb NOT NULL);
          INSERT INTO gate_test_evidence.sentinel VALUES(1,'{"synthetic":"preserve","xp":17,"dinars":23,"legacy_unknown":true}');""")
        before = self.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM gate_test_evidence.sentinel s;")
        uid_before = self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);")
        proposal = PROPOSAL.read_text()
        self.report["proposal_sha256"] = hashlib.sha256(proposal.encode()).hexdigest()
        self.sql(proposal)
        self.sql(f"INSERT INTO public.economic_protocol_candidates(user_id,diagnostic_state) VALUES ('{users[0]}','candidate'),('{users[1]}','incomplete'); NOTIFY pgrst,'reload schema';")
        expected = [{"schema_version": 1, "protocol_state": p, "diagnostic_state": d, "economic_authority_enabled": False}
                    for p, d in (("legacy", "candidate"), ("unresolved", "incomplete"), ("legacy", "absent"), ("legacy", "absent"))]
        # Bounded schema-cache readiness; no failure is interpreted as ACL denial.
        for attempt in range(30):
            code, body = self.gate(tokens[0])
            if code == 200:
                break
            require(code == 404 and isinstance(body, dict) and body.get("code") in ("PGRST202", "PGRST205"), "unexpected gate readiness failure")
            time.sleep(1)
        self.check(code == 200 and body == expected[0], "PostgREST gate ready and Alice JWT resolves real auth.uid")
        for i, token in enumerate(tokens):
            self.check(self.gate(token) == (200, expected[i]), "gate inert for synthetic user " + str(i))
        for i in (0, 1):
            response = self.request("/rest/v1/economic_protocol_candidates?select=user_id,diagnostic_state", tokens[i])
            self.check(response == (200, [{"user_id": users[i], "diagnostic_state": expected[i]["diagnostic_state"]}]), "RLS own row only user " + str(i))
            self.check(self.request("/rest/v1/economic_protocol_candidates?user_id=eq." + users[1-i], tokens[i]) == (200, []), "RLS cross-owner invisible user " + str(i))
        for method, path, payload in (("POST", "", {"user_id": users[2], "diagnostic_state": "candidate"}),
                                      ("PATCH", "?user_id=eq." + users[0], {"diagnostic_state": "incomplete"}),
                                      ("DELETE", "?user_id=eq." + users[0], None)):
            for label, token in (("authenticated", tokens[0]), ("service_role", self.fields["service"])):
                self.check(self.denied(self.request("/rest/v1/economic_protocol_candidates" + path, token, payload, method)), label + " cannot " + method)
        for label, token in (("anonymous", None), ("service_role", self.fields["service"])):
            self.check(self.denied(self.request("/rest/v1/economic_protocol_candidates?select=user_id", token)), label + " direct table read denied")
        self.check(self.denied(self.gate(None)), "anonymous RPC denied")
        self.check(self.denied(self.gate(self.fields["service"])), "service_role RPC denied despite BYPASSRLS")
        code, body = self.gate("invalid.jwt.value")
        self.check(code == 401 and isinstance(body, dict) and body.get("code") == "PGRST301", "invalid JWT rejected by PostgREST")
        code, body = self.gate(tokens[0], {"user_id": users[1]})
        self.check(code == 404 and body.get("code") == "PGRST202", "destination UID argument rejected")
        self.check(self.sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_economic_protocol_gate_v1' AND p.pronargs=0 AND NOT p.prosecdef;") == "1", "single invoker no-argument gate signature")
        self.check(self.sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_economic_protocol_gate_v1';") == "1", "no gate overloads")
        # Deliberate relaxations ONLY inside this disposable DB. The same
        # protection predicates must detect them, then the exact grants/policy
        # are restored and positive reachability plus denials rechecked.
        try:
            self.sql("GRANT UPDATE ON public.economic_protocol_candidates TO authenticated; NOTIFY pgrst,'reload schema';")
            self.check(self.gate(tokens[0]) == (200, expected[0]), "positive gate before ACL negative control")
            response = self.request("/rest/v1/economic_protocol_candidates?user_id=eq." + users[0], tokens[0], {"diagnostic_state": "candidate"}, "PATCH")
            self.check(not self.denied(response) and response[0] in (200, 204), "negative control detects missing UPDATE ACL denial")
        finally:
            self.sql("REVOKE UPDATE ON public.economic_protocol_candidates FROM authenticated; NOTIFY pgrst,'reload schema';")
        self.check(self.denied(self.request("/rest/v1/economic_protocol_candidates?user_id=eq." + users[0], tokens[0], {"diagnostic_state": "candidate"}, "PATCH")), "UPDATE ACL restored")
        try:
            self.sql("CREATE POLICY gate_negative_cross_owner ON public.economic_protocol_candidates FOR SELECT TO authenticated USING(true); NOTIFY pgrst,'reload schema';")
            self.check(self.gate(tokens[0]) == (200, expected[0]), "positive gate before RLS negative control")
            code, body = self.request("/rest/v1/economic_protocol_candidates?select=user_id", tokens[0])
            self.check(code == 200 and {row["user_id"] for row in body} == set(users[:2]), "negative control detects cross-owner RLS exposure")
        finally:
            self.sql("DROP POLICY gate_negative_cross_owner ON public.economic_protocol_candidates;")
        self.check(self.request("/rest/v1/economic_protocol_candidates?user_id=eq." + users[1], tokens[0]) == (200, []), "cross-owner RLS restored")
        try:
            self.sql("""CREATE FUNCTION public.get_economic_protocol_gate_v1(user_id uuid) RETURNS jsonb
                LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
                AS $$ SELECT jsonb_build_object('negative_control',true) $$;
                REVOKE ALL ON FUNCTION public.get_economic_protocol_gate_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
                GRANT EXECUTE ON FUNCTION public.get_economic_protocol_gate_v1(uuid) TO authenticated;
                NOTIFY pgrst,'reload schema';""")
            for attempt in range(30):
                code, body = self.gate(tokens[0], {"user_id": users[1]})
                if code == 200:
                    break
                require(code == 404 and isinstance(body, dict) and body.get("code") == "PGRST202", "UID negative-control readiness failure")
                time.sleep(1)
            self.check(code == 200 and body == {"negative_control": True}, "negative control detects destination UID overload")
            self.check(self.gate(tokens[0]) == (200, expected[0]), "positive no-argument gate during overload control")
        finally:
            self.sql("DROP FUNCTION IF EXISTS public.get_economic_protocol_gate_v1(uuid); NOTIFY pgrst,'reload schema';")
        for attempt in range(30):
            code, body = self.gate(tokens[0], {"user_id": users[1]})
            if code == 404 and isinstance(body, dict) and body.get("code") == "PGRST202":
                break
            # A cache entry may temporarily survive its function; never count
            # SQL errors or transport errors as successful restored rejection.
            require(code in (200, 400, 404), "unexpected overload restoration response")
            time.sleep(1)
        self.check(code == 404 and isinstance(body, dict) and body.get("code") == "PGRST202", "UID overload removed and schema cache restored")
        for i, token in enumerate(tokens):
            self.check(self.gate(token) == (200, expected[i]), "gate unchanged after negative controls user " + str(i))
        self.check(self.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM gate_test_evidence.sentinel s;") == before, "entire synthetic sentinel unchanged across DDL/API/negative controls")
        self.check(self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);") == uid_before, "actual auth.uid definition unchanged")
        self.report["catalog"] = json.loads(self.sql("""SELECT jsonb_build_object(
          'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'inherit',rolinherit)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator')),
          'memberships',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname)) FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member),
          'default_acls',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'schema',nspname,'type',defaclobjtype,'acl',defaclacl::text)) FROM pg_default_acl LEFT JOIN pg_namespace n ON n.oid=defaclnamespace),
          'table_acl',(SELECT relacl::text FROM pg_class WHERE oid='public.economic_protocol_candidates'::regclass),
          'table_owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.economic_protocol_candidates'::regclass),
          'rls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.economic_protocol_candidates'::regclass),
          'rpc_acl',(SELECT proacl::text FROM pg_proc WHERE oid='public.get_economic_protocol_gate_v1()'::regprocedure),
          'rpc_stable',(SELECT provolatile='s' FROM pg_proc WHERE oid='public.get_economic_protocol_gate_v1()'::regprocedure),
          'rpc_search_path',(SELECT proconfig FROM pg_proc WHERE oid='public.get_economic_protocol_gate_v1()'::regprocedure),
          'auth_uid_definition',pg_get_functiondef('auth.uid()'::regprocedure))::text;"""))
        self.check(self.report["catalog"]["rls"] is True, "RLS enabled and forced in actual catalog")
        self.check(self.report["catalog"]["rpc_stable"] is True
                   and self.report["catalog"]["rpc_search_path"] == ["search_path=pg_catalog"], "gate STABLE and exact safe search_path")
        self.check(self.sql("""SELECT has_table_privilege('authenticated','public.economic_protocol_candidates','SELECT')
          AND has_function_privilege('authenticated','public.get_economic_protocol_gate_v1()','EXECUTE')
          AND NOT has_table_privilege('authenticated','public.economic_protocol_candidates','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          AND NOT has_table_privilege('anon','public.economic_protocol_candidates','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          AND NOT has_table_privilege('service_role','public.economic_protocol_candidates','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          AND NOT has_function_privilege('anon','public.get_economic_protocol_gate_v1()','EXECUTE')
          AND NOT has_function_privilege('service_role','public.get_economic_protocol_gate_v1()','EXECUTE');""") == "t", "effective inherited table and function privilege boundaries")
        roles = {role["name"]: role for role in self.report["catalog"]["roles"]}
        self.check(not roles["authenticated"]["superuser"] and not roles["authenticated"]["bypassrls"]
                   and roles["service_role"]["bypassrls"], "actual authenticated/service role attributes verified")
        self.check(self.sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_economic_protocol_gate_v1';") == "1", "no negative-control overload remains")
        self.report["result"] = "LOCAL STACK PASS; HOSTED STAGING PENDING; PRODUCTION NO-GO"

    def cleanup(self):
        if not self.work.exists():
            return
        cfg = self.work / "supabase/config.toml"
        require(cfg.exists() and tomllib.loads(cfg.read_text())["project_id"] == self.project, "cleanup project ownership mismatch")
        self.cli("stop", "--project-id", self.project, "--no-backup", timeout=120)

    def run(self):
        require(not self.work.exists(), "disposable directory already exists")
        self.work.mkdir(mode=0o700)
        (self.work / "private-home").mkdir(mode=0o700)
        try:
            self.check(self.command(["supabase", "--version"]).strip() == CLI_VERSION, "exact pinned CLI version")
            self.report["stage"] = "fresh local init"
            self.cli("init", "--yes")
            cfg = self.work / "supabase/config.toml"
            cfg.write_text(configure(cfg.read_text(), self.project))
            self.report["stage"] = "local stack start with health checks"
            self.cli("start", "--exclude", EXCLUDE, timeout=720)
            self.report["stage"] = "private status parse"
            self.fields = status_fields(json.loads(self.cli("status", "--output", "json")))
            self.isolation()
            require(all(isinstance(self.fields[k], str) and self.fields[k] for k in ("anon", "service")), "local credential fields unavailable")
            self.report["stage"] = "container identity verification"
            self.containers()
            self.report["stage"] = "real Auth SQL and PostgREST probes"
            self.probe()
            self.report["stage"] = "acceptance complete"
        except Failure as error:
            self.report["failure"] = str(error)
        except Exception:
            # Never serialize arbitrary exception text: it may contain credentials.
            self.report["failure"] = "unexpected local harness error; raw details withheld"
        finally:
            try:
                self.cleanup()
                self.report["cleanup"] = "unique project stopped without backups"
            except Exception:
                self.report["cleanup"] = "failed; always-run cleanup step must retry"
                self.report["result"] = "FAIL"
            (self.evidence / "acceptance.json").write_text(json.dumps(self.report, indent=2) + "\n")
        print(self.report["result"])
        return 0 if self.report["result"].startswith("LOCAL STACK PASS") else 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("run", "cleanup"))
    action = parser.parse_args().action
    try:
        harness = Harness()
        if action == "cleanup":
            harness.cleanup()
        else:
            sys.exit(harness.run())
    except Exception:
        print("Local harness preflight/cleanup failed; details withheld", file=sys.stderr)
        sys.exit(1)

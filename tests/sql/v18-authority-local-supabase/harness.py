#!/usr/bin/env python3
"""Disposable local-stack acceptance ONLY; never hosted staging/deployment."""
import argparse
import base64
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
from concurrent.futures import ThreadPoolExecutor
import adapter

CLI_VERSION = "2.122.1"
API_PORT, DB_PORT = 55531, 55532
ADMIN_IMAGE_ID = "sha256:75e157ef7b7e35e286a2df56e2fb1be697bbf0b07fae0565f3c1da0b33f4629a"
ADMIN_IMAGE_REFERENCE = "public.ecr.aws/supabase/postgres:17.11.0.006"
ADMIN_IMAGE_DIGEST = "public.ecr.aws/supabase/postgres@sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2"
EXCLUDE = "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
PROJECT_RE = re.compile(r"irth-v18-authority-[0-9]+-[0-9]+\Z")
ROOT = Path(__file__).resolve().parents[3]
ENGINE = ROOT / "tests/sql/v18-authority-prototype/prototype.sql"

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
    set_value("db", "shadow_port", "55530")
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
        require(os.environ.get("GITHUB_REF") == "refs/heads/v18-01a-outbox-recovery", "only isolated verification branch allowed")
        source_sha = os.environ.get("GITHUB_SHA", "")
        require(re.fullmatch(r"[0-9a-f]{40}", source_sha), "missing immutable source revision")
        base = Path(os.environ["RUNNER_TEMP"]).resolve()
        require(base.is_dir(), "runner temp missing")
        run, attempt = os.environ.get("GITHUB_RUN_ID", ""), os.environ.get("GITHUB_RUN_ATTEMPT", "")
        self.project = f"irth-v18-authority-{run}-{attempt}"
        require(PROJECT_RE.fullmatch(self.project), "invalid run identity")
        self.work = base / self.project
        self.evidence = base / "v18-authority-local-evidence"
        self.evidence.mkdir(mode=0o700, exist_ok=True)
        self.report = {"scope": "LOCAL SUPABASE STACK ONLY; NOT hosted staging or production approval",
                       "cli_version": CLI_VERSION, "source_sha": source_sha, "cases": [], "result": "FAIL"}
        self.fields = None
        self.endpoints_verified = False
        self.db_identity = None
        self.socket_admin = False
        self.admin_socket = None
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
        config_path = self.work / "supabase/config.toml"
        require(not config_path.is_symlink(), "config symlink forbidden")
        cfg = tomllib.loads(config_path.read_text())
        require(cfg["project_id"] == self.project and cfg["api"]["port"] == API_PORT
                and cfg["db"]["port"] == DB_PORT and cfg["db"]["major_version"] == 17
                and cfg["db"]["shadow_port"] == 55530 and cfg["api"]["schemas"] == ["public"], "disposable config drift")
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
            if component == "db":
                require(re.fullmatch(r"[0-9a-f]{64}", data.get("Id", "")), "invalid database container ID")
                self.db_identity = {"id": data["Id"], "image": data["Image"], "name": name}
            image = json.loads(self.command(["docker", "image", "inspect", data["Image"]]))[0]
            records.append({"component": component, "image": data["Config"]["Image"],
                            "image_id": data["Image"], "repo_digests": image.get("RepoDigests", [])})
        self.report["containers"] = records
        self.endpoints_verified = True

    def sql(self, sql):
        require(self.endpoints_verified, "container identity not verified")
        self.isolation()
        if self.socket_admin:
            return self.socket_admin_sql(sql)
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

    def verify_admin_container(self):
        require(self.endpoints_verified and self.db_identity is not None, "admin requires verified local container")
        self.isolation()
        saved = self.db_identity
        evidence = next((r for r in self.report.get('containers',[]) if r.get('component')=='db'), None)
        require(evidence is not None and evidence.get('image_id')==ADMIN_IMAGE_ID
                and evidence.get('image')==ADMIN_IMAGE_REFERENCE
                and ADMIN_IMAGE_DIGEST in evidence.get('repo_digests',[])
                and saved['image']==ADMIN_IMAGE_ID, "admin image is not reviewed disposable build")
        require(re.fullmatch(r"[0-9a-f]{64}", saved['id']), "invalid pinned container ID")
        data = json.loads(self.command(['docker','inspect',saved['id']]))[0]
        require(data.get('Id')==saved['id'] and data.get('Name')=='/'+saved['name']
                and data['Config']['Labels'].get('com.supabase.cli.project')==self.project
                and data['Image']==saved['image'] and data['State']['Running'], "admin container identity changed")
        ports = data['NetworkSettings']['Ports'].get('5432/tcp') or []
        require(any(p['HostPort']==str(DB_PORT) for p in ports), "admin container port changed")
        return saved['id']

    def socket_admin_sql(self, sql):
        container = self.verify_admin_container()
        require(self.admin_socket in ('/tmp','/var/run/postgresql'), "unreviewed admin socket")
        # The password stays inside the already-verified disposable container;
        # it is never read into output, argv, an artifact or a host environment.
        script = ("set -eu; test -n \"${POSTGRES_PASSWORD:-}\"; "
                  "unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGUSER PGHOST PGPORT PGPASSFILE PGSSLMODE; "
                  "export PGPASSWORD=\"$POSTGRES_PASSWORD\"; "
                  "exec psql -X -qAt -w -h " + self.admin_socket +
                  " -p 5432 -U supabase_admin -d postgres -v ON_ERROR_STOP=1")
        guard = """DO $$ BEGIN
          IF current_user IS DISTINCT FROM 'supabase_admin' OR session_user IS DISTINCT FROM 'supabase_admin'
             OR current_database() IS DISTINCT FROM 'postgres' OR inet_client_addr() IS NOT NULL
             OR inet_server_port() IS NOT NULL OR current_setting('port') IS DISTINCT FROM '5432'
             OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin)
          THEN RAISE EXCEPTION 'acceptance:unverified-local-admin'; END IF;
          END $$;
        """
        return self.command(['docker','exec','-i',container,'/bin/sh','-c',script], input=guard+sql, timeout=45).strip()

    def select_local_admin(self):
        # Read-only inspection first through the independently verified TCP path.
        current = json.loads(self.sql("SELECT jsonb_build_object('superuser',rolsuper,'create_role',rolcreaterole)::text FROM pg_roles WHERE rolname=current_user;"))
        self.report['local_admin'] = current
        if current.get('superuser') is True:
            self.report['admin_route'] = 'verified loopback postgres superuser'
            return
        candidate = self.sql("SELECT coalesce(bool_and(rolsuper AND rolcanlogin),false) FROM pg_roles WHERE rolname='supabase_admin';")
        require(candidate=='t', "local supabase_admin capability absent")
        socket = self.sql('SHOW unix_socket_directories;')
        require(socket in ('/tmp','/var/run/postgresql'), "local admin socket is not reviewed")
        self.admin_socket = socket
        result = json.loads(self.socket_admin_sql("SELECT jsonb_build_object('role',current_user,'session',session_user,'database',current_database(),'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'socket',inet_client_addr() IS NULL AND inet_server_port() IS NULL)::text;"))
        require(result == {'role':'supabase_admin','session':'supabase_admin','database':'postgres','superuser':True,'socket':True}, "local admin session verification failed")
        self.socket_admin = True
        self.report['admin_route'] = 'verified pinned-container supabase_admin local socket'
        self.report['admin_session'] = result
        self.report['admin_socket'] = socket

    def request(self, path, token=None, payload=None, method="GET", apikey=None, profile=None):
        require(self.endpoints_verified, "container identity not verified")
        self.isolation()
        require(path.startswith(("/auth/v1/", "/rest/v1/")) and not path.startswith("//"), "invalid API path")
        headers = {"apikey": apikey or self.fields["anon"], "Content-Type": "application/json"}
        if profile:
            require(profile in ("v18_proto_api", "public", "v18_proto_private"), "unreviewed schema profile")
            headers["Content-Profile" if method == "POST" else "Accept-Profile"] = profile
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

    def rpc(self, name, token, payload):
        require(name in ('bootstrap', 'apply_fact'), 'unexpected RPC')
        return self.request('/rest/v1/rpc/' + name, token, payload, 'POST', profile='v18_proto_api')

    def snapshot(self):
        # Full protected engine state; deterministic ordering, not only totals.
        tables = ('catalog', 'sources', 'facts', 'seals', 'accounts', 'operations', 'consumption')
        parts = ["'%s',(SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM (SELECT to_jsonb(t) v FROM v18_proto_private.%s t) q)" % (t, t) for t in tables]
        return self.sql('SELECT jsonb_build_object(' + ','.join(parts) + ')::text;')

    @staticmethod
    def rejection(response, message=None, codes=None):
        status, body = response
        return (status in (400, 401, 403, 404) and isinstance(body, dict)
                and (body.get('message') == message if message else body.get('code') in codes))

    def unchanged_rejection(self, call, name, message=None, codes=None):
        before = self.snapshot()
        self.check(self.rejection(call(), message, codes), name)
        self.check(self.snapshot() == before, name + ': complete protected state unchanged')

    def seed(self, owner, purpose, entries):
        require(purpose in ('genesis', 'facts'), 'invalid synthetic source purpose')
        owner = str(uuid.UUID(owner))
        source, seal = str(uuid.uuid4()), str(uuid.uuid4())
        facts = [str(uuid.uuid4()) for _ in entries]
        statements = [f"SELECT v18_proto_private.seed_source('{owner}','{source}','{purpose}');"]
        for fact, (subject, term) in zip(facts, entries):
            require(re.fullmatch(r'[a-z0-9-]+', subject) and term in ('genesis-v1','reward-v1','purchase-v1'), 'invalid synthetic seed')
            statements.append(f"SELECT v18_proto_private.seed_fact('{source}','{fact}','{subject}','{term}');")
        statements.append(f"SELECT v18_proto_private.seal_source('{source}','{seal}');")
        self.sql('BEGIN;\n' + '\n'.join(statements) + '\nCOMMIT;')
        return seal, facts

    def acl_safe(self):
        # Effective checks include inherited and column-only privileges. PostgreSQL
        # SET ROLE is not used to pretend that a JWT was verified.
        return self.sql("""SELECT
          NOT EXISTS(SELECT 1 FROM pg_roles a CROSS JOIN pg_roles b
            WHERE a.rolname IN ('anon','authenticated','service_role','authenticator')
            AND b.rolname IN ('v18_proto_issuer','v18_proto_executor')
            AND pg_has_role(a.oid,b.oid,'MEMBER'))
          AND NOT EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE r.rolname IN ('anon','authenticated','service_role','v18_proto_authenticated','v18_proto_anon','v18_proto_service')
            AND n.nspname IN ('v18_proto_private','v18_proto_api') AND c.relkind IN ('r','p','v','m','f')
            AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
          AND NOT EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE r.rolname IN ('anon','authenticated','service_role','v18_proto_authenticated','v18_proto_anon','v18_proto_service')
            AND n.nspname IN ('v18_proto_private','v18_proto_api')
            AND has_function_privilege(r.oid,p.oid,'EXECUTE') IS DISTINCT FROM
              (r.rolname='authenticated' AND n.nspname='v18_proto_api'
               AND p.oid IN ('v18_proto_api.bootstrap(uuid)'::regprocedure,'v18_proto_api.apply_fact(uuid,uuid,bigint)'::regprocedure)))
          AND NOT EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_namespace n
            WHERE r.rolname IN ('anon','authenticated','service_role','v18_proto_authenticated','v18_proto_anon','v18_proto_service')
            AND n.nspname IN ('v18_proto_private','v18_proto_api')
            AND (has_schema_privilege(r.oid,n.oid,'CREATE') OR
              has_schema_privilege(r.oid,n.oid,'USAGE') IS DISTINCT FROM (r.rolname='authenticated' AND n.nspname='v18_proto_api')))
          AND (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='v18_proto_api')
          AND (SELECT bool_and(pg_get_userbyid(proowner)='v18_proto_executor' AND prosecdef
                 AND proconfig=ARRAY['search_path=pg_catalog']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='v18_proto_api')
          AND (SELECT NOT prosecdef AND pg_get_userbyid(proowner)='v18_proto_executor'
                 AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='v18_proto_private.fixture_subject()'::regprocedure)
          AND (SELECT NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname='authenticated')
          AND (SELECT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname='service_role');""") == 't'

    def role_default_probe(self):
        # Objects created by dedicated fixture owners must not acquire ambient
        # Supabase grants. Roll back probes; postgres future objects are not claimed.
        for role in ('v18_proto_issuer','v18_proto_executor'):
            schema = "v18_proto_private" if role == "v18_proto_issuer" else "v18_proto_api"
            result = self.sql(f"""BEGIN; SET LOCAL ROLE {role};
              CREATE TABLE {schema}.future_acl_probe(id integer);
              CREATE FUNCTION {schema}.future_acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
              RESET ROLE;
              SELECT NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
                AND (has_table_privilege(r.oid,'{schema}.future_acl_probe','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                  OR has_function_privilege(r.oid,'{schema}.future_acl_probe()','EXECUTE')));
              ROLLBACK;""")
            self.check(result == 't', 'dedicated creator default ACL ' + role)

    def auth_users(self):
        users, tokens = [], []
        for name in ('alice', 'bob'):
            password = secrets.token_urlsafe(32)
            email = name + '@v18-authority.invalid'
            code, user = self.request('/auth/v1/admin/users', self.fields['service'],
                {'email': email, 'password': password, 'email_confirm': True}, 'POST', self.fields['service'])
            self.check(code in (200,201) and isinstance(user,dict) and 'id' in user, 'real Auth creates ' + name)
            user_id = str(uuid.UUID(user['id']))
            code, session = self.request('/auth/v1/token?grant_type=password', payload={'email':email,'password':password}, method='POST')
            self.check(code==200 and isinstance(session,dict) and session.get('user',{}).get('id')==user_id
                       and bool(session.get('access_token')), 'real Auth password grant ' + name)
            users.append(user_id); tokens.append(session['access_token'])
        return users, tokens

    def ready(self, token):
        # Actual PostgREST db-config precedence is verified, not assumed.
        for _ in range(30):
            result = self.rpc('bootstrap', token, {'p_seal':str(uuid.uuid4())})
            public = self.request('/rest/v1/', token, profile='public')
            if self.rejection(result, 'prototype:unknown-seal') and self.rejection(public, codes=('PGRST106',)):
                self.check(True, 'API schema active and public schema excluded')
                return
            time.sleep(1)
        raise Failure('PostgREST schema readiness or exposure boundary not verified')

    def probe(self):
        self.check(self.sql("SELECT current_database()='postgres' AND inet_server_port()=5432;")=='t', 'actual isolated database')
        self.check(self.sql("SELECT count(*) FROM auth.users;")=='0', 'empty Auth before installation')
        self.check(self.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';")=='0', 'empty public before installation')
        uid_before = self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);")
        self.sql("""CREATE SCHEMA fixture_boundary;
          REVOKE ALL ON SCHEMA fixture_boundary FROM PUBLIC,anon,authenticated,service_role;
          CREATE TABLE fixture_boundary.marker(marker text PRIMARY KEY);
          REVOKE ALL ON fixture_boundary.marker FROM PUBLIC,anon,authenticated,service_role;
          INSERT INTO fixture_boundary.marker VALUES('v18-authority-local-supabase-only-v1');""")
        self.report["stage"] = "verified disposable admin route"
        self.select_local_admin()
        self.report["stage"] = "atomic engine and adapter install"
        transaction, evidence = adapter.build(ENGINE.read_bytes())
        self.sql(transaction)
        self.report['adapter'] = evidence
        self.report['stage'] = 'effective ACL and dedicated default probes'
        self.check(self.acl_safe(), 'actual roles effective schema table column function and membership boundaries')
        self.role_default_probe()
        self.sql("ALTER ROLE authenticator SET pgrst.db_schemas='v18_proto_api'; NOTIFY pgrst,'reload config'; NOTIFY pgrst,'reload schema';")
        self.report["stage"] = "real Auth users and HTTP schema readiness"
        users, tokens = self.auth_users()
        alice, bob = users
        self.ready(tokens[0])
        seals = [self.seed(owner, 'genesis', [('baseline','genesis-v1')])[0] for owner in users]
        self.report['stage'] = 'HTTP bootstrap and credential denials'
        first = self.rpc('bootstrap', tokens[0], {'p_seal':seals[0]})
        self.check(first[0]==200 and isinstance(first[1],dict) and first[1].get('owner')==alice
                   and first[1].get('revision')=='0' and first[1].get('xp')=='100' and first[1].get('dinars')=='50', 'own bootstrap through verified JWT')
        before = self.snapshot()
        self.check(self.rpc('bootstrap', tokens[0], {'p_seal':seals[0]})==first and self.snapshot()==before, 'bootstrap exact replay no additional effect')
        self.unchanged_rejection(lambda:self.rpc('bootstrap',tokens[1],{'p_seal':seals[0]}), 'cross-owner bootstrap', 'prototype:foreign-evidence')
        with ThreadPoolExecutor(max_workers=2) as pool:
            second_pair = list(pool.map(lambda _:self.rpc('bootstrap',tokens[1],{'p_seal':seals[1]}),range(2)))
        second = second_pair[0]
        self.check(second==second_pair[1] and second[0]==200 and second[1].get('owner')==bob, 'second owner concurrent bootstrap identical receipt')
        signed_parts = tokens[0].split('.')
        require(len(signed_parts)==3, 'real Auth JWT shape')
        signature = signed_parts[2]
        forged_signature = '.'.join(signed_parts[:2] + [('A' if signature[0]!='A' else 'B') + signature[1:]])
        claims = json.loads(base64.urlsafe_b64decode(signed_parts[1] + '=' * (-len(signed_parts[1]) % 4)))
        claims['sub'] = bob
        changed_claims = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
        forged_subject = '.'.join((signed_parts[0],changed_claims,signed_parts[2]))
        for token,name in ((forged_signature,'tampered valid-token signature'),(forged_subject,'tampered subject without signature'),(None,'no bearer'),(self.fields['anon'],'anon'),(self.fields['service'],'service BYPASSRLS'),('invalid.jwt.signature','invalid JWT')):
            self.unchanged_rejection(lambda t=token:self.rpc('bootstrap',t,{'p_seal':seals[0]}), name+' denied', codes=('42501','PGRST301','PGRST302','PGRST303'))
        self.unchanged_rejection(lambda:self.rpc('bootstrap',tokens[0],{'p_seal':seals[0],'p_owner':bob}), 'no caller owner overload', codes=('PGRST202',))
        self.report['stage'] = 'HTTP ledger apply replay CAS and lineage'
        seal, facts = self.seed(alice,'facts', [('reward-a','reward-v1'),('purchase-a','purchase-v1'),('rollback','reward-v1')])
        request = str(uuid.uuid4())
        payload = {'p_fact':facts[0],'p_request':request,'p_expected_revision':0}
        self.unchanged_rejection(lambda:self.rpc('apply_fact',tokens[1],payload), 'cross-owner apply', 'prototype:foreign-evidence')
        self.unchanged_rejection(lambda:self.rpc('apply_fact',tokens[0],dict(payload,p_expected_revision=-1)), 'negative revision rejected', 'prototype:invalid-request')
        self.lineage_probe(tokens[0],payload)
        applied = self.rpc('apply_fact',tokens[0],payload)
        self.check(applied[0]==200 and applied[1].get('owner')==alice and applied[1].get('revision')=='1'
                   and applied[1].get('xp')=='110' and applied[1].get('dinars')=='53', 'own fact apply receipt and totals')
        before = self.snapshot()
        self.check(self.rpc('apply_fact',tokens[0],payload)==applied and self.snapshot()==before, 'exact retry returns identical receipt without writes')
        self.unchanged_rejection(lambda:self.rpc('apply_fact',tokens[0],dict(payload,p_request=str(uuid.uuid4()),p_expected_revision=1)), 'new request alias cannot consume fact twice', 'prototype:entitlement-consumed')
        self.unchanged_rejection(lambda:self.rpc('apply_fact',tokens[0],dict(payload,p_fact=facts[1])), 'request ID binding', 'prototype:request-conflict')
        self.unchanged_rejection(lambda:self.rpc('apply_fact',tokens[0],dict(payload,p_fact=facts[1],p_request=str(uuid.uuid4()))), 'stale revision', 'prototype:stale-revision')
        # Separate seals avoid serializing both contenders on the same source lock.
        # Parallel HTTP submission alone does not prove forced database lock overlap.
        race_facts = [self.seed(alice,'facts',[(subject,'reward-v1')])[1][0]
                      for subject in ('race-left','race-right')]
        self.check(self.sql(f"SELECT count(DISTINCT f.source_id)=2 AND bool_and(s.sealed) FROM v18_proto_private.facts f JOIN v18_proto_private.sources s USING(source_id) WHERE f.fact_id IN ('{race_facts[0]}','{race_facts[1]}');")=='t', 'CAS contenders belong to distinct sealed sources')
        race_payloads = [{'p_fact':f,'p_request':str(uuid.uuid4()),'p_expected_revision':1} for f in race_facts]
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda p:self.rpc('apply_fact',tokens[0],p), race_payloads))
        self.check(sum(r[0]==200 for r in outcomes)==1 and sum(self.rejection(r,'prototype:stale-revision') for r in outcomes)==1, 'parallel HTTP distinct-source CAS exactly one winner')
        self.check(self.sql(f"SELECT revision=2 AND xp=120 AND dinars=56 FROM v18_proto_private.accounts WHERE owner='{alice}';")=='t', 'CAS one committed delta')
        purchase = {'p_fact':facts[1],'p_request':str(uuid.uuid4()),'p_expected_revision':2}
        with ThreadPoolExecutor(max_workers=2) as pool:
            retries = list(pool.map(lambda _:self.rpc('apply_fact',tokens[0],purchase), range(2)))
        self.check(retries[0]==retries[1] and retries[0][0]==200 and retries[0][1].get('revision')=='3', 'concurrent identical request returns one receipt')
        self.check(self.sql(f"SELECT revision=3 AND xp=120 AND dinars=49 FROM v18_proto_private.accounts WHERE owner='{alice}';")=='t', 'concurrent retry exactly one purchase')
        _, bob_facts = self.seed(bob,'facts',[('bob-reward','reward-v1')])
        bob_result = self.rpc('apply_fact',tokens[1],{'p_fact':bob_facts[0],'p_request':request,'p_expected_revision':0})
        self.check(bob_result[0]==200 and bob_result[1].get('owner')==bob and bob_result[1].get('revision')=='1', 'same request identifier scoped independently to second owner')
        self.report['stage'] = 'late-write rollback and negative controls'
        self.rollback_probe(tokens[0],facts[2],3)
        self.negative_controls(tokens[0],seals[0])
        self.check(self.acl_safe(), 'final restored effective ACLs')
        self.check(self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);")==uid_before, 'auth.uid definition unchanged across all tests')
        before = self.snapshot()
        self.check(self.rpc('apply_fact',tokens[0],payload)==applied and self.snapshot()==before, 'final original replay clean after controls')
        self.report['final_state_sha256'] = hashlib.sha256(before.encode()).hexdigest()
        self.report['concurrency_scope'] = 'Parallel HTTP submission; no forced lock-overlap claim. Separate PostgreSQL engine fixture covers forced overlap.'
        self.report['numeric_scope'] = 'HTTP negative revision tested; overflow and underflow matrix remains separate PostgreSQL engine evidence.'
        self.report['default_acl_scope'] = 'Dedicated issuer/executor future objects checked; future postgres/supabase_admin-created objects require explicit cleanup and are not certified.'
        self.report['default_acls'] = json.loads(self.sql("SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'schema',n.nspname,'type',defaclobjtype,'acl',defaclacl::text)),'[]'::jsonb)::text FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE pg_get_userbyid(defaclrole) IN ('postgres','supabase_admin','v18_proto_issuer','v18_proto_executor');"))
        self.report['result'] = 'LOCAL STACK PASS; HOSTED AND PRODUCTION NOT ACCEPTED'

    def lineage_probe(self, token, payload):
        fact = str(uuid.UUID(payload['p_fact']))
        original = self.sql(f"SELECT event_hash FROM v18_proto_private.facts WHERE fact_id='{fact}';")
        require(re.fullmatch(r'[0-9a-f]{64}', original), 'invalid fixture event hash')
        before = self.snapshot()
        self.sql(f"BEGIN; ALTER TABLE v18_proto_private.facts DISABLE TRIGGER guard_fact; UPDATE v18_proto_private.facts SET event_hash=repeat('f',64) WHERE fact_id='{fact}'; ALTER TABLE v18_proto_private.facts ENABLE TRIGGER guard_fact; COMMIT;")
        try:
            self.unchanged_rejection(lambda:self.rpc('apply_fact',token,payload), 'tampered immutable journal lineage rejected', 'prototype:invalid-journal')
        finally:
            self.sql(f"BEGIN; ALTER TABLE v18_proto_private.facts DISABLE TRIGGER guard_fact; UPDATE v18_proto_private.facts SET event_hash='{original}' WHERE fact_id='{fact}'; ALTER TABLE v18_proto_private.facts ENABLE TRIGGER guard_fact; COMMIT;")
        self.check(self.snapshot()==before, 'synthetic journal corruption restored byte-for-byte')
        self.check(self.sql("SELECT tgenabled='O' FROM pg_trigger WHERE tgrelid='v18_proto_private.facts'::regclass AND tgname='guard_fact';")=='t', 'journal mutation guard restored')

    def rollback_probe(self, token, fact, revision):
        self.sql("""CREATE FUNCTION v18_proto_private.inject_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'acceptance:injected-failure'; END $$;
          REVOKE ALL ON FUNCTION v18_proto_private.inject_failure() FROM PUBLIC,anon,authenticated,service_role;
          CREATE TRIGGER acceptance_inject BEFORE INSERT ON v18_proto_private.consumption FOR EACH ROW EXECUTE FUNCTION v18_proto_private.inject_failure();""")
        payload = {'p_fact':fact,'p_request':str(uuid.uuid4()),'p_expected_revision':revision}
        try:
            self.unchanged_rejection(lambda:self.rpc('apply_fact',token,payload), 'late write failure rolls back account operation and consumption', 'acceptance:injected-failure')
        finally:
            self.sql('DROP TRIGGER acceptance_inject ON v18_proto_private.consumption; DROP FUNCTION v18_proto_private.inject_failure();')
        result = self.rpc('apply_fact',token,payload)
        self.check(result[0]==200 and result[1].get('revision')==str(revision+1), 'same failed request succeeds after fault removed')

    def negative_controls(self, token, seal):
        # Deliberately grant a real-role forbidden privilege, show audit fails,
        # restore exactly, then prove actual HTTP owner overload detection works.
        before = self.snapshot()
        self.sql('GRANT SELECT(xp) ON v18_proto_private.accounts TO authenticated;')
        try:
            self.check(not self.acl_safe(), 'negative control catches column-only privilege leak')
        finally:
            self.sql('REVOKE SELECT(xp) ON v18_proto_private.accounts FROM authenticated;')
        self.check(self.acl_safe() and self.snapshot()==before, 'column ACL control restored without data change')
        self.sql("""CREATE FUNCTION v18_proto_api.bootstrap(p_seal uuid,p_owner uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS 'SELECT jsonb_build_object(''acceptance_control'',true)';
          REVOKE ALL ON FUNCTION v18_proto_api.bootstrap(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
          GRANT EXECUTE ON FUNCTION v18_proto_api.bootstrap(uuid,uuid) TO authenticated;
          NOTIFY pgrst,'reload schema';""")
        try:
            response = None
            for _ in range(30):
                response = self.rpc('bootstrap',token,{'p_seal':seal,'p_owner':str(uuid.uuid4())})
                if response==(200,{'acceptance_control':True}): break
                time.sleep(0.2)
            self.check(response==(200,{'acceptance_control':True}), 'negative owner-overload control reaches real HTTP')
            self.check(not self.rejection(response,codes=('PGRST202',)), 'no-owner overload detector demonstrably fails when weakened')
            self.check(not self.acl_safe(), 'catalog detector catches extra API function')
        finally:
            self.sql("DROP FUNCTION v18_proto_api.bootstrap(uuid,uuid); NOTIFY pgrst,'reload schema';")
        for _ in range(30):
            response = self.rpc('bootstrap',token,{'p_seal':seal,'p_owner':str(uuid.uuid4())})
            if self.rejection(response,codes=('PGRST202',)): break
            time.sleep(0.2)
        self.check(self.rejection(response,codes=('PGRST202',)) and self.snapshot()==before, 'owner overload removed and no data changed')
    def cleanup(self):
        if not self.work.exists():
            return
        require(self.work.is_dir() and not self.work.is_symlink(), "cleanup workdir ownership mismatch")
        cfg = self.work / "supabase/config.toml"
        require(cfg.exists() and not cfg.is_symlink() and tomllib.loads(cfg.read_text())["project_id"] == self.project, "cleanup project ownership mismatch")
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

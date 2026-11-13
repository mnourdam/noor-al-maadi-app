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

CLI_VERSION = "2.122.1"
API_PORT, DB_PORT = 55541, 55542
ADMIN_IMAGE_ID = "sha256:75e157ef7b7e35e286a2df56e2fb1be697bbf0b07fae0565f3c1da0b33f4629a"
ADMIN_IMAGE_REFERENCE = "public.ecr.aws/supabase/postgres:17.11.0.006"
ADMIN_IMAGE_DIGEST = "public.ecr.aws/supabase/postgres@sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2"
EXCLUDE = "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
PROJECT_RE = re.compile(r"irth-v18-feedback-media-[0-9]+-[0-9]+\Z")
ROOT = Path(__file__).resolve().parents[3]
PROPOSAL = ROOT / "docs/proposals/v18-feedback-private-images.sql"
PROPOSAL_SHA = "9c503b313b34fc0e8994aea96824d8499aba527fe4edf72e62a5979f056c9280"

def admitted_event(event):
    return event in ("push", "workflow_dispatch")

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
    set_value("db", "shadow_port", "55540")
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
        require(admitted_event(os.environ.get("GITHUB_EVENT_NAME")), "unapproved event")
        source_sha = os.environ.get("GITHUB_SHA", "")
        require(re.fullmatch(r"[0-9a-f]{40}", source_sha), "missing immutable source revision")
        base = Path(os.environ["RUNNER_TEMP"]).resolve()
        require(base.is_dir(), "runner temp missing")
        run, attempt = os.environ.get("GITHUB_RUN_ID", ""), os.environ.get("GITHUB_RUN_ATTEMPT", "")
        self.project = f"irth-v18-feedback-media-{run}-{attempt}"
        require(PROJECT_RE.fullmatch(self.project), "invalid run identity")
        self.work = base / self.project
        self.evidence = base / "v18-feedback-media-evidence"
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
                and cfg["db"]["shadow_port"] == 55540 and cfg["api"]["schemas"] == ["public"], "disposable config drift")
        require(not (self.work / "supabase/.temp/project-ref").exists(), "linked project forbidden")
        require(not list((self.work / "supabase/migrations").glob("*.sql")), "unexpected migrations")
        require(not cfg["db"]["migrations"]["enabled"] and not cfg["db"]["seed"]["enabled"], "implicit SQL execution forbidden")
        require(self.fields is not None, "missing local status")
        endpoint(self.fields["api"], "http", API_PORT)
        endpoint(self.fields["db"], "postgresql", DB_PORT, "/postgres", credentials=True)

    def containers(self):
        records = []
        for component, internal, external in (("db", "5432/tcp", DB_PORT), ("kong", "8000/tcp", API_PORT), ("auth", None, None), ("rest", None, None), ("storage", None, None)):
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


    def check(self, condition, name):
        require(condition, name)
        self.report['cases'].append(name)

    def request(self, path, token=None, payload=None, method='GET', raw=None, mime='application/json', service=False, representation=False):
        require(self.endpoints_verified, 'container identity not verified')
        self.isolation()
        require(path.startswith(('/auth/v1/','/rest/v1/','/storage/v1/')) and '..' not in path and not any(c in path for c in '\r\n#'), 'invalid local API path')
        headers={'apikey':self.fields['service' if service else 'anon'], 'Content-Type':mime}
        if representation: headers['Prefer']='return=representation'
        if token: headers['Authorization']='Bearer '+token
        data=raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
        req=urllib.request.Request(self.fields['api']+path,data=data,headers=headers,method=method)
        try:
            with self.http.open(req,timeout=20) as response: return response.status,response.read()
        except urllib.error.HTTPError as error: return error.code,error.read()
        except (urllib.error.URLError,TimeoutError): raise Failure('local HTTP transport failed') from None

    @staticmethod
    def decoded(result):
        status,body=result
        try:return status,json.loads(body)
        except (ValueError,UnicodeError):raise Failure('invalid JSON response') from None

    @staticmethod
    def object_absent(result):
        status,body=result
        try: data=json.loads(body)
        except (ValueError,UnicodeError):return False
        if not isinstance(data,dict):return False
        # Known Storage contracts only. Authorization/transport errors are NOT absence.
        return ((status==404 and data.get('code')=='NoSuchKey') or
                (status==400 and str(data.get('statusCode'))=='404' and data.get('error')=='not_found' and data.get('message')=='Object not found'))

    def rpc(self, name, token, payload):
        require(name in ('reserve_feedback_image','reply_with_feedback_images'), 'unexpected RPC')
        return self.decoded(self.request('/rest/v1/rpc/'+name,token,payload,'POST'))

    def probe(self):
        self.check(self.sql('SELECT count(*) FROM auth.users;')=='0','fresh native Auth')
        self.check(self.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';")=='0','empty fixture schema')
        self.select_local_admin()
        proposal=PROPOSAL.read_bytes()
        require(hashlib.sha256(proposal).hexdigest()==PROPOSAL_SHA,'proposal source changed')
        fixture=Path(__file__).with_name('fixture.sql').read_bytes()
        self.report['proposal_sha256']=PROPOSAL_SHA
        self.report['fixture_sha256']=hashlib.sha256(fixture).hexdigest()
        self.report['boundary']='Synthetic role/feedback prerequisites only; not inherited or deployed policies'
        uid_before=self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);")
        self.sql('BEGIN;'+fixture.decode()+'COMMIT;')
        self.sql(proposal.decode());self.sql("NOTIFY pgrst,'reload schema';")
        actors=[]
        for n in range(3):
            email=f'media-{n}-{uuid.uuid4()}@example.invalid';password=secrets.token_urlsafe(32)
            status,body=self.decoded(self.request('/auth/v1/admin/users',self.fields['service'],{'email':email,'password':password,'email_confirm':True},'POST',service=True))
            require(status in (200,201),'local Auth create failed');user=str(uuid.UUID(body['id']))
            status,body=self.decoded(self.request('/auth/v1/token?grant_type=password',payload={'email':email,'password':password},method='POST'))
            require(status==200 and isinstance(body.get('access_token'),str),'local password grant failed')
            actors.append((user,body['access_token']))
        (alice,at),(bob,bt),(staff,st)=actors;issue=str(uuid.uuid4())
        self.sql(f"INSERT INTO user_roles VALUES('{staff}','fixture_staff'); INSERT INTO feedback_issues VALUES('{issue}','{alice}');")
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=')
        def reserve(token,aid,internal=False):
            return self.rpc('reserve_feedback_image',token,{'p_id':aid,'p_issue_id':issue,'p_internal':internal,'p_mime':'image/png','p_bytes':len(png)})
        aid=str(uuid.uuid4())
        for attempt in range(30):
            result=reserve(at,aid)
            if result[0]==200:break
            time.sleep(.2) # Schema readiness only, never a race assertion.
        self.check(result[0]==200,'owner reservation through real JWT')
        path=result[1];require(path==f'{alice}/{issue}/{aid}','unexpected reserved path')
        def obj(p,token,method='GET',raw=None):
            return self.request('/storage/v1/object/'+('authenticated/' if method=='GET' else '')+'feedback-images/'+p,token,method=method,raw=raw,mime='image/png')
        def denied(result):return result[0] in (400,401,403,404)
        # Verify actual table ACL denial, not only inaccessible schema or empty RLS response.
        for token,label in ((at,'player'),(st,'staff')):
            for table,payload in (('user_roles',{'user_id':alice,'role':'fixture_staff'}),('feedback_issues',{'id':str(uuid.uuid4()),'reporter_id':alice}),('feedback_messages',{'issue_id':issue,'author_id':alice,'author_role':'admin','body':'forged','is_internal':True})):
                status,body=self.decoded(self.request('/rest/v1/'+table,token,payload,'POST'))
                self.check(status==403 and body.get('code')=='42501',label+' direct '+table+' write denied')
            status,body=self.decoded(self.request('/rest/v1/feedback_image_delete_queue?select=id',token))
            self.check(status==403 and body.get('code')=='42501',label+' queue access denied')
        self.check(denied(reserve(bt,str(uuid.uuid4()))),'other owner reservation denied')
        self.check(denied(reserve(at,str(uuid.uuid4()),True)),'player internal reservation denied')
        self.check(obj(path,at,'POST',png)[0] in (200,201),'private bytes upload terminal')
        self.check(denied(obj(path,at)),'unattached bytes denied')
        self.check(denied(obj(path,at,'PUT',png)),'overwrite not accepted')
        mid=str(uuid.uuid4());payload={'p_message_id':mid,'p_issue_id':issue,'p_body':'synthetic image','p_internal':False,'p_image_ids':[aid]}
        with ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(lambda _:self.rpc('reply_with_feedback_images',at,payload),range(2)))
        self.check(replies==[(200,mid),(200,mid)],'parallel finalization same receipt')
        self.check(self.sql(f"SELECT count(*) FROM feedback_messages WHERE id='{mid}';")=='1','one persisted message')
        for token,label in ((at,'owner'),(st,'staff')):self.check(obj(path,token)==(200,png),label+' exact byte roundtrip')
        self.check(denied(obj(path,bt)),'other player bytes denied');self.check(denied(obj(path,None)),'anonymous bytes denied')
        self.check(self.sql(f"SELECT author_id='{alice}' AND author_role='player' FROM feedback_messages WHERE id='{mid}';")=='t','player attribution')
        self.check(denied(self.rpc('reply_with_feedback_images',at,dict(payload,p_body='changed'))),'changed replay rejected')
        sid=str(uuid.uuid4());internal=reserve(st,sid,True);self.check(internal[0]==200,'staff internal reservation')
        sp=internal[1];require(sp==f'{staff}/{issue}/{sid}','unexpected internal path')
        self.check(obj(sp,st,'POST',png)[0] in (200,201),'internal bytes upload terminal')
        smid=str(uuid.uuid4())
        self.check(self.rpc('reply_with_feedback_images',st,dict(payload,p_message_id=smid,p_internal=True,p_image_ids=[sid]))==(200,smid),'staff internal finalize')
        self.check(obj(sp,st)==(200,png) and denied(obj(sp,at)),'internal bytes staff only')
        self.sql(f"DELETE FROM feedback_messages WHERE author_id='{alice}'; DELETE FROM feedback_issues WHERE reporter_id='{alice}';")
        self.check(denied(obj(path,at)) and denied(obj(sp,st)),'retirement denies retained bytes')
        service=self.fields['service']
        status,rows=self.decoded(self.request('/rest/v1/feedback_image_delete_queue?select=id,object_path',service,service=True))
        self.check(status==200 and isinstance(rows,list) and len(rows)==2,'service REST queue positive read')
        expected={aid:path,sid:sp}
        self.check({row['id']:row['object_path'] for row in rows}==expected,'exact pending paths')
        # All PUTs are terminal. No late/inflight cleanup guarantee is asserted.
        for row in rows:
            rid=str(uuid.UUID(row['id']));p=row['object_path'];require(expected[rid]==p,'queue path mismatch')
            self.check(obj(p,service)==(200,png),'same service token positive byte read before removal')
            status,_=self.request('/storage/v1/object/feedback-images',service,{'prefixes':[p]},'DELETE',service=True)
            self.check(status==200,'Storage API removal successful')
            self.check(self.object_absent(obj(p,service)),'known Storage object absence after terminal PUT cleanup')
            self.check(self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='feedback-images' AND name='{p}';")=='0','object metadata absence corroborated')
            query=urllib.parse.urlencode({'id':'eq.'+rid,'object_path':'eq.'+p})
            status,deleted=self.decoded(self.request('/rest/v1/feedback_image_delete_queue?'+query,service,method='DELETE',service=True,representation=True))
            self.check(status==200 and isinstance(deleted,list) and len(deleted)==1 and deleted[0].get('id')==rid and deleted[0].get('object_path')==p,'service REST exact queue acknowledgement')
        status,rows=self.decoded(self.request('/rest/v1/feedback_image_delete_queue?select=id',service,service=True))
        self.check(status==200 and rows==[] and self.sql('SELECT count(*) FROM feedback_image_delete_queue;')=='0','queue empty via REST and SQL')
        self.check(self.sql("SELECT pg_get_functiondef('auth.uid()'::regprocedure);")==uid_before,'native auth.uid unchanged')
        self.report['not_proven']=['inflight late PUT race','deployed inherited policies','server image decoding','complete account deletion service','JS cleanup loop and scheduler','push delivery','native Android','legacy text lifecycle']
        self.report['result']='LOCAL STACK PASS; BOUNDED MEDIA CONTRACT ONLY; ACTIVATION BLOCKED'


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

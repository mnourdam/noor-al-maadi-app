"""Pure safety guards. These tests never invoke CLI, Docker, SQL or HTTP."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import harness

CONFIG = '''project_id = "generated"
[api]
port = 54321
schemas = ["public", "graphql_public"]
[db]
port = 54322
major_version = 17
shadow_port = 54320
[db.migrations]
enabled = true
[db.seed]
enabled = true
'''

class SafetyTests(unittest.TestCase):
    def test_exact_loopback_api(self):
        harness.endpoint("http://127.0.0.1:55421", "http", 55421)

    def test_api_rejects_redirect_or_remote_shapes(self):
        for value in ("https://127.0.0.1:55421", "http://localhost:55421", "http://127.0.0.1:54321",
                      "http://remote.invalid:55421", "http://127.0.0.1:55421/", "http://127.0.0.1:55421?host=remote",
                      "http://127.0.0.1:55421#fragment", "http://user:password@127.0.0.1:55421", "http://127.0.0.1:55421\n", None):
            with self.subTest(value=value), self.assertRaises(harness.Failure):
                harness.endpoint(value, "http", 55421)

    def test_database_rejects_libpq_host_override_and_wrong_identity(self):
        good = "postgresql://postgres:synthetic@127.0.0.1:55422/postgres"
        harness.endpoint(good, "postgresql", 55422, "/postgres", True)
        for value in (good + "?host=remote.invalid", good + "#fragment", good.replace("postgres@", "attacker@"),
                      good.replace("127.0.0.1", "127.1"), good.replace("/postgres", "/production"),
                      good.replace(":synthetic@", "@"), good.replace("postgres:synthetic", "admin:synthetic")):
            # First replacement may leave the URL unchanged; only test mutations.
            if value != good:
                with self.subTest(value=value), self.assertRaises(harness.Failure):
                    harness.endpoint(value, "postgresql", 55422, "/postgres", True)

    def test_generated_config_disables_implicit_sql(self):
        result = harness.configure(CONFIG, "irth-v18-ci-123-1")
        data = harness.tomllib.loads(result)
        self.assertEqual(data["api"]["port"], 55421)
        self.assertEqual(data["db"]["port"], 55422)
        self.assertFalse(data["db"]["seed"]["enabled"])
        self.assertFalse(data["db"]["migrations"]["enabled"])
        self.assertEqual(data["project_id"], "irth-v18-ci-123-1")

    def test_config_missing_sections_or_unsafe_project_fail(self):
        for text, project in ((CONFIG, "production"), (CONFIG.replace("[db.seed]", "[other]"), "irth-v18-ci-123-1")):
            with self.assertRaises(harness.Failure):
                harness.configure(text, project)

    def test_cli_status_explicit_layouts(self):
        self.assertEqual(harness.status_fields({"API_URL": "local", "DB_URL": "db", "ANON_KEY": "a", "SERVICE_ROLE_KEY": "s"}),
                         {"api": "local", "db": "db", "anon": "a", "service": "s"})
        self.assertEqual(harness.status_fields({"api": {"url": "local"}, "db": {"url": "db"}, "auth": {"anon_key": "a", "service_role_key": "s"}})["service"], "s")

    def test_status_malformed_or_ambiguous_fields_fail(self):
        for value in (None, [], {}, {"api": "bad"}, {"API_URL": "a", "api": {"url": "b"}}):
            with self.subTest(value=value), self.assertRaises(harness.Failure):
                harness.status_fields(value)

    def test_docker_remote_environment_is_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {"GITHUB_ACTIONS": "true", "RUNNER_TEMP": tmp, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
                   "DOCKER_HOST": "tcp://remote.invalid:2376", "DOCKER_CONTEXT": "remote", "DOCKER_TLS_VERIFY": "1",
                   "DOCKER_CERT_PATH": "/private", "DOCKER_CONFIG": "/private", "SUPABASE_ACCESS_TOKEN": "forbidden", "PGSERVICE": "remote"}
            with patch.dict(os.environ, env, clear=True):
                obj = harness.Harness()
            self.assertEqual(obj.env["DOCKER_HOST"], "unix:///var/run/docker.sock")
            for key in ("DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG", "SUPABASE_ACCESS_TOKEN", "PGSERVICE"):
                self.assertNotIn(key, obj.env)

    def test_no_stack_operations_outside_actions(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(harness.Failure):
            harness.Harness()

    def test_unverified_containers_block_sql_and_http(self):
        obj = object.__new__(harness.Harness)
        obj.endpoints_verified = False
        with self.assertRaises(harness.Failure):
            obj.sql("SELECT 1")
        with self.assertRaises(harness.Failure):
            obj.request("/rest/v1/test")

    def test_http_failures_are_not_permission_denials(self):
        obj = object.__new__(harness.Harness)
        self.assertTrue(obj.denied((403, {"code": "42501"})))
        for value in ((500, {"code": "42501"}), (404, {"code": "PGRST202"}), (401, {"code": "PGRST301"}), (403, None)):
            self.assertFalse(obj.denied(value))

    def test_redirects_rejected(self):
        with self.assertRaises(harness.Failure):
            harness.NoRedirect().redirect_request(None, None, 302, "", {}, "https://remote.invalid")

    def test_isolation_rejects_link_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            obj = object.__new__(harness.Harness)
            obj.work = Path(tmp)
            obj.project = "irth-v18-ci-123-1"
            (obj.work / "supabase/.temp").mkdir(parents=True)
            (obj.work / "supabase/config.toml").write_text(harness.configure(CONFIG, obj.project))
            (obj.work / "supabase/.temp/project-ref").write_text("forbidden")
            obj.fields = {"api": "http://127.0.0.1:55421", "db": "postgresql://postgres:synthetic@127.0.0.1:55422/postgres"}
            with self.assertRaises(harness.Failure):
                obj.isolation()

if __name__ == "__main__":
    unittest.main()

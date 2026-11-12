import unittest
from harness import connection_options, DB, PORT

class SafetyTests(unittest.TestCase):
    def env(self):
        return {"PGHOST": "127.0.0.1", "PGPORT": str(PORT), "PGDATABASE": DB,
                "PGUSER": "postgres", "PGPASSWORD": "synthetic-authority-job-only"}
    def test_exact_fixture(self):
        self.assertEqual(connection_options(self.env())["host"], "127.0.0.1")
    def test_alternate_endpoints_and_credentials_fail(self):
        for key, value in [("PGHOST","localhost"),("PGHOST","example.com"),("PGPORT","5432"),
                           ("PGDATABASE","postgres"),("PGDATABASE",DB+"?host=example.com"),
                           ("PGUSER","other"),("PGPASSWORD","other")]:
            with self.subTest(key=key,value=value):
                e=self.env();e[key]=value
                with self.assertRaises(ValueError):connection_options(e)
    def test_missing_configuration_fails(self):
        with self.assertRaises(ValueError):connection_options({})
    def test_libpq_overrides_fail(self):
        for key in ["PGSERVICE","PGSERVICEFILE","PGOPTIONS","PGHOSTADDR","PGPASSFILE"]:
            with self.subTest(key=key):
                e=self.env();e[key]="unexpected"
                with self.assertRaises(ValueError):connection_options(e)
if __name__ == '__main__': unittest.main()

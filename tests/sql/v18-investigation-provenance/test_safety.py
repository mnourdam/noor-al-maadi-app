import unittest
import tempfile
from pathlib import Path
from fixture import build,ROOT,SOURCES,START,assert_latest_definition
from harness import options

class Safety(unittest.TestCase):
    def test_source_extraction_is_exact(self):
        sql,evidence=build()
        source=(ROOT/'supabase/migrations'/SOURCES['completion'][0]).read_text()
        function=START+source.split(START)[1].split('\n-- 4. Legacy backfill:')[0]
        self.assertEqual(sql.count(function),1)
        self.assertEqual(sql.count('CREATE OR REPLACE FUNCTION public.complete_investigation_v2('),1)
        self.assertNotIn('CREATE OR REPLACE FUNCTION public.backfill_investigation_completions(',sql)
        self.assertIn('v18_investigation_fixture',sql)
        self.assertEqual(len(evidence['extracted_completion_sha256']),64)
    def test_any_source_drift_rejected(self):
        inputs={key:(ROOT/'supabase/migrations'/value[0]).read_bytes() for key,value in SOURCES.items()}
        for key in inputs:
            changed=dict(inputs);changed[key]+=b'\n'
            with self.assertRaises(ValueError):build(changed)
    def test_exact_loopback_only(self):
        env=dict(PGHOST='127.0.0.1',PGPORT='55434',PGDATABASE='v18_investigation_fixture',PGUSER='postgres',PGPASSWORD='synthetic-provenance-job-only')
        self.assertEqual(options(env)['dbname'],'v18_investigation_fixture')
        for key,value in [('PGHOST','example.com'),('PGDATABASE','postgres'),('PGPORT','5432'),('PGOPTIONS','-c search_path=evil'),('PGSERVICE','remote')]:
            changed=dict(env);changed[key]=value
            with self.assertRaises(ValueError):options(changed)
    def test_later_definition_requires_review(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'20990101000000_future.sql'
            for statement in ('CREATE OR REPLACE FUNCTION public.complete_investigation_v2(', 'DROP FUNCTION \"public\".\"complete_investigation_v2\"(', 'ALTER FUNCTION complete_investigation_v2('):
                path.write_text(statement)
                with self.assertRaisesRegex(ValueError,'renewed review'):
                    assert_latest_definition(Path(directory))
            path.write_text('SELECT 1;')
            assert_latest_definition(Path(directory))

    def test_empty_environment_rejected(self):
        with self.assertRaises(ValueError):options({})

if __name__=='__main__':unittest.main()

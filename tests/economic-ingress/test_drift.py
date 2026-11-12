import copy,json,tempfile,unittest
from pathlib import Path
from check_drift import ROOT,check,digest

class DriftTests(unittest.TestCase):
    def test_reviewed_repository_snapshot(self):
        m=json.loads(Path(__file__).with_name('manifest.json').read_text())
        self.assertEqual(check(ROOT,m),[])
        self.assertTrue(m['unparsed_or_unresolved'])
    def fixture(self,root):
        (root/'supabase/migrations').mkdir(parents=True);(root/'src').mkdir()
        sql=b'CREATE FUNCTION public.reward() RETURNS void AS $$ SELECT 1 $$ LANGUAGE sql;'
        path='supabase/migrations/1.sql';(root/path).write_bytes(sql)
        js='db.rpc("reward", {});';(root/'src/a.ts').write_text(js)
        return {'migration_pins':{path:digest(sql)},'function_candidates':[{'name':'public.reward','signature':'public.reward()','source':{'path':path,'start_byte':0,'byte_length':len(sql),'sha256':digest(sql)}}],'client_candidates':[{'path':'src/a.ts','sha256':digest(js.encode())}],'economic_table_watchlist':['profiles']}
    def test_source_add_remove_edit_and_statement_tamper(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);m=self.fixture(root);self.assertEqual(check(root,m),[])
            p=root/'supabase/migrations/2.sql';p.write_text('SELECT 2;');self.assertTrue(check(root,m));p.unlink()
            p=root/'supabase/migrations/1.sql';old=p.read_bytes();p.write_bytes(old+b' ');self.assertTrue(check(root,m));p.unlink();self.assertTrue(check(root,m));p.write_bytes(old)
            changed=copy.deepcopy(m);changed['function_candidates'][0]['source']['start_byte']=1
            self.assertTrue(check(root,changed))
    def test_client_add_remove_edit_and_new_direct_table(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);m=self.fixture(root)
            p=root/'src/b.ts';p.write_text('db.from("profiles").update({xp:1})');self.assertTrue(check(root,m));p.unlink()
            p=root/'src/a.ts';old=p.read_text();p.write_text(old+'\n');self.assertTrue(check(root,m));p.unlink();self.assertTrue(check(root,m))
    def test_new_literal_ingress_with_whitespace_or_newline_is_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);m=self.fixture(root)
            p=root/'src/new.ts'
            for text in ('db.rpc ("reward", {});', 'db.rpc\n (\n"reward", {});', 'db.from ("profiles").update({xp:1});', 'db.from\n (\n"profiles").update({xp:1});'):
                p.write_text(text)
                self.assertTrue(check(root,m),text)

    def test_unchanged_pin_does_not_assert_catalog_or_dynamic_coverage(self):
        m=json.loads(Path(__file__).with_name('manifest.json').read_text())
        self.assertIn('dynamic SQL and unresolved calls',m['unknowns'])
        self.assertIn('deployed catalog and migration application order',m['unknowns'])
        self.assertTrue(all('UNVERIFIED' in f['effective_privileges'] for f in m['function_candidates']))

if __name__=='__main__':unittest.main()

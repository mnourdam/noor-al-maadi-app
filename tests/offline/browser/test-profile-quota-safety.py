import importlib.util, pathlib, tempfile, unittest
p=pathlib.Path(__file__).with_name('profile-quota-browser.py')
s=importlib.util.spec_from_file_location('quota_browser',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Safety(unittest.TestCase):
 def test_exact_origin(self):
  origin='http://127.0.0.1:1234';paths={'/','/fixture.js'}
  self.assertTrue(m.admitted(origin+'/fixture.js',origin,paths))
  self.assertFalse(m.admitted(origin+'/fixture.js',origin,paths,True))
  for url in ['https://127.0.0.1:1234/','http://127.0.0.1:1235/','http://localhost:1234/','http://user@127.0.0.1:1234/','http://127.0.0.1:1234/?x=1','http://127.0.0.1:1234/#x','http://127.0.0.1:1234/unknown','http://evil.test/','http://127.0.0.1:1234/%66ixture.js']:
   self.assertFalse(m.admitted(url,origin,paths),url)
 def test_asset_symlink(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'bad').symlink_to('/tmp')
   with self.assertRaises(ValueError):m.asset_paths(root)
 def test_cleanup_attempts_all(self):
  calls=[]
  def bad():calls.append('bad');raise RuntimeError('synthetic')
  def good():calls.append('good')
  with self.assertRaises(RuntimeError):m.cleanup_all([bad,good],False)
  self.assertEqual(calls,['bad','good'])
  calls.clear();m.cleanup_all([bad,good],True);self.assertEqual(calls,['bad','good'])
 def test_close_preserves_primary(self):
  import asyncio
  class Context:
   async def close(self):raise RuntimeError('cleanup')
  asyncio.run(m.close_context(Context(),True))
  with self.assertRaises(RuntimeError):asyncio.run(m.close_context(Context(),False))
if __name__=='__main__':unittest.main()

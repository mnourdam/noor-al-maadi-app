import importlib.util,unittest,tempfile,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('runtime',Path(__file__).with_name('content-runtime-native.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StaticBoot(unittest.TestCase):
 def test_exact_inventory_and_negative_files(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'assets').mkdir()
   rows=[]
   for name in ['index.html','fixture.js','assets/real-hash.js']:
    (root/name).write_bytes(b'fixed');rows.append({'file':name,'sha256':hashlib.sha256(b'fixed').hexdigest()})
   def save(value):(root/'static-boot.json').write_text(json.dumps(value))
   save(rows);self.assertEqual(set(m.static_boot_inventory(root)),{'/offline-reopen.html','/fixture.js','/assets/real-hash.js'})
   for name in ['../secret','offline-snapshot.json','assets/data.json','assets/sub/a.js']:
    save(rows+[{'file':name,'sha256':'0'*64}])
    with self.assertRaises(ValueError):m.static_boot_inventory(root)
   save(rows+rows[:1])
   with self.assertRaises(ValueError):m.static_boot_inventory(root)
   save(rows);(root/'fixture.js').write_bytes(b'changed')
   with self.assertRaises(ValueError):m.static_boot_inventory(root)
class FailedLaunch(unittest.IsolatedAsyncioTestCase):
 async def test_failure_closes_owned_context_preserves_primary(self):
  from unittest.mock import AsyncMock,Mock
  for phase in ['set_offline','goto','wait_for_function']:
   for close_fails in [False,True]:
    primary=RuntimeError('primary')
    page=Mock();page.goto=AsyncMock();page.wait_for_function=AsyncMock()
    context=Mock();context.set_offline=AsyncMock();context.route=AsyncMock();context.route_web_socket=AsyncMock();context.new_page=AsyncMock(return_value=page);context.close=AsyncMock(side_effect=RuntimeError('cleanup') if close_fails else None)
    getattr(context if phase=='set_offline' else page,phase).side_effect=primary
    with self.assertRaises(RuntimeError) as result:
     await m.finish_launch(context,'http://127.0.0.1:1',True,None,None,[])
    self.assertIs(result.exception,primary);context.close.assert_awaited_once()
    self.assertEqual(getattr(primary,"__notes__",[]),["owned browser context cleanup incomplete"] if close_fails else [])
if __name__=='__main__':unittest.main()

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

class OfflineOrdering(unittest.IsolatedAsyncioTestCase):
 async def test_offline_reapplied_after_page_before_navigation(self):
  from unittest.mock import AsyncMock,Mock
  events=[]
  page=Mock()
  page.goto=AsyncMock(side_effect=lambda *_:events.append('goto'))
  page.wait_for_function=AsyncMock(side_effect=lambda *_:events.append('ready'))
  context=Mock()
  context.set_offline=AsyncMock(side_effect=lambda value:events.append(('offline',value)))
  context.route=AsyncMock(side_effect=lambda *_:events.append('route'))
  context.route_web_socket=AsyncMock(side_effect=lambda *_:events.append('sockets'))
  async def new_page():events.append('page');return page
  context.new_page=AsyncMock(side_effect=new_page)
  context.close=AsyncMock()
  result=await m.finish_launch(context,'http://127.0.0.1:1',True,None,None,[])
  self.assertEqual(events,[('offline',True),'route','sockets','page',('offline',True),'goto','ready'])
  self.assertEqual(result,(context,page))
  context.close.assert_not_called()
 async def test_online_launch_does_not_toggle_emulation(self):
  from unittest.mock import AsyncMock,Mock
  page=Mock();page.goto=AsyncMock();page.wait_for_function=AsyncMock()
  context=Mock();context.set_offline=AsyncMock();context.route=AsyncMock();context.route_web_socket=AsyncMock();context.new_page=AsyncMock(return_value=page);context.close=AsyncMock()
  await m.finish_launch(context,'http://127.0.0.1:1',False,None,None,[])
  context.set_offline.assert_not_called()
  page.goto.assert_awaited_once_with('http://127.0.0.1:1')
if __name__=='__main__':unittest.main()


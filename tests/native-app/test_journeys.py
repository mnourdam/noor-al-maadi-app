import ast,importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('journeys',Path(__file__).with_name('journeys.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class JourneyControls(unittest.TestCase):
 def test_exact_six_groups(self):
  self.assertEqual(set(m.GROUPS),{'chapter_images_encyclopedia','museum_profile','content_update_recovery','private_feedback','chapter_reread','english_controls'})
 def test_native_tap_not_dom_navigation(self):
  class Page:
   def evaluate(self,_):return [100,200]
  class Device:
   def __init__(self):self.calls=[]
   def adb(self,*args):self.calls.append(args)
  d=Device();m.tap(d,Page(),'a[href="/profile"]');self.assertEqual(d.calls,[('shell','input','tap','100','200')])
 def test_missing_prerequisites_do_not_return_success(self):
  text=Path(m.__file__).read_text();ast.parse(text)
  for reason in ('missing_update_fixture','missing_authenticated_service_fixture','missing_completed_chapter_fixture','missing_owned_artifact_fixture'):self.assertIn(reason,text)
  self.assertNotIn('history.pushState',text);self.assertNotIn('location.href=',text)
  self.assertIn('device.force_stop()',text);self.assertIn('device.home()',text)
if __name__=='__main__':unittest.main()

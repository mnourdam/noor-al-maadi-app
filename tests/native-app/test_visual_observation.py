import importlib.util,sys,unittest,struct,tempfile
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import visual_observation as v
class VisualTests(unittest.TestCase):
 def png(self,w=320,h=640):return b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+b'IHDR'+struct.pack('>II',w,h)+b'\0'*9
 def xml(self,**kw):
  attrs={'package':v.r.PACKAGE,'bounds':'[0,24][320,600]','text':'اللعب كضيف',**kw}
  return ('<hierarchy rotation="0"><node '+' '.join(f'{k}="{x}"' for k,x in attrs.items())+'/></hierarchy>').encode()
 def test_known_label(self):
  self.assertEqual(v.png_dimensions(self.png()),(320,640));s=v.hierarchy(self.xml(),(320,640));self.assertEqual(s['known_labels']['guest'],1);self.assertNotIn('text',s)
 def test_bounds_and_rotation(self):
  for xml in [self.xml(bounds='[0,0][321,640]'),self.xml().replace(b'rotation="0"',b'rotation="1"'),b'<!DOCTYPE hierarchy>'+self.xml()]:
   with self.assertRaises(ValueError):v.hierarchy(xml,(320,640))
 def test_unknown_system_flag(self):
  self.assertTrue(v.hierarchy(self.xml(package='com.android.permissioncontroller'),(320,640))['foreign_or_unclassified_system_nodes'])
 def test_png_rejects(self):
  for raw in [b'error',self.png(640,320),self.png(99999,99999)]:
   with self.assertRaises(ValueError):v.png_dimensions(raw)
 def test_no_cdp_or_taps(self):
  source=Path(v.__file__).read_text();self.assertNotIn('r.Page(',source);self.assertNotIn("'input'",source);self.assertIn('return 1',source)
class ObserveTests(unittest.TestCase):
 png=VisualTests.png
 xml=VisualTests.xml
 def run_observation(self,xml_state='complete',xml=None,foreground='exact_component_observed'):
  good=lambda raw:{'state':'complete','returncode':0,'raw':raw}
  rows=[good(b'activity'),good(self.png()),good(b'activity'),{'state':xml_state,'returncode':0,'raw':b'dumped'},good(self.xml() if xml is None else xml)]
  with tempfile.TemporaryDirectory() as temp:
   target=Path(temp)/'screen.png';device=SimpleNamespace(sdk=Path('/sdk'),serial='emulator-5580')
   with patch.object(v.probes,'capture',side_effect=rows),patch.object(v.reconciliation,'activity',side_effect=['exact_component_observed',foreground]):
    try:result=v.observe(device,target)
    except Exception:return None,target.exists()
   return result,target.exists()
 def test_positive_observation(self):
  result,exists=self.run_observation();self.assertTrue(exists);self.assertEqual(result['hierarchy_status'],'observed');self.assertEqual(result['coordinate_actions'],0)
 def test_xml_failures_keep_screen(self):
  for state,xml in [('timeout',None),('complete',b'bad xml')]:
   result,exists=self.run_observation(state,xml);self.assertTrue(exists);self.assertEqual(result['hierarchy_status'],'unavailable')
 def test_foreground_changed_withholds(self):
  result,exists=self.run_observation(foreground='other_component_observed');self.assertIsNone(result);self.assertFalse(exists)
 def test_cleanup_uncertainty_explicit(self):
  result,exists=self.run_observation('reap_failed');self.assertTrue(exists);self.assertTrue(result['probe_cleanup_failed']);self.assertEqual(result['hierarchy_status'],'unavailable')
 def test_workflow_scope(self):
  s=(Path(__file__).parents[2]/'.github/workflows/v18-android-full-app.yml').read_text()
  self.assertIn('tests/native-app/visual_observation.py --apk',s);self.assertNotIn('tests/native-app/runner.py --exploratory',s)
  self.assertIn('path: ${{ runner.temp }}/irth-visual-evidence/',s);self.assertIn('retention-days: 1',s)
  self.assertIn('tests/native-app/transfer.py verify',s)
if __name__=='__main__':unittest.main()


import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('evidence',HERE/'evidence.py');e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
s=importlib.util.spec_from_file_location('producer',HERE.parent/'native-app/build-full-app.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def rows():
 return [{'kind':'config','minify':True,'shrink':True,'debuggable':False,'optimizedResourceFlag':'unspecified'}]+[{'kind':'task','name':name,'executed':True,'didWork':True,'skipped':False,'upToDate':False,'noSource':False,'skipMessage':None,'failed':False} for name in ['minifyReleaseWithR8','shrinkReleaseRes']]
def manifest(flag):
 return '''E: manifest
  E: application
'''+('    A: android:debuggable(0x0101000f)='+flag+'\n' if flag is not None else '')+'''    E: activity
      A: android:name="app.lovable.irth.MainActivity"
      E: intent-filter
        E: data
          A: android:scheme="app.lovable.irth.acceptance"
    E: provider
      A: android:authorities="app.lovable.irth.acceptance.fileprovider"
'''+''.join('    E: meta-data\n      A: android:name="'+name+'"\n      A: android:value=(type 0x12)0x0\n' for name in ('firebase_messaging_auto_init_enabled','firebase_analytics_collection_enabled','firebase_data_collection_default_enabled'))
class EvidenceTests(unittest.TestCase):
 def test_modes_default_unchanged_and_closed(self):
  self.assertEqual(p.build_env(Path('/tmp/home'),'a'*40)['ANDROID_BUILD_TYPE'],'debug')
  self.assertEqual(p.build_env(Path('/tmp/home'),'a'*40,'release_config')['ANDROID_BUILD_TYPE'],'release')
  for mode in ['release','optimized_release','',None]:
   with self.subTest(mode=mode),self.assertRaises(ValueError):p.variant_for(mode)
 def test_manifest_debug_and_release(self):
  p.verify_manifest(manifest('(type 0x12)0xffffffff'))
  for flag in [None,'(type 0x12)0x0']:p.verify_manifest(manifest(flag),'release_config')
  for flag in ['(type 0x12)0xffffffff','false','(type 0x10)0x0','(type 0x12)garbage']:
   with self.subTest(flag=flag),self.assertRaises(ValueError):p.verify_manifest(manifest(flag),'release_config')
  with self.assertRaises(ValueError):p.verify_manifest(manifest(None))
 def test_release_retains_identity_gates(self):
  for old,new in [('app.lovable.irth.MainActivity','other.MainActivity'),('app.lovable.irth.acceptance.fileprovider','other.fileprovider'),('firebase_messaging_auto_init_enabled','removed')]:
   with self.subTest(old=old),self.assertRaises(ValueError):p.verify_manifest(manifest(None).replace(old,new),'release_config')
 def test_actual_work_required(self):
  self.assertEqual(e.validate_events(rows())['tasks']['minifyReleaseWithR8'],'EXECUTED_WORK')
  for field,value in [('executed',False),('didWork',False),('skipped',True),('upToDate',True),('noSource',True),('failed',True),('skipMessage','FROM-CACHE')]:
   r=rows();r[1][field]=value
   with self.subTest(field=field),self.assertRaises(ValueError):e.validate_events(r)
  for r in [rows()[:-1],rows()+[rows()[1]],rows()[1:],rows()+[{'kind':'unknown'}]]:
   with self.assertRaises(ValueError):e.validate_events(r)
 def test_effective_config_flags(self):
  for field in ['minify','shrink']:
   r=rows();r[0][field]=False
   with self.assertRaises(ValueError):e.validate_events(r)
  r=rows();r[0]['optimizedResourceFlag']='secret-or-unsupported'
  with self.assertRaises(ValueError):e.validate_events(r)
 def fixture(self,root):
  (root/'release-task-events.jsonl').write_text('\n'.join(json.dumps(r) for r in rows()))
  report=root/'android/app/build/outputs/mapping/release';report.mkdir(parents=True)
  for name in e.REPORTS:(report/name).write_text('-dontoptimize\n' if name=='configuration.txt' else 'synthetic-report')
  return report
 def test_reports_and_dontoptimize(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.fixture(root);r=e.collect(root)
   self.assertTrue(r['effective_dontoptimize']);self.assertFalse(r['full_code_optimization_proven']);self.assertEqual(len(r['reports']),3)
   self.assertNotIn('synthetic-report',json.dumps(r))
 def test_missing_empty_symlink_reports(self):
  for mode in ['missing','empty','symlink']:
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as d:
    root=Path(d);report=self.fixture(root);f=report/'mapping.txt';f.unlink()
    if mode=='empty':f.touch()
    if mode=='symlink':f.symlink_to(report/'resources.txt')
    with self.assertRaises(ValueError):e.collect(root)
 def test_stale_preexisting_reports_or_events_fail(self):
  for name in ['android/app/build/outputs/mapping/release','release-task-events.jsonl','release-evidence.gradle']:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.touch()
    with self.assertRaises(ValueError):e.prepare(root)
 def test_workflow_build_only_and_old_native_manual(self):
  root=HERE.parents[1];text=(root/'.github/workflows/v18-release-config-smoke.yml').read_text()
  self.assertEqual(text.split('on:\n',1)[1].split('permissions:',1)[0],
   "  push:\n    branches: [v18-01a-outbox-recovery]\n    paths:\n      - '.github/workflows/v18-release-config-smoke.yml'\n  workflow_dispatch:\n")
  self.assertEqual([l for l in text.splitlines() if l.strip().startswith('if: github.ref')],
   ["    if: github.ref == 'refs/heads/v18-01a-outbox-recovery' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')"])
  self.assertEqual(text.count('python tests/release-config/build.py'),1)
  self.assertIn('contents: read',text);self.assertIn('persist-credentials: false',text);self.assertIn("github.event_name == 'workflow_dispatch'",text)
  self.assertEqual(text.count('uses: actions/upload-artifact@'),1);self.assertIn('path: ${{ runner.temp }}/release-config-result.json',text)
  for x in ['adb ','emulator','avdmanager','chmod ','needs:','assembleDebug','--licenses']:self.assertNotIn(x,text)
  old=(root/'.github/workflows/v18-android-full-app.yml').read_text();conditions=[l for l in old.splitlines() if l.strip().startswith('if: github.ref')]
  self.assertEqual(len(conditions),2);self.assertTrue(all("github.event_name == 'workflow_dispatch'" in line for line in conditions))
  packaging=(root/'.github/workflows/v18-apk-image-packaging.yml').read_text()
  guards=[l for l in packaging.splitlines() if l.strip().startswith('if: github.ref')]
  self.assertEqual(guards,["    if: github.ref == 'refs/heads/v18-01a-outbox-recovery' && github.event_name == 'workflow_dispatch'"])
  # All three legacy build/device jobs now require a dispatch, so a push cannot execute them.
  for event in ['push','pull_request']:
   self.assertFalse(event=='workflow_dispatch')
if __name__=='__main__':unittest.main()

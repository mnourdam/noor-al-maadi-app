"""Pure evaluator/DOM-shape controls; no browser, ADB, network or device imports."""
import importlib.util,json,subprocess,unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('home_runner',Path(__file__).with_name('runner.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

JS="""
const fs=require('fs');const {expression,state}=JSON.parse(fs.readFileSync(0,'utf8'));
const calls=[];let observerCalls=0;
const node=on=>({getClientRects:()=>on?[{}]:[]});
const cinematic=node(state.cinematic),auth=node(state.auth),other=node(state.other);
const document={querySelector(s){
 calls.push('dom');
 if(s==='[data-irth-cinematic-opening][role=dialog]')return state.cinematic?cinematic:null;
 if(s==='[data-irth-first-launch][role=dialog]')return state.auth?auth:null;
 if(s==='#irth-boot-splash,.splash-root')return state.splash?node(true):null;
 if(s.includes("href='/profile'"))return node(state.profile);
 if(s.includes("home-stat-investigations"))return node(state.investigations);
 throw Error('unexpected selector');
},querySelectorAll(s){if(s!=='[role=dialog]')throw Error('unexpected selector');return [cinematic,auth,other];}};
const location={pathname:state.root?'/':'/other'};
const window=state.observer?{__IRTH_NATIVE_OBSERVATIONS__:()=>{calls.push('observer');observerCalls++;return {unexpected:state.unexpected,nativeBlocked:state.nativeBlocked,bridgeGuardsIntact:state.guards}}}:{};
const value=eval(expression);process.stdout.write(JSON.stringify({value,observerCalls,calls}));
"""
def state(**kw):return dict(root=True,profile=True,investigations=True,splash=False,cinematic=False,auth=False,other=False,observer=True,unexpected=0,nativeBlocked=0,guards=True,**kw)
def observation_receipt(**kw):
 s=state();s.update(kw)
 p=subprocess.run(['node','-e',JS],input=json.dumps({'expression':r.HOME_OBSERVATION,'state':s}),text=True,capture_output=True,timeout=5,check=True)
 return json.loads(p.stdout)
def observed(**kw):return r.validate_home_observation(observation_receipt(**kw)['value'])

class Tests(unittest.TestCase):
 def test_actual_js_first_launch_and_unknown_dialogs(self):
  for args,key in [({'cinematic':True},'cinematic_visible'),({'auth':True},'auth_choice_visible'),({'other':True},'other_dialog_visible')]:
   out=observed(**args);self.assertTrue(out[key]);self.assertFalse(out['ready']);self.assertFalse(out['home_ready']);self.assertTrue(out['visible_dialog'])
   self.assertEqual(set(out),r.HOME_OBSERVATION_KEYS);self.assertTrue(all(type(v)is bool for v in out.values()))
  self.assertTrue(observed()['ready'])
 def test_each_original_guard_remains_required(self):
  for change in [{'root':False},{'profile':False},{'investigations':False},{'splash':True},{'observer':False},{'unexpected':1},{'nativeBlocked':1},{'guards':False}]:
   with self.subTest(change=change):self.assertFalse(observed(**change)['ready'])
  self.assertEqual(r.HOME_OBSERVATION.count(r.HOME_READY),1)
 def test_original_guard_call_order_and_short_circuit_count(self):
  for change,count in [({},3),({'unexpected':1},1),({'nativeBlocked':1},2),({'guards':False},3),({'observer':False},0)]:
   out=observation_receipt(**change);self.assertEqual(out['observerCalls'],count)
   self.assertEqual(out['calls'][:count],['observer']*count)
   self.assertNotIn('observer',out['calls'][count:])
   if count<3:self.assertFalse(out['value']['bridge_guards_observed'])
 def page(self,values):
  p=r.Page.__new__(r.Page);p.evaluate=Mock(side_effect=values);return p
 def test_false_original_gate_never_promoted_by_diagnostics(self):
  out=observed();out['ready']=False
  p=self.page([2,True,True,out])
  with patch.object(r.time,'monotonic',side_effect=[0,0,31]),patch.object(r.time,'sleep'):
   with self.assertRaisesRegex(r.Failure,'full_app_readiness'):p.readiness()
  self.assertFalse(p.readiness_checks['home']);self.assertEqual(p.evaluate.call_count,4);self.assertEqual(r.home_diagnostics(p)['sample'],out)
 def test_malformed_rejected_no_raw_payload_retained(self):
  good=observed()
  for bad in [None,True,{**good,'secret':'raw'},dict(list(good.items())[1:]),{**good,'ready':1},{**good,'visible_dialog':True}]:
   p=self.page([2,True,True,bad])
   with self.assertRaises(r.Failure):p.readiness()
   self.assertEqual(r.home_diagnostics(p),{'status':'unavailable'});self.assertFalse(p.readiness_checks['home']);self.assertNotIn('raw',json.dumps(r.home_diagnostics(p)))
 def test_transport_error_preserved_with_last_validated_not_current_claim(self):
  out=observed(auth=True);error=RuntimeError('private transport details');p=self.page([2,True,True,out,error])
  with patch.object(r.time,'monotonic',return_value=0),patch.object(r.time,'sleep'):
   with self.assertRaises(RuntimeError) as caught:p.readiness()
  self.assertIs(caught.exception,error);self.assertEqual(r.home_diagnostics(p),{'status':'last_validated','sample':out});self.assertEqual(p.evaluate.call_count,5)
 def test_malformed_after_valid_clears_old_sample(self):
  p=self.page([2,True,True,observed(auth=True),{'private':'raw'}])
  with patch.object(r.time,'monotonic',return_value=0),patch.object(r.time,'sleep'):
   with self.assertRaises(r.Failure):p.readiness()
  self.assertEqual(r.home_diagnostics(p),{'status':'unavailable'})
 def test_linux_report_propagates_without_extra_evaluation(self):
  s=(Path(__file__).parents[1]/'linux-android-once/experiment.py').read_text()
  self.assertIn("report['home_observation'] = r.home_diagnostics(page)",s)
if __name__=='__main__':unittest.main()

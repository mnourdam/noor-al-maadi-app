"""One CI-only debug APK build; no install, device, release or APK artifact."""
import argparse,hashlib,importlib.util,json,os,re,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def require(ok):
 if not ok:raise ValueError('packaging_receipt_validation')
def digest(b):return hashlib.sha256(b).hexdigest()
def verify_bytes(apk,assets,records,producer):
 require(len(records)==3)
 with zipfile.ZipFile(apk) as z:
  names=z.namelist();require(len(names)==len(set(names)))
  for r in records:
   relative='campaign-key-art/'+r['path'];name='assets/public/'+relative
   require(names.count(name)==1)
   file=assets/relative;require(file.is_file() and not file.is_symlink())
   b=file.read_bytes();require(len(b)==r['bytes'] and digest(b)==r['sha256'])
   packed=z.read(name);require(packed==b)
   require(producer['assets_sha256'].get(name)==r['sha256'])
 require(producer['apk_sha256']==digest(apk.read_bytes()))
def main(destination,result):
 state={'result':'FAIL','stage':'preflight','scope':'DEBUG_APK_IMAGE_BYTES_ONLY','release_ready':False,'device_executed':False,'r8_tested':False}
 code=1
 try:
  require(os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_REF')=='refs/heads/v18-01a-outbox-recovery')
  sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
  require(re.fullmatch('[0-9a-f]{40}',sha) and sha==os.environ.get('GITHUB_SHA'));state['source_sha']=sha
  runner=Path(os.environ['RUNNER_TEMP']).resolve()
  require(destination.is_absolute() and destination.parent==runner and not destination.exists() and not destination.is_symlink())
  state['stage']='source_images'
  decoded=subprocess.run(['node','tests/apk-images/verify-source.mjs'],cwd=ROOT,capture_output=True,text=True,timeout=60,check=True)
  records=json.loads(decoded.stdout)
  spec=importlib.util.spec_from_file_location('producer',ROOT/'tests/native-app/build-full-app.py');producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
  state['stage']='isolated_debug_producer'
  receipt=producer.build(destination)
  require(receipt['source_sha']==sha and producer.STATE['result']=='BUILT_NOT_ACCEPTED')
  state['stage']='three_images_apk_comparison'
  apk=destination/'android/app/build/outputs/apk/debug/app-debug.apk'
  verify_bytes(apk,destination/'android/app/src/main/assets/public',records,receipt)
  state.update(result='PASS_PACKAGED_BYTES_ONLY',stage='complete',apk_sha256=receipt['apk_sha256'],signer_sha256=receipt['signer_sha256'],producer_stage=producer.STATE['stage'],image_count=3,total_image_bytes=sum(r['bytes'] for r in records),images=records,source_pixel_decode='1600x900 RGB each; identical APK bytes',all_packaged_assets_verified=True)
  code=0
 except Exception:
  if 'producer' in locals():
   # Fixed producer-controlled stage only, no exception/command/output disclosure.
   stage=producer.STATE.get('stage','unknown')
   state['producer_stage']=stage if re.fullmatch('[a-z_]{1,64}',stage) else 'unknown'
 finally:
  result.write_text(json.dumps(state,sort_keys=True)+'\n');print(json.dumps(state,sort_keys=True))
 return code
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('destination',type=Path);p.add_argument('--result',required=True,type=Path);a=p.parse_args();raise SystemExit(main(a.destination,a.result))

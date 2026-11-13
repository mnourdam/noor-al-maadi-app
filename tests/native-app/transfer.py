"""Exact two-file same-run transfer checks; no builder execution or credentials."""
import argparse,hashlib,importlib.util,json,os,re,shutil
from pathlib import Path
NAMES={'acceptance.apk','apk-receipt.json'}
def require(value):
 if not value:raise ValueError('transfer_validation')
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def regular(path,limit):
 require(path.is_absolute() and path.resolve()==path and not path.is_symlink() and path.is_file() and 0<path.stat().st_size<=limit)
def directory(root):require(root.is_absolute() and root.resolve()==root and not root.is_symlink() and root.is_dir())
def receipt_check(root,source):
 require(re.fullmatch('[0-9a-f]{40}',source) is not None)
 regular(root/'acceptance.apk',1024**3);regular(root/'apk-receipt.json',8*1024**2)
 data=json.loads((root/'apk-receipt.json').read_text())
 require(data.get('source_sha')==source and data.get('application_id')=='app.lovable.irth.acceptance')
 require(re.fullmatch('[0-9a-f]{64}',data.get('signer_sha256','')) is not None)
 require(data.get('apk_sha256')==digest(root/'acceptance.apk'))
 return {'apk_sha256':data['apk_sha256'],'receipt_sha256':digest(root/'apk-receipt.json'),'source_sha':source}
def stage(apk,receipt,root,source):
 require(not root.exists() and not root.is_symlink());regular(apk,1024**3);regular(receipt,8*1024**2)
 root.mkdir(mode=0o700);directory(root)
 shutil.copyfile(apk,root/'acceptance.apk');shutil.copyfile(receipt,root/'apk-receipt.json')
 return receipt_check(root,source)
def verify(root,source,apk_hash,receipt_hash):
 directory(root);require({p.name for p in root.iterdir()}==NAMES)
 for value in (apk_hash,receipt_hash):require(re.fullmatch('[0-9a-f]{64}',value) is not None)
 regular(root/'acceptance.apk',1024**3);regular(root/'apk-receipt.json',8*1024**2)
 require(digest(root/'acceptance.apk')==apk_hash and digest(root/'apk-receipt.json')==receipt_hash)
 return receipt_check(root,source)
def manifest(root,sdk):
 # Importing the producer only defines helpers; never invoke prepare/build/main.
 spec=importlib.util.spec_from_file_location('producer',Path(__file__).with_name('build-full-app.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 import subprocess
 text=subprocess.run([str(sdk/'build-tools/35.0.0/aapt'),'dump','xmltree',str(root/'acceptance.apk'),'AndroidManifest.xml'],capture_output=True,text=True,timeout=30,check=True).stdout
 module.verify_manifest(text)
def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['stage','verify']);p.add_argument('--root',type=Path,required=True);p.add_argument('--apk',type=Path);p.add_argument('--receipt',type=Path);a=p.parse_args()
 try:
  source=os.environ['GITHUB_SHA']
  if a.mode=='stage':
   output=stage(a.apk,a.receipt,a.root,source)
   with open(os.environ['GITHUB_OUTPUT'],'a') as f:
    for key,value in output.items():f.write(key+'='+value+'\n')
  else:
   verify(a.root,source,os.environ['EXPECTED_APK_SHA256'],os.environ['EXPECTED_RECEIPT_SHA256'])
   manifest(a.root,Path(os.environ['ANDROID_HOME']))
  return 0
 except Exception:print('transfer_validation_failed');return 1
if __name__=='__main__':raise SystemExit(main())

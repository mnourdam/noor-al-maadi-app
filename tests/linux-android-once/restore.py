"""Independent always-step cleanup; attempt exact ACL restoration despite process errors."""
import json, os, stat, subprocess
from pathlib import Path
import owned_process
from kvm_acl import KvmAccess

def restore():
    result={'owned_process_cleanup':False,'adb_cleanup':False,'acl_restored':False}
    try:owned_process.cleanup();result['owned_process_cleanup']=True
    except Exception:pass
    env={**os.environ,'ANDROID_ADB_SERVER_PORT':'5038','ADB_SERVER_SOCKET':'tcp:127.0.0.1:5038'}
    try:
        marker=Path(os.environ['RUNNER_TEMP'])/'irth-linux-adb-owned'
        if marker.exists():
            info=marker.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('adb_owner')
            subprocess.run([str(Path(os.environ['ANDROID_HOME'])/'platform-tools/adb'),'kill-server'],env=env,timeout=5,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        result['adb_cleanup']=True
    except Exception:pass
    try:
        state=KvmAccess().restore()['restoration']
        result['acl_restoration']=state
        result['acl_restored']=state=='verified_exact_acl_identity_mode'
        result['acl_cleanup_complete']=state in ('not_needed','verified_exact_acl_identity_mode')
    except Exception:pass
    out=Path(os.environ['RUNNER_TEMP'])/'irth-linux-evidence'
    out.mkdir(mode=0o700,exist_ok=True)
    (out/'restoration.json').write_text(json.dumps(result,sort_keys=True)+'\n')
    return 0 if result['owned_process_cleanup'] and result['adb_cleanup'] and result.get('acl_cleanup_complete',False) else 1
if __name__=='__main__':raise SystemExit(restore())

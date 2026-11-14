"""Private identity receipt for one session-leading emulator; no PID discovery."""
import json, os, signal, stat, time
from pathlib import Path

def path(): return Path(os.environ['RUNNER_TEMP'])/'irth-linux-emulator-owner.json'
def identity(pid):
    raw=Path(f'/proc/{pid}/stat').read_text()
    fields=raw[raw.rfind(')')+2:].split()
    return {'pid':pid,'start':fields[19],'group':int(fields[2]),'session':int(fields[3]),'uid':Path(f'/proc/{pid}').stat().st_uid}
def record(pid):
    row=identity(pid)
    if row['group']!=pid or row['session']!=pid or row['uid']!=os.getuid(): raise ValueError('owned_identity')
    fd=os.open(path(),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as out:json.dump(row,out)
def load():
    p=path()
    if not p.exists(): return None
    info=p.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('owned_record')
    row=json.loads(p.read_text())
    if set(row)!={'pid','start','group','session','uid'} or type(row['pid']) is not int or row['pid']<=1 or row['uid']!=os.getuid() or row['group']!=row['pid'] or row['session']!=row['pid'] or not isinstance(row['start'],str) or not row['start'].isdigit():raise ValueError('owned_schema')
    return row

def signal_owned(pid,sig):
    row=load()
    if row is None or row['pid']!=pid or identity(pid)!=row:raise ValueError('owned_changed')
    os.killpg(pid,sig)

def cleanup():
    row=load()
    if row is None:return
    p=path()
    pid=row['pid']
    try:current=identity(pid)
    except FileNotFoundError:
        try:os.killpg(pid,0)
        except ProcessLookupError:p.unlink();return
        raise ValueError('leader_absent_group_uncertain')
    if current!=row:raise ValueError('owned_changed')
    for sig,budget in [(signal.SIGTERM,5),(signal.SIGKILL,5)]:
        signal_owned(pid,sig)
        end=time.monotonic()+budget
        while time.monotonic()<end:
            try:os.killpg(pid,0)
            except ProcessLookupError:p.unlink();return
            time.sleep(.1)
    raise ValueError('owned_cleanup_timeout')

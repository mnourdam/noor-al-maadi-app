"""No SQL execution/dependencies. Detects reviewed source-set and byte drift.
Passing means pinned evidence unchanged, NEVER complete writer/admission coverage.
"""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def digest(data):return hashlib.sha256(data).hexdigest()
def check(root,manifest):
    errors=[]
    actual={str(p.relative_to(root)):digest(p.read_bytes()) for p in (root/'supabase/migrations').glob('*.sql')}
    if actual!=manifest['migration_pins']:errors.append('migration source set or bytes changed: review required')
    for f in manifest['function_candidates']:
        src=f['source'];path=root/src['path']
        if not path.is_file():errors.append('missing function source');continue
        piece=path.read_bytes()[src['start_byte']:src['start_byte']+src['byte_length']]
        if digest(piece)!=src['sha256']:errors.append('function statement range/hash changed: '+f['signature'])
    expected={x['path']:x for x in manifest['client_candidates']}
    names={x['name'].split('.')[-1] for x in manifest['function_candidates']}
    tables=set(manifest['economic_table_watchlist'])
    observed=set()
    for p in (root/'src').rglob('*'):
        if p.suffix not in ('.ts','.tsx'):continue
        text=p.read_text();rel=str(p.relative_to(root))
        calls=set(re.findall(r'\.rpc\s*\(\s*["\x27]([^"\x27]+)',text))&names
        direct=set(re.findall(r'\.from\s*\(\s*["\x27]([^"\x27]+)',text))&tables
        if calls or direct:observed.add(rel)
    if observed!=set(expected):errors.append('literal client ingress set changed: review required')
    for path,evidence in expected.items():
        p=root/path
        if not p.is_file() or digest(p.read_bytes())!=evidence['sha256']:errors.append('client ingress bytes changed: '+path)
    return errors

if __name__=='__main__':
    m=json.loads(Path(__file__).with_name('manifest.json').read_text())
    failures=check(ROOT,m)
    print('\n'.join(failures) if failures else 'PASS: pinned evidence unchanged; authority coverage remains UNPROVED')
    raise SystemExit(bool(failures))

"""CI-only bounded observation; does not attest compiled semantics or run a race."""
import importlib.util,json,re,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('base_media',Path(__file__).parents[1]/'feedback-private-images-local-supabase/harness.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
IMAGE='sha256:2b7ca2e35a0c54663fd0942a0fe99650d138515e4f3a3e36697a5104e99c5bd2'
DIGEST='sha256:a0420573837ee08c0afdc9cd01f90b4b8027579da99e0b9a159fe912ef756c99'
REVISION='872757184c35626fef3d84f35e0b3c4fa82af1b6'
MODULES=('storage/uploader','storage/database/pg','internal/hashing/string-to-int')
PATHS=tuple('/app/dist/'+name+suffix for name in MODULES for suffix in ('.js','.js.map'))
EXPECTED={'internal/hashing/string-to-int':'bab1e69c782912ba45b4a781e20883cc8df21a58614d07b29a2907f8827f272a','storage/uploader':'e44e5458f70c9279e81f66c83ca82ef31de6fe84f1917903615095df5280716e','storage/database/pg':'d3bcfa58b849cfe17e7fa311ecc3b119f50e0b41fc43e10024d761b03851496e'}
# Reads only six fixed regular files, never imports/evaluates the target modules.
READ_SCRIPT=r'''
const fs=require('node:fs'),crypto=require('node:crypto');
const modules=['storage/uploader','storage/database/pg','internal/hashing/string-to-int'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const rows=[];
for(const name of modules) for(const suffix of ['.js','.js.map']) {
 const p='/app/dist/'+name+suffix; let fd;
 try {
  if(fs.realpathSync(p)!==p) throw Error('path');
  fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  const st=fs.fstatSync(fd); if(!st.isFile()||st.size<1||st.size>1048576) throw Error('size');
  const b=Buffer.alloc(st.size); let n=0; while(n<b.length){const k=fs.readSync(fd,b,n,b.length-n,null);if(!k)throw Error('short');n+=k;}
  const row={path:p,bytes:b.length,sha256:hash(b),source_hashes:[]};
  if(suffix==='.js.map') {const m=JSON.parse(b.toString('utf8'));if(!Array.isArray(m.sourcesContent)||m.sourcesContent.length>16)throw Error('map');row.source_hashes=m.sourcesContent.map(x=>{if(typeof x!=='string')throw Error('map');return hash(Buffer.from(x))});}
  rows.push(row);
 } catch { rows.push({path:p,unavailable:true}); }
 finally {if(fd!==undefined)fs.closeSync(fd);}
}
process.stdout.write(JSON.stringify(rows));
'''
def image_guard(info):
 base.require(isinstance(info,dict) and info.get('Id')==IMAGE,'Storage image identity mismatch')
 base.require(any(isinstance(x,str) and x.endswith('@'+DIGEST) for x in info.get('RepoDigests',[])),'Storage image digest mismatch')

def sanitize(rows,labels):
 base.require(isinstance(rows,list) and len(rows)==6,'source observation shape mismatch')
 out=[]
 for expected,row in zip(PATHS,rows):
  base.require(isinstance(row,dict) and row.get('path')==expected,'source observation path mismatch')
  if row.get('unavailable') is True:out.append({'path':expected,'unavailable':True});continue
  base.require(type(row.get('bytes')) is int and 0<row['bytes']<=1048576,'source observation size invalid')
  base.require(isinstance(row.get('sha256'),str) and re.fullmatch('[a-f0-9]{64}',row['sha256']),'source observation hash invalid')
  hashes=row.get('source_hashes');base.require(isinstance(hashes,list) and len(hashes)<=16 and all(isinstance(x,str) and re.fullmatch('[a-f0-9]{64}',x) for x in hashes),'embedded source hashes invalid')
  out.append({'path':expected,'bytes':row['bytes'],'sha256':row['sha256'],'source_hashes':hashes})
 labels=labels if isinstance(labels,dict) else {}
 revision=labels.get('org.opencontainers.image.revision');version=labels.get('org.opencontainers.image.version')
 safe={}
 if isinstance(revision,str) and re.fullmatch('[a-f0-9]{40}',revision):safe['revision']=revision
 if isinstance(version,str) and re.fullmatch(r'v?[0-9]+\.[0-9]+\.[0-9]+',version):safe['version']=version
 matches={name:any(EXPECTED[name] in row.get('source_hashes',[]) for row in out if row['path']=='/app/dist/'+name+'.js.map') for name in EXPECTED}
 return {'files':out,'oci':safe,'reviewed_source_matches':matches,'oci_revision_matches':safe.get('revision')==REVISION,'collection_status':'COMPLETE','embedded_source_status':'MATCHED' if all(matches.values()) else 'UNSUPPORTED','provenance_status':'UNSUPPORTED','compiled_order_attested':False,'barrier_authorized':False}

class Observation(base.Harness):
 def __init__(self):
  super().__init__();self.evidence=self.evidence.parent/'v18-feedback-media-provenance';self.evidence.mkdir(mode=0o700,exist_ok=True)
 def probe(self):
  name='supabase_storage_'+self.project
  running=self.command(['docker','inspect','--format','{{.Image}}',name]).strip()
  base.require(running==IMAGE,'running Storage image mismatch')
  template='{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}},"Labels":{{json .Config.Labels}}}'
  info=json.loads(self.command(['docker','image','inspect','--format',template,IMAGE]));image_guard(info)
  rows=json.loads(self.command(['docker','exec',name,'node','-e',READ_SCRIPT],timeout=15))
  self.report['provenance']=sanitize(rows,info.get('Labels'))
  self.report['image_id']=IMAGE;self.report['image_digest']=DIGEST;self.report['reviewed_revision']=REVISION
  self.report['not_proven']=['compiled source-order attestation','completion-lock interleaving','byte erasure','retention deadline','trusted decode','production activation']
  self.report['result']='UNSUPPORTED; COMPILED ORDER NOT ATTESTED; BARRIER NOT AUTHORIZED'

if __name__=='__main__':
 try:
  action=sys.argv[1] if len(sys.argv)==2 else ''
  base.require(action in ('run','cleanup'),'unsupported action')
  h=Observation()
  if action=='cleanup':h.cleanup()
  else:sys.exit(h.run())
 except Exception:
  print('Provenance preflight/cleanup failed; details withheld',file=sys.stderr);sys.exit(1)

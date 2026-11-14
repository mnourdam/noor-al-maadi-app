"""Fail-closed evidence for existing release minify/shrink configuration, not runtime."""
import hashlib,json,re
from pathlib import Path
TASKS=('minifyReleaseWithR8','shrinkReleaseRes','optimizeReleaseResources')
REPORTS=('mapping.txt','configuration.txt','resources.txt')
SOURCE_FILES=('android/app/build.gradle','android/app/proguard-rules.pro','android/gradle.properties','android/build.gradle')
def require(ok):
 if not ok:raise ValueError('release_config_evidence')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def source_hashes(root):return {name:sha(root/name) for name in SOURCE_FILES}
def regular(root,path,maximum):
 require(path.is_relative_to(root))
 current=root
 require(not root.is_symlink())
 for part in path.relative_to(root).parts:
  current=current/part;require(not current.is_symlink())
 require(path.is_file() and 0<path.stat().st_size<=maximum)
 return path

def prepare(root):
 reports=root/'android/app/build/outputs/mapping/release'
 require(not reports.exists())
 events=root/'release-task-events.jsonl';require(not events.exists())
 script=root/'release-evidence.gradle';require(not script.exists())
 # Fresh private copy; fixed filenames only. Observe task outcomes without adding tasks.
 script.write_text('''import groovy.json.JsonOutput
 def appendEvidence = { row -> new File(gradle.rootProject.projectDir.parentFile, "release-task-events.jsonl").append(JsonOutput.toJson(row)+'\\n') }
 gradle.projectsEvaluated {
   def app = gradle.rootProject.findProject(':app')
   def release = app.extensions.findByName('android').buildTypes.getByName('release')
   def flag = app.findProperty('android.r8.optimizedResourceShrinking')
   appendEvidence([kind:'config', minify:release.minifyEnabled, shrink:release.shrinkResources, debuggable:release.debuggable, optimizedResourceFlag:flag == null ? 'unspecified' : flag.toString()])
 }
 gradle.taskGraph.afterTask { task, state ->
   if (task.project.path == ':app' && ['minifyReleaseWithR8','shrinkReleaseRes','optimizeReleaseResources'].contains(task.name)) {
     appendEvidence([kind:'task', name:task.name, executed:state.executed, didWork:state.didWork, skipped:state.skipped, upToDate:state.upToDate, noSource:state.noSource, skipMessage:state.skipMessage, failed:state.failure != null])
   }
 }
''')
 return script

def validate_events(rows):
 configs=[r for r in rows if r.get('kind')=='config'];require(len(configs)==1)
 c=configs[0];require(c.get('minify') is True and c.get('shrink') is True and c.get('debuggable') is False)
 flag=c.get('optimizedResourceFlag');require(flag in ('true','false','unspecified'))
 tasks={}
 for r in rows:
  if r.get('kind')=='config':continue
  require(r.get('kind')=='task' and r.get('name') in TASKS and r['name'] not in tasks)
  require(r.get('executed') is True and r.get('didWork') is True and r.get('failed') is False and r.get('skipped') is False and r.get('upToDate') is False and r.get('noSource') is False and r.get('skipMessage') is None)
  tasks[r['name']]='EXECUTED_WORK'
 require('minifyReleaseWithR8' in tasks and any(t in tasks for t in TASKS[1:]))
 return {'tasks':tasks,'minify_enabled':True,'shrink_resources':True,'optimized_resource_flag':flag,'optimized_resource_mode':'UNKNOWN_NOT_INFERRED'}

def collect(root):
 events=regular(root,root/'release-task-events.jsonl',65536)
 result=validate_events([json.loads(line) for line in events.read_text().splitlines()])
 reports={}
 for name in REPORTS:
  file=regular(root,root/'android/app/build/outputs/mapping/release'/name,64*1024*1024)
  reports[name]={'sha256':sha(file),'bytes':file.stat().st_size}
 config=(root/'android/app/build/outputs/mapping/release/configuration.txt').read_text()
 result.update(reports=reports,effective_dontoptimize=bool(re.search(r'^\s*-dontoptimize\b',config,re.M)),full_code_optimization_proven=False)
 return result

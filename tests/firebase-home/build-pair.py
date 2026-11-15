"""Review-gated CI draft. Build isolated app/test pair, never install or run it."""
import argparse, hashlib, importlib.util, json, os, re, shutil, subprocess
from pathlib import Path
PIN = '56bd440232ca1a7b426b1b7dcf928f36f0aa76ce'
APP = 'app.lovable.irth.acceptance'
TEST = APP + '.test'
REVIEWED_SOURCES = {
    'IrthHomeTest.java': '8dfed6f7a5cb19a67ee072dc086b522d799db572d1e547e950729d7b177b3820',
    'SafeCleanup.java': '1ca806d5512def84478d13bd0f16493bdfe25d5e721e8ec5d473eec3f563a398',
    'SafeCleanupTest.java': '587350b56fcf875a3dd0e335051dd5351ce96169f559dfdd8831d9fdb6832f09',
}
def require(condition):
    if not condition: raise ValueError('pair_validation_failed')
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def verify_sources(java):
    require(java.name == 'IrthHomeTest.java')
    hashes = {}
    for name, expected in REVIEWED_SOURCES.items():
        file = java.parent/name
        require(file.is_file() and not file.is_symlink() and file.resolve() == file)
        hashes[name] = digest(file)
        require(hashes[name] == expected)
    return hashes

def signer(text):
    values = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})', text)
    require(len(values) == 1)
    return values[0].lower()
def verify_test_manifest(text):
    # aapt xmltree instrumentation attributes must belong to that element.
    entries = []; current = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith('E: '):
            current = {} if stripped.split()[1] == 'instrumentation' else None
            if current is not None: entries.append(current)
        elif current is not None and stripped.startswith('A: android:'):
            m = re.match(r'A: android:(\w+)(?:\([^)]*\))?="([^"]*)"', stripped)
            if m: current[m[1]] = m[2]
    require(len(entries) == 1 and entries[0].get('targetPackage') == APP
            and entries[0].get('name') == 'androidx.test.runner.AndroidJUnitRunner')
def main(args):
    require(os.environ.get('GITHUB_ACTIONS') == 'true')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/v18-home-pair-56bd4402')
    source, java, root, output = args.source, args.java, args.root, args.output
    for path in (source, java, root, output):
        require(path.is_absolute() and path.resolve() == path and not path.is_symlink())
    require(not root.exists() and not output.exists())
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip() == PIN)
    require(not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=source,text=True).strip())
    source_hashes = verify_sources(java)
    reviewed = source_hashes['IrthHomeTest.java']
    # Negative cleanup tests must pass under the CI JDK before any Android build.
    classes = root.parent/'irth-home-cleanup-classes'
    require(not classes.exists() and not classes.is_symlink())
    classes.mkdir(mode=0o700)
    subprocess.run(['javac','-d',str(classes),str(java.parent/'SafeCleanup.java'),str(java.parent/'SafeCleanupTest.java')],check=True,capture_output=True,timeout=60)
    subprocess.run(['java','-cp',str(classes),'app.lovable.irth.acceptance.test.SafeCleanupTest'],check=True,capture_output=True,timeout=30)
    spec = importlib.util.spec_from_file_location('producer', Path(__file__).resolve().parents[1]/'native-app/build-full-app.py')
    producer = importlib.util.module_from_spec(spec); spec.loader.exec_module(producer)
    # Uses the reviewed producer with narrow branch/source binding; preserves transport, no INTERNET,
    # asset inventory, native config, Firebase-disable and ephemeral signing checks.
    receipt = producer.build(root, source_root=source)
    require(receipt['source_sha'] == PIN and receipt['application_id'] == APP)
    apk = root/'android/app/build/outputs/apk/debug/app-debug.apk'
    original_hash = digest(apk)
    require(original_hash == receipt['apk_sha256'])
    tests = root/'android/app/src/androidTest'
    require(tests.is_dir() and not tests.is_symlink())
    # Replace only disposable test sources, never the source checkout/main application.
    shutil.rmtree(tests); target = tests/'java/app/lovable/irth/acceptance/test'
    target.mkdir(parents=True)
    for name in ('IrthHomeTest.java', 'SafeCleanup.java'):
        shutil.copyfile(java.parent/name, target/name)
        require(digest(target/name) == source_hashes[name])
    (tests/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"><uses-permission android:name="android.permission.INTERNET" tools:node="remove" /></manifest>')
    env = producer.build_env(root/'private-home', PIN)
    def run(argv): return producer.run_command(argv, root, env, 1200)
    run(['bash','android/gradlew','-p','android','--no-daemon',':app:assembleDebugAndroidTest'])
    require(digest(apk) == original_hash)
    test_apk = root/'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    require(test_apk.is_file() and not test_apk.is_symlink())
    sdk = Path(env.get('ANDROID_SDK_ROOT') or env.get('ANDROID_HOME', ''))
    tools = sdk/'build-tools/35.0.0'
    for file, package in ((apk,APP),(test_apk,TEST)):
        require("package: name='"+package+"'" in run([str(tools/'aapt'),'dump','badging',str(file)]))
        require('android.permission.INTERNET' not in run([str(tools/'aapt'),'dump','permissions',str(file)]))
        require(signer(run([str(tools/'apksigner'),'verify','--print-certs',str(file)])) == receipt['signer_sha256'])
    verify_test_manifest(run([str(tools/'aapt'),'dump','xmltree',str(test_apk),'AndroidManifest.xml']))
    output.mkdir(mode=0o700)
    shutil.copyfile(apk,output/'acceptance.apk');shutil.copyfile(test_apk,output/'instrumentation.apk')
    shutil.copyfile(root/'apk-receipt.json',output/'apk-receipt.json')
    pair = {'source_sha':PIN,'harness_sha':os.environ.get('GITHUB_SHA'), 'java_sha256':reviewed, 'reviewed_java_sources':source_hashes, 'cleanup_jvm_negative_tests':'PASS',
            'application_id':APP,'test_application_id':TEST,'signer_sha256':receipt['signer_sha256'],
            'files':{name:digest(output/name) for name in ('acceptance.apk','instrumentation.apk','apk-receipt.json')},
            'scope':'BUILT ONLY; HOME NOT EXECUTED; ANDROID ACCEPTANCE NOT PROVEN'}
    (output/'pair-receipt.json').write_text(json.dumps(pair,indent=2)+'\n')
    require({p.name for p in output.iterdir()} == {'acceptance.apk','instrumentation.apk','apk-receipt.json','pair-receipt.json'})
    print(json.dumps({'result':'PAIR_BUILT_NOT_ACCEPTED','source_sha':PIN}))
if __name__ == '__main__':
    p=argparse.ArgumentParser()
    for name in ('source','java','root','output'): p.add_argument('--'+name,required=True,type=Path)
    try: main(p.parse_args())
    except Exception:
        # Never print captured build output, signing paths or environment.
        print('{"result":"FAIL","stage":"pair_build_or_validation","release_ready":false}')
        raise SystemExit(1)

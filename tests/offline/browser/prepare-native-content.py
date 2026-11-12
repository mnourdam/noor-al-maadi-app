"""Prepare an isolated Android copy only; never edits the source checkout."""
import os,shutil,subprocess,sys
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[3]
def prepare(destination):
    root=Path(destination).resolve();runner=Path(os.environ['RUNNER_TEMP']).resolve()
    if root.parent!=runner or root.exists():raise ValueError('fresh direct RUNNER_TEMP child required')
    root.mkdir()
    shutil.copytree(ROOT/'android',root/'android',ignore=shutil.ignore_patterns('build','.gradle','local.properties','google-services.json','*.jks','*.keystore'))
    shutil.copy2(ROOT/'package.json',root/'package.json');shutil.copy2(ROOT/'capacitor.config.ts',root/'capacitor.config.ts')
    (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
    output=root/'dist/android';output.mkdir(parents=True)
    subprocess.run(['node','tests/offline/browser/build-native-content.mjs',str(output)],cwd=ROOT,check=True)
    subprocess.run([str(ROOT/'node_modules/.bin/cap'),'sync','android'],cwd=root,check=True)
    manifest=root/'android/app/src/main/AndroidManifest.xml'
    android='http://schemas.android.com/apk/res/android';tools='http://schemas.android.com/tools'
    ET.register_namespace('android',android);ET.register_namespace('tools',tools)
    tree=ET.parse(manifest);node=tree.getroot()
    for permission in list(node.findall('uses-permission')):
        if permission.get('{'+android+'}name')=='android.permission.INTERNET':node.remove(permission)
    ET.SubElement(node,'uses-permission',{'{'+android+'}name':'android.permission.INTERNET','{'+tools+'}node':'remove'})
    tree.write(manifest,encoding='unicode')
    key=root/'debug-acceptance.keystore'
    subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=Disposable Native Acceptance','-keyalg','RSA','-keysize','2048','-validity','2'],check=True)
    with (root/'android/app/build.gradle').open('a') as f:
        f.write("\n// Isolated CI copy only; no release signing configuration.\nandroid.signingConfigs.debug { storeFile file('../../debug-acceptance.keystore'); storePassword 'android'; keyAlias 'androiddebugkey'; keyPassword 'android' }\n")
    print('Prepared isolated synthetic native fixture; no app built or launched by this helper.')
if __name__=='__main__':prepare(sys.argv[1])

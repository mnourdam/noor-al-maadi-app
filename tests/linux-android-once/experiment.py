"""One isolated Linux launch/screen/readiness attempt; no journey or release acceptance."""
import argparse, fcntl, json, os, platform, re, signal, socket, stat, subprocess, sys, time
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native-app'))
import runner as r
import visual_observation as visual
from kvm_acl import KvmAccess
import owned_process

class LinuxDevice(r.Device):
    def provision(self):
        if platform.system() != 'Linux' or platform.machine() != 'x86_64':
            raise r.Failure('linux_required')
        if not (self.sdk/'licenses/android-sdk-license').is_file():
            raise r.Failure('existing_license_required')
        if not (self.sdk/'system-images/android-35/default/x86_64/package.xml').is_file():
            raise r.Failure('image_missing')
        self.versions = {}
        for name, path in [('emulator','emulator'),('image','system-images/android-35/default/x86_64'),('platform_tools','platform-tools'),('build_tools','build-tools/35.0.0')]:
            rev = ET.parse(self.sdk/path/'package.xml').find('.//revision')
            if rev is None: raise r.Failure('tool_revision')
            values = [rev.findtext(k, '0') for k in ('major','minor','micro')]
            if any(not re.fullmatch(r'[0-9]{1,9}', v) for v in values): raise r.Failure('tool_revision')
            self.versions[name] = '.'.join(values)

    def verify_acceleration(self):
        fd = os.open('/dev/kvm', os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            if not stat.S_ISCHR(os.fstat(fd).st_mode) or fcntl.ioctl(fd, 0xAE00) != 12:
                raise r.Failure('kvm_unverified')
        finally: os.close(fd)
        value = r.command([self.sdk/'emulator/emulator', '-accel-check'], 30)
        if not re.search(r'\bKVM\b', value): raise r.Failure('kvm_unverified')

    def boot(self):
        if self.root.exists(): raise r.Failure('fresh_avd_required')
        with socket.socket() as probe:
            probe.settimeout(1)
            if probe.connect_ex(('127.0.0.1',5038)) == 0: raise r.Failure('existing_devices')
        marker = Path(os.environ['RUNNER_TEMP'])/'irth-linux-adb-owned'
        fd = os.open(marker, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        os.close(fd)
        listing = r.command([self.sdk/'platform-tools/adb','devices'])
        if any(line.strip() and not line.startswith('List of devices') for line in listing.splitlines()):
            raise r.Failure('existing_devices')
        self.root.mkdir(mode=0o700); self.created = True
        os.environ['ANDROID_AVD_HOME'] = str(self.root)
        r.command([self.sdk/'cmdline-tools/latest/bin/avdmanager','create','avd','-n','irth-full-acceptance','-k',r.IMAGE],60,input=b'no\n')
        self.emulator = subprocess.Popen([str(self.sdk/'emulator/emulator'),'-avd','irth-full-acceptance','-port','5580','-accel','on','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader_indirect'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        owned_process.record(self.emulator.pid)
        self.output.start(self.emulator.stdout,self.emulator.stderr)
        self.await_boot()

    def close(self):
        # Owned child is session/group leader; no PID discovery or broad termination.
        if self.emulator and self.emulator.poll() is None:
            pid = self.emulator.pid
            if os.getpgid(pid) != pid: raise r.Failure('cleanup_path')
            try: self.adb('emu','kill',timeout=5)
            except Exception: pass
            try: self.emulator.wait(timeout=10)
            except subprocess.TimeoutExpired:
                owned_process.signal_owned(pid, signal.SIGTERM)
                try: self.emulator.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    owned_process.signal_owned(pid, signal.SIGKILL); self.emulator.wait(timeout=5)
        super().close()
        owned_process.cleanup()


def execute(apk, receipt, evidence):
    r.require_ci()
    def interrupted(*_): raise RuntimeError('terminated')
    signal.signal(signal.SIGTERM, interrupted)
    root = Path(os.environ['RUNNER_TEMP'])
    out = Path(evidence)
    if out != root/'irth-linux-evidence' or out.exists(): raise ValueError('fresh_evidence_required')
    out.mkdir(mode=0o700)
    os.environ['ANDROID_ADB_SERVER_PORT'] = '5038'
    os.environ['ADB_SERVER_SOCKET'] = 'tcp:localhost:5038'
    report = {'result':'BLOCKED','release_ready':False,'scope':'ONE_LINUX_SYNTHETIC_APP_ATTEMPT',
              'six_feature_journeys':'NOT_EXECUTED','stage':'preflight','reached':{},'cleanup_complete':False}
    device = None; page = None; lease = None
    try:
        sdk = Path(os.environ['ANDROID_HOME'])
        device = LinuxDevice(sdk, root/'irth-linux-avd')
        device.provision()
        report.update(r.verify_apk(apk, receipt, sdk))
        report['reached']['apk_verified'] = True
        report['sdk_versions'] = device.versions
        # All APK/tool gates precede the only permitted host access change.
        report['stage'] = 'kvm_access'
        lease = KvmAccess()
        report['acl_grant'] = lease.acquire()
        device.verify_acceleration()
        report['reached']['kvm_api12_and_emulator_check'] = True
        report['stage'] = 'boot'; device.boot()
        report['boot_observations'] = dict(device.boot_observations)
        report['reached']['boot_completed'] = True
        try: report['avd_numeric_configuration'] = visual.probes.avd_resources(device.root)
        except Exception: report['avd_configuration_status'] = 'unavailable'
        report['stage'] = 'install'; report['installation'] = {}
        r.install_once(device, apk, report['apk_sha256'], report['installation'])
        report['reached']['installed_verified'] = True
        report['stage'] = 'launch'; report['launch'] = {}
        launch_error = None
        try:
            device.launch(report['launch'], verified_install=True)
            report['reached']['launched'] = True
        except Exception as error:
            launch_error = error
        # Foreground-bracketed screen can survive launch/bridge failure; never promotes it.
        report['stage'] = 'screen'
        try: report['visual'] = visual.observe(device, out/'initial-screen.png')
        except Exception as error: report['visual'] = {'screen_observed':False,'category':r.safe_diagnostic_error(error)}
        if launch_error is not None:
            report['stage'] = 'launch'
            raise launch_error
        report['stage'] = 'app_readiness'
        page = r.Page(device)
        page.readiness()
        report['reached']['home_ready'] = True
        report['result'] = 'READY_NOT_ACCEPTANCE'
        report['stage'] = 'complete'
    except Exception as error:
        report['category'] = r.safe_diagnostic_error(error)
    finally:
        clean = not report.get('visual', {}).get('probe_cleanup_failed', False)
        if page:
            report['readiness_checks'] = getattr(page, 'readiness_checks', {})
            report['readiness_phase'] = getattr(page, 'readiness_phase', 'not_started')
            try: page.close()
            except Exception: clean = False
        if device:
            report['native_actions'] = device.actions
            report.setdefault('boot_observations', dict(device.boot_observations))
            try: device.close()
            except Exception: clean = False
            try:
                if (root/'irth-linux-adb-owned').exists(): r.command([device.sdk/'platform-tools/adb', 'kill-server'], 5)
            except Exception: clean = False
        # Never skip restoration because earlier owned-process cleanup failed.
        if lease:
            try:
                report['acl_restoration'] = lease.restore()
                report['acl_restored'] = report['acl_restoration']['restoration'] == 'verified_exact_acl_identity_mode'
            except Exception: report['acl_restored'] = False; clean = False
        report['cleanup_complete'] = clean
        if not clean: report['result'] = 'BLOCKED'
        (out/'result.json').write_text(json.dumps(report, sort_keys=True)+'\n')
    return 0 if report['result'] == 'READY_NOT_ACCEPTANCE' and report['cleanup_complete'] else 1

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--apk',required=True);p.add_argument('--receipt',required=True);p.add_argument('--evidence',required=True);a=p.parse_args()
    raise SystemExit(execute(a.apk,a.receipt,a.evidence))

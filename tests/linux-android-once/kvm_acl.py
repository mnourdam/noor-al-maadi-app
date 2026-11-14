"""Single-device, named-runner ACL lease. Never executes privileged interpreters."""
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

DEVICE = '/dev/kvm'
STATE_NAME = 'irth-kvm-acl.json'
IDENTITY_KEYS = {'dev', 'ino', 'rdev', 'uid', 'gid', 'mode'}

class AclFailure(Exception):
    def __init__(self, category, restoration='not_attempted'):
        super().__init__(category)
        self.category = category
        self.restoration = restoration


def parse_base(raw):
    if not isinstance(raw, str) or len(raw) > 256:
        raise AclFailure('baseline_acl_unsupported')
    lines = raw.splitlines()
    while lines and not lines[-1]:
        lines.pop()
    if len(lines) != 3:
        raise AclFailure('baseline_acl_unsupported')
    values = {}
    for line, kind in zip(lines, ('user', 'group', 'other')):
        match = re.fullmatch(kind + r'::([r-][w-][x-])', line)
        if not match:
            raise AclFailure('baseline_acl_unsupported')
        values[kind] = match.group(1)
    return values


def bits(value):
    return sum(flag for char, flag in zip(value, (4, 2, 1)) if char != '-')


def mode_from_acl(acl):
    return bits(acl['user']) * 64 + bits(acl['group']) * 8 + bits(acl['other'])


def base_text(acl):
    return ''.join(f'{kind}::{acl[kind]}\n' for kind in ('user', 'group', 'other'))


def granted_text(acl, uid):
    # No named/default entries exist at admission. Expanded mask cannot increase
    # group effective rights: the group's unchanged entry remains the ceiling.
    mask_bits = bits(acl['group']) | 6
    mask = ''.join(char if mask_bits & bit else '-' for char, bit in zip('rwx', (4, 2, 1)))
    return f'user::{acl["user"]}\nuser:{uid}:rw-\ngroup::{acl["group"]}\nmask::{mask}\nother::{acl["other"]}\n'


def identity():
    before = os.lstat(DEVICE)
    if not stat.S_ISCHR(before.st_mode) or before.st_uid != 0:
        raise AclFailure('device_identity')
    fd = os.open(DEVICE, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_rdev', 'st_uid', 'st_gid', 'st_mode')
        if any(getattr(before, field) != getattr(after, field) for field in fields):
            raise AclFailure('device_identity')
        return dict(dev=after.st_dev, ino=after.st_ino, rdev=after.st_rdev,
                    uid=after.st_uid, gid=after.st_gid, mode=stat.S_IMODE(after.st_mode))
    finally:
        os.close(fd)


def trusted_tool(name):
    found = shutil.which(name)
    if not found:
        raise AclFailure('tools_unavailable')
    path = Path(found).resolve(strict=True)
    for item in (path, *path.parents):
        info = item.stat()
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022:
            raise AclFailure('untrusted_tool')
    if not path.is_file() or not os.access(path, os.X_OK):
        raise AclFailure('untrusted_tool')
    return str(path)


def validate_state(value, uid):
    if not isinstance(value, dict) or set(value) != {'schema', 'runner_uid', 'identity', 'acl'}:
        raise AclFailure('state_schema')
    if value['schema'] != 1 or type(value['runner_uid']) is not int or value['runner_uid'] != uid or uid <= 0:
        raise AclFailure('state_schema')
    ident = value['identity']
    if not isinstance(ident, dict) or set(ident) != IDENTITY_KEYS or any(type(v) is not int or v < 0 for v in ident.values()):
        raise AclFailure('state_schema')
    acl = parse_base(value['acl'])
    if ident['uid'] != 0 or ident['mode'] != mode_from_acl(acl):
        raise AclFailure('state_schema')
    return value


class KvmAccess:
    def __init__(self):
        self.uid = os.getuid()
        if self.uid <= 0:
            raise AclFailure('runner_identity')
        root = Path(os.environ['RUNNER_TEMP'])
        if not root.is_absolute() or root.is_symlink() or root.resolve() != root:
            raise AclFailure('state_path')
        info = root.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != self.uid:
            raise AclFailure('state_path')
        self.path = root / STATE_NAME
        self.getfacl = trusted_tool('getfacl')
        self.setfacl = trusted_tool('setfacl')
        self.sudo = trusted_tool('sudo')
        self.state = None

    def command(self, args, data=None):
        try:
            result = subprocess.run(args, input=data, capture_output=True, timeout=5, check=False)
        except Exception:
            raise AclFailure('acl_command') from None
        if result.returncode != 0 or len(result.stdout) > 2048 or len(result.stderr) > 2048:
            raise AclFailure('acl_command')
        return result.stdout.decode('ascii', 'strict')

    def read_acl(self):
        return self.command([self.getfacl, '--numeric', '--omit-header', '--no-effective', '--', DEVICE]).rstrip('\n') + '\n'

    def check_identity(self, exact_mode=False):
        now = identity()
        keys = IDENTITY_KEYS if exact_mode else IDENTITY_KEYS - {'mode'}
        if any(now[key] != self.state['identity'][key] for key in keys):
            raise AclFailure('device_replaced')

    def set_acl(self, text):
        self.check_identity()
        self.command([self.sudo, '-n', self.setfacl, '--set-file=-', '--', DEVICE], text.encode('ascii'))

    def acquire(self):
        if self.state is not None or self.path.exists() or self.path.is_symlink():
            raise AclFailure('fresh_state_required')
        before = identity()
        acl = parse_base(self.read_acl())
        after = identity()
        if before != after or before['mode'] != mode_from_acl(acl):
            raise AclFailure('device_identity')
        self.state = validate_state({'schema': 1, 'runner_uid': self.uid, 'identity': before, 'acl': base_text(acl)}, self.uid)
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
        try:
            with os.fdopen(fd, 'w', encoding='ascii') as stream:
                json.dump(self.state, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
        except Exception:
            self.state = None  # No privileged operation has occurred.
            raise
        try:
            expected = granted_text(acl, self.uid)
            self.set_acl(expected)
            self.check_identity()
            if self.read_acl() != expected:
                raise AclFailure('grant_verification')
        except Exception as original:
            restored = 'failed'
            try:
                self.restore()
                restored = 'verified'
            except Exception:
                pass
            if isinstance(original, AclFailure):
                original.restoration = restored
                raise
            raise AclFailure('grant_failed', restored) from None
        return {'grant': 'verified_named_uid_only', 'baseline': 'simple_acl'}

    def load(self):
        fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        with os.fdopen(fd, 'r', encoding='ascii') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != self.uid or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 2048:
                raise AclFailure('state_schema')
            self.state = validate_state(json.load(stream), self.uid)

    def restore(self):
        if self.state is None:
            if not self.path.exists() and not self.path.is_symlink():
                return {'restoration': 'not_needed'}
            self.load()
        self.check_identity()
        self.set_acl(self.state['acl'])
        self.check_identity(exact_mode=True)
        if self.read_acl() != self.state['acl']:
            raise AclFailure('restore_verification')
        return {'restoration': 'verified_exact_acl_identity_mode'}


def main():
    if sys.argv[1:] != ['restore']:
        return 2
    try:
        result = KvmAccess().restore()
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception:
        print('{"restoration":"failed_or_uncertain"}')
        return 1

if __name__ == '__main__':
    raise SystemExit(main())

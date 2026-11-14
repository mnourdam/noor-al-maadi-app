import importlib.util
from pathlib import Path
import tempfile
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('kvm_acl', Path(__file__).with_name('kvm_acl.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BASE = 'user::rw-\ngroup::rw-\nother::---\n'
IDENT = {'dev': 1, 'ino': 2, 'rdev': 3, 'uid': 0, 'gid': 109, 'mode': 0o660}

class AclTests(unittest.TestCase):
    def instance(self, root):
        x = m.KvmAccess.__new__(m.KvmAccess)
        x.uid = 1001
        x.path = Path(root) / m.STATE_NAME
        x.getfacl = '/usr/bin/getfacl'
        x.setfacl = '/usr/bin/setfacl'
        x.sudo = '/usr/bin/sudo'
        x.state = None
        return x

    def test_simple_only_and_mask_preserves_other_principals(self):
        for group in ('---', 'r--', '-w-', '--x', 'r-x', 'rw-', 'rwx'):
            acl = m.parse_base(f'user::rw-\ngroup::{group}\nother::---\n')
            grant = m.granted_text(acl, 1001)
            self.assertIn(f'group::{group}\n', grant)
            self.assertEqual(grant.count('user:1001:rw-'), 1)
            mask = next(row.split('::')[1] for row in grant.splitlines() if row.startswith('mask::'))
            self.assertEqual(m.bits(group) & m.bits(mask), m.bits(group))
        for extra in ('user:222:rwx\n', 'mask::rwx\n', 'default:user::rwx\n'):
            with self.assertRaises(m.AclFailure):
                m.parse_base(BASE + extra)

    def test_invalid_state_rejected(self):
        good = {'schema': 1, 'runner_uid': 1001, 'identity': IDENT, 'acl': BASE}
        m.validate_state(good, 1001)
        for value in ({**good, 'extra': 1}, {**good, 'runner_uid': 1002}, {**good, 'acl': BASE+'mask::rwx\n'}, {**good, 'identity': {**IDENT, 'mode': 0o777}}):
            with self.assertRaises(m.AclFailure):
                m.validate_state(value, 1001)

    def test_acquire_and_restore_exact_fixed_commands(self):
        with tempfile.TemporaryDirectory() as root, patch.object(m, 'identity', return_value=IDENT.copy()):
            x = self.instance(root)
            current = [BASE]
            calls = []
            def command(args, data=None):
                calls.append((args, data))
                if data is None:
                    return current[0]
                self.assertTrue(x.path.exists())
                self.assertEqual(args, ['/usr/bin/sudo', '-n', '/usr/bin/setfacl', '--set-file=-', '--', '/dev/kvm'])
                current[0] = data.decode()
                return ''
            x.command = command
            self.assertEqual(x.acquire()['grant'], 'verified_named_uid_only')
            self.assertEqual(x.restore()['restoration'], 'verified_exact_acl_identity_mode')
            self.assertEqual(current[0], BASE)
            self.assertEqual(sum(data is not None for _, data in calls), 2)

    def test_partial_failed_grant_restores_and_preserves_failure(self):
        with tempfile.TemporaryDirectory() as root, patch.object(m, 'identity', return_value=IDENT.copy()):
            x = self.instance(root)
            current = [BASE]
            writes = []
            error = m.AclFailure('acl_command')
            def command(args, data=None):
                if data is None:
                    return current[0]
                current[0] = data.decode()
                writes.append(current[0])
                if len(writes) == 1:
                    raise error
                return ''
            x.command = command
            with self.assertRaises(m.AclFailure) as got:
                x.acquire()
            self.assertIs(got.exception, error)
            self.assertEqual(error.restoration, 'verified')
            self.assertEqual(writes[-1], BASE)

    def test_restore_failure_cannot_discard_original_grant_failure(self):
        with tempfile.TemporaryDirectory() as root, patch.object(m, 'identity', return_value=IDENT.copy()):
            x = self.instance(root)
            error = m.AclFailure('acl_command')
            x.read_acl = lambda: BASE
            x.command = lambda *a, **kw: (_ for _ in ()).throw(error)
            with self.assertRaises(m.AclFailure) as got:
                x.acquire()
            self.assertIs(got.exception, error)
            self.assertEqual(error.restoration, 'failed')
            self.assertTrue(x.path.exists())

    def test_replaced_device_never_mutated(self):
        with tempfile.TemporaryDirectory() as root:
            x = self.instance(root)
            x.state = {'identity': IDENT, 'acl': BASE}
            with patch.object(m, 'identity', return_value={**IDENT, 'ino': 77}), patch.object(x, 'command') as command:
                with self.assertRaises(m.AclFailure):
                    x.restore()
                command.assert_not_called()

    def test_postrestore_mode_or_acl_mismatch_fails(self):
        for wrongmode in (True, False):
            with tempfile.TemporaryDirectory() as root:
                x = self.instance(root)
                x.state = {'identity': IDENT, 'acl': BASE}
                x.command = lambda args, data=None: '' if data else BASE.replace('other::---', 'other::r--')
                values = [IDENT.copy(), IDENT.copy(), {**IDENT, 'mode': 0o664} if wrongmode else IDENT.copy()]
                with patch.object(m, 'identity', side_effect=values), self.assertRaises(m.AclFailure):
                    x.restore()

    def test_existing_state_prevents_second_grant(self):
        with tempfile.TemporaryDirectory() as root:
            x = self.instance(root)
            x.path.write_text('pending')
            with patch.object(x, 'command') as command, self.assertRaises(m.AclFailure):
                x.acquire()
            command.assert_not_called()

    def test_identity_rejects_symlink_without_open(self):
        with patch.object(m.os, 'lstat', return_value=SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0)), patch.object(m.os, 'open') as opened:
            with self.assertRaises(m.AclFailure):
                m.identity()
            opened.assert_not_called()

    def test_open_identity_mismatch_closes_owned_fd(self):
        original = SimpleNamespace(st_mode=stat.S_IFCHR | 0o660, st_uid=0, st_gid=109, st_dev=1, st_ino=2, st_rdev=3)
        changed = SimpleNamespace(**{**vars(original), 'st_ino': 9})
        with patch.object(m.os, 'lstat', return_value=original), patch.object(m.os, 'open', return_value=44), patch.object(m.os, 'fstat', return_value=changed), patch.object(m.os, 'close') as close:
            with self.assertRaises(m.AclFailure):
                m.identity()
            close.assert_called_once_with(44)

    def test_missing_tools_fail_without_device_access(self):
        with patch.object(m.shutil, 'which', return_value=None), patch.object(m, 'identity') as device:
            with self.assertRaises(m.AclFailure):
                m.trusted_tool('setfacl')
            device.assert_not_called()

    def test_missing_fallback_state_is_noop(self):
        with tempfile.TemporaryDirectory() as root:
            x = self.instance(root)
            with patch.object(x, 'command') as command:
                self.assertEqual(x.restore(), {'restoration': 'not_needed'})
                command.assert_not_called()

if __name__ == '__main__':
    unittest.main()

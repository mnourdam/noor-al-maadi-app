"""Pure source contract: does not import the runner or execute ADB/KVM."""
import ast
from pathlib import Path
import unittest

EXPECTED = 'tcp:localhost:5038'
ROOT = Path(__file__).resolve().parent

def socket_value(source, filename):
    tree = ast.parse(source)
    values = []
    for node in ast.walk(tree):
        if filename == 'experiment.py' and isinstance(node, ast.Assign):
            for target in node.targets:
                if (isinstance(target, ast.Subscript) and isinstance(target.value, ast.Attribute)
                    and isinstance(target.value.value, ast.Name) and target.value.value.id == 'os'
                    and target.value.attr == 'environ' and isinstance(target.slice, ast.Constant)
                    and target.slice.value == 'ADB_SERVER_SOCKET'):
                    values.append(ast.literal_eval(node.value))
        if filename == 'restore.py' and isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if isinstance(key, ast.Constant) and key.value == 'ADB_SERVER_SOCKET':
                    values.append(ast.literal_eval(value))
    if values != [EXPECTED]:
        raise ValueError('exact single local ADB socket required')
    # No dormant numeric-host socket can be introduced elsewhere in these files.
    if any(isinstance(n, ast.Constant) and isinstance(n.value, str)
           and n.value.startswith('tcp:') and n.value != EXPECTED for n in ast.walk(tree)):
        raise ValueError('unexpected TCP socket specification')
    return values[0]

class Contract(unittest.TestCase):
    def test_experiment_and_restoration_use_same_explicit_local_socket(self):
        for name in ('experiment.py', 'restore.py'):
            with self.subTest(file=name):
                self.assertEqual(socket_value((ROOT/name).read_text(), name), EXPECTED)

    def test_numeric_remote_and_wrong_port_counterfactuals_rejected(self):
        for name in ('experiment.py', 'restore.py'):
            source = (ROOT/name).read_text()
            for wrong in ('tcp:127.0.0.1:5038', 'tcp:localhost:5037', 'tcp:remote.invalid:5038'):
                with self.subTest(file=name, value=wrong):
                    with self.assertRaises(ValueError):
                        socket_value(source.replace(EXPECTED, wrong), name)

    def test_missing_or_duplicate_binding_rejected(self):
        for name in ('experiment.py', 'restore.py'):
            source = (ROOT/name).read_text()
            with self.subTest(file=name):
                with self.assertRaises(ValueError):
                    socket_value(source.replace('ADB_SERVER_SOCKET', 'UNUSED_SOCKET'), name)
                with self.assertRaises(ValueError):
                    socket_value(source+'\n'+source, name)

if __name__ == '__main__':
    unittest.main()

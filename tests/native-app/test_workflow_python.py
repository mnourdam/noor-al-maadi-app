"""Static Python isolation contract; no install, SDK, or runtime actions."""
import re
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/v18-android-full-app.yml"
PYTHON = '"$RUNNER_TEMP/irth-native-python/bin/python"'


def validate_python_contract(text):
    assert text.count('python3 -m venv "$RUNNER_TEMP/irth-native-python"') == 1
    assert "--break-system-packages" not in text
    assert not re.search(r"^\s*(?:python3? -m pip|pip3?)\s+install\b", text, re.M)
    expected = [
        PYTHON + " -m pip install websocket-client==1.8.0",
        PYTHON + " -m unittest discover -s tests/native-app -p 'test_*.py' -v",
        PYTHON + " tests/native-app/build-full-app.py",
        PYTHON + " tests/native-app/runner.py",
    ]
    start = text.index('python3 -m venv')
    for invocation in expected:
        assert text.count(invocation) == 1
        assert text.index(invocation) > start
    # Bare system Python is used only to create the isolated environment.
    assert len(re.findall(r"\bpython3?\s", text)) == 1
    assert 'if: always()' in text
    assert '"release_ready":false' in text
    assert 'continue-on-error:' not in text
    assert '|| true' not in text


class WorkflowPython(unittest.TestCase):
    def test_isolated_coherent_python(self):
        validate_python_contract(WORKFLOW.read_text())

    def test_system_pip_or_mixed_python_rejected(self):
        source = WORKFLOW.read_text()
        for changed in [
            source.replace(PYTHON + " -m pip", "python3 -m pip"),
            source.replace(PYTHON + " -m unittest", "python3 -m unittest"),
            source.replace(PYTHON + " tests/native-app/build-full-app.py", "python3 tests/native-app/build-full-app.py"),
            source.replace(PYTHON + " tests/native-app/runner.py", "python3 tests/native-app/runner.py"),
            source.replace("-m pip install", "-m pip install --break-system-packages"),
            source.replace("if: always()", "if: success()"),
        ]:
            with self.subTest(changed=changed[-100:]):
                with self.assertRaises(AssertionError):
                    validate_python_contract(changed)


if __name__ == "__main__":
    unittest.main()

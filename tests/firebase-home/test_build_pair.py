"""Local producer guard tests only; never build APK or call Java."""
import importlib.util, pathlib, tempfile, unittest
spec=importlib.util.spec_from_file_location('pair',pathlib.Path(__file__).with_name('build-pair.py'))
pair=importlib.util.module_from_spec(spec);spec.loader.exec_module(pair)
DRAFT=pathlib.Path(__file__).resolve().parent
class SourceGuards(unittest.TestCase):
    def populate(self, directory):
        for name in pair.REVIEWED_SOURCES:
            (directory/name).write_bytes((DRAFT/name).read_bytes())
    def test_reviewed_files(self):
        self.assertEqual(pair.verify_sources(DRAFT/'IrthHomeTest.java'),pair.REVIEWED_SOURCES)
    def test_each_modified_file_rejected(self):
        for name in pair.REVIEWED_SOURCES:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as d:
                p=pathlib.Path(d);self.populate(p);(p/name).write_text('changed')
                with self.assertRaises(ValueError):pair.verify_sources(p/'IrthHomeTest.java')
    def test_missing_helper_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);self.populate(p);(p/'SafeCleanup.java').unlink()
            with self.assertRaises(ValueError):pair.verify_sources(p/'IrthHomeTest.java')
    def test_symlink_helper_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);self.populate(p);(p/'SafeCleanup.java').unlink();(p/'SafeCleanup.java').symlink_to(DRAFT/'SafeCleanup.java')
            with self.assertRaises(ValueError):pair.verify_sources(p/'IrthHomeTest.java')
if __name__=='__main__':unittest.main()

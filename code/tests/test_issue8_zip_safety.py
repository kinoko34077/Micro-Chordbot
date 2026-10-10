import importlib.util
import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / ".github" / "scripts" / "safe_extract_zip.py"
spec = importlib.util.spec_from_file_location("safe_extract_zip", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ZipReviewSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        self.zpath = self.base / "fixture.zip"

    def make_zip(self, names):
        with zipfile.ZipFile(self.zpath, "w") as archive:
            for name in names:
                archive.writestr(name, "test")

    def test_happy_path_is_reviewable_files_only(self):
        self.make_zip(["source/code/index.html", "source/docs/readme.txt"])
        module.extract(self.zpath, self.repo, True)
        self.assertEqual((self.repo / "code/index.html").read_text(), "test")
        self.assertEqual((self.repo / "docs/readme.txt").read_text(), "test")

    def test_traversal_rejected_without_mutation(self):
        self.make_zip(["source/code/index.html", "source/../../escape"])
        with self.assertRaises(ValueError):
            module.extract(self.zpath, self.repo, True)
        self.assertFalse((self.repo / "code/index.html").exists())

    def test_private_profiles_and_workflow_overwrites_rejected(self):
        for name in ["source/.git/config", "source/.github/workflows/other.yml",
                     "source/code/.edge-profile/Default/Cookies"]:
            self.make_zip(["source/code/index.html", name])
            with self.assertRaises(ValueError):
                module.extract(self.zpath, self.repo, True)
            self.assertFalse((self.repo / "code/index.html").exists())

    def test_symlink_rejected_without_mutation(self):
        with zipfile.ZipFile(self.zpath, "w") as archive:
            archive.writestr("source/code/index.html", "test")
            info=zipfile.ZipInfo("source/code/pointer")
            info.create_system=3
            info.external_attr=(stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "../../.git")
        with self.assertRaises(ValueError):
            module.extract(self.zpath, self.repo, True)
        self.assertFalse((self.repo / "code/index.html").exists())

    def test_malformed_wrapper_rejected(self):
        self.make_zip(["code/index.html", "docs/readme.txt"])
        with self.assertRaises(ValueError):
            module.extract(self.zpath, self.repo, True)

if __name__ == "__main__":
    unittest.main()

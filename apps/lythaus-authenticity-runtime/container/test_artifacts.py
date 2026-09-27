import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("safe_process", Path(__file__).with_name("safe_process.py"))
safe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safe)


class ArtifactIntegrity(unittest.TestCase):
    def test_missing_checkpoint_is_unavailable_before_torch_import(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                safe.load(Path(directory))

    def test_source_and_checkpoint_mismatch_fail_before_model_deserialization(self):
        with patch.object(safe, "digest", return_value="wrong"):
            with self.assertRaisesRegex(ValueError, "SOURCE_CHECKSUM_MISMATCH"):
                safe.load(Path("/protocol-fixture"))
        with patch.object(safe, "digest", side_effect=[safe.SOURCE, "wrong"]):
            with self.assertRaisesRegex(ValueError, "CHECKPOINT_CHECKSUM_MISMATCH"):
                safe.load(Path("/protocol-fixture"))


if __name__ == "__main__":
    unittest.main()

import importlib.util
import io
import hashlib
from pathlib import Path
import tarfile
import unittest

spec = importlib.util.spec_from_file_location('licenses', Path(__file__).with_name('dart-license-review.py'))
licenses = importlib.util.module_from_spec(spec)
spec.loader.exec_module(licenses)


class LicenseResolutionTests(unittest.TestCase):
    def setUp(self):
        self.change = {'ecosystem': 'pub', 'name': 'file_selector_ios', 'manifest': 'pubspec.lock', 'version': '0.5.3+6', 'license': 'bsd-3-clause', 'package_url': 'pkg:pub/file_selector_ios@0.5.3%2B6'}
        self.expected = [{**self.change, 'integrity': licenses.EVIDENCE['file_selector_ios'][1]}]

    def test_exact_reviewed_artifact(self):
        self.assertEqual(licenses.eligible(self.change, self.expected)[0], '0.5.3+6')

    def test_version_manifest_license_and_lock_fail_closed(self):
        for field, value in [('version', '0.5.3+7'), ('manifest', 'other/pubspec.lock'), ('license', 'GPL-3.0'), ('package_url', 'pkg:pub/file_selector_ios')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                licenses.eligible({**self.change, field: value}, self.expected)
        with self.assertRaises(ValueError):
            licenses.eligible(self.change, [{**self.expected[0], 'integrity': '0' * 64}])

    def test_changed_license_bytes_are_not_approved(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            member = tarfile.TarInfo('LICENSE')
            member.size = 7
            archive.addfile(member, io.BytesIO(b'GPL-3.0'))
        raw = stream.getvalue()
        with self.assertRaisesRegex(ValueError, 'UNREVIEWED_LICENSE_TEXT'):
            licenses.verify_archive(raw, hashlib.sha256(raw).hexdigest())
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_INTEGRITY_MISMATCH'):
            licenses.verify_archive(raw, '0' * 64)


if __name__ == '__main__':
    unittest.main()

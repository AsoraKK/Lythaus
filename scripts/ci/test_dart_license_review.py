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

    def test_canonical_sdk_packages_remain_exact_and_fail_closed(self):
        for name in ('matcher', 'test_api', 'test_core'):
            version, digest = licenses.EVIDENCE[name]
            change = {**self.change, 'name': name, 'version': version,
                      'license': None if name == 'matcher' else 'bsd-3-clause',
                      'package_url': f'pkg:pub/{name}@{version}'}
            expected = [{**change, 'integrity': digest}]
            with self.subTest(name=name):
                self.assertEqual(licenses.eligible(change, expected), (version, digest))
                for field, value in [('version', version + '+1'), ('license', 'GPL-3.0'),
                                     ('manifest', 'other/pubspec.lock'), ('package_url', 'pkg:pub/other@' + version)]:
                    with self.assertRaises(ValueError):
                        licenses.eligible({**change, field: value}, expected)
                with self.assertRaisesRegex(ValueError, 'LOCK_INTEGRITY_MISMATCH'):
                    licenses.eligible(change, [{**expected[0], 'integrity': '0' * 64}])

    def test_missing_metadata_is_not_allowed_for_other_reviewed_packages(self):
        for name in ('file_selector_ios', 'test_api', 'test_core'):
            version, digest = licenses.EVIDENCE[name]
            change = {**self.change, 'name': name, 'version': version, 'license': None,
                      'package_url': f'pkg:pub/{name}@{version}'}
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'UNREVIEWED_VERSION_OR_LICENSE'):
                licenses.eligible(change, [{**change, 'integrity': digest}])

    def test_new_license_hashes_do_not_approve_changed_text(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            member = tarfile.TarInfo('LICENSE')
            member.size = 7
            archive.addfile(member, io.BytesIO(b'GPL-3.0'))
        raw = stream.getvalue()
        for digest in licenses.LICENSE_SHA256_BY_PACKAGE.values():
            with self.subTest(digest=digest), self.assertRaisesRegex(ValueError, 'UNREVIEWED_LICENSE_TEXT'):
                licenses.verify_archive(raw, hashlib.sha256(raw).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()

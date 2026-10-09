import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sdk_archive_cache', Path(__file__).parent / 'sdk-verifier/cache-hosted-packages.py')
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)


def archive(members):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as value:
        for name, data, kind in members:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind == tarfile.SYMTYPE:
                member.linkname = '/tmp/synthetic-escape'
            value.addfile(member, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class ArchiveCacheTests(unittest.TestCase):
    def prepare(self, raw, digest=None):
        self.temporary = tempfile.TemporaryDirectory(prefix='lythaus-sdk-archive-')
        self.addCleanup(self.temporary.cleanup)
        directory = Path(self.temporary.name)
        digest = digest or hashlib.sha256(raw).hexdigest()
        archives = directory / 'archives'
        archives.mkdir()
        (archives / (digest + '.tar.gz')).write_bytes(raw)
        return [{'name': 'synthetic', 'version': '1.0.0', 'integrity': digest}], directory

    def test_exact_archive_hash_and_license_file_evidence(self):
        raw = archive([('LICENSE', b'synthetic license', tarfile.REGTYPE), ('lib/value.dart', b'synthetic source', tarfile.REGTYPE)])
        packages, directory = self.prepare(raw)
        result = cache.populate(packages, directory)
        self.assertEqual(result[0]['fileCount'], 2)
        self.assertEqual(result[0]['licenseFiles'], [{'path': 'LICENSE', 'sha256': hashlib.sha256(b'synthetic license').hexdigest()}])
        self.assertEqual((directory / 'hosted/pub.dev/synthetic-1.0.0/lib/value.dart').read_bytes(), b'synthetic source')

    def test_modified_cached_archive_cannot_retain_old_integrity(self):
        packages, directory = self.prepare(b'synthetic modified archive', 'a' * 64)
        with self.assertRaisesRegex(ValueError, 'INTEGRITY_MISMATCH'):
            cache.populate(packages, directory)

    def test_parent_traversal_is_rejected(self):
        packages, directory = self.prepare(archive([('../synthetic-escape', b'data', tarfile.REGTYPE)]))
        with self.assertRaisesRegex(ValueError, 'UNSAFE_MEMBER'):
            cache.populate(packages, directory)

    def test_absolute_path_is_rejected(self):
        packages, directory = self.prepare(archive([('/tmp/synthetic-escape', b'data', tarfile.REGTYPE)]))
        with self.assertRaisesRegex(ValueError, 'UNSAFE_MEMBER'):
            cache.populate(packages, directory)

    def test_symbolic_link_is_rejected(self):
        packages, directory = self.prepare(archive([('lib/value.dart', b'', tarfile.SYMTYPE)]))
        with self.assertRaisesRegex(ValueError, 'UNSAFE_MEMBER'):
            cache.populate(packages, directory)

    def test_duplicate_member_is_rejected(self):
        packages, directory = self.prepare(archive([('lib/value.dart', b'first', tarfile.REGTYPE), ('lib/value.dart', b'second', tarfile.REGTYPE)]))
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_MEMBER'):
            cache.populate(packages, directory)


if __name__ == '__main__':
    unittest.main()

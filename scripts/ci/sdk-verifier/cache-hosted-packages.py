import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile
import urllib.parse
import urllib.request


def populate(packages, destination):
    cache = Path(destination)
    receipts = []
    for package in packages:
        name, version, digest = package['name'], package['version'], package['integrity']
        archive_path = cache / 'archives' / (digest + '.tar.gz')
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        if archive_path.exists():
            raw = archive_path.read_bytes()
        else:
            url = f'https://pub.dev/api/archives/{name}-{urllib.parse.quote(version, safe="")}.tar.gz'
            with urllib.request.urlopen(url, timeout=30) as response:
                if urllib.parse.urlparse(response.url).hostname != 'pub.dev':
                    raise ValueError('HOSTED_ARCHIVE_REDIRECT_REJECTED')
                raw = response.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError('HOSTED_ARCHIVE_INTEGRITY_MISMATCH:' + name)
        archive_path.write_bytes(raw)
        target = cache / 'hosted/pub.dev' / f'{name}-{version}'
        target.mkdir(parents=True, exist_ok=True)
        files, total, licenses = [], 0, []
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
            for count, member in enumerate(archive):
                path = PurePosixPath(member.name)
                if count >= 20000 or path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
                    raise ValueError('HOSTED_ARCHIVE_UNSAFE_MEMBER:' + name)
                if member.isdir():
                    (target / str(path)).mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    total += member.size
                    if member.size > 32 * 1024 * 1024 or total > 128 * 1024 * 1024:
                        raise ValueError('HOSTED_ARCHIVE_MEMBER_LIMIT:' + name)
                    data = archive.extractfile(member).read(member.size + 1)
                    if len(data) != member.size:
                        raise ValueError('HOSTED_ARCHIVE_MEMBER_SIZE:' + name)
                    file = target / str(path)
                    if file.exists():
                        raise ValueError('HOSTED_ARCHIVE_DUPLICATE_MEMBER:' + name)
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_bytes(data)
                    file.chmod(0o755 if member.mode & 0o111 else 0o644)
                    file_hash = hashlib.sha256(data).hexdigest()
                    files.append([str(path), file_hash])
                    if str(path).upper() in ('LICENSE', 'LICENSE.TXT', 'LICENSE.MD', 'COPYING'):
                        licenses.append({'path': str(path), 'sha256': file_hash})
                else:
                    raise ValueError('HOSTED_ARCHIVE_SPECIAL_MEMBER:' + name)
        hashes = cache / 'hosted-hashes/pub.dev'
        hashes.mkdir(parents=True, exist_ok=True)
        (hashes / f'{name}-{version}.sha256').write_text(digest)
        receipts.append({**package, 'fileCount': len(files), 'filesSha256': hashlib.sha256(json.dumps(sorted(files)).encode()).hexdigest(), 'licenseFiles': licenses})
    return receipts


if __name__ == '__main__':
    packages = json.loads(Path(sys.argv[1]).read_text())
    if not isinstance(packages, list) or len(packages) > 1000:
        raise ValueError('HOSTED_ARCHIVE_PACKAGE_LIMIT')
    Path(sys.argv[3]).write_text(json.dumps(populate(packages, sys.argv[2]), indent=2) + '\n')

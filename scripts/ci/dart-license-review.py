"""Resolve demonstrated native SPDX metadata failures by exact artifact and license hashes."""
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import urllib.parse
import urllib.request

EVIDENCE = {
    'file_selector_ios': ('0.5.3+6', '97269e5307a0ab813b1fa2430bada0a96e0afb74848417f8676f64ba5de0051c'),
    'file_selector_linux': ('0.9.4+1', 'da76400e7872ce7637ffdce12749ec24169c25f6195c28372208e65a24bcd2ab'),
    'file_selector_macos': ('0.9.5+1', 'd57c62362766b5e7ae739448650b66c6aab7a68ba7ecc65e04018652645ae0f4'),
    'file_selector_windows': ('0.9.3+6', 'fbefc5fb92c6d3cbe8d284a2cd971b593bb07d2cd6da8557b81a862250b4acec'),
    'matcher': ('0.12.18', '12956d0ad8390bbcc63ca2e1469c0619946ccb52809807067a7020d57e647aa6'),
    'test_api': ('0.7.9', '93167629bfc610f71560ab9312acdda4959de4df6fac7492c89ff0d3886f6636'),
    'test_core': ('0.6.15', '394f07d21f0f2255ec9e3989f21e54d3c7dc0e6e9dbce160e5a9c1a6be0e2943'),
}
LICENSE_SHA256 = '420f7739f169097f0aad1242045169cd643c8f1d94e62866fad265ae4c369b7d'
LICENSE_SHA256_BY_PACKAGE = {
    'matcher': '3c32b53167c7dae9190c38dab5dd9fe1789c53623ebc7d1babcb29914c5b3f16',
    'test_api': 'ff1b9f0df9036c04be424b1e3ce12789bea880ad5ffc3a48e069ae2d40a087a4',
    'test_core': 'ff1b9f0df9036c04be424b1e3ce12789bea880ad5ffc3a48e069ae2d40a087a4',
}
DENIED = {'GPL-3.0', 'AGPL-3.0'}
MAX_ARCHIVE_BYTES = 5 * 1024 * 1024


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def eligible(change, expected):
    name = change['name']
    version, digest = EVIDENCE[name]
    require(change['ecosystem'].lower() == 'pub' and change['manifest'] == 'pubspec.lock', 'UNREVIEWED_MANIFEST')
    reviewed_metadata = change['license'] in ('bsd-3-clause', 'BSD-3-Clause') or (name == 'matcher' and change['license'] is None)
    require(change['version'] == version and reviewed_metadata, 'UNREVIEWED_VERSION_OR_LICENSE')
    require(urllib.parse.unquote(change['package_url']) == f'pkg:pub/{name}@{version}', 'UNEXPECTED_PACKAGE_URL')
    matches = [row for row in expected if row['ecosystem'] == 'pub' and row['name'] == name and row['version'] == version and row['manifest'] == 'pubspec.lock']
    require(len(matches) == 1 and matches[0].get('integrity') == digest, 'LOCK_INTEGRITY_MISMATCH')
    require('BSD-3-Clause' not in DENIED, 'LICENSE_POLICY_FAILURE')
    return version, digest


def verify_archive(raw, expected_digest, expected_license_digest=LICENSE_SHA256):
    require(len(raw) <= MAX_ARCHIVE_BYTES and hashlib.sha256(raw).hexdigest() == expected_digest, 'ARCHIVE_INTEGRITY_MISMATCH')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        licenses = []
        for count, member in enumerate(archive):
            require(count < 5000, 'ARCHIVE_MEMBER_LIMIT')
            if member.name == 'LICENSE':
                require(member.isfile() and member.size <= 65536, 'INVALID_LICENSE_MEMBER')
                licenses.append(archive.extractfile(member).read(65537))
        require(len(licenses) == 1, 'LICENSE_MISSING_OR_DUPLICATE')
    require(hashlib.sha256(licenses[0]).hexdigest() == expected_license_digest, 'UNREVIEWED_LICENSE_TEXT')


def main():
    directory = Path('.artifacts/security-run-evidence')
    comparison = json.loads((directory / 'comparison.json').read_text())
    receipt = {'schemaVersion': 'lythaus-dart-license-resolution-v1', 'conclusion': 'failure', 'packages': [], 'nativeLimitationRun': '36337306887', 'deniedLicenses': sorted(DENIED)}
    try:
        require({value.strip() for value in os.environ.get('DENY_LICENSES', '').split(',')} == DENIED, 'LICENSE_POLICY_CHANGED_REVIEW_REQUIRED')
        require(comparison.get('nativeRequiredCoverage', comparison.get('coverage')) == 'COMPLETE', 'NATIVE_COVERAGE_REQUIRED')
        selected = [row for row in comparison['changes'] if row['change_type'] == 'added' and row['ecosystem'].lower() == 'pub' and row['name'] in EVIDENCE]
        for change in selected:
            version, digest = eligible(change, comparison['expected'])
            license_digest = LICENSE_SHA256_BY_PACKAGE.get(change['name'], LICENSE_SHA256)
            url = f"https://pub.dev/api/archives/{change['name']}-{urllib.parse.quote(version, safe='')}.tar.gz"
            with urllib.request.urlopen(url, timeout=30) as response:
                require(urllib.parse.urlparse(response.url).hostname == 'pub.dev', 'UNEXPECTED_ARCHIVE_HOST')
                verify_archive(response.read(MAX_ARCHIVE_BYTES + 1), digest, license_digest)
            receipt['packages'].append({'packageUrl': change['package_url'], 'archiveSha256': digest, 'licenseSha256': license_digest, 'resolvedLicense': 'BSD-3-Clause', 'source': url})
        receipt['conclusion'] = 'success'
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('resolved=' + ','.join(sorted({row['packageUrl'] for row in receipt['packages']})) + '\n')
    except Exception as error:
        receipt['reason'] = str(error)
        raise
    finally:
        (directory / 'licenses.json').write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    main()

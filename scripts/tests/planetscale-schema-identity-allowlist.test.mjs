import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalReleaseSchemaContract, canonicalSchemaIdentityForVersion } from '../ci/product-integrity-schema-contract.mjs';
import { isDatabaseSchemaIdentityAllowed, parseDatabaseSchemaIdentityAllowlist } from '../../packages/db/src/identity-schema-policy.ts';

const historical3880Identity = {
  sourceSha: '3880a8be4c89459dd7ef831c9385817a887511ef',
  schemaVersion: '0020_auth_recovery_delivery.sql',
  schemaFingerprint: 'd60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0',
  relationCount: 103,
};

test('captured 3880 identity matches the committed 0020 contract tuple', () => {
  const canonical = canonicalSchemaIdentityForVersion(historical3880Identity.schemaVersion, { committedOnly: true });
  assert.deepEqual({
    schemaVersion: canonical.schemaVersion,
    schemaFingerprint: canonical.fingerprint,
    relationCount: canonical.relationCount,
  }, {
    schemaVersion: historical3880Identity.schemaVersion,
    schemaFingerprint: historical3880Identity.schemaFingerprint,
    relationCount: historical3880Identity.relationCount,
  });
  assert.match(historical3880Identity.sourceSha, /^[0-9a-f]{40}$/);
});

test('exact tuple allowlist admits only canonical 0020 and 0021 schema identities', () => {
  const identity0020 = canonicalSchemaIdentityForVersion('0020_auth_recovery_delivery.sql');
  const identity0021 = canonicalSchemaIdentityForVersion('0021_media_quarantine_cleanup.sql');
  const allowlist = parseDatabaseSchemaIdentityAllowlist(JSON.stringify([
    { schemaVersion: identity0020.schemaVersion, schemaFingerprint: identity0020.fingerprint, relationCount: identity0020.relationCount },
    { schemaVersion: identity0021.schemaVersion, schemaFingerprint: identity0021.fingerprint, relationCount: identity0021.relationCount },
  ]));
  assert.equal(allowlist.configured, true);
  assert.equal(allowlist.valid, true);
  for (const identity of [identity0020, identity0021]) {
    assert.equal(isDatabaseSchemaIdentityAllowed({
      schemaVersion: identity.schemaVersion,
      schemaFingerprint: identity.fingerprint,
      relationCount: identity.relationCount,
    }, {
      schemaVersion: identity0021.schemaVersion,
      schemaFingerprint: identity0021.fingerprint,
      relationCount: identity0021.relationCount,
      schemaIdentityAllowlist: allowlist,
    }), true);
  }
  assert.equal(isDatabaseSchemaIdentityAllowed({
    schemaVersion: identity0020.schemaVersion,
    schemaFingerprint: identity0021.fingerprint,
    relationCount: identity0020.relationCount,
  }, {
    schemaVersion: identity0021.schemaVersion,
    schemaFingerprint: identity0021.fingerprint,
    relationCount: identity0021.relationCount,
    schemaIdentityAllowlist: allowlist,
  }), false);
  const release = canonicalReleaseSchemaContract();
  assert.deepEqual({ fingerprint: identity0021.fingerprint, relationCount: identity0021.relationCount }, {
    fingerprint: release.fingerprint,
    relationCount: release.relationCount,
  });
});

test('invalid configured allowlist fails closed and absent allowlist preserves exact singular behavior', () => {
  const identity0021 = canonicalSchemaIdentityForVersion('0021_media_quarantine_cleanup.sql');
  const actual = {
    schemaVersion: identity0021.schemaVersion,
    schemaFingerprint: identity0021.fingerprint,
    relationCount: identity0021.relationCount,
  };
  const expected = { ...actual };
  assert.equal(isDatabaseSchemaIdentityAllowed(actual, expected), true);
  assert.equal(isDatabaseSchemaIdentityAllowed({ ...actual, relationCount: actual.relationCount + 1 }, expected), false);

  const invalid = parseDatabaseSchemaIdentityAllowlist('{"schemaVersion":"0020_auth_recovery_delivery.sql"}');
  assert.deepEqual(invalid, { configured: true, valid: false, identities: [] });
  assert.equal(isDatabaseSchemaIdentityAllowed(actual, { ...expected, schemaIdentityAllowlist: invalid }), false);
});

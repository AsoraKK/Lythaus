import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'pg-connection-string';
import { privacyPostgresTarget } from './privacy-postgres-target.mjs';

const local = 'postgresql://fixture@127.0.0.1:5432/lythaus_auth_test_guard';

test('privacy target guard preserves approved loopback targets and sslmode=disable', () => {
  for (const value of [local, local + '?sslmode=disable', local.replace('127.0.0.1', 'localhost')]) {
    const target = privacyPostgresTarget(value);
    assert.equal(parse(target.toString()).host, target.hostname);
    assert.equal(parse(target.toString()).database, 'lythaus_auth_test_guard');
  }
});

test('locked parser host override is rejected before any connection, along with other target overrides', () => {
  const hostile = local + '?host=unapproved.invalid';
  assert.equal(new URL(hostile).hostname, '127.0.0.1');
  assert.equal(parse(hostile).host, 'unapproved.invalid');
  for (const suffix of ['host=unapproved.invalid', 'port=6432', 'database=other', 'user=other',
    'password=other', 'options=other', 'sslmode=disable&host=unapproved.invalid', 'sslmode=disable&sslmode=disable']) {
    assert.throws(() => privacyPostgresTarget(local + '?' + suffix), /privacy_fixture_target_invalid/);
  }
});

test('privacy target guard rejects malformed URLs, schemes, hosts, database paths, hashes and SSL overrides', () => {
  for (const value of [undefined, null, '', 'not a URL', 'postgresql://localhost:99999/lythaus_auth_test_guard',
    local.replace('postgresql:', 'https:'), local.replace('postgresql:', 'postgres:'),
    local.replace('127.0.0.1', 'unapproved.invalid'), local.replace('lythaus_auth_test_guard', 'other'),
    local + '/other', local + '#private', local + '?sslmode=require']) {
    assert.throws(() => privacyPostgresTarget(value), /privacy_fixture_target_invalid/);
  }
});

test('the postgres database is accepted only for the existing disposable CI service', () => {
  const previous = process.env.GITHUB_ACTIONS;
  try {
    delete process.env.GITHUB_ACTIONS;
    assert.throws(() => privacyPostgresTarget(local.replace('lythaus_auth_test_guard', 'postgres')), /privacy_fixture_target_invalid/);
    process.env.GITHUB_ACTIONS = 'true';
    assert.equal(privacyPostgresTarget(local.replace('lythaus_auth_test_guard', 'postgres')).pathname, '/postgres');
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

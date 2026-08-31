import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { encryptField } from '@lythaus/security';
import { decryptTransactionalEmailEnvelope } from '../src/transactional-email-runtime.ts';

test('Jobs decrypts only a purpose-scoped transactional delivery envelope', async () => {
  const key = randomBytes(32).toString('base64');
  const envelope = await encryptField(JSON.stringify({
    to: 'non-pii-fixture@example.invalid',
    token: 'fixture-token',
    acceptanceContext: 'fixture-context',
  }), key, 'v1');
  assert.deepEqual(await decryptTransactionalEmailEnvelope(envelope, key), {
    to: 'non-pii-fixture@example.invalid',
    token: 'fixture-token',
    acceptanceContext: 'fixture-context',
  });
  await assert.rejects(() => decryptTransactionalEmailEnvelope(envelope, randomBytes(32).toString('base64')));
});

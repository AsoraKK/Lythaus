import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
const migration = fs.readFileSync(path.resolve(root, '../../database/planetscale/migrations/0013_marketing_waitlist.sql'), 'utf8');

test('waitlist persistence is encrypted, parameterised, and duplicate neutral', () => {
  assert.match(worker, /hmacLookup\(submission\.email, secrets\.hmacKey\)/);
  assert.match(worker, /encryptField\(submission\.email, secrets\.encryptionKey, 'v1'\)/);
  assert.match(worker, /INSERT INTO marketing\.waitlist_signups[\s\S]+VALUES \(\$1, decode\(\$2, 'base64'\), convert_to\(\$3, 'utf8'\), \$4, 'waiting', \$5, \$6\)/);
  assert.match(worker, /ON CONFLICT DO NOTHING/);
  assert.match(worker, /\{ ok: true, status: 'waitlisted' \}[\s\S]+status: 200/);
  assert.doesNotMatch(migration, /plain_email|raw_ip|ip_address|user_agent|turnstile_token/i);
});

test('waitlist abuse controls and logs contain no submitted PII or token', () => {
  assert.match(worker, /hmacLookup\(`waitlist:\$\{abuseSubject\}`, hmacKey\)/);
  assert.match(worker, /request_count < 5/);
  const successLog = worker.match(/logEvent\(\{[\s\S]*?marketing\.waitlist_signup_processed[\s\S]*?\}\);/)?.[0] ?? '';
  assert.ok(successLog);
  assert.doesNotMatch(successLog, /email|token|subjectHash|cf-connecting-ip/i);
});

test('waitlist route remains public-write-only and no-store', () => {
  assert.match(worker, /url\.pathname === '\/api\/waitlist'/);
  assert.match(worker, /request\.method === 'POST'/);
  assert.match(worker, /url\.pathname === '\/api\/waitlist'\) throw new Error\('method_not_allowed'\)/);
  assert.match(worker, /'cache-control': 'no-store'/);
  assert.doesNotMatch(worker, /SELECT[\s\S]{0,120}marketing\.waitlist_signups/i);
});

import { query, type HyperdriveBinding } from '@lythaus/db';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { idempotencyKey } from './auth-runtime-policy.ts';

export async function idempotentAuthIntake(input: {
  request: Request;
  payload: { mode?: unknown; email?: unknown; password?: unknown };
  scope: string;
  candidateVersion: string;
  key: string;
  database: HyperdriveBinding;
  work: () => Promise<Response>;
}, runQuery: typeof query = query): Promise<Response> {
  const key = idempotencyKey(input.request.headers.get('idempotency-key'));
  if (!key) return input.work();
  if (!input.key) throw new Error('authentication_not_configured');
  const encoded = new TextEncoder();
  const digest = hmac(sha256, encoded.encode(input.key), encoded.encode(JSON.stringify({
    policy: 'auth-intake-v1', scope: input.scope, candidateVersion: input.candidateVersion,
    acceptanceRun: input.request.headers.get('x-lythaus-acceptance-run-id'), email: input.payload.email,
    mode: input.payload.mode, password: input.payload.password,
  })));
  const requestHash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  const scope = `auth-intake:${input.scope}`;
  const inserted = await runQuery(input.database,
    `INSERT INTO system.idempotency_keys(scope,key,response) VALUES($1,$2,$3::jsonb)
     ON CONFLICT(scope,key) DO NOTHING RETURNING key`, [scope, key, JSON.stringify({ state:'processing',requestHash })]);
  if (inserted.rowCount !== 1) {
    const previous = (await runQuery<{ response: { state: string; requestHash: string; correlationId?: string }; recent: boolean }>(input.database,
      `SELECT response,created_at>now()-interval '24 hours' AS recent FROM system.idempotency_keys WHERE scope=$1 AND key=$2`, [scope,key])).rows[0];
    if (!previous || previous.response.requestHash !== requestHash || !previous.recent) throw new Error('idempotency_key_conflict');
    if (previous.response.state !== 'completed') throw new Error('idempotency_outcome_unknown');
    return Response.json({
      state: input.scope === 'password_reset' ? 'reset_if_eligible' : 'verification_required',
      ...(input.scope === 'password_reset' && previous.response.correlationId ? { correlationId: previous.response.correlationId } : {}),
    }, {
      status:202, headers:{'cache-control':'private, no-store'},
    });
  }
  try {
    const response = await input.work();
    if (response.status !== 202) throw new Error('auth_intake_response_invalid');
    const correlation = input.scope === 'password_reset' ? (await response.clone().json() as { correlationId?: string }).correlationId : undefined;
    const reference = typeof correlation === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(correlation) ? correlation : undefined;
    await runQuery(input.database,
      `UPDATE system.idempotency_keys SET response=$3::jsonb WHERE scope=$1 AND key=$2`,
      [scope,key,JSON.stringify({ state:'completed',requestHash, ...(reference ? { correlationId: reference } : {}) })]);
    return response;
  } catch (error) {
    await runQuery(input.database,
      `UPDATE system.idempotency_keys SET response=$3::jsonb WHERE scope=$1 AND key=$2`,
      [scope,key,JSON.stringify({ state:'outcome_unknown',requestHash })]).catch(() => undefined);
    throw error;
  }
}

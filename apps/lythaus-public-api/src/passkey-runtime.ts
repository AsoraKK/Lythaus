import type { DatabaseClient } from '@lythaus/db';
import { REPUTATION_POLICY } from '@lythaus/contracts';
import { randomToken, uuidv7, verifyLoginPassword, type PasswordHash, type Principal } from '@lythaus/security';
import { authenticationOptions, passkeyConfiguration, passkeyDigest, passkeyEvidence, passkeyId, passkeyName,
  passkeyOrigin, registrationOptions, verifyPasskeyAuthentication, verifyPasskeyRegistration,
  type PasskeyEnvironment, type PasskeyConfiguration } from '../../../packages/security/src/passkeys.ts';
import { lockPasskeyAccount, lockPasskeyCredential, recordPasskeyEvidence, webAuthnCredential,
  type PasskeyAccount, type PasskeyChallenge, type PasskeyCredential } from '../../../packages/db/src/passkeys.ts';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { readBoundedJson } from './request-body-runtime.ts';

const BINDING_COOKIE = '__Host-lythaus_passkey';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PasskeyInput {
  password?: unknown;
  name?: unknown;
  challengeId?: unknown;
  credential?: AuthenticationResponseJSON | RegistrationResponseJSON;
}

export interface PasskeyDependencies {
  principal(request: Request): Promise<Principal>;
  rateLimit(request: Request, scope: string, limit: number, subject?: string): Promise<void>;
  transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
  query<T extends import('pg').QueryResultRow>(sql: string, values: unknown[]): Promise<import('pg').QueryResult<T>>;
  issueSession(client: DatabaseClient, account: PasskeyAccount): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;
  revokeSessions(client: DatabaseClient, userId: string): Promise<void>;
  sessionResponse(request: Request, tokens: { accessToken: string; refreshToken: string; expiresIn: number }): Response;
  response(request: Request, body: unknown, init?: ResponseInit): Response;
}

function cookieBinding(request: Request): string {
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${BINDING_COOKIE}=`));
  if (cookies.length !== 1 || !/^[a-f0-9]{64}$/.test(cookies[0].slice(BINDING_COOKIE.length + 1))) throw new Error('passkey_invalid');
  return cookies[0].slice(BINDING_COOKIE.length + 1);
}

async function sessionBinding(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('authentication_required');
  return passkeyDigest(`passkey-session:${token}`);
}

async function passwordProof(client: DatabaseClient, userId: string, password: unknown, pepper: string | undefined): Promise<void> {
  if (typeof password !== 'string' || password.length < 1 || password.length > 128 || !pepper) throw new Error('invalid_credentials');
  const result = await client.query<{ password_hash: PasswordHash }>(
    `SELECT password_hash FROM identity.email_credentials WHERE user_id = $1 AND verified_at IS NOT NULL`, [userId]);
  if (!result.rows[0] || !verifyLoginPassword(password, result.rows[0].password_hash, pepper)) throw new Error('invalid_credentials');
}

async function credentials(client: DatabaseClient, userId: string, rpId: string): Promise<PasskeyCredential[]> {
  const result = await client.query<PasskeyCredential>(
    `SELECT c.*, s.user_handle FROM identity.passkey_credentials c JOIN identity.passkey_subjects s USING (user_id, rp_id)
      WHERE c.user_id = $1 AND c.rp_id = $2 ORDER BY c.created_at`, [userId, rpId]);
  return result.rows;
}

async function challengeOptions(deps: PasskeyDependencies, request: Request, config: PasskeyConfiguration,
  input: PasskeyInput, purpose: PasskeyChallenge['purpose'], pepper?: string): Promise<Response> {
  const origin = passkeyOrigin(request, config);
  const owner = purpose === 'login' ? undefined : await deps.principal(request);
  if (owner) await deps.rateLimit(request, 'passkey:account', 6, owner.userId);
  const nonce = purpose === 'login' ? randomToken(32) : undefined;
  const binding = nonce ? await passkeyDigest(`passkey-login:${nonce}`) : await sessionBinding(request);
  const result = await deps.transaction(async client => {
    const account = owner ? await lockPasskeyAccount(client, owner.userId, owner) : undefined;
    if (purpose === 'register') await passwordProof(client, owner!.userId, input.password, pepper);
    const rows = owner ? await credentials(client, owner.userId, config.rpId) : [];
    if (purpose === 'register' && rows.filter(row => !row.revoked_at).length >= 10) throw new Error('passkey_limit_reached');
    if (purpose === 'maintenance' && !rows.some(row => !row.revoked_at)) throw new Error('passkey_invalid');
    let options;
    const name = purpose === 'register' ? passkeyName(input.name) : null;
    if (purpose === 'register') {
      const handle = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
      await client.query(`INSERT INTO identity.passkey_subjects (user_id, rp_id, user_handle) VALUES ($1, $2, $3) ON CONFLICT (user_id, rp_id) DO NOTHING`, [owner!.userId, config.rpId, handle]);
      const subject = await client.query<{ user_handle: string }>(`SELECT user_handle FROM identity.passkey_subjects WHERE user_id = $1 AND rp_id = $2`, [owner!.userId, config.rpId]);
      options = await registrationOptions(config, subject.rows[0].user_handle, rows.map(webAuthnCredential));
    } else options = await authenticationOptions(config, owner ? rows.filter(row => !row.revoked_at).map(webAuthnCredential) : undefined);
    const challengeId = uuidv7();
    await client.query(`INSERT INTO identity.passkey_challenges
      (id, user_id, token_version, purpose, challenge, rp_id, origin, binding_hash, name, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '5 minutes')`,
    [challengeId, owner?.userId ?? null, account?.tokenVersion ?? null, purpose, options.challenge, config.rpId, origin, binding, name]);
    return { challengeId, options };
  });
  return deps.response(request, result, nonce ? { headers: { 'set-cookie': `${BINDING_COOKIE}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300` } } : undefined);
}

async function consumeChallenge(deps: PasskeyDependencies, request: Request, input: PasskeyInput,
  purpose: PasskeyChallenge['purpose'], config: PasskeyConfiguration, owner?: Principal): Promise<PasskeyChallenge> {
  if (typeof input.challengeId !== 'string' || !UUID.test(input.challengeId) || !input.credential) throw new Error('passkey_invalid');
  const binding = purpose === 'login' ? await passkeyDigest(`passkey-login:${cookieBinding(request)}`) : await sessionBinding(request);
  const result = await deps.query<PasskeyChallenge>(
    `UPDATE identity.passkey_challenges SET consumed_at = now()
      WHERE id = $1 AND purpose = $2 AND rp_id = $3 AND origin = $4 AND binding_hash = $5
        AND user_id IS NOT DISTINCT FROM $6::uuid AND consumed_at IS NULL AND expires_at > now()
      RETURNING *`, [input.challengeId, purpose, config.rpId, passkeyOrigin(request, config), binding, owner?.userId ?? null]);
  if (!result.rows[0]) throw new Error('passkey_invalid');
  return result.rows[0];
}

async function verifyCeremony(deps: PasskeyDependencies, request: Request, config: PasskeyConfiguration,
  input: PasskeyInput, purpose: PasskeyChallenge['purpose']): Promise<Response> {
  const owner = purpose === 'login' ? undefined : await deps.principal(request);
  if (owner) await deps.rateLimit(request, 'passkey:account', 6, owner.userId);
  const challenge = await consumeChallenge(deps, request, input, purpose, config, owner);
  const result = await deps.transaction(async client => {
    if (purpose === 'register') {
      const account = await lockPasskeyAccount(client, owner!.userId, owner);
      if (account.tokenVersion !== challenge.token_version) throw new Error('passkey_invalid');
      const rows = await credentials(client, owner!.userId, config.rpId);
      if (rows.filter(row => !row.revoked_at).length >= 10) throw new Error('passkey_limit_reached');
      const verified = await verifyPasskeyRegistration(input.credential as RegistrationResponseJSON, challenge.challenge, challenge.origin, config.rpId);
      const duplicate = await client.query(`SELECT id FROM identity.passkey_credentials WHERE rp_id = $1 AND credential_id = $2`, [config.rpId, verified.credential.id]);
      if (duplicate.rowCount !== 0) throw new Error('passkey_invalid');
      const id = uuidv7();
      await client.query(`INSERT INTO identity.passkey_credentials
        (id, user_id, rp_id, credential_id, public_key, sign_count, device_type, backed_up, transports, name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, owner!.userId, config.rpId, verified.credential.id, verified.credential.publicKey, verified.credential.counter,
        verified.credentialDeviceType, verified.credentialBackedUp, verified.credential.transports ?? [], challenge.name]);
      await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'passkey_enrolled', $3::jsonb)`,
        [uuidv7(), owner!.userId, JSON.stringify({ credentialId: id })]);
      await recordPasskeyEvidence(client, uuidv7(), owner!.userId, passkeyEvidence(owner!.userId, 'enrolled', new Date(), REPUTATION_POLICY.version));
      return { id, enrolled: true };
    }
    const credentialId = passkeyId(input.credential!.id);
    const lookup = await client.query<{ user_id: string }>(`SELECT user_id FROM identity.passkey_credentials WHERE credential_id = $1 AND rp_id = $2`, [credentialId, config.rpId]);
    const userId = owner?.userId ?? lookup.rows[0]?.user_id;
    if (!userId || lookup.rows[0]?.user_id !== userId) throw new Error('passkey_invalid');
    const account = await lockPasskeyAccount(client, userId, owner);
    if (owner && account.tokenVersion !== challenge.token_version) throw new Error('passkey_invalid');
    const row = await lockPasskeyCredential(client, credentialId, config.rpId, userId);
    const verified = await verifyPasskeyAuthentication({ response: input.credential as AuthenticationResponseJSON,
      challenge: challenge.challenge, origin: challenge.origin, rpId: config.rpId,
      userHandle: row.user_handle, credential: webAuthnCredential(row), deviceType: row.device_type,
      requireUserHandle: purpose === 'login' });
    await client.query(`UPDATE identity.passkey_credentials SET sign_count = greatest(sign_count, $2), backed_up = $3,
      last_used_at = now(), last_verified_at = now() WHERE id = $1`, [row.id, verified.newCounter, verified.credentialBackedUp]);
    if (purpose === 'maintenance') {
      const evidenceRecorded = await recordPasskeyEvidence(client, uuidv7(), userId, passkeyEvidence(userId, 'maintenance', new Date(), REPUTATION_POLICY.version));
      return { verified: true, evidenceRecorded, points: 0 };
    }
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'passkey_login', '{}'::jsonb)`, [uuidv7(), userId]);
    return { tokens: await deps.issueSession(client, account) };
  });
  if ('tokens' in result && result.tokens) {
    const response = deps.sessionResponse(request, result.tokens);
    response.headers.append('set-cookie', `${BINDING_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return response;
  }
  return deps.response(request, result);
}

async function manageCredential(env: PasskeyEnvironment & { AUTH_PASSWORD_PEPPER_V1?: string },
  deps: PasskeyDependencies, request: Request, config: PasskeyConfiguration, input: PasskeyInput,
  credentialId: string, revoke: boolean): Promise<Response> {
    if (!UUID.test(credentialId)) throw new Error('method_not_allowed');
    const owner = await deps.principal(request);
    await deps.rateLimit(request, 'passkey:account', 6, owner.userId);
    return deps.transaction(async client => {
      await lockPasskeyAccount(client, owner.userId, owner);
      if (revoke) await passwordProof(client, owner.userId, input.password, env.AUTH_PASSWORD_PEPPER_V1);
      const result = await client.query(`UPDATE identity.passkey_credentials SET
        name = CASE WHEN $4 THEN name ELSE $5 END, revoked_at = CASE WHEN $4 THEN now() ELSE revoked_at END
        WHERE id = $1 AND user_id = $2 AND rp_id = $3 AND revoked_at IS NULL RETURNING id`,
      [credentialId, owner.userId, config.rpId, revoke, revoke ? null : passkeyName(input.name)]);
      if (result.rowCount !== 1) throw new Error('passkey_invalid');
      if (revoke) await deps.revokeSessions(client, owner.userId);
      await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, $3, $4::jsonb)`,
        [uuidv7(), owner.userId, revoke ? 'passkey_revoked' : 'passkey_renamed', JSON.stringify({ credentialId })]);
      return deps.response(request, { id: credentialId, revoked: revoke, ...(revoke ? { sessionRevocation: 'all' } : {}) });
    });
}

export function createPasskeyHandler(env: PasskeyEnvironment & { AUTH_PASSWORD_PEPPER_V1?: string }, deps: PasskeyDependencies) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/auth/passkeys')) return undefined;
    if (url.pathname === '/api/auth/passkeys/capabilities' && request.method === 'GET') {
      if (env.PASSKEYS_ENABLED !== 'true') return deps.response(request, { enabled: false });
      passkeyOrigin(request, passkeyConfiguration(env));
      return deps.response(request, { enabled: true });
    }
    const config = passkeyConfiguration(env);
    passkeyOrigin(request, config);
    await deps.rateLimit(request, 'passkey:request', 12);
    if (url.pathname === '/api/auth/passkeys/credentials' && request.method === 'GET') {
      const owner = await deps.principal(request);
      const result = await deps.query(`SELECT id, name, device_type AS "deviceType", backed_up AS "backedUp",
        created_at AS "createdAt", last_used_at AS "lastUsedAt", last_verified_at AS "lastVerifiedAt"
        FROM identity.passkey_credentials WHERE user_id = $1 AND rp_id = $2 AND revoked_at IS NULL ORDER BY created_at`, [owner.userId, config.rpId]);
      return deps.response(request, { credentials: result.rows });
    }
    if (!['POST', 'PATCH'].includes(request.method)) throw new Error('method_not_allowed');
    const input = await readBoundedJson<PasskeyInput>(request, 32_768);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_json');
    const ceremony = url.pathname.match(/^\/api\/auth\/passkeys\/(register|login|maintenance)\/(options|verify)$/);
    if (ceremony && request.method === 'POST') {
      const purpose = ceremony[1] as PasskeyChallenge['purpose'];
      return ceremony[2] === 'options'
        ? challengeOptions(deps, request, config, input, purpose, env.AUTH_PASSWORD_PEPPER_V1)
        : verifyCeremony(deps, request, config, input, purpose);
    }
    const renameRoute = url.pathname.match(/^\/api\/auth\/passkeys\/credentials\/([^/]+)$/);
    if (renameRoute && request.method === 'PATCH') return manageCredential(env, deps, request, config, input, renameRoute[1], false);
    const revokeRoute = url.pathname.match(/^\/api\/auth\/passkeys\/credentials\/([^/]+)\/revoke$/);
    if (revokeRoute && request.method === 'POST') return manageCredential(env, deps, request, config, input, revokeRoute[1], true);
    throw new Error('method_not_allowed');
  };
}

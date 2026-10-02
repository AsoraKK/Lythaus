import { transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { accountSupportSnapshot, supportUuid } from '@lythaus/contracts';
import { hmacLookup } from '@lythaus/security';
import { readBoundedJson } from './request-body-runtime.ts';
import { normalizeEmailAddress } from './auth-runtime-policy.ts';

export async function handleAccountSupportLookup(request: Request, env: EnvBindings, runTransaction = transaction): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/keeper-account-support/lookup') return new Response(null, { status: 404, headers });
  const respond = (value: Record<string, unknown>, status = 200) => new Response(JSON.stringify({ ...value, workerVersion: env.WORKER_VERSION?.id }), { status, headers });
  try {
    if (!env.DB_APP_FRESH || !env.PII_HMAC_KEY_V1 || !supportUuid(env.WORKER_VERSION?.id)) throw new Error('account_support_unavailable');
    const input = await readBoundedJson<Record<string, unknown>>(request, 4096);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['actorId', 'email'].includes(key))
      || !supportUuid(input.actorId)) throw new Error('account_support_unavailable');
    const email = normalizeEmailAddress(input.email);
    const result = await runTransaction(env.DB_APP_FRESH as HyperdriveBinding, async client => {
      const membership = await client.query(`SELECT a.user_id FROM identity.admin_memberships a
        JOIN identity.users u ON u.id = a.user_id
        WHERE a.user_id = $1 AND a.role = 'owner' AND a.active = true AND u.status = 'active'`, [input.actorId]);
      if (membership.rowCount !== 1) throw new Error('account_support_owner_required');
      const records = await client.query(`SELECT u.id, u.status, u.created_at, u.updated_at, u.deleted_at,
          CASE WHEN c.user_id IS NOT NULL THEN c.verified_at ELSE e.verified_at END AS verified_at,
          CASE WHEN e.verified_at IS NOT NULL AND (c.user_id IS NULL OR c.email_lookup_hmac = e.email_lookup_hmac) THEN 'verified'
               WHEN c.verified_at IS NOT NULL THEN 'credential_setup_required' ELSE 'pending_verification' END AS verification_state,
          (SELECT max(event.created_at) FROM identity.account_events event
            WHERE event.user_id = u.id AND event.event_type = 'email_login') AS last_sign_in_at,
          (SELECT count(*)::integer FROM identity.auth_sessions session
            JOIN identity.refresh_token_families family ON family.id = session.refresh_family_id
            WHERE session.user_id = u.id AND session.revoked_at IS NULL AND family.revoked_at IS NULL
              AND session.expires_at > now()) AS active_session_count,
          COALESCE(entitlement.subscription_tier, 'free') AS subscription_tier
        FROM identity.users u
        LEFT JOIN identity.contact_emails c ON c.user_id = u.id
        LEFT JOIN identity.email_credentials e ON e.user_id = u.id
        LEFT JOIN identity.user_entitlements entitlement ON entitlement.user_id = u.id
        WHERE c.email_lookup_hmac = decode($1, 'base64')
          OR (c.user_id IS NULL AND e.email_lookup_hmac = decode($1, 'base64'))
        ORDER BY u.id LIMIT 2`, [hmacLookup(email, env.PII_HMAC_KEY_V1!)]);
      if (records.rows.length > 1) return { state: 'ambiguous', account: null };
      const row = records.rows[0];
      if (!row) return { state: 'not_found', account: null };
      const iso = (time: unknown): string | null => time === null ? null : new Date(time as string | Date).toISOString();
      return { state: 'found', account: accountSupportSnapshot({
        id: row.id, status: row.status, verificationState: row.verification_state, verifiedAt: iso(row.verified_at),
        createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), deletedAt: iso(row.deleted_at),
        lastSignInAt: iso(row.last_sign_in_at), activeSessionCount: row.active_session_count, subscriptionTier: row.subscription_tier,
      }) };
    });
    return respond({ result });
  } catch (error) {
    const code = error instanceof Error && error.message === 'account_support_owner_required' ? error.message : 'account_support_unavailable';
    return respond({ error: code }, code === 'account_support_owner_required' ? 403 : 503);
  }
}

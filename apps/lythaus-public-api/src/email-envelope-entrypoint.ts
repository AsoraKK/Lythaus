import type { EnvBindings } from '@lythaus/cloudflare-env';
import { enqueueTransactionalEmailIntent, transaction } from '@lythaus/db';
import { publishCommittedEmailDispatch } from './auth-email-dispatch-queue.ts';
import { decryptField, encryptField, hashAuthToken, hashPassword, hmacLookup, randomToken, uuidv7 } from '@lythaus/security';
import { readBoundedJson } from './request-body-runtime.ts';
import { normalizeEmailAddress } from './auth-runtime-policy.ts';
import { claimRegistrationAddress, lockRecoveryAccount, recoveryPlan } from './auth-recovery-policy.ts';
import { handleAccountSupportLookup } from './account-support-entrypoint.ts';

/** Private Admin service capability. Never attached to the public router. */
export async function handleEmailEnvelope(request: Request, env: EnvBindings, runTransaction = transaction): Promise<Response> {
  if (new URL(request.url).pathname === '/keeper-account-support/lookup') return handleAccountSupportLookup(request, env, runTransaction);
  const headers = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/keeper-email') return new Response(null, { status: 404, headers });
  const respond = (value: Record<string, unknown>, status = 200) => new Response(JSON.stringify({ ...value, workerVersion: env.WORKER_VERSION?.id }), { status, headers });
  const piiKey = env.PII_ENCRYPTION_KEY_V1, lookupKey = env.PII_HMAC_KEY_V1, deliveryKey = env.TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1;
  if (!env.DB_APP_FRESH || !piiKey || !lookupKey || !deliveryKey || !env.AUTH_PASSWORD_PEPPER_V1 || !env.WORKER_VERSION?.id) return respond({ error: 'auth_email_dispatch_unavailable' }, 503);
  try {
    const input = await readBoundedJson<Record<string, unknown>>(request, 4096);
    if (input.operation === 'probe' && Object.keys(input).length === 1) return respond({ result: { bindingVerified: true } });
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (!['invite', 'resend'].includes(String(input.operation))
      || Object.keys(input).some(key => !['operation','actorId','correlationId','reasonCode','email','displayName','handle','userId'].includes(key))
      || typeof input.actorId !== 'string' || !uuid.test(input.actorId)
      || typeof input.correlationId !== 'string' || !uuid.test(input.correlationId)
      || typeof input.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(input.reasonCode)) throw new Error('invalid_request');
    const email = input.operation === 'invite' ? normalizeEmailAddress(input.email) : undefined;
    if (input.operation === 'resend' && (typeof input.userId !== 'string' || !uuid.test(input.userId))) throw new Error('invalid_request');
    if (input.displayName !== undefined && (typeof input.displayName !== 'string' || input.displayName.length > 80)) throw new Error('invalid_request');
    if (input.handle !== undefined && (typeof input.handle !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(input.handle))) throw new Error('invalid_request');
    let outboxId: string | undefined;
    const result = await runTransaction(env.DB_APP_FRESH, async client => {
      const member = await client.query(`SELECT a.user_id FROM identity.admin_memberships a JOIN identity.users u ON u.id=a.user_id
        WHERE a.user_id=$1 AND a.active=true AND a.role IN ('administrator','owner') AND u.status='active'`, [input.actorId]);
      if (member.rowCount !== 1) throw new Error('admin_role_required');
      const userId = email ? uuidv7() : String(input.userId);
      let recipient = email;
      if (email) {
        const lookup = hmacLookup(email, lookupKey);
        if (!await claimRegistrationAddress(client, lookup)) throw new Error('user_email_exists');
        const encrypted = await encryptField(email, piiKey, 'v1');
        const passwordHash = hashPassword(randomToken(32), env.AUTH_PASSWORD_PEPPER_V1!, { pepperVersion: 'v1', fallbackToScrypt: env.PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK === 'true' });
        await client.query("INSERT INTO identity.users(id,status,display_name) VALUES($1,'relink_required',$2)", [userId, input.displayName ?? '']);
        if (input.handle) await client.query('INSERT INTO identity.handles(user_id,handle,handle_normalized) VALUES($1,$2,lower($2))', [userId,input.handle]);
        await client.query(`INSERT INTO identity.email_credentials(user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash)
          VALUES($1,convert_to($2,'utf8'),decode($3,'base64'),'v1','v1',$4::jsonb)`, [userId,encrypted.ciphertext,lookup,JSON.stringify(passwordHash)]);
        await client.query(`INSERT INTO identity.contact_emails(user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,source_provider)
          VALUES($1,convert_to($2,'utf8'),decode($3,'base64'),'v1','email')`, [userId,encrypted.ciphertext,lookup]);
      } else {
        const account = await lockRecoveryAccount(client, userId);
        if (!account) throw new Error('user_not_found');
        if (account.credential_verified && account.status === 'active') throw new Error('email_already_verified');
        if (recoveryPlan(account) !== 'credential_setup') throw new Error('invalid_account_status');
        recipient = normalizeEmailAddress(await decryptField({ ciphertext: account.contact_ciphertext!, encryptionKeyVersion: account.contact_key_version! }, piiKey));
        if (hmacLookup(recipient, lookupKey) !== account.contact_lookup) throw new Error('auth_email_dispatch_unavailable');
        const recent = await client.query(`SELECT id FROM identity.email_verification_tokens WHERE user_id=$1 AND consumed_at IS NULL
          AND superseded_at IS NULL AND expires_at>now() AND created_at>now()-interval '30 seconds'`, [userId]);
        if (recent.rowCount) return { userId, deliveryState: 'cooldown' };
      }
      const token = randomToken(32), challengeId = uuidv7();
      await client.query('UPDATE identity.email_verification_tokens SET superseded_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND superseded_at IS NULL', [userId]);
      await client.query(`UPDATE system.transactional_email_outbox SET state='cancelled',terminal_at=now(),updated_at=now(),delivery_envelope_ciphertext=NULL,delivery_envelope_encryption_key_version=NULL
        WHERE user_id=$1 AND purpose IN ('invite','verification') AND state IN ('queued','processing','failed')`, [userId]);
      await client.query("INSERT INTO identity.email_verification_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,decode($3,'base64'),now()+interval '30 minutes')", [challengeId,userId,hashAuthToken(token,'verification')]);
      const envelope = await encryptField(JSON.stringify({ to: recipient, token }), deliveryKey, 'v1');
      outboxId = uuidv7();
      await enqueueTransactionalEmailIntent(client, { id:outboxId,userId,contactEmailUserId:userId,purpose:email?'invite':'verification',challengeId,templateVersion:'v1',deliveryEnvelopeCiphertext:envelope.ciphertext,deliveryEnvelopeEncryptionKeyVersion:'v1',correlationId:String(input.correlationId) });
      await client.query('INSERT INTO identity.account_events(id,user_id,actor_id,event_type,metadata) VALUES($1,$2,$3,$4,$5::jsonb)', [uuidv7(),userId,input.actorId,email?'account_invited':'email_verification_requested',JSON.stringify({ deliveryState:'queued',reasonCode:input.reasonCode })]);
      await client.query('INSERT INTO system.audit_events(id,action,reason_code,correlation_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)', [uuidv7(),email?'identity.account_invited':'identity.email_verification_resent',input.reasonCode,input.correlationId,JSON.stringify({ actorId:input.actorId,targetId:userId,deliveryState:'queued' })]);
      return { userId, deliveryState:'queued' };
    });
    if (result.deliveryState === 'queued') await publishCommittedEmailDispatch(env, outboxId);
    return respond({ result });
  } catch(error) {
    const code = error instanceof Error ? error.message : '';
    const exposed = ['user_email_exists','user_not_found','email_already_verified','invalid_account_status','admin_role_required'].includes(code);
    return respond({ error:exposed?code:'auth_email_dispatch_unavailable' }, exposed?409:503);
  }
}

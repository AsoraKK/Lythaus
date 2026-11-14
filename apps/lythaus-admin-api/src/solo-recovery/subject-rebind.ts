import { transactionWithVerifiedFailureCleanup, verifiedTransactionFailureCause, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import { assertAdminMutationRequest } from '../admin-cors-policy.ts';
import { readBoundedJson } from '../request-body-policy.ts';
import { verifiedHumanAccessIdentity } from './human-access.ts';
import { rebindRuntimeTarget, rebindSessionMatches } from './rebind-target.ts';
import { REBIND_POLICY_SETTING, parseRebindPolicy, rebindCommitment } from './rebind-protocol.ts';

export const SUBJECT_REBIND_PATH = '/api/admin/recovery/subject-rebind';
export const SUBJECT_REBIND_CONFIRMATION = 'MOVE EXISTING ADMINISTRATOR SIGN-IN';
export const REBIND_POLICY_SQL = `SELECT proconfig, prosecdef AS security_definer,
       proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) AS owned_by_caller
  FROM pg_catalog.pg_proc
 WHERE oid = to_regprocedure('identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)')`;
export const REBIND_MEMBERSHIP_SQL = `SELECT membership.user_id, membership.access_subject_hmac, membership.role,
       membership.active, membership.revoked_at, account.status AS principal_status, account.deleted_at,
       (SELECT count(*)::integer FROM identity.admin_memberships) AS membership_count,
       (SELECT count(*)::integer FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped') AS bootstrap_count,
       EXISTS (SELECT 1 FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped'
                AND actor_id = membership.user_id AND target_id = membership.user_id AND target_type = 'admin_membership'
                AND metadata = '{"createdCount":1,"role":"administrator","principalType":"control_plane"}'::jsonb) AS original_bootstrap
  FROM identity.admin_memberships AS membership JOIN identity.users AS account ON account.id = membership.user_id
 LIMIT 2`;

interface Env {
  WORKER_VERSION?: { id?: string; tag?: string };
  DB_ADMIN_FRESH: HyperdriveBinding;
  ACCESS_SUBJECT_HMAC_KEY?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  EXPECTED_HOSTNAMES?: string;
  CORS_ALLOWED_ORIGINS?: string;
}
type Runner = <T>(binding: HyperdriveBinding, work: (client: DatabaseClient) => Promise<T>) => Promise<T>;
interface Dependencies { run?: Runner; }
interface Membership {
  user_id: string; access_subject_hmac: Uint8Array; role: string; active: boolean; revoked_at: unknown;
  principal_status: string; deleted_at: unknown; membership_count: number; bootstrap_count: number; original_bootstrap: boolean;
}
function fail(): never { throw new Error('admin_subject_rebind_unavailable'); }
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/../g)!, pair => Number.parseInt(pair, 16));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
const live = (notBefore: number, expiresAt: number) => notBefore * 1000 <= Date.now() && Date.now() < expiresAt * 1000;

function response(body: unknown, status = 200, html = false, extra: Record<string, string> = {}): Response {
  return new Response(html ? String(body) : JSON.stringify(body), { status, headers: {
    'content-type': html ? 'text/html; charset=utf-8' : 'application/json',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer', 'vary': 'Cf-Access-Jwt-Assertion, Accept', ...extra,
  } });
}

export function rebindConfirmationPage(value: Record<string, unknown>, ready: boolean): Response {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  // All interpolated packet fields are generated UUIDs, lowercase hex, enums or
  // integers. Escape the serialized object anyway; no identity or SQL row is HTML.
  const packet = JSON.stringify(value, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const action = ready ? '<button id="confirm">Update sign-in</button>'
    : '<p>Give this review packet to your recovery operator, then check approval.</p><pre id="packet">' + packet + '</pre><button id="refresh">Check approval</button>';
  const expectation = JSON.stringify(value.reviewPacket ?? {}).replaceAll('<', '\\u003c');
  const script = `const expected=${expectation};const sameVersion=r=>r.headers.get('x-lythaus-source-sha')===expected.sourceSha&&r.headers.get('x-lythaus-worker-version')===expected.workerVersionId;const status=document.getElementById('status');const continueLink=document.getElementById('continue');async function checkAccess(){let authorized=false;try{const health=await fetch('/api/admin/health',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(!health.ok||!sameVersion(health)||(await health.json()).status!=='ok')throw new Error('unverified');continueLink.hidden=false;authorized=true;const read=await fetch('/api/admin/moderation/cases',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(read.ok&&sameVersion(read)&&(read.headers.get('content-type')||'').includes('application/json')&&Array.isArray((await read.json()).items)){status.textContent='Administrator access and the safe admin read are verified. Continue to the administrator panel.';}else{status.textContent='Administrator access is verified; the safe admin read did not complete. Ask your recovery operator to check it.';}}catch{status.textContent=authorized?'Administrator access is verified; the safe admin read did not complete. Ask your recovery operator to check it.':'The update outcome and administrator access could not be confirmed. Ask your recovery operator to check; no further update will be submitted.';}}const button=document.getElementById('confirm');if(button)button.onclick=async()=>{button.disabled=true;try{const result=await fetch(location.pathname,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({confirmation:'${SUBJECT_REBIND_CONFIRMATION}'})});status.textContent=result.ok?'Checking administrator access with a safe read.':'The update outcome is unconfirmed. Checking access without another update.';}catch{status.textContent='The connection was interrupted. Checking access without another update.';}await checkAccess();};const refresh=document.getElementById('refresh');if(refresh)refresh.onclick=()=>location.reload();`;
  return response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lythaus administrator sign-in</title><main><h1>Update administrator sign-in</h1><p>This keeps your existing administrator account and role.</p><p id="status">${ready ? 'Approval is ready. Confirm to use the identity you signed in with.' : 'The update is waiting for its specific approval.'}</p>${action}<a id="continue" href="/" hidden>Continue to the administrator panel</a></main><script nonce="${nonce}">${script}</script></html>`, 200, true, {
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
}

export async function handleSubjectRebind(request: Request, env: Env, deps: Dependencies = {}): Promise<Response> {
  const correlationId = uuidv7();
  let mutationAttempted = false;
  try {
    const url = new URL(request.url), method = request.method;
    if (url.origin !== 'https://admin.lythaus.co' || url.pathname !== SUBJECT_REBIND_PATH || url.search || url.hash
      || !['GET', 'POST'].includes(method) || !request.headers.has('cf-access-jwt-assertion')
      || request.headers.has('authorization')
      || !(env.EXPECTED_HOSTNAMES ?? '').split(',').map(value => value.trim()).includes(url.hostname)
      || !env.ACCESS_SUBJECT_HMAC_KEY || !env.WORKER_VERSION?.id || !env.WORKER_VERSION.tag
      || (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) fail();
    if (method === 'GET' && request.body !== null) fail();
    if (method === 'POST') {
      assertAdminMutationRequest(request, env.CORS_ALLOWED_ORIGINS);
      const body = await readBoundedJson<Record<string, unknown>>(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).join(',') !== 'confirmation' || body.confirmation !== SUBJECT_REBIND_CONFIRMATION) fail();
    }
    const outcome = await (deps.run ?? transactionWithVerifiedFailureCleanup)(env.DB_ADMIN_FRESH, async client => {
      if (method === 'GET') await client.query('SET TRANSACTION READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const metadata = await client.query<{ proconfig: unknown; security_definer: unknown; owned_by_caller: unknown }>(REBIND_POLICY_SQL);
      if (metadata.rowCount !== 1 || metadata.rows[0].security_definer !== true || metadata.rows[0].owned_by_caller !== false
        || !Array.isArray(metadata.rows[0].proconfig)) fail();
      const settings = (metadata.rows[0].proconfig as unknown[]).filter(value => typeof value === 'string' && value.startsWith(REBIND_POLICY_SETTING + '='));
      if (settings.length !== 1) fail();
      const policy = parseRebindPolicy((settings[0] as string).slice(REBIND_POLICY_SETTING.length + 1));
      if (!policy || !live(policy.notBefore, policy.expiresAt)
        || policy.sourceSha !== env.WORKER_VERSION!.tag || policy.workerVersionId !== env.WORKER_VERSION!.id
        || policy.accessIssuer !== `https://${env.ACCESS_TEAM_DOMAIN}`
        || policy.bindingProof.checkedAt * 1000 > Date.now()) fail();
      const target = await rebindRuntimeTarget(env.DB_ADMIN_FRESH.connectionString, policy);
      const identity = await verifiedHumanAccessIdentity(request, { ...env, ACCESS_RECOVERY_AUDIENCE: policy.accessAudience });
      const emailSha256 = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity.email.toLowerCase()))));
      if (emailSha256 !== policy.emailSha256) fail();
      const session = await client.query<{ database_name: unknown; current_role: unknown; session_role: unknown; read_only: unknown }>(
        `SELECT current_database() AS database_name, current_user AS current_role, session_user AS session_role,
                current_setting('transaction_read_only') AS read_only`);
      const row = session.rows[0];
      if (session.rowCount !== 1 || !(await rebindSessionMatches(row, policy, target))
        || row.read_only !== (method === 'GET' ? 'on' : 'off')) fail();
      const records = await client.query<Membership>(REBIND_MEMBERSHIP_SQL);
      const original = records.rows[0];
      if (records.rowCount !== 1 || records.rows.length !== 1 || original.membership_count !== 1 || original.bootstrap_count !== 1
        || !original.original_bootstrap || original.role !== 'administrator' || original.active !== true || original.revoked_at !== null
        || original.principal_status !== 'locked' || original.deleted_at !== null
        || !(original.access_subject_hmac instanceof Uint8Array) || original.access_subject_hmac.length !== 32) fail();
      const nextDigest = Uint8Array.from(atob(hmacLookup(identity.subject, env.ACCESS_SUBJECT_HMAC_KEY!)), character => character.charCodeAt(0));
      if (same(original.access_subject_hmac, nextDigest)) {
        return { status: 'already_bound', subjectBindingMatches: true, writePerformed: false, correlationId };
      }
      const nonceHex = policy.mode === 'execute' ? policy.nonceHex! : hex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = Math.min(policy.expiresAt, Math.floor(identity.expiresAt / 1000));
      const commitmentSha256 = await rebindCommitment({ principalId: original.user_id, previousDigest: original.access_subject_hmac,
        nextDigest, sourceSha: policy.sourceSha, workerVersionId: policy.workerVersionId, emailSha256, nonceHex, expiresAt });
      if (policy.mode === 'execute' && (expiresAt !== policy.expiresAt || commitmentSha256 !== policy.commitmentSha256)) fail();
      if (!live(policy.notBefore, expiresAt) || identity.expiresAt <= Date.now()) fail();
      if (method === 'GET') return {
        status: policy.mode === 'preview' ? 'preview_ready' : 'approved_ready', correlationId,
        databaseTransactionReadOnly: true, databaseTargetMatchesApprovedMain: true, approvedEmailMatchesVerifiedIdentity: true,
        subjectBindingMatches: false, existingRole: 'administrator',
        reviewPacket: { sourceSha: policy.sourceSha, workerVersionId: policy.workerVersionId, nonceHex, expiresAt, commitmentSha256 },
      };
      if (policy.mode !== 'execute') fail();
      mutationAttempted = true;
      const result = await client.query<{ changed: unknown }>(`SELECT identity.rebind_control_plane_administrator(
        $1::bytea,$2::text,$3::uuid,$4::text,$5::bytea,$6::bigint,$7::uuid,$8::text) AS changed`,
      [nextDigest, policy.sourceSha, policy.workerVersionId, emailSha256, unhex(nonceHex), expiresAt, uuidv7(), correlationId]);
      if (result.rowCount !== 1 || result.rows[0].changed !== true) fail();
      const after = await client.query<Membership>(REBIND_MEMBERSHIP_SQL);
      if (after.rowCount !== 1 || after.rows[0].user_id !== original.user_id || after.rows[0].role !== original.role
        || after.rows[0].active !== true || !same(after.rows[0].access_subject_hmac, nextDigest)
        || !live(policy.notBefore, expiresAt) || identity.expiresAt <= Date.now()) fail();
      return { status: 'rebound', existingPrincipalPreserved: true, existingRole: original.role, correlationId };
    });
    if (method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
      if (outcome.status === 'already_bound') return response('<!doctype html><html lang="en"><title>Lythaus administrator sign-in</title><p>This identity is already bound. <a href="/">Continue to the administrator panel</a>.</p></html>', 200, true,
        { 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      return rebindConfirmationPage(outcome, outcome.status === 'approved_ready');
    }
    return response(outcome);
  } catch (error) {
    // Never report SQL, a JWT, either digest, the key, raw identity or input data.
    if (mutationAttempted && !verifiedTransactionFailureCause(error)) {
      return response({ error: 'admin_subject_rebind_outcome_unknown',
        readOnlyReconciliationRequired: true, correlationId }, 409);
    }
    return response({ error: 'admin_subject_rebind_unavailable', correlationId }, 404);
  }
}

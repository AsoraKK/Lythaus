import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';
import { TARGET } from './lythaus-new-core-isolation-review.mjs';
import { adminDatabaseConnectionConfig, branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';

const api = `https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/`;
const idPattern = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
const allowedGet = /^(?:subscriptions|billable-usage|entitlements|access\/users\?per_page=100&page=(?:[1-9]|10)|mtls_certificates(?:\/(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}))?)$/i;
const definition = '69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e';
const grants = '65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513';
class Failure extends Error {}
const requireCheck = (value, code) => { if (!value) throw new Failure(code); };
const reason = (error, fallback) => error instanceof Failure ? error.message : fallback;
const createPg = async config => new (await import('pg')).default.Client(config);

async function loadReaders() {
  const directory = path.resolve('worker-source');
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio:['ignore','pipe','pipe'], encoding:'utf8' }).trim();
  requireCheck(git('rev-parse','HEAD') === TARGET.candidate && !git('status','--porcelain','--untracked-files=no'), 'fingerprint_source_unverified');
  return import(pathToFileURL(path.join(directory, 'scripts/ci/lythaus-new-core-clean-install.mjs')).href);
}

export function verifiedOriginIssuers(stream, host) {
  requireCheck(stream?.encrypted === true && stream.authorized === true, 'tls_unverified');
  const peer = stream.getPeerCertificate(true);
  requireCheck(peer?.raw && !tls.checkServerIdentity(host, peer), 'tls_hostname_unverified');
  const issuers = [];
  let node = peer, child = new X509Certificate(peer.raw);
  while (node?.issuerCertificate?.raw && issuers.length < 12) {
    const issuer = new X509Certificate(node.issuerCertificate.raw);
    if (issuer.fingerprint256 === child.fingerprint256) break;
    requireCheck(issuer.ca && child.checkIssued(issuer) && child.verify(issuer.publicKey)
      && !issuers.some(c => c.fingerprint256 === issuer.fingerprint256), 'tls_issuer_unverified');
    issuers.push(issuer);
    child = issuer;
    node = node.issuerCertificate;
  }
  const trust = (tls.getCACertificates?.('default') ?? tls.rootCertificates).map(pem => new X509Certificate(pem));
  const root = trust.find(cert => cert.ca && child.checkIssued(cert) && child.verify(cert.publicKey));
  if (root && root.fingerprint256 !== child.fingerprint256) issuers.push(root);
  requireCheck(issuers.length > 0, 'tls_issuer_unavailable');
  return issuers;
}

const boundarySql = `SELECT current_database()='postgres' AND current_user=session_user AND current_user=$1
    AND current_setting('server_version_num')::int / 10000=17 AS session_matches,
  current_setting('transaction_read_only')='on' AS read_only,
  rolcanlogin AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit)
    AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=r.oid) AS restricted_role,
  NOT has_database_privilege(current_database(),'CREATE')
    AND NOT EXISTS (SELECT FROM pg_namespace WHERE has_schema_privilege(oid,'CREATE'))
    AND NOT EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid
      AND deptype='o' AND (dbid=0 OR dbid=(SELECT oid FROM pg_database WHERE datname=current_database()))) AS ddl_denied,
  NOT has_any_column_privilege('identity.users','INSERT')
    AND NOT has_any_column_privilege('identity.admin_memberships','INSERT') AS direct_inserts_denied,
  has_schema_privilege('identity','USAGE') AND
    has_function_privilege('identity.bootstrap_first_administrator(uuid,bytea,uuid,text)','EXECUTE') AS bootstrap_execute,
  has_schema_privilege('system','USAGE') AND has_function_privilege('system.read_first_admin_bootstrap_state()','EXECUTE') AS verifier_execute
  FROM pg_roles r WHERE rolname=current_user`;

async function inspectDatabase(raw, role, deps) {
  const isAdmin = role === 'lythaus_admin';
  const report = { bindingAccessible:Boolean(raw), urlValid:false, targetMatches:false, roleMatches:false, connectionAttempted:false, authenticated:false,
    verifiedTls:false, readOnly:false, restrictedRole:false, ddlDenied:false, directIdentityInsertsDenied:false,
    functionBoundaryVerified:false, ...(isAdmin ? {} : { receiptFingerprintsMatch:false, bootstrapClean:false }), verified:false };
  let client, issuers;
  try {
    requireCheck(report.bindingAccessible, 'binding_inaccessible');
    let identity;
    try {
      identity = deps.parseTarget(raw);
      report.urlValid = Boolean(new URL(raw).password);
    } catch {}
    requireCheck(report.urlValid, 'url_invalid');
    report.targetMatches = identity.branchId === TARGET.branch && identity.originFingerprint === TARGET.origin
      && identity.origin.port === 5432 && identity.sqlDatabaseName === 'postgres';
    requireCheck(report.targetMatches, 'target_mismatch');
    report.roleMatches = identity.role === role;
    requireCheck(report.roleMatches, 'role_mismatch');
    if (isAdmin) requireCheck(deps.privateCredentialConfirmed === true, 'private_custody_unconfirmed');
    const config = adminDatabaseConnectionConfig(raw);
    client = await deps.createClient({ ...config, options:'-c default_transaction_read_only=on -c search_path=pg_catalog',
      statement_timeout:12000, connectionTimeoutMillis:10000, query_timeout:15000 });
    report.connectionAttempted = true;
    try { await client.connect(); }
    catch (error) { throw new Failure(['28P01','28000'].includes(error?.code) ? 'authentication_rejected' : 'connection_unavailable'); }
    issuers = deps.readIssuers(client.connection.stream, identity.origin.host);
    report.verifiedTls = true;
    const row = (await client.query(boundarySql, [role])).rows[0];
    report.authenticated = row?.session_matches === true;
    report.readOnly = row?.read_only === true;
    report.restrictedRole = row?.restricted_role === true;
    report.ddlDenied = row?.ddl_denied === true;
    report.directIdentityInsertsDenied = row?.direct_inserts_denied === true;
    report.functionBoundaryVerified = row?.bootstrap_execute === isAdmin && row?.verifier_execute === !isAdmin;
    requireCheck(report.authenticated && report.readOnly && report.restrictedRole && report.ddlDenied
      && report.directIdentityInsertsDenied && report.functionBoundaryVerified, 'database_boundary_mismatch');
    if (!isAdmin) {
      const readers = deps.fingerprintReaders ?? await loadReaders();
      const catalog = await readers.schemaDefinitionFingerprint(client);
      const acl = await readers.schemaGrantFingerprint(client);
      report.receiptFingerprintsMatch = catalog.sha256 === definition && acl.sha256 === grants;
      requireCheck(report.receiptFingerprintsMatch, 'schema_or_grants_changed');
      const state = await client.query(`SELECT membership_count=0 AND active_admin_membership_count=0
        AND active_non_admin_membership_count=0 AND bootstrap_latch_count=1 AND bootstrap_consumed=false
        AND completion_audit_count=0 AND bootstrap_control_plane_count=0 AND bootstrap_consumer_material_count=0 AS clean
        FROM system.read_first_admin_bootstrap_state()`);
      report.bootstrapClean = state.rows.length === 1 && state.rows[0].clean === true;
      requireCheck(report.bootstrapClean, 'bootstrap_state_changed');
    }
    report.verified = true;
    return { report, issuers };
  } catch (error) { return { report, error:reason(error,'database_read_unavailable') }; }
  finally { if (client) await client.end().catch(() => {}); }
}

function accountReader(token, fetchImpl) {
  return async route => {
    requireCheck(allowedGet.test(route), 'read_scope_blocked');
    const url = api + route;
    const res = await fetchImpl(url, { method:'GET', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15000),
      headers:{ authorization:`Bearer ${token}`, accept:'application/json' } });
    if (!res.ok || res.status !== 200 || res.redirected || res.url && res.url !== url) {
      await res.body?.cancel();
      throw new Failure([401,403].includes(res.status) ? 'read_denied' : 'read_unavailable');
    }
    let size = 0;
    const parts = [];
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      requireCheck(size <= 4*1024*1024, 'response_oversized');
      parts.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
    requireCheck(data?.success === true && Object.hasOwn(data, 'result'), 'response_invalid');
    return data;
  };
}

async function listSingle(get, route) {
  const { result, result_info:info } = await get(route);
  requireCheck(Array.isArray(result) && (info?.total_pages ?? 1) <= 1 && (info?.total_count ?? result.length) === result.length, 'inventory_incomplete');
  return result;
}

async function selectCa(get, issuers) {
  const records = await listSingle(get,'mtls_certificates');
  const matches = [];
  for (let cert of records) {
    requireCheck(typeof cert?.ca === 'boolean', 'certificate_inventory_invalid');
    if (!cert.ca) continue;
    const id = cert.id;
    requireCheck(idPattern.test(id) && records.length <= 100, 'certificate_inventory_invalid');
    if (!cert.certificates) cert = (await get(`mtls_certificates/${id}`)).result;
    requireCheck(cert.id === id && cert.ca === true && typeof cert.certificates === 'string', 'certificate_metadata_unavailable');
    const pems = cert.certificates.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    requireCheck(pems?.length && cert.certificates.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,'').trim() === '', 'certificate_metadata_invalid');
    const fingerprints = pems.map(pem => new X509Certificate(pem).fingerprint256);
    const matched = issuers.find(c => fingerprints.includes(c.fingerprint256));
    if (matched) {
      requireCheck(fingerprints.every(f => issuers.some(c => c.fingerprint256 === f)), 'certificate_trust_bundle_ambiguous');
      requireCheck(new Set(fingerprints).size === fingerprints.length, 'certificate_trust_bundle_ambiguous');
      matches.push({id, cert:matched, fingerprints});
    }
  }
  const {id,cert,fingerprints} = matches[0] ?? {id:null, cert:issuers.at(-1)};
  const sha256 = cert.fingerprint256.replaceAll(':','').toLowerCase();
  return { id, pem:cert.toString(), sha256,
    caFingerprints:fingerprints?.map(f => f.replaceAll(':','').toLowerCase()).sort() ?? [sha256] };
}

async function seatCheck(get, owner) {
  let count = 0, owned = 0, active = false;
  const ids = new Set();
  for (let page=1;page<=10;page++) {
    const {result, result_info:info} = await get(`access/users?per_page=100&page=${page}`);
    requireCheck(Array.isArray(result) && (info?.page ?? page) === page, 'inventory_incomplete');
    for (const user of result) {
      requireCheck(typeof user?.id === 'string' && !ids.has(user.id) && typeof user.access_seat === 'boolean'
        && typeof user.gateway_seat === 'boolean', 'seat_inventory_invalid');
      ids.add(user.id);
      if (user.access_seat || user.gateway_seat) count++;
      if (typeof user.email === 'string' && user.email.toLowerCase() === owner.toLowerCase()) {
        owned++;
        active = user.access_seat || user.gateway_seat;
      }
    }
    if (info?.total_pages !== undefined ? page >= info.total_pages : result.length < 100) {
      requireCheck((info?.total_count ?? ids.size) === ids.size && owned <= 1, 'seat_inventory_ambiguous');
      if (active) return true;
      const entitlements = await listSingle(get, 'entitlements');
      const limits = entitlements.filter(e => !e.deleted_date && e.allocation?.type === 'max_count'
        && /^(?:Cloudflare )?(?:Zero Trust|Access) (?:included |prepaid |purchased )?seats$/i.test(e.feature?.name)
        && Number.isSafeInteger(e.allocation.value) && e.allocation.value >= 0);
      if (limits.some(e => count >= e.allocation.value)) return false;
      return limits.some(e => /\b(included|prepaid|purchased)\b/i.test(e.feature.name)) ? true : null;
    }
  }
  throw new Failure('inventory_incomplete');
}

function workersSubscription(subscriptions, now) {
  const workers = subscriptions.filter(s => /^(?:Cloudflare )?Workers (?:Paid|Standard|Free)(?: Plan)?$/i.test(s.rate_plan?.public_name));
  const current = workers.filter(s => ['Paid','Provisioned'].includes(s.state)
    && Date.parse(s.current_period_start) <= now && now < Date.parse(s.current_period_end));
  if (current.length === 1) return {covered:!/\bFree\b/i.test(current[0].rate_plan.public_name), current:current[0]};
  const inactive = workers.length > 0 && workers.every(s => ['Cancelled','Failed','Expired','AwaitingPayment','Trial'].includes(s.state));
  return {covered:inactive ? false : null};
}

function capacityCheck(rows, now, subscription) {
  const period = Date.parse(subscription?.current_period_start);
  const totals = { requests:0, cpu:0 }, latest = { requests:0, cpu:0 };
  const periods = new Set();
  for (const row of rows) {
    if (!/^(?:Cloudflare )?Workers(?: Standard)?(?: Requests| CPU Time)?$/i.test(row.ServiceName)) continue;
    const unit = String(row.ConsumedUnit).toLowerCase();
    const metric = /^(?:requests?|million requests?)$/.test(unit) ? 'requests' : /^(?:ms|milliseconds?|cpu[- ]milliseconds?)$/.test(unit) ? 'cpu' : null;
    if (!metric) continue;
    const start = Date.parse(row.BillingPeriodStart), end = Date.parse(row.ChargePeriodEnd);
    requireCheck(row.BillingAccountId === TARGET.account && Number.isFinite(row.ConsumedQuantity) && row.ConsumedQuantity >= 0
      && start <= now && start >= now - 32*86400000 && end >= start && end <= now + 86400000, 'usage_dimensions_invalid');
    if (Number.isFinite(period) && period !== start) continue;
    if (subscription?.id && row.SubscriptionId && subscription.id !== row.SubscriptionId) continue;
    periods.add(start);
    totals[metric] += row.ConsumedQuantity * (unit.startsWith('million') ? 1e6 : 1);
    latest[metric] = Math.max(latest[metric], end);
  }
  if (periods.size !== 1) return null;
  // Both fresh sessions can invoke the Worker for every asset. Include the API checks and bootstrap.
  const rehearsalRequests = 96;
  if (totals.requests + rehearsalRequests > 1e7 || totals.cpu + rehearsalRequests*30000 > 3e7) return false;
  return Number.isFinite(period) && Object.values(latest).every(end => end > now - 2*86400000) ? true : null;
}

export async function collectAdminInputs({ env, createClient=createPg, parseTarget=branchQualifiedDatabaseTarget,
  readIssuers=verifiedOriginIssuers, fingerprintReaders, fetchImpl=fetch, now=Date.now(), expectedOwner=env.LYTHAUS_NEW_CORE_OWNER_EMAIL,
  existingPlanConfirmedByOwner=false, privateCredentialConfirmed=false, previousInputs, onVerifiedCa, onVerifiedCaId } = {}) {
  const deps = {createClient,parseTarget,readIssuers,fingerprintReaders,privateCredentialConfirmed};
  const admin = await inspectDatabase(env.LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL, 'lythaus_admin', deps);
  const verifier = await inspectDatabase(env.LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL, 'lythaus_verifier', deps);
  const errors = [admin.error && 'admin_'+admin.error, verifier.error && 'verifier_'+verifier.error].filter(Boolean);
  const cf = { bindingAccessible:Boolean(env.CLOUDFLARE_API_TOKEN), ownerBindingPresent:Boolean(env.LYTHAUS_NEW_CORE_OWNER_EMAIL),
    ownerBindingValidForm:/^[^@\s]+@[^@\s]+$/.test(env.LYTHAUS_NEW_CORE_OWNER_EMAIL ?? ''), ownerExpectationAvailable:typeof expectedOwner === 'string'
    && /^[^@\s]+@[^@\s]+$/.test(expectedOwner), paidPlanVerified:false, includedCapacityVerified:false, seatCovered:false,
    ownerAttestationUsed:false, caInventoryVerified:false, matchingUploadedCa:false };
  if (!cf.bindingAccessible) errors.push('cloudflare_binding_inaccessible');
  if (!cf.ownerExpectationAvailable) errors.push('owner_expectation_inaccessible');
  const get = accountReader(env.CLOUDFLARE_API_TOKEN, fetchImpl);
  let ca;
  if (cf.bindingAccessible) {
    let subscription;
    const checks = [
      ['paidPlanVerified',async () => {
        const evidence = workersSubscription(await listSingle(get,'subscriptions'), now);
        subscription = evidence.current;
        return evidence.covered;
      }],
      ['includedCapacityVerified',async () => capacityCheck(await listSingle(get,'billable-usage'), now, subscription)],
      ['seatCovered',async () => cf.ownerExpectationAvailable ? seatCheck(get,expectedOwner) : null],
    ];
    for (const [field,read] of checks) {
      let value = null, code = 'unavailable';
      const previouslyAttested = existingPlanConfirmedByOwner === true && previousInputs?.ready === true
        && previousInputs.cloudflare?.[field+'Attested'] === true;
      if (!previouslyAttested) {
        try { value = await read(); } catch (error) { code = reason(error,'read_unavailable'); }
      }
      const attested = value === null && existingPlanConfirmedByOwner === true;
      cf[field+'Attested'] = attested;
      cf.ownerAttestationUsed ||= attested;
      cf[field] = value === true || attested;
      if (!cf[field]) errors.push(field+'_'+(value === false ? 'not_covered' : code));
    }
    if (admin.report.verified) {
      try {
        ca = await selectCa(get, admin.issuers);
        cf.caInventoryVerified = true;
        cf.matchingUploadedCa = ca.id !== null;
      } catch(error) { errors.push('ca_'+reason(error,'read_unavailable')); }
    }
  }
  const ready = errors.length === 0;
  if (ready) {
    if (onVerifiedCa) await onVerifiedCa(ca);
    if (ca.id && onVerifiedCaId) await onVerifiedCaId(ca.id);
  }
  return { ready, admin:admin.report, verifier:verifier.report, cloudflare:cf, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {authorizeSetup} = await import('./new-core-setup-control.mjs');
    const approval = await authorizeSetup({env:process.env,afterReview:true});
    const report = await collectAdminInputs({ env:process.env, ...approval });
    console.log(JSON.stringify(report));
    if (!report.ready) process.exitCode = 1;
  } catch { console.error(JSON.stringify({ready:false,errors:['input_preflight_unavailable']})); process.exitCode = 1; }
}

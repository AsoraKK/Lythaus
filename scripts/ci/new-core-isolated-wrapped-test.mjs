import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { REPAIR_PINS } from './new-core-isolated-repair-pins.mjs';
import { loadArtifacts } from './new-core-isolated-worker.mjs';

const [sourceDir, artifactDir, endpoint] = process.argv.slice(2);
assert.match(endpoint, /^127\.0\.0\.1:[1-9][0-9]{0,4}$/);
const port = Number(endpoint.split(':')[1]);
assert.ok(port <= 65535);
const {worker} = await loadArtifacts({sourceDir, artifactDir, pins:REPAIR_PINS});
const fixtures = new URL('../tests/fixtures/new-core-wrapped/',import.meta.url);
await Promise.all([
  writeFile('sealed.js',worker,{flag:'wx'}),
  copyFile(new URL('workerd.capnp',fixtures),'fixture.capnp'),
  copyFile(new URL('worker.mjs',fixtures),'worker.mjs'),
]);
const config = JSON.parse(await readFile(join(sourceDir,'apps/lythaus-admin-api/wrangler.new-core-test.jsonc')));
assert.equal(config.compatibility_date,'2026-07-27');
assert.deepEqual(config.compatibility_flags,['nodejs_compat']);
const { Client } = createRequire(join(sourceDir,'package.json'))('pg');
const issuer = 'https://wrapped-fixture.invalid';
const digest = value => createHash('sha256').update(value).digest('hex');
const audience = digest('wrapped-fixture');
const member = 'wrapped-member', key = 'disposable-wrapped-member-lookup';
const {privateKey,publicKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const jwk = {...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'fixture'};
function assertion(sub) {
  const now = Math.floor(Date.now()/1000);
  const data = [{alg:'RS256',kid:jwk.kid},{aud:audience,iss:issuer,sub,iat:now,exp:now+300}]
    .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
}

let prepared = false;
let unexpected = false;
let jwksReads = 0;
async function prepare(placeholders) {
  assert.ok(!prepared && Array.isArray(placeholders) && placeholders.length === 3 &&
    placeholders.every(value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)) && new Set(placeholders).size === 3);
  prepared = true;
  const [database,user,password] = placeholders;
  // In production the Hyperdrive service owns the mapping to the origin. Here only the
  // disposable PostgreSQL instance recognizes this wrapped binding's generated login.
  const connection = {host:'127.0.0.1',port,user:'postgres',password:'local_wrapped_fixture',ssl:false};
  const admin = new Client({...connection,database:'postgres'});
  await admin.connect();
  try {
    await admin.query('CREATE ROLE "' + user + '" LOGIN PASSWORD \'' + password + '\' IN ROLE lythaus_admin');
    await admin.query('CREATE DATABASE "' + database + '" TEMPLATE postgres');
  } finally { await admin.end(); }
  const fixture = new Client({...connection,database});
  await fixture.connect();
  try {
    const userId = '00000000-0000-7000-8000-000000000001';
    await fixture.query("INSERT INTO identity.users(id,status) VALUES ($1,'locked')",[userId]);
    await fixture.query("INSERT INTO identity.admin_memberships(user_id,access_subject_hmac,role) VALUES ($1,$2,'administrator')",
      [userId,createHmac('sha256',key).update(member).digest()]);
  } finally { await fixture.end(); }
  return {bindings:{...config.vars,ACCESS_TEAM_DOMAIN:new URL(issuer).host,ACCESS_AUDIENCES:audience,ACCESS_SUBJECT_HMAC_KEY:key,
    ACCESS_JWKS_URL:issuer+'/cdn-cgi/access/certs',NEW_CORE_ACCESS_ISSUER:issuer,NEW_CORE_ACCESS_AUDIENCE_SHA256:digest(audience)},
    memberAssertion:assertion(member),visitorAssertion:assertion('wrapped-nonmember')};
}
const server = createServer(async (req,res) => {
  try {
    let result;
    if (req.url === '/prepare' && req.method === 'POST' && req.headers.host === 'fixture.invalid') {
      let json = '';
      for await (const chunk of req) { json += chunk; assert.ok(json.length <= 128); }
      result = await prepare(JSON.parse(json));
    } else if (req.url === '/cdn-cgi/access/certs' && req.method === 'GET' && req.headers.host === new URL(issuer).host) {
      jwksReads++;
      result = {keys:[jwk]};
    } else throw new Error('unexpected_request');
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(result));
  } catch { unexpected = true; res.writeHead(400).end(); }
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
try {
  await promisify(execFile)('./workerd',['test','fixture.capnp','--external-addr=postgres='+endpoint,
    '--external-addr=fixture=127.0.0.1:'+server.address().port],{timeout:45000,env:{}});
  assert.ok(prepared && !unexpected && jwksReads >= 2, 'wrapped membership verification incomplete');
  console.log('Verified the sealed Worker on the official PostgreSQL wrapped binding: nonmember 403 and member 200 against disposable PostgreSQL 17.');
} catch (error) {
  if (error.stderr?.includes('sealed_worker_rejected_official_wrapped_binding')) throw new Error('sealed_worker_rejected_official_wrapped_binding');
  throw new Error('wrapped_binding_rehearsal_failed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}

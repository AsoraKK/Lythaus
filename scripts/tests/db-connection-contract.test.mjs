import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { databaseClientConfig, query, transaction, verifyFullConnectionString } from '../../packages/db/src/index.ts';
import { createDedicatedAutocommitClient } from '../../packages/db/src/autocommit.ts';

test('Hyperdrive strings inherit verify-full when the binding omits the query parameter', () => {
  const result = verifyFullConnectionString('postgres://user:password@example.test/postgres');
  assert.equal(new URL(result).searchParams.get('sslmode'), 'verify-full');
});

test('Hyperdrive strings reject an explicitly weaker TLS mode', () => {
  assert.throws(
    () => verifyFullConnectionString('postgres://user:password@example.test/postgres?sslmode=require'),
    /hyperdrive_requires_sslmode_verify_full/
  );
});

test('PlanetScale Hyperdrive generated require mode is upgraded to verify-full', () => {
  const result = verifyFullConnectionString('postgres://user:password@aws-eu-central-1-1.pg.psdb.cloud/postgres?sslmode=require');
  assert.equal(new URL(result).searchParams.get('sslmode'), 'verify-full');
});

test('Non-PlanetScale require mode remains rejected', () => {
  assert.throws(
    () => verifyFullConnectionString('postgres://user:password@example.test/postgres?sslmode=require'),
    /hyperdrive_requires_sslmode_verify_full/
  );
});

test('Cloudflare Hyperdrive local binding accepts the platform local mode', () => {
  const result = verifyFullConnectionString(
    'postgres://user:password@1ceb53ab1f079a104475e16fe4ce21d5.hyperdrive.local:5432/postgres?sslmode=disable'
  );
  assert.equal(new URL(result).searchParams.get('sslmode'), 'disable');
});

test('Cloudflare Hyperdrive local binding rejects an unexpected mode', () => {
  assert.throws(
    () => verifyFullConnectionString('postgres://user:password@hyperdrive.local/postgres?sslmode=require'),
    /hyperdrive_requires_platform_local_sslmode_disable/
  );
});

// Native accessors live on the binding prototype. The local link is intercepted
// by workerd; the verified upstream connection is configured on Hyperdrive.
class NativeBinding {
  get host() { return 'f5d4cdef1b0849ecadb3b4e35fd4ada0.hyperdrive.local'; }
  get port() { return 5433; }
  get database() { return 'records/postgres'; }
  get user() { return 'fixture@user'; }
  get password() { return 'fixture/#?@%2F+:'; }
  get connectionString() { throw new Error('synthetic connection string unavailable'); }
  connect() { assert.fail('configuration must not open a socket'); }
}

test('native Hyperdrive fields reach the installed pg driver without DSN escaping or a dial', () => {
  const binding = new NativeBinding();
  assert.deepEqual(Object.keys(binding), []);
  const config = databaseClientConfig(binding);
  assert.equal(Object.hasOwn(config, 'connectionString'), false);
  const client = new Client(config);
  for (const field of ['host', 'port', 'database', 'user', 'password']) {
    assert.equal(client.connectionParameters[field], binding[field], field);
  }
  assert.equal(client.connectionParameters.ssl, false);
});

test('each database entry point constructs pg from native fields before connecting', async t => {
  const binding = new NativeBinding();
  const stop = new Error('synthetic stop before connecting');
  const connect = t.mock.method(Client.prototype, 'connect', async function () {
    assert.equal(this.host, binding.host);
    assert.equal(this.port, binding.port);
    assert.equal(this.password, binding.password);
    assert.equal(this.ssl, false);
    throw stop;
  });
  for (const call of [() => query(binding, 'SELECT 1'), () => transaction(binding, () => assert.fail('transaction opened')),
    () => createDedicatedAutocommitClient(binding).queryAutocommit('SELECT 1')]) {
    await assert.rejects(call, error => error === stop);
  }
  assert.equal(connect.mock.callCount(), 3);
});

test('partial native bindings and unexpected native endpoints cannot fall back to a string', () => {
  const ds = 'postgres://fixture@fixture.psdb.cloud/postgres?sslmode=verify-full';
  for (const properties of [
    {connect:null}, {connect:true}, {host:undefined}, {user:''}, {password:''}, {database:''},
    {port:0}, {port:5432.5}, {port:65536}, {port:'5432'}, {host:'fixture.psdb.cloud'}, {host:'hyperdrive.local.fixture.test'},
  ]) {
    const binding = Object.defineProperties(Object.create(NativeBinding.prototype), Object.fromEntries(
      Object.entries(properties).map(([name,value]) => [name,{value}])
    ));
    let fallbackReads = 0;
    Object.defineProperty(binding, 'connectionString', {get() { fallbackReads++; return ds; }});
    assert.throws(() => databaseClientConfig(binding));
    assert.equal(fallbackReads, 0);
  }
});

test('URL-only bindings retain verified TLS on the origin and reject weaker foreign settings', () => {
  const origin = 'postgres://fixture:fixture@fixture.psdb.cloud/postgres?sslmode=require';
  const config = databaseClientConfig({connectionString:origin});
  assert.equal(new URL(config.connectionString).searchParams.get('sslmode'), 'verify-full');
  const parsed = new Client(config).connectionParameters;
  assert.equal(parsed.host, 'fixture.psdb.cloud');
  assert.ok(parsed.ssl && parsed.ssl.rejectUnauthorized !== false);
  for (const value of ['disable','require']) {
    assert.throws(() => databaseClientConfig({connectionString:'postgres://fixture@origin.test/postgres?sslmode=' + value}));
  }
});

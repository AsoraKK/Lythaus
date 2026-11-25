import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { DatabaseBindingError, databaseBindingDiagnostic, databaseClientConfig, query, transaction, verifyFullConnectionString } from '../../packages/db/src/index.ts';

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

test('queries and transactions construct pg from native fields before connecting', async t => {
  const binding = new NativeBinding();
  const stop = new Error('synthetic stop before connecting');
  const connect = t.mock.method(Client.prototype, 'connect', async function () {
    assert.equal(this.host, binding.host);
    assert.equal(this.port, binding.port);
    assert.equal(this.password, binding.password);
    assert.equal(this.ssl, false);
    throw stop;
  });
  for (const call of [() => query(binding, 'SELECT 1'), () => transaction(binding, () => assert.fail('transaction opened'))]) {
    await assert.rejects(call, error => error === stop);
  }
  assert.equal(connect.mock.callCount(), 2);
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

const virtualHost = '0123456789abcdef0123456789abcdef.workers.alt';

function wrappedBinding(overrides = {}) {
  const fields = {
    host: virtualHost, port: 5432, scheme: 'postgresql',
    user: '1'.repeat(32), password: '2'.repeat(32), database: '3'.repeat(32),
    ...overrides,
  };
  const binding = {
    get connectionString() { assert.fail('the wrapped binding DSN was read'); },
  };
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(binding, key, { get: () => value, enumerable: true });
  }
  Object.defineProperty(binding, 'connect', { value() { assert.fail('configuration opened a socket'); } });
  return binding;
}

test('pg and the query and transaction paths accept the Cloudflare wrapped PostgreSQL binding', async t => {
  const binding = wrappedBinding();
  const config = databaseClientConfig(binding);
  assert.deepEqual(config, {
    host: virtualHost, port: 5432, user: binding.user, password: binding.password, database: binding.database, ssl: false,
  });
  const stop = new Error('synthetic stop before connecting');
  const connect = t.mock.method(Client.prototype, 'connect', async function () {
    for (const [key, value] of Object.entries(config)) assert.equal(this.connectionParameters[key], value, key);
    throw stop;
  });
  await assert.rejects(() => query(binding, 'SELECT 1'), error => error === stop);
  await assert.rejects(() => transaction(binding, () => assert.fail('transaction opened')), error => error === stop);
  assert.equal(connect.mock.callCount(), 2);
});

test('native binding failures retain the public error and record only their bounded cause', () => {
  for (const [field, category, values] of [
    ['host', 'native_host_rejected', [
      '', 'workers.alt', 'fixture.workers.alt', '0'.repeat(31) + '.workers.alt', '0'.repeat(33) + '.workers.alt',
      'F'.repeat(32) + '.workers.alt', 'g'.repeat(32) + '.workers.alt', 'extra.' + virtualHost, virtualHost + '.external.test',
      virtualHost + '.', virtualHost + '\n', virtualHost.replace('.workers.', '.Workers.'), 'fixture.psdb.cloud',
    ]],
    ['port', 'native_port_rejected', [undefined, 0, 3306, 5433, 65536, 5432.5, '5432']],
    ['scheme', 'native_scheme_rejected', [undefined, 'mysql', 'postgres', 'PostgreSQL']],
    ['user', 'native_user_rejected', [undefined, '', 'bad\0user']],
    ['password', 'native_password_rejected', [undefined, '', 'bad\0password']],
    ['database', 'native_database_rejected', [undefined, '', 'bad\0database']],
  ]) {
    for (const value of values) {
      assert.throws(() => databaseClientConfig(wrappedBinding({ [field]: value })), error =>
        error instanceof DatabaseBindingError && error.message === 'invalid_binding'
        && error.category === 'invalid_binding' && databaseBindingDiagnostic(error) === category);
    }
  }
});

test('URL-only virtual hosts retain full origin verification and fixed parse and TLS failure details', () => {
  const dsn = 'postgresql://fixture@' + virtualHost + ':5432/postgres';
  const verified = databaseClientConfig({ connectionString: dsn });
  assert.equal(new URL(verified.connectionString).searchParams.get('sslmode'), 'verify-full');
  assert.ok(new Client(verified).connectionParameters.ssl);
  for (const [connectionString, type, message, category] of [
    ['invalid fixture', TypeError, 'Invalid URL', 'legacy_url_invalid'],
    [dsn + '?sslmode=disable', Error, 'hyperdrive_requires_sslmode_verify_full', 'legacy_tls_policy_rejected'],
    ['postgresql://fixture@hyperdrive.local/postgres', Error, 'hyperdrive_requires_platform_local_sslmode_disable', 'legacy_tls_policy_rejected'],
  ]) {
    assert.throws(() => databaseClientConfig({ connectionString }), error => error instanceof type
      && error.message === message && databaseBindingDiagnostic(error) === category);
  }
  const untrusted = Object.assign(new Error('invalid_binding'), { category: 'native_host_rejected' });
  assert.equal(databaseBindingDiagnostic(untrusted), undefined);
});

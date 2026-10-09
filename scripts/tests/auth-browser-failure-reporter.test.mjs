import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import reporter, { authBrowserFailureContext } from './auth-browser-failure-reporter.mjs';

const head = 'f1d85cd0054f02e563339c0c25203b6a0b886f87';
const name = 'webkit 390: actual Flutter release login, recovery navigation, cookie restore and logout';
const event = (overrides = {}) => ({ name, file: '/checkout/scripts/tests/flutter-auth.browser.mjs', line: 21, testNumber: 3,
  details: { error: { failureType: 'testCodeFailure', cause: { name: 'TimeoutError',
    message: 'locator.waitFor: Timeout 15000ms exceeded.',
    stack: 'TimeoutError\n at /checkout/scripts/tests/flutter-auth.browser.mjs:120:8' } } }, ...overrides });
async function collect(events) {
  const output = [];
  for await (const line of reporter(events)) output.push(line);
  return output.join('');
}
function packet(output) { return JSON.parse(output.split('::').at(-1).trim().replaceAll('%0A', '\n').replaceAll('%0D', '\r').replaceAll('%25', '%')); }

test('auth failure context identifies all five browser families and both viewports/engines', () => {
  const families = [
    ['actual Flutter release login, recovery navigation, cookie restore and logout', 'flutter_auth'],
    ['optional profile partial save, skip, pending state and interruption', 'optional_profile'],
    ['actual guest account entry, cancellation, query return and unsupported feeds', 'guest_account_entry'],
    ['native member notifications, guest isolation, preferences, devices and expiry', 'native_notifications'],
    ['native privacy status, verified export, holds, cancellation and expiry', 'privacy_requests'],
  ];
  for (const [flow, family] of families) for (const engine of ['chromium', 'webkit']) for (const width of [1440, 390]) {
    const context = authBrowserFailureContext(event({ name: `${engine} ${width}: ${flow}` }), head);
    assert.deepEqual([context.family, context.engine, context.width], [family, engine, width]);
  }
  assert.equal(authBrowserFailureContext(event({ name: `${name} [controlled pending owner response]` }), head).variant, 'controlled_pending_owner_response');
});

test('auth failure context retains the failing source location and category without raw error content', () => {
  const context = authBrowserFailureContext(event(), head);
  assert.equal(context.head, head);
  assert.equal(context.category, 'locator_timeout');
  assert.equal(context.file, 'scripts/tests/flutter-auth.browser.mjs');
  assert.equal(context.line, 120);
  assert.equal(context.failureType, 'testCodeFailure');
});

test('reporter captures matching teardown phase even when diagnostics arrive after test failure', async () => {
  const output = await collect([
    { type: 'test:fail', data: event() },
    { type: 'test:diagnostic', data: { message: JSON.stringify({ authRequestLifecycle: {
      engine: 'webkit', width: 390, scenario: 'baseline', complete: false,
      events: [{ type: 'phase', phase: 'security_reload' }, { type: 'phase', phase: 'settings_revisit' }],
    } }) } },
  ]);
  assert.match(output, /^::error file=scripts\/tests\/flutter-auth.browser.mjs,line=120,title=/);
  assert.equal(packet(output).phase, 'settings_revisit');
  assert.equal(packet(output).journeyComplete, false);
});

test('reporter never includes arbitrary test names, error messages, credentials, URLs or DOM diagnostics', async () => {
  const privatePayload = 'DO_NOT_OUTPUT_FIXTURE_PAYLOAD';
  const output = await collect([
    { type: 'test:diagnostic', data: { message: JSON.stringify({ calls: [{ authorization: privatePayload }], screen: [privatePayload], url: `https://example.invalid/?token=${privatePayload}` }) } },
    { type: 'test:fail', data: event({ name: privatePayload, file: `/private/${privatePayload}`, details: { error: { message: privatePayload, stack: privatePayload, expected: privatePayload, actual: privatePayload } } }) },
  ]);
  assert.ok(!output.includes(privatePayload));
  assert.equal(packet(output).family, 'unclassified');
  assert.equal(packet(output).file, null);
});

test('reporter ignores malformed lifecycle data and isolates engine, viewport and controlled scenario', async () => {
  const output = await collect([
    { type: 'test:fail', data: event() },
    ...['{bad', JSON.stringify({ authRequestLifecycle: { engine: 'webkit', width: 390, scenario: 'baseline', complete: false, events: [null] } }),
      JSON.stringify({ authRequestLifecycle: { engine: 'webkit', width: 390, scenario: 'controlled_pending_owner_response', complete: false, events: [{ type: 'phase', phase: 'logout_armed' }] } })]
      .map(message => ({ type: 'test:diagnostic', data: { message } })),
  ]);
  assert.equal(packet(output).phase, null);
});

test('passing and skipped tests create no failure annotation', async () => {
  assert.equal(await collect([{ type: 'test:pass', data: event() }, { type: 'test:diagnostic', data: { message: 'ordinary message' } }]), '');
});

test('unknown readiness failure and invalid head retain safe classification without injecting commands', () => {
  const context = authBrowserFailureContext(event({ details: { error: { failureType: 'testCodeFailure', cause: { message: 'Fresh owner readiness timed out' } } } }), 'bad\n::warning::injection');
  assert.equal(context.head, 'local');
  assert.equal(context.category, 'owner_readiness_timeout');
  assert.equal(context.reason, 'owner_readiness_timeout');
});

test('readiness rejections preserve a specific allowlisted reason and HTTP status without raw bodies', () => {
  const context = message => authBrowserFailureContext(event({ details: { error: { cause: { message } } } }), head);
  assert.equal(context('Owner response belongs to a stale document request').reason, 'owner_request_predates_document');
  assert.equal(context('Fresh owner response does not match the signed-in owner').reason, 'owner_identity_mismatch');
  assert.equal(context('Fresh owner response body did not finish').reason, 'owner_response_incomplete');
  assert.equal(context('Fresh owner read returned status 503').status, 503);
  assert.equal(context('Fresh owner read returned status 503 PRIVATE_BODY').reason, null);
});

test('actual Node reporter integration preserves failure exit and receives cloned errors', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lythaus-auth-reporter-'));
  const fixture = path.join(directory, 'fixture.test.mjs');
  const reporterEnvironment = { ...process.env, GITHUB_SHA: head };
  delete reporterEnvironment.NODE_TEST_CONTEXT;
  try {
    await writeFile(fixture, `import test from 'node:test';\ntest(${JSON.stringify(name)}, t => { t.diagnostic(JSON.stringify({ authRequestLifecycle: { engine: 'webkit', width: 390, scenario: 'baseline', complete: false, events: [{ type: 'phase', phase: 'security_reload' }] } })); const e = new Error('locator.waitFor: Timeout 15000ms exceeded. PRIVATE_FIXTURE_PAYLOAD'); e.name='TimeoutError'; throw e; });\n`);
    const run = spawnSync(process.execPath, ['--test', `--test-reporter=${new URL('./auth-browser-failure-reporter.mjs', import.meta.url).href}`, fixture], { encoding: 'utf8', env: reporterEnvironment, timeout: 10000 });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /^::error /);
    assert.ok(!run.stdout.includes('PRIVATE_FIXTURE_PAYLOAD'));
    const context = packet(run.stdout);
    assert.equal(context.family, 'flutter_auth');
    assert.equal(context.engine, 'webkit');
    assert.equal(context.width, 390);
    assert.equal(context.category, 'locator_timeout');
    assert.equal(context.phase, 'security_reload');
    assert.equal(context.head, head);
    const combined = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
      `--test-reporter=${new URL('./auth-browser-failure-reporter.mjs', import.meta.url).href}`, '--test-reporter-destination=stdout', fixture],
    { encoding: 'utf8', env: reporterEnvironment, timeout: 10000 });
    assert.equal(combined.status, 1, combined.stderr);
    assert.match(combined.stdout, /not ok/);
    const annotation = combined.stdout.split('\n').find(line => line.startsWith('::error '));
    assert.ok(annotation);
    assert.ok(!annotation.includes('PRIVATE_FIXTURE_PAYLOAD'));
    assert.equal(packet(annotation).phase, 'security_reload');
    const passing = spawnSync(process.execPath, ['--test', `--test-reporter=${new URL('./auth-browser-failure-reporter.mjs', import.meta.url).href}`, '--test-name-pattern=does-not-match', fixture], { encoding: 'utf8', env: reporterEnvironment, timeout: 10000 });
    assert.equal(passing.status, 0, passing.stderr);
    assert.equal(passing.stdout, '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

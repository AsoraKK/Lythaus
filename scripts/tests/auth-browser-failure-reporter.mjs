const flows = new Map([
  ['actual Flutter release login, recovery navigation, cookie restore and logout', 'flutter_auth'],
  ['optional profile partial save, skip, pending state and interruption', 'optional_profile'],
  ['actual guest account entry, cancellation, query return and unsupported feeds', 'guest_account_entry'],
  ['native member notifications, guest isolation, preferences, devices and expiry', 'native_notifications'],
  ['native privacy status, verified export, holds, cancellation and expiry', 'privacy_requests'],
]);
const files = new Map([
  ['flutter-auth.browser.mjs', 'flutter_auth'],
  ['optional-profile.browser.mjs', 'optional_profile'],
  ['guest-account-entry.browser.mjs', 'guest_account_entry'],
  ['native-notifications.browser.mjs', 'native_notifications'],
  ['privacy-requests.browser.mjs', 'privacy_requests'],
  ['auth-request-lifecycle.test.mjs', 'request_lifecycle_negative'],
  ['fresh-owner-read.test.mjs', 'owner_readiness_negative'],
  ['fresh-owner-read.mjs', 'owner_readiness_helper'],
]);
const phases = new Set(['entry', 'cookie_restore', 'two_tab_restore', 'settings_entry',
  'browser_back', 'browser_forward', 'security_reload', 'security_back',
  'settings_back', 'settings_revisit', 'logout_armed', 'protected_return']);
const failureTypes = new Set(['testCodeFailure', 'testTimeoutFailure', 'testAborted',
  'cancelledByParent', 'hookFailed', 'subtestsFailed']);
const readinessReasons = new Map([
  ['Fresh owner read became stale after another document navigation', 'owner_read_stale_after_navigation'],
  ['Security reload navigated to an unexpected document', 'unexpected_document_navigation'],
  ['Security reload did not commit the expected document', 'unexpected_document_commit'],
  ['Fresh document initialization evidence could not be read', 'document_initialization_capture_failed'],
  ['Fresh owner read was aborted', 'owner_read_aborted'],
  ['Security document reload was aborted', 'security_document_aborted'],
  ['Page closed before fresh owner readiness', 'page_closed_before_owner_readiness'],
  ['Fresh owner response body did not finish', 'owner_response_incomplete'],
  ['Fresh owner read timing evidence is unavailable', 'owner_request_timing_unavailable'],
  ['Fresh document initialization timing evidence is unavailable', 'document_initialization_timing_unavailable'],
  ['Owner response belongs to a stale document request', 'owner_request_predates_document'],
  ['Fresh owner response does not match the signed-in owner', 'owner_identity_mismatch'],
  ['Fresh owner response or semantic readiness could not complete', 'owner_response_or_semantics_failed'],
  ['Fresh owner readiness timed out', 'owner_readiness_timeout'],
]);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : null;

function sourceFile(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/');
  for (const file of files.keys()) {
    const path = `scripts/tests/${file}`;
    if (normalized === path || normalized.endsWith(`/${path}`)) return path;
  }
  return null;
}

function scenario(name, file) {
  const match = typeof name === 'string'
    ? /^(chromium|webkit) (1440|390): (.+?)( \[controlled pending owner response\])?$/.exec(name)
    : null;
  if (match && flows.has(match[3])) return { family: flows.get(match[3]),
    engine: match[1], width: Number(match[2]),
    variant: match[4] ? 'controlled_pending_owner_response' : 'baseline' };
  return { family: files.get(file?.split('/').at(-1)) ?? 'unclassified',
    engine: null, width: null, variant: 'unclassified' };
}

function errorChain(error) {
  const chain = [], seen = new Set();
  while (error && typeof error === 'object' && !seen.has(error) && chain.length < 8) {
    chain.push(error); seen.add(error); error = error.cause;
  }
  return chain;
}

function category(chain) {
  for (const error of chain) {
    if (error.code === 'ERR_ASSERTION') return 'assertion_failure';
    if (error.failureType === 'testTimeoutFailure') return 'test_timeout';
    const message = typeof error.message === 'string' ? error.message : '';
    if (/^locator\.[a-zA-Z]+: Timeout /.test(message)) return 'locator_timeout';
    if (/^page\.waitForEvent: Timeout /.test(message)) return 'page_event_timeout';
    if (/^page\.(?:goto|waitForURL): Timeout /.test(message)) return 'navigation_timeout';
    if (message === 'Fresh owner readiness timed out') return 'owner_readiness_timeout';
    if (/^(?:Fresh owner|Fresh document|Owner response belongs to|Security (?:reload|document)) /.test(message)) return 'owner_readiness_rejected';
    if (error.name === 'TimeoutError') return 'timeout';
  }
  return 'unclassified';
}

function failureSite(chain, file, line) {
  for (const error of chain.toReversed()) {
    if (typeof error.stack !== 'string') continue;
    for (const match of error.stack.matchAll(/scripts\/tests\/([a-z-]+\.(?:browser|test)\.mjs|fresh-owner-read\.mjs):(\d+):(\d+)/g)) {
      if (files.has(match[1]) && positiveInteger(Number(match[2]))) {
        return { file: `scripts/tests/${match[1]}`, line: Number(match[2]) };
      }
    }
  }
  return { file, line: positiveInteger(line) };
}

function readinessReason(chain) {
  for (const error of chain) {
    if (readinessReasons.has(error.message)) return { reason: readinessReasons.get(error.message), status: null };
    const match = typeof error.message === 'string' && /^Fresh owner read returned status ([1-5][0-9]{2})$/.exec(error.message);
    if (match) return { reason: 'owner_response_http_status', status: Number(match[1]) };
  }
  return { reason: null, status: null };
}

export function authBrowserFailureContext(data, head) {
  const file = sourceFile(data.file), errors = errorChain(data.details?.error);
  return { schemaVersion: 1, purpose: 'diagnosis_only_no_failure_acceptance',
    head: typeof head === 'string' && /^[0-9a-f]{40}$/.test(head) ? head : 'local',
    ...scenario(data.name, file),
    testNumber: positiveInteger(data.testNumber),
    failureType: failureTypes.has(errors[0]?.failureType) ? errors[0].failureType : 'unclassified',
    category: category(errors), ...readinessReason(errors), ...failureSite(errors, file, data.line) };
}

function lifecycleContext(message) {
  if (typeof message !== 'string' || message.length > 1048576 || !message.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(message).authRequestLifecycle; } catch { return null; }
  if (!value || !['chromium', 'webkit'].includes(value.engine) || ![1440, 390].includes(value.width)
    || !['baseline', 'controlled_pending_owner_response'].includes(value.scenario) || typeof value.complete !== 'boolean') return null;
  const lastPhase = Array.isArray(value.events) ? value.events.findLast(event => event?.type === 'phase' && phases.has(event.phase))?.phase : null;
  return { family: 'flutter_auth', engine: value.engine, width: value.width,
    variant: value.scenario, phase: lastPhase ?? null, complete: value.complete };
}

const key = value => `${value.family}:${value.engine}:${value.width}:${value.variant}`;
const escapeData = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

export default async function* authBrowserFailureReporter(events) {
  const failures = [], lifecycle = new Map();
  for await (const event of events) {
    if (event.type === 'test:diagnostic') {
      const context = lifecycleContext(event.data?.message);
      if (context) lifecycle.set(key(context), context);
    }
    if (event.type === 'test:fail') failures.push(authBrowserFailureContext(event.data ?? {}, process.env.GITHUB_SHA));
  }
  for (const failure of failures) {
    const context = lifecycle.get(key(failure));
    const result = { ...failure, phase: context?.phase ?? null, journeyComplete: context?.complete ?? null };
    const location = result.file ? ` file=${result.file}${result.line ? `,line=${result.line}` : ''},` : ' ';
    yield `::error${location}title=Auth browser acceptance failure::${escapeData(JSON.stringify(result))}\n`;
  }
}

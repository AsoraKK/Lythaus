import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFailure, FAILURE_DOMAINS, failureDomainEvidence } from '../release/failure-domains.mjs';
import { resolveUpstreamFailureDomain } from '../ci/resolve-release-failure-domain.mjs';

test('failure domains distinguish product, certification, tooling, observability, and safety', () => {
  assert.equal(classifyFailure({ gate: 'PRODUCT_ACCEPTANCE', message: 'verification replay rejected' }), FAILURE_DOMAINS.PRODUCT_BLOCKER);
  assert.equal(classifyFailure({ gate: 'PRODUCT_ACCEPTANCE', message: 'Keeper mailbox unavailable' }), FAILURE_DOMAINS.CERTIFICATION_BLOCKER);
  assert.equal(classifyFailure({ gate: 'CANDIDATE', message: 'GitHub runner browser timeout' }), FAILURE_DOMAINS.TOOLING_FAILURE);
  assert.equal(classifyFailure({ gate: 'INFRASTRUCTURE', message: 'Cloudflare provider rate limit reached' }), FAILURE_DOMAINS.TOOLING_FAILURE);
  assert.equal(classifyFailure({ gate: 'POST_ACTIVATION', message: 'delivery observer unavailable' }), FAILURE_DOMAINS.OBSERVABILITY_WARNING);
  assert.equal(classifyFailure({ gate: 'PRODUCT_ACCEPTANCE', message: 'delivery observer unavailable' }), FAILURE_DOMAINS.CERTIFICATION_BLOCKER);
  assert.equal(classifyFailure({ gate: 'INFRASTRUCTURE', code: 'provider_configuration_validation_failed', message: 'production Turnstile provider configuration validation failed' }), FAILURE_DOMAINS.SAFETY_BLOCKER);
  assert.equal(classifyFailure({ gate: 'ACTIVATION', message: 'candidate identity mismatch' }), FAILURE_DOMAINS.SAFETY_BLOCKER);
});

test('failure evidence is sanitized and keeps the gate/domain explicit', () => {
  const evidence = failureDomainEvidence({ gate: 'CANDIDATE', code: 'runner_timeout', message: 'bad\nmessage', domain: FAILURE_DOMAINS.TOOLING_FAILURE });
  assert.deepEqual(evidence, {
    gate: 'CANDIDATE',
    code: 'runner_timeout',
    domain: FAILURE_DOMAINS.TOOLING_FAILURE,
    message: 'badmessage',
  });
});

test('upstream failure classification preserves worker evidence and labels child tooling failures', () => {
  const existing = [{ gate: 'PRODUCT_ACCEPTANCE', code: 'auth_product_acceptance_failed', domain: FAILURE_DOMAINS.PRODUCT_BLOCKER, message: 'candidate failed' }];
  assert.deepEqual(resolveUpstreamFailureDomain({
    workersResult: 'failure',
    productionSmokeResult: 'failure',
    existingEvidence: existing,
  }), existing);
  const pages = resolveUpstreamFailureDomain({
    preflightResult: 'success',
    providerResult: 'success',
    workersResult: 'success',
    marketingResult: 'failure',
    webResult: 'success',
    adminResult: 'skipped',
    productionSmokeResult: 'failure',
  });
  assert.equal(pages[0].domain, FAILURE_DOMAINS.TOOLING_FAILURE);
  assert.match(pages[0].message, /marketing/);
});

test('upstream safety failures are explicit when no child evidence exists', () => {
  const evidence = resolveUpstreamFailureDomain({
    preflightResult: 'success',
    providerResult: 'success',
    workersResult: 'success',
    marketingResult: 'skipped',
    webResult: 'skipped',
    adminResult: 'skipped',
    productionSmokeResult: 'failure',
  });
  assert.equal(evidence[0].domain, FAILURE_DOMAINS.SAFETY_BLOCKER);
  assert.equal(evidence[0].gate, 'ACTIVATION');
});

test('cancelled GitHub jobs are tooling failures rather than auth product failures', () => {
  const evidence = resolveUpstreamFailureDomain({
    preflightResult: 'success',
    providerResult: 'success',
    workersResult: 'cancelled',
    productionSmokeResult: 'skipped',
  });
  assert.equal(evidence[0].code, 'github_job_cancelled');
  assert.equal(evidence[0].domain, FAILURE_DOMAINS.TOOLING_FAILURE);
});

test('rollback failure takes precedence over downstream tooling labels', () => {
  const evidence = resolveUpstreamFailureDomain({
    preflightResult: 'success',
    providerResult: 'success',
    workersResult: 'success',
    marketingResult: 'failure',
    webResult: 'skipped',
    adminResult: 'skipped',
    productionSmokeResult: 'failure',
    rollbackResult: 'failure',
  });
  assert.equal(evidence[0].domain, FAILURE_DOMAINS.SAFETY_BLOCKER);
  assert.equal(evidence[0].code, 'component_rollback_failed');
});

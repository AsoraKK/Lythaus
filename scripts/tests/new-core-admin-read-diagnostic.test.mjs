import assert from 'node:assert/strict';
import test from 'node:test';
import { readAdminHyperdriveMetrics } from '../ci/new-core-admin-read-diagnostic.mjs';
import { TARGET } from '../ci/lythaus-new-core-isolation-review.mjs';

const payload = groups => ({data:{viewer:{accounts:[{hyperdriveQueriesAdaptiveGroups: groups}]}}});
test('reads aggregate errors on the isolated connector for the incident interval only', async () => {
  const result = await readAdminHyperdriveMetrics('test-only', async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const {query, variables} = JSON.parse(options.body);
    assert.equal(variables.config, TARGET.hyperdrive);
    assert.equal(variables.account, TARGET.account);
    assert.equal(variables.start, '2026-11-25T12:19:30Z');
    assert.equal(variables.end, '2026-11-25T13:00:00Z');
    assert.match(query, /^query /);
    assert.doesNotMatch(query, /mutation|sqlText|sampleInterval/);
    return Response.json(payload([{count:2, dimensions:{eventStatus:'error'}}]));
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.error, 2);
  assert.equal(result.complete, 0);
});

test('unavailable evidence, empty results and malformed provider output stay distinct', async () => {
  for (const [response, status] of [
    [new Response('private fixture', {status:403}), 'http_error'],
    [Response.json({errors:[{message:'private fixture'}]}), 'graphql_error'],
    [Response.json(payload([])), 'no_samples'],
    [Response.json(payload([{dimensions:{eventStatus:'private fixture'}, count:1}])), 'unexpected_response'],
  ]) {
    const report = await readAdminHyperdriveMetrics('test-only', async () => response);
    assert.equal(report.status, status);
    assert.ok(!JSON.stringify(report).includes('private fixture'));
  }
});

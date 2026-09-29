import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');
test('canonical owner acceptance has no preconfigured destination or password dependency', () => {
  for (const path of ['.github/workflows/production-release.yml', '.github/workflows/native-workers-deploy.yml', 'scripts/ci/prepare-scoped-worker-secrets.mjs']) {
    assert.doesNotMatch(read(path), /secrets\.CODEX_TEST_(?:EMAIL|SECONDARY_EMAIL|PASSWORD)|requiredEnvironment\('AUTH_ACCEPTANCE_(?:SECONDARY_)?EMAIL_BASE'/);
  }
  const workflow = read('.github/workflows/native-workers-deploy.yml');
  assert.match(workflow, /ADR003_OWNER_OPERATED: 'true'/);
  assert.equal(workflow.match(/destinationInput == "keeper_owner_runtime"/g).length, 2);
  assert.match(read('scripts/ci/run-adr003-authenticated-acceptance.mjs'), /requireAuthAcceptance\(\)\.productAcceptance\?\.cases.find/);
  assert.match(read('.github/workflows/production-release.yml'), /node --test scripts\/tests\/keeper-owner-input-contract.test.mjs/);
});

test('human-only private input does not replace delivery or exact-candidate evidence', () => {
  const source = read('apps/lythaus-auth-acceptance-coordinator/src/index.ts');
  assert.doesNotMatch(source, /AUTH_ACCEPTANCE_(?:SECONDARY_)?EMAIL_BASE/);
  const handler = source.slice(source.indexOf('async function authorizeDestinations'), source.indexOf('async function recordEvent'));
  for (const expression of [/await accessSubject/, /requireEmailCompletionOrigin/, /body.releaseSha !== run.release_sha/, /body.candidateVersion !== run.candidate_version/, /FOR UPDATE/, /reserveDestinationAttempt/, /observeMailboxProviders/, /encryptField/, /primary_email_ciphertext=\$2/]) assert.match(handler, expression);
  assert.doesNotMatch(handler, /EMAIL\.send|candidateJson|console\./);
  for (const expression of [/requireRunOwner/, /message.delivered/, /requireAcceptanceRejection/, /Cloudflare-Workers-Version-Overrides/, /read_only_database_query/, /owner_destinations_required/]) assert.match(source, expression);
  const ui = read('apps/control-panel/src/pages/ProductionAuthAcceptance.jsx');
  assert.match(ui, /Microsoft is not required/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|console\./);
});

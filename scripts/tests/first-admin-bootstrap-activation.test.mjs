import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/native-admin-bootstrap-activation.yml', 'utf8').replace(/\r\n/g, '\n');
const accessVerifier = readFileSync('scripts/ci/verify-cloudflare-admin-access.mjs', 'utf8');
const stateVerifier = readFileSync('scripts/ci/verify-first-admin-bootstrap-state.mjs', 'utf8');

test('bootstrap activation is a protected, Admin-only, pre-bootstrap path', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /test "\$REF_PROTECTED" = 'true'/);
  assert.match(workflow, /test "\$CONFIRM_PRODUCTION" = 'true'/);
  assert.match(workflow, /git merge-base --is-ancestor "\$CANDIDATE_SOURCE_SHA" HEAD/);
  assert.match(workflow, /test -z "\$\(git diff --name-only "\$CANDIDATE_SOURCE_SHA" HEAD -- apps\/lythaus-admin-api\)"/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /production-cutover-\$\{\{ inputs\.candidate_source_sha \}\}/);
  assert.match(workflow, /Probe admin candidate without production traffic \(CANDIDATE gate\)/);
  assert.match(workflow, /git show "\$CANDIDATE_SOURCE_SHA:apps\/lythaus-admin-api\/src\/bootstrap-wrapper\.ts"/);
});

test('bootstrap activation checks Access and untouched database state before traffic mutation', () => {
  const accessStep = workflow.indexOf('Reconfirm both Cloudflare Access administrator allowlists');
  const databaseStep = workflow.indexOf('Verify the database is still bootstrap-ready');
  const rollbackCapture = workflow.indexOf('Capture exact Admin rollback state');
  const activation = workflow.indexOf('Activate only the exact bootstrap-aware Admin candidate');
  assert.ok(accessStep >= 0 && databaseStep > accessStep);
  assert.ok(rollbackCapture > databaseStep && activation > rollbackCapture);
  assert.match(workflow, /EXPECTED_MEMBERSHIP_COUNT: '0'/);
  assert.match(workflow, /EXPECTED_BOOTSTRAP_CONSUMED: 'false'/);
  assert.match(workflow, /EXPECTED_COMPLETION_AUDIT_COUNT: '0'/);
  assert.match(workflow, /verify-cloudflare-admin-access\.mjs/);
  assert.match(workflow, /verify-first-admin-bootstrap-state\.mjs/);
  assert.match(workflow, /versions deploy \\\n\s+"\$\{CANDIDATE_VERSION_ID\}@100"/);
});

test('bootstrap activation has exact provenance, 100-percent verification, rollback, and sanitized evidence', () => {
  assert.match(workflow, /versions list --name lythaus-admin-api-development --json/);
  assert.match(workflow, /resolve-worker-version-state\.mjs candidate/);
  assert.match(workflow, /\.annotations\["workers\/tag"\] == \$sha/);
  assert.match(workflow, /Verify exact Admin candidate serves 100 percent/);
  assert.match(workflow, /\.version_id == \$id and \(\(\.percentage \| tonumber\) == 100\)/);
  assert.match(workflow, /if: \$\{\{ always\(\) && env\.BOOTSTRAP_ACTIVATION_ATTEMPTED == 'true' && env\.BOOTSTRAP_ACTIVATION_VERIFIED != 'true' \}\}/);
  assert.match(workflow, /versions deploy "\$ADMIN_ROLLBACK_SPECS"/);
  assert.match(workflow, /first-admin-bootstrap-activation-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /identity\.admin_memberships/);
  assert.doesNotMatch(workflow, /CF-Access-Client-Secret/);
});

test('Access verifier requires one shared human identity and preserved deny policies without exposing it', () => {
  assert.match(accessVerifier, /CLOUDFLARE_AUDIT_API_TOKEN \|\| process\.env\.CLOUDFLARE_API_TOKEN/);
  assert.match(accessVerifier, /Lythaus Admin UI/);
  assert.match(accessVerifier, /Lythaus Admin API/);
  assert.match(accessVerifier, /admin\.lythaus\.co/);
  assert.match(accessVerifier, /admin-api\.lythaus\.co/);
  assert.match(accessVerifier, /allows\.length !== 1/);
  assert.match(accessVerifier, /blocks\.length < 1/);
  assert.match(accessVerifier, /verified\[0\]\.humanAllowEmail !== verified\[1\]\.humanAllowEmail/);
  assert.match(accessVerifier, /humanAllowEmail: _humanAllowEmail/);
});

test('database state verifier uses the exact sanitized read-only bootstrap query', () => {
  assert.match(stateVerifier, /SET TRANSACTION READ ONLY/);
  assert.match(stateVerifier, /FROM identity\.admin_memberships\s+WHERE active = true/);
  assert.match(stateVerifier, /flag_key = 'identity\.first_admin_bootstrap_consumed'/);
  assert.match(stateVerifier, /action = 'identity\.first_admin_bootstrapped'/);
  assert.match(stateVerifier, /EXPECTED_MEMBERSHIP_COUNT/);
  assert.match(stateVerifier, /EXPECTED_BOOTSTRAP_CONSUMED/);
  assert.match(stateVerifier, /EXPECTED_COMPLETION_AUDIT_COUNT/);
  assert.doesNotMatch(stateVerifier, /INSERT INTO|UPDATE .*admin_memberships|DELETE FROM/);
});

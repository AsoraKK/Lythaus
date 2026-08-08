import { spawnSync, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const configs = [
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-admin-api/wrangler.jsonc',
  'apps/lythaus-jobs/wrangler.jsonc',
];

test('native Workers disable production workers.dev and preview URLs', () => {
  for (const relative of configs) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /"workers_dev": false/);
    assert.match(source, /"preview_urls": false/);
    assert.match(source, /"nodejs_compat"/);
    assert.doesNotMatch(source, /azurewebsites\.net|asora\.co\.za/);
  }
});

test('native production routing is custom-domain-only', () => {
  const validate = fs.readFileSync(path.join(root, 'scripts/validate-native-worker-config.mjs'), 'utf8');
  assert.match(validate, /workers\\\.dev/);
  assert.match(validate, /pages\\\.dev/);
  assert.match(validate, /r2\\\.dev/);
  assert.match(validate, /api\\\.lythaus\\\.co/);
  assert.match(validate, /admin-api\\\.lythaus\\\.co/);
});

test('native public and admin APIs enforce configured hostnames', () => {
  const observability = fs.readFileSync(path.join(root, 'packages/observability/src/index.ts'), 'utf8');
  const publicApi = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  const adminApi = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
  assert.match(observability, /assertExpectedHostname/);
  assert.match(observability, /hostname_not_configured/);
  assert.match(observability, /hostname_not_allowed/);
  assert.match(publicApi, /assertExpectedHostname\(request, env\.EXPECTED_HOSTNAMES\)/);
  assert.match(adminApi, /assertExpectedHostname\(request, env\.EXPECTED_HOSTNAMES\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'apps/lythaus-public-api/wrangler.jsonc'), 'utf8').slice(0, fs.readFileSync(path.join(root, 'apps/lythaus-public-api/wrangler.jsonc'), 'utf8').indexOf('"env"')), /asora\.workers\.dev/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/wrangler.jsonc'), 'utf8').slice(0, fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/wrangler.jsonc'), 'utf8').indexOf('"env"')), /asora\.workers\.dev/);
});

test('public API dispatch awaits rejection-prone async handlers', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  for (const handler of ['emailAuth', 'verifyEmail', 'requestPasswordReset']) {
    assert.match(source, new RegExp(`return await ${handler}\\(`));
  }
  for (const handler of ['createPost', 'createUploadSession']) {
    assert.match(source, new RegExp(`return await idempotentMutation[\\s\\S]*${handler}\\(`));
  }
});

test('admin API dispatch awaits rejection-prone mutations', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
  assert.match(source, /return await decideModeration\(/);
  assert.match(source, /return await updateAccountStatus\(/);
});

test('native Workers declare cache-disabled Hyperdrive intent', () => {
  for (const relative of configs) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /HYPERDRIVE_QUERY_CACHE_MODE/);
    assert.match(source, /"disabled"/);
  }
});

test('migration baseline contains subject locator and idempotency tables', () => {
  const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0002_core_tables.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE privacy\.subject_data_locations/);
  assert.match(migration, /CREATE TABLE system\.outbox_events/);
  assert.match(migration, /CREATE TABLE system\.consumer_inbox/);
  assert.match(migration, /CREATE TABLE system\.idempotency_keys/);
  assert.match(migration, /state text NOT NULL DEFAULT 'processing'/);
  assert.match(migration, /claimed_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(migration, /id uuid PRIMARY KEY/);
  assert.doesNotMatch(migration, /DEFAULT uuidv7\(\)/);
});

test('native queue consumers claim, retry, and complete duplicate events safely', () => {
  const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  assert.match(jobs, /ON CONFLICT \(consumer_name, event_id\) DO NOTHING/);
  assert.match(jobs, /message\.retry\(\)/);
  assert.match(jobs, /state = 'completed'/);
  assert.match(jobs, /claimed_at < now\(\) - interval '5 minutes'/);
});

test('launch schema and media boundary are explicit', () => {
  const launch = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0004_launch_contract.sql'), 'utf8');
  const media = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  assert.match(launch, /CREATE TABLE social\.profiles/);
  assert.match(launch, /CREATE TABLE content\.content_declarations/);
  assert.match(launch, /CREATE TABLE system\.feature_flags/);
  assert.match(media, /createPresignedPutUrl/);
  assert.match(media, /uploadSessionId/);
  assert.doesNotMatch(media, /arrayBuffer\(\).*MEDIA_QUARANTINE\.put/s);
});

test('native media buckets are isolated by Wrangler environment', () => {
  for (const relative of ['apps/lythaus-public-api/wrangler.jsonc', 'apps/lythaus-jobs/wrangler.jsonc']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const production = source.slice(0, source.indexOf('"env"'));
    const development = source.slice(source.indexOf('"development"'));
    assert.match(production, /MEDIA_(?:QUARANTINE|APPROVED)_BUCKET[^\n]*lythaus-media-(?:quarantine|approved)-dev/);
    assert.match(development, /MEDIA_(?:QUARANTINE|APPROVED)_BUCKET[^\n]*lythaus-media-(?:quarantine|approved)-dev/);
  }
});

test('native auth and user controls are implemented behind configured secrets', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  const grants = fs.readFileSync(path.join(root, 'database/planetscale/grants/roles.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0004_launch_contract.sql'), 'utf8');
  assert.match(source, /hashPassword/);
  assert.match(source, /refresh_token_hash/);
  assert.match(source, /email_verification_tokens/);
  assert.match(source, /MEDIA_QUOTA_BYTES/);
  assert.match(source, /privacy\.set_retention_rule/);
  assert.match(source, /feed\.user_inbox/);
  assert.match(grants, /GRANT EXECUTE ON FUNCTION privacy\.set_retention_rule/);
  assert.match(migration, /SECURITY DEFINER/);
});

test('native authentication supports account-level token revocation and social controls', () => {
  const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0005_auth_revocation.sql'), 'utf8');
  const relinkMigration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0008_legacy_relink_status.sql'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
  assert.match(migration, /token_version/);
  assert.match(relinkMigration, /relink_required/);
  assert.match(source, /tokenVersion/);
  assert.match(source, /account_relink_required/);
  assert.match(source, /source_provider/);
  assert.match(source, /social\.blocks/);
  assert.match(source, /social\.mutes/);
  assert.match(source, /social\.bookmarks/);
  assert.match(admin, /account\.status_changed/);
});

test('password hashing fallback is explicitly environment-gated', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  assert.match(source, /PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK === 'true'/);
  assert.match(source, /fallbackToScrypt:/);
  assert.match(source, /needsPasswordRehash/);
  const config = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/wrangler.jsonc'), 'utf8');
  assert.match(config, /"PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK": "false"/);
});

test('admin verifies Access JWTs independently', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
  assert.match(source, /createRemoteJWKSet/);
  assert.match(source, /jwtVerify/);
  assert.match(source, /ACCESS_AUDIENCE/);
  assert.match(source, /admin_memberships/);
});

test('branch policy forbids automatic provider branch creation', () => {
  const guide = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(guide, /Git convention only/);
  assert.match(guide, /Never create another PlanetScale branch/);
  assert.match(guide, /PostgreSQL 17/);
});

test('resource registry is complete and discover-before-create guarded', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure/lythaus-resource-registry.json'), 'utf8'));
  assert.equal(registry.policy.discoverBeforeCreate, true);
  assert.equal(registry.policy.creationRequiresOwnerApproval, true);
  assert.ok(registry.resources.some((resource) => resource.resourceName === 'lythaus-public-api-development'));
  assert.ok(registry.resources.some((resource) => resource.resourceName === 'development' && resource.temporary === true));
});

test('production deployment is manually gated and provisioned-only', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/native-workers-deploy.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /validate:native-workers:provisioned/);
  assert.doesNotMatch(workflow, /on:\s*\n\s*push:/);
});

test('Cloudflare scope manifest forbids known shared and unrelated resources', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure/cloudflare/native-scope.json'), 'utf8'));
  assert.equal(manifest.production.accountId, 'e5b7ae46e04698f507b7e4b3d4ef1af0');
  assert.equal(manifest.production.zoneId, '7bc572c8b7cd3c00be9c655176c29382');
  assert.equal(manifest.production.sharedAccountMustDiffer, false);
  assert.ok(manifest.forbiddenResourcePrefixes.includes('nite-owl-'));
  assert.ok(manifest.approvedLegacyResourcePrefixes.includes('asora-azure-compat'));
});

test('production config reuses existing Workers and disables paid or incomplete features', () => {
  for (const relative of configs) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source.slice(0, source.indexOf('"env"')), /"images"\s*:/);
  }
  const publicConfig = fs.readFileSync(path.join(root, configs[0]), 'utf8');
  const jobsConfig = fs.readFileSync(path.join(root, configs[2]), 'utf8');
  assert.match(publicConfig, /"name": "lythaus-public-api-development"/);
  assert.match(publicConfig, /"EMAIL_PROVIDER_MODE": "disabled"/);
  assert.match(publicConfig, /"MEDIA_UPLOADS_ENABLED": "false"/);
  assert.match(jobsConfig, /"MEDIA_PROCESSING_ENABLED": "false"/);
});

test('native Workers have an explicit Azure dependency scan', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/validate-native-azure-dependencies.mjs'), 'utf8');
  assert.match(script, /azurewebsites/);
  assert.match(script, /CosmosClient/);
  assert.match(script, /applicationinsights/);
});

test('jobs Worker exposes durable privacy and appeal workflows', () => {
  const config = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/wrangler.jsonc'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  assert.match(config, /APPEAL_LIFECYCLE/);
  assert.match(source, /class AppealLifecycleWorkflow/);
  assert.match(source, /moderation\.appeal\.created/);
  assert.match(source, /ON CONFLICT DO NOTHING/);
  assert.match(config, /BACKUP_VALIDATION/);
  assert.match(source, /class BackupValidationWorkflow/);
  assert.match(source, /backup\.schema_validation\.completed/);
});

test('account deletion clears private and derived relationships while preserving evidence', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  const grants = fs.readFileSync(path.join(root, 'database/planetscale/grants/roles.sql'), 'utf8');
  for (const relation of [
    'identity.auth_sessions',
    'identity.refresh_token_families',
    'identity.provider_links',
    'identity.contact_emails',
    'identity.user_region_preferences',
    'identity.admin_memberships',
    'social.profiles',
    'social.profile_private_fields',
    'social.custom_feeds',
    'social.blocks',
    'social.mutes',
    'feed.user_inbox',
    'feed.feed_events',
    'feed.notifications',
    'media.storage_ledger',
  ]) assert.match(source, new RegExp(`DELETE FROM ${relation.replace('.', '\\\.')}`));
  assert.match(source, /privacy\.legal_holds WHERE subject_id = \$1 AND active/);
  assert.doesNotMatch(source, /DELETE FROM privacy\.retention_rules/);
  assert.match(source, /privacy\.deletion_tombstones/);
  assert.doesNotMatch(source, /DELETE FROM privacy\.(?:requests|request_events|legal_holds|deletion_tombstones)/);
  assert.match(grants, /GRANT DELETE ON feed\.author_outbox/);
  assert.match(grants, /GRANT SELECT \(user_id\), DELETE ON trust\.accountability_signals, trust\.reputation_balances TO lythaus_jobs/);
  assert.match(grants, /GRANT SELECT \(actor_id\), DELETE ON system\.idempotency_keys TO lythaus_jobs/);
  assert.match(grants, /social\.blocks, social\.mutes/);
  assert.match(grants, /GRANT SELECT \(user_id\), DELETE ON identity\.provider_links[\s\S]*identity\.user_region_preferences, identity\.admin_memberships TO lythaus_privacy/);
  assert.match(grants, /GRANT SELECT \(user_id\), DELETE ON editorial\.applications, editorial\.memberships TO lythaus_privacy/);
});

test('public API CORS preflight uses a bodyless 204 response', () => {
  const source = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
  assert.match(source, /init\.status === 204 \? new Response\(null, init\) : json\(body, init\)/);
  assert.match(source, /request\.method === 'OPTIONS'/);
  assert.match(source, /'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'/);
});

test('production database identity and budget controls are explicit', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure/cloudflare/native-hyperdrive-production.json'), 'utf8'));
  const verifier = fs.readFileSync(path.join(root, 'scripts/ci/verify-cloudflare-hyperdrive-targets.mjs'), 'utf8');
  const identity = fs.readFileSync(path.join(root, 'packages/db/src/identity.ts'), 'utf8');
  const budget = fs.readFileSync(path.join(root, 'packages/db/src/budget.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0009_cost_budget_enforcement.sql'), 'utf8');
  const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  const budgetProbe = fs.readFileSync(path.join(root, 'scripts/ci/probe-budget-hard-stop.mjs'), 'utf8');
  assert.equal(manifest.bindings.length, 5);
  assert.match(manifest.expectedMainOriginFingerprint, /^[a-f0-9]{64}$/);
  assert.match(verifier, /PSCALE_BRANCH_NAME.*main/);
  assert.match(verifier, /originFingerprint/);
  assert.match(verifier, /developmentOriginFingerprint/);
  assert.match(verifier, /caching\?\.disabled === true/);
  assert.match(identity, /information_schema\.tables/);
  assert.match(identity, /identity.*contact_emails/);
  assert.match(budget, /SERIALIZABLE/);
  assert.match(budget, /cost_budget_reservations/);
  assert.match(budget, /cost_kill_switches/);
  assert.match(migration, /CREATE TABLE system\.cost_budget_periods/);
  assert.match(migration, /status IN \('reserved', 'committed', 'released', 'expired', 'rejected', 'reconciled'\)/);
  assert.match(migration, /CREATE TABLE system\.cost_usage_events/);
  assert.match(migration, /CREATE TABLE system\.cost_kill_switches/);
  assert.match(jobs, /budget_operation_rejected/);
  assert.match(jobs, /budget-hard-stop/);
  assert.match(budgetProbe, /providerCallPermitted/);
  assert.match(jobs, /lythaus-ai/);
});

test('PlanetScale CI uses a disposable local PostgreSQL 17 service', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/native-planetscale-ci.yml'), 'utf8');
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /PLANETSCALE_PG17_TEST_DATABASE_URL/);
  assert.doesNotMatch(workflow, /pscale branch create|PSCALE_SERVICE_TOKEN|ci-\$\{\{/);
});

test('production migrations remain explicit while Worker deployment verifies read-only', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/native-workers-deploy.yml'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'scripts/ci/apply-planetscale-production-migrations.mjs'), 'utf8');
  const verifier = fs.readFileSync(path.join(root, 'scripts/ci/verify-planetscale-production-schema.mjs'), 'utf8');
  assert.match(workflow, /Verify production schema read-only/);
  assert.match(workflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.doesNotMatch(workflow, /apply:planetscale-production-migrations|PLANETSCALE_PRODUCTION_MIGRATIONS_APPROVED/);
  assert.match(workflow, /PSCALE_BRANCH_NAME: main/);
  assert.match(script, /branch !== 'main'/);
  assert.match(script, /approval !== 'approved'/);
  assert.match(script, /sslmode.*verify-full/);
  assert.match(script, /migration checksum mismatch/);
  assert.doesNotMatch(script, /0001_feature_flags/);
  assert.match(verifier, /system\.schema_migrations/);
  assert.match(verifier, /expectedMigrationBytes = 48_192/);
  assert.match(verifier, /c8b14a6f418dfa1150cd6933733f2811cae8576246a88662463f712b0a64bf6a/);
  assert.match(verifier, /migration SHA-256 mismatch/);
  assert.match(verifier, /approved applied migration payload mismatch/);
  assert.match(verifier, /searchParams\.get\('sslrootcert'\) === 'system'/);
  assert.match(verifier, /searchParams\.delete\('sslrootcert'\)/);
  assert.match(verifier, /ssl: \{ rejectUnauthorized: true \}/);
  assert.doesNotMatch(verifier, /to_regclass|identity\.users|content\.posts/);
});

test('production deployment is fail-closed on predeploy and final gate phases', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/native-workers-deploy.yml'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure/cloudflare/production-gates.json'), 'utf8'));
  const validator = fs.readFileSync(path.join(root, 'scripts/validate-production-gates.mjs'), 'utf8');
  assert.match(workflow, /Validate production predeployment gates/);
  assert.ok(Object.keys(manifest.gates.predeploy).length >= 6);
  assert.ok(Object.keys(manifest.gates.final).length >= 6);
  assert.ok(manifest.gates.final.domainCutover);
  assert.equal(manifest.gates.final.domainAndOAuthCutover, undefined);
  assert.equal(manifest.gates.final.googleOAuthAcceptance.status, 'DEFERRED TO ADR 003');
  assert.equal(manifest.gates.final.googleOAuthAcceptance.ownerApproved, true);
  assert.equal(manifest.gates.final.googleOAuthAcceptance.launchBlocking, true);
  assert.equal(manifest.gates.final.googleOAuthAcceptance.scope, 'Google OAuth end-to-end session acceptance only');
  assert.equal(manifest.gates.final.googleOAuthAcceptance.decisionDate, '2026-08-02');
  assert.equal(manifest.gates.final.googleOAuthAcceptance.expiresWhen, 'ADR 003 authentication acceptance completes');
  assert.ok(manifest.gates.final.azureDeletionInventory);
  assert.equal(manifest.azureDeletionExecution, 'NOT STARTED');
  assert.equal(manifest.cutoverAuthorized, true);
  assert.equal(manifest.migrationUsageAuthorized, false);
  assert.equal(manifest.migrationUsageMaxUsd, 0);
  assert.equal(manifest.estimatedIncrementalCostUsd, 0);
  assert.equal(manifest.azureDeletionAuthorized, false);
  assert.match(validator, /phase === 'predeploy'/);
  assert.match(validator, /phase === 'final'/);
  assert.match(validator, /DEFERRED TO ADR 003/);
  assert.match(validator, /googleOAuthAcceptance/);
  assert.match(validator, /zero-cost deployment requires migration usage authorization false and maximum US\$0/);
});

test('ADR 003 deferral is accepted only for final Google OAuth acceptance', () => {
  const manifestPath = path.join(root, 'infrastructure/cloudflare/production-gates.json');
  const validatorSource = fs.readFileSync(path.join(root, 'scripts/validate-production-gates.mjs'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-production-gates-'));
  const temporaryManifestPath = path.join(temporaryRoot, 'infrastructure/cloudflare/production-gates.json');
  const temporaryValidatorPath = path.join(temporaryRoot, 'scripts/validate-production-gates.mjs');

  try {
    fs.mkdirSync(path.dirname(temporaryManifestPath), { recursive: true });
    fs.mkdirSync(path.dirname(temporaryValidatorPath), { recursive: true });
    fs.writeFileSync(temporaryValidatorPath, validatorSource);

    const validManifest = structuredClone(manifest);
    for (const record of Object.values(validManifest.gates.predeploy)) record.status = 'COMPLETED';
    for (const [gateName, record] of Object.entries(validManifest.gates.final)) {
      if (gateName !== 'googleOAuthAcceptance') record.status = 'COMPLETED';
    }
    fs.writeFileSync(temporaryManifestPath, JSON.stringify(validManifest));
    const validationReleaseSha = validManifest.releaseSha ?? '0'.repeat(40);

    assert.doesNotThrow(() => execFileSync(
      process.execPath,
      [temporaryValidatorPath, '--phase', 'final'],
      {
        cwd: temporaryRoot,
        env: { ...process.env, RELEASE_SHA: validationReleaseSha },
        encoding: 'utf8',
      },
    ));

    const invalidManifest = structuredClone(validManifest);
    invalidManifest.gates.final.domainCutover = structuredClone(validManifest.gates.final.googleOAuthAcceptance);
    fs.writeFileSync(temporaryManifestPath, JSON.stringify(invalidManifest));
    const result = spawnSync(
      process.execPath,
      [temporaryValidatorPath, '--phase', 'final'],
      {
        cwd: temporaryRoot,
        env: { ...process.env, RELEASE_SHA: invalidManifest.releaseSha },
        encoding: 'utf8',
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /final\.domainCutover may not use DEFERRED TO ADR 003/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('production deployment accepts only the exact merged main SHA', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/native-workers-deploy.yml'), 'utf8');
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /\[\[ "\$RELEASE_SHA" != "\$checked_out_sha" \]\]/);
  assert.match(workflow, /Refusing deployment: release_sha is not the checked-out main SHA/);
  assert.match(workflow, /\[\[ "\$checked_out_sha" != "\$remote_main_sha" \]\]/);
  assert.match(workflow, /Refusing deployment: checked-out main is not current origin\/main/);
});

test('Azure transformation evidence uses deterministic canonical hashes', () => {
  const canonical = fs.readFileSync(path.join(root, 'scripts/azure-exit/canonical-hash.mjs'), 'utf8');
  const transform = fs.readFileSync(path.join(root, 'scripts/azure-exit/transform-records.mjs'), 'utf8');
  assert.match(canonical, /Object\.keys\(value\).*sort\(\)/s);
  assert.match(canonical, /sha256/);
  assert.match(transform, /rawSourceSha256/);
  assert.match(transform, /transformedSha256/);
  assert.match(transform, /aes-256-gcm/);
});

test('DSR evidence import is protected, idempotent, and UUIDv7-based', () => {
  const importer = fs.readFileSync(path.join(root, 'scripts/azure-exit/import-dsr-evidence.mjs'), 'utf8');
  assert.match(importer, /protected-migration\/dsr\//);
  assert.match(importer, /restoreVerified !== true/);
  assert.match(importer, /ON CONFLICT \(request_id, object_key\) DO UPDATE/);
  assert.match(importer, /ON CONFLICT \(subject_id, store_type, resource_reference, entity_type, entity_key\) DO UPDATE/);
  assert.match(importer, /bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x70/);
  assert.match(importer, /sourceSemanticHash/);
  assert.match(importer, /destinationSemanticHash/);
});

test('jobs role can read trust ledgers required by Data Passport exports', () => {
  const grants = fs.readFileSync(path.join(root, 'database/planetscale/grants/roles.sql'), 'utf8');
  const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  assert.match(grants, /GRANT SELECT, INSERT ON trust\.provenance_events, trust\.human_contribution_events TO lythaus_jobs/);
  assert.match(grants, /GRANT SELECT ON trust\.reputation_events TO lythaus_jobs/);
  assert.match(jobs, /FROM trust\.provenance_events/);
  assert.match(jobs, /FROM trust\.human_contribution_events/);
  assert.match(jobs, /FROM trust\.reputation_events/);
});

test('privacy workflows reconcile the subject-data locator before export or deletion', () => {
  const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0004_launch_contract.sql'), 'utf8');
  const grants = fs.readFileSync(path.join(root, 'database/planetscale/grants/roles.sql'), 'utf8');
  const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
  assert.match(migration, /CREATE OR REPLACE FUNCTION privacy\.reconcile_subject_data_locations/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(grants, /GRANT EXECUTE ON FUNCTION privacy\.reconcile_subject_data_locations\(uuid\) TO lythaus_privacy/);
  assert.equal((jobs.match(/privacy\.reconcile_subject_data_locations/g) ?? []).length, 2);
});

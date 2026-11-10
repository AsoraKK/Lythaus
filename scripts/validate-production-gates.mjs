import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'infrastructure/cloudflare/production-gates.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const phaseIndex = process.argv.indexOf('--phase');
const phase = phaseIndex === -1 ? null : process.argv[phaseIndex + 1];
const expectedSha = process.env.RELEASE_SHA ?? '';
const releaseClass = process.env.RELEASE_CLASS ?? 'AUTH_CRITICAL_RELEASE';
const authCritical = releaseClass === 'AUTH_CRITICAL_RELEASE';
const ownerTestingDeployment = process.env.OWNER_TESTING_DEPLOYMENT === 'true';
const ownerTestingSubjectDiagnostic = process.env.OWNER_TESTING_SUBJECT_DIAGNOSTIC === 'true';
const authAcceptanceStatus = process.env.AUTH_ACCEPTANCE_STATUS ?? '';
const allowedStatuses = new Set(['COMPLETED', 'REQUIRED', 'BLOCKED']);
const failures = [];

if (manifest.schemaVersion !== 'lythaus-production-gates-v3') failures.push('unsupported production gate manifest schema');
if (!['STANDARD_RELEASE', 'AUTH_CRITICAL_RELEASE'].includes(releaseClass)) failures.push('RELEASE_CLASS must be STANDARD_RELEASE or AUTH_CRITICAL_RELEASE');
if (manifest.releaseSha !== null && (typeof manifest.releaseSha !== 'string' || !/^[0-9a-f]{40}$/.test(manifest.releaseSha))) failures.push('releaseSha must be null before merge or a full 40-character commit SHA');
if (manifest.releaseShaPolicy !== 'workflow input must equal the checked-out merged main SHA') failures.push('releaseShaPolicy must require the merged main checkout');
if (typeof manifest.estimatedIncrementalCostUsd !== 'number' || manifest.estimatedIncrementalCostUsd < 0) failures.push('estimatedIncrementalCostUsd must be a non-negative number');
if (!Array.isArray(manifest.requiredOwnerActions) || manifest.requiredOwnerActions.length === 0) failures.push('requiredOwnerActions must list the remaining owner-controlled gates');

if (phase !== null && phase !== 'predeploy' && phase !== 'final') failures.push(`unsupported production gate phase ${phase}`);

for (const groupName of ['predeploy', 'final']) {
  const group = manifest.gates?.[groupName];
  if (!group || typeof group !== 'object' || Array.isArray(group)) {
    failures.push(`missing ${groupName} gate group`);
    continue;
  }
  for (const [gateName, record] of Object.entries(group)) {
    if (!allowedStatuses.has(record?.status)) failures.push(`${groupName}.${gateName} has unsupported status ${record?.status}`);
    if (!Array.isArray(record?.evidence) || record.evidence.length === 0) failures.push(`${groupName}.${gateName} must cite evidence`);
    for (const evidencePath of record?.evidence ?? []) {
      if (typeof evidencePath !== 'string' || evidencePath.length === 0) {
        failures.push(`${groupName}.${gateName} contains an invalid evidence path`);
      } else if (!fs.existsSync(path.join(root, evidencePath))) {
        failures.push(`${groupName}.${gateName} evidence does not exist: ${evidencePath}`);
      }
    }
  }
}

if (phase === 'predeploy' || phase === 'final') {
  if (manifest.cutoverAuthorized !== true) failures.push('cutoverAuthorized must be true for production deployment');
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) failures.push('RELEASE_SHA must be the full merged main SHA');
  if (manifest.releaseSha !== null && manifest.releaseSha !== expectedSha) failures.push(`manifest releaseSha ${manifest.releaseSha} does not match requested release ${expectedSha}`);
  for (const [gateName, record] of Object.entries(manifest.gates?.predeploy ?? {})) {
    if (record.status !== 'COMPLETED') failures.push(`predeploy.${gateName} is not COMPLETED`);
  }
}

if (phase === 'final') {
  for (const [gateName, record] of Object.entries(manifest.gates?.final ?? {})) {
    if (record.status === 'BLOCKED') failures.push(`final.${gateName} is BLOCKED`);
  }
  for (const evidenceVariable of ['HYPERDRIVE_VERIFIED_MAIN', 'DATABASE_IDENTITY_VERIFIED', 'BUDGET_ENFORCEMENT_VERIFIED']) {
    if (process.env[evidenceVariable] !== 'true') failures.push(`${evidenceVariable}=true is required from this exact deployment run`);
  }
  if (authCritical && process.env.AUTHENTICATED_ACCEPTANCE_PROVEN !== 'true' && !ownerTestingDeployment) failures.push('AUTHENTICATED_ACCEPTANCE_PROVEN=true is required for AUTH_CRITICAL_RELEASE');
  if (!authCritical && process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true') failures.push('STANDARD_RELEASE must not claim authenticated acceptance was required');
  if (ownerTestingSubjectDiagnostic && !ownerTestingDeployment) {
    failures.push('OWNER_TESTING_SUBJECT_DIAGNOSTIC requires OWNER_TESTING_DEPLOYMENT=true');
  }
  if (ownerTestingDeployment && !ownerTestingSubjectDiagnostic && (!authCritical
    || process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'
    || authAcceptanceStatus !== 'OWNER_TEST_PENDING'
    || Boolean(process.env.AUTH_ACCEPTANCE_RUN_ID))) {
    failures.push('owner-testing deployment must remain AUTH_CRITICAL_RELEASE with pending, unrun authentication acceptance');
  }
  if (ownerTestingDeployment && ownerTestingSubjectDiagnostic) {
    let dependencies = null;
    try { dependencies = JSON.parse(process.env.AUTH_ACCEPTANCE_DEPENDENCIES_JSON ?? ''); } catch {}
    const runId = process.env.AUTH_ACCEPTANCE_RUN_ID ?? '';
    const expiresAt = process.env.AUTH_ACCEPTANCE_EXPIRES_AT ?? '';
    const diagnosticExpiresAt = process.env.SUBJECT_DIAGNOSTIC_EXPIRES_AT ?? '';
    const expectedDependencyKeys = ['admin', 'coordinator', 'jobs', 'public', 'subjectDiagnosticExpiresAt'];
    const validTimestamp = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
      && Number.isFinite(Date.parse(value));
    const validDiagnosticTimestamp = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)
      && Number.isFinite(Date.parse(value));
    const admin = dependencies?.admin;
    const coordinator = dependencies?.coordinator;
    const exactAcceptedCandidate = authCritical
      && process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'
      && authAcceptanceStatus === 'PASSED'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      && validTimestamp(expiresAt)
      && Date.parse(expiresAt) > Date.now()
      && validDiagnosticTimestamp(diagnosticExpiresAt)
      && Date.parse(diagnosticExpiresAt) > Date.now()
      && dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)
      && Object.keys(dependencies).sort().join(',') === expectedDependencyKeys.sort().join(',')
      && dependencies?.subjectDiagnosticExpiresAt === diagnosticExpiresAt
      && admin?.workerName === 'lythaus-admin-api-development'
      && admin?.versionId === (process.env.ADMIN_WORKER_VERSION_ID ?? '')
      && admin?.sourceSha === (process.env.ADMIN_WORKER_SOURCE_SHA ?? '')
      && admin?.sourceSha === process.env.RELEASE_SHA
      && admin?.status === 'NEW_CANDIDATE'
      && admin?.provenance === 'BUILT_FROM_RELEASE_SHA'
      && coordinator?.workerName === 'lythaus-auth-acceptance-coordinator-development'
      && coordinator?.versionId === (process.env.COORDINATOR_WORKER_VERSION_ID ?? '')
      && coordinator?.sourceSha === (process.env.COORDINATOR_WORKER_SOURCE_SHA ?? '')
      && coordinator?.sourceSha === process.env.RELEASE_SHA
      && coordinator?.status === 'NEW_CANDIDATE'
      && coordinator?.provenance === 'BUILT_FROM_RELEASE_SHA';
    if (!exactAcceptedCandidate) failures.push('owner-testing subject diagnostic requires same-run PASSED acceptance bound to exact Admin/coordinator candidates and live expiry');
  }
  if (!ownerTestingDeployment && authAcceptanceStatus === 'OWNER_TEST_PENDING') failures.push('OWNER_TEST_PENDING requires explicit OWNER_TESTING_DEPLOYMENT=true');
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated production gate manifest${phase ? ` for ${phase}` : ''}.`);
}

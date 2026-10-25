import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RESTORE, ROLE_NAMES, EXTENSIONS, CREATE_TARGET_BODY, RestoreApi, RestoreFailure, requireThat, failureCode, hash,
  approvalRecord, checkBackup, checkBranch, checkOwnedBranch, checkedRoles, safeId } from './planetscale-native-restore-contract.mjs';
import { sourceConnection, restoredConnection, readOnly, collectRestoreCatalog, inspectExtensionAuthority,
  installMissingExtensions } from './planetscale-native-restore-verifier.mjs';
import { buildRestoreSmoke, runRestoreSmoke } from './planetscale-native-restore-smoke.mjs';
import { inspectCleanupReservation, finalizeQualificationEvidence } from './planetscale-native-restore-evidence.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/native-hyperdrive-production.json', import.meta.url)));
const targetPath = `/branches/${RESTORE.target}`;
const backupPath = `/branches/main/backups/${RESTORE.backupId}`;

export async function githubReadiness(environment, fetchImpl = fetch, execute = false) {
  const env = environment;
  requireThat(/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') && env.GITHUB_SHA === env.RELEASE_SHA
    && env.GITHUB_REF === 'refs/heads/main' && env.REF_PROTECTED === 'true' && env.GITHUB_REPOSITORY_ID === '1010752912'
    && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '')
    && env.GITHUB_RUN_ATTEMPT === '1' && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') && env.GH_TOKEN, 'invalid_protected_execution_context');
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
  const read = async suffix => {
    const response = await fetchImpl(base + suffix, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json' } });
    requireThat(response.status === 200 && !response.redirected && (!response.url || response.url === base + suffix), 'github_precondition_read_failed');
    const text = await response.text(); requireThat(Buffer.byteLength(text) <= 1048576, 'github_precondition_response_too_large');
    try { return JSON.parse(text); } catch { throw new RestoreFailure('github_precondition_response_invalid'); }
  };
  const repository = await read('');
  requireThat(repository.id === 1010752912 && repository.full_name === env.GITHUB_REPOSITORY, 'repository_identity_changed');
  const branch = await read('/branches/main');
  requireThat(branch.protected === true && branch.commit?.sha === env.RELEASE_SHA, 'current_protected_main_changed');
  if (execute) {
    const approvals = await read(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`);
    const record = JSON.parse(env.RESTORE_CHECK_APPROVAL_JSON);
    requireThat(Array.isArray(approvals) && approvals.some(row => row.state === 'approved' && row.user?.type === 'User'
      && row.user.login === record.manualOperator && row.environments?.some(item => item.name === 'production')), 'named_human_production_approval_required');
    const prior = await read(`/actions/workflows/planetscale-native-restore-check.yml/runs?head_sha=${env.RELEASE_SHA}&event=workflow_dispatch&per_page=100`);
    requireThat(Number.isInteger(prior.total_count) && prior.total_count <= 100 && Array.isArray(prior.workflow_runs)
      && prior.workflow_runs.length === prior.total_count, 'execution_history_incomplete');
    requireThat(!prior.workflow_runs.some(run => String(run.id) !== env.GITHUB_RUN_ID
      && run.display_title === `Native restore execute ${env.RELEASE_SHA}`), 'prior_execution_requires_manual_reconciliation');
  }
}

export async function runNativeRestore({ environment = process.env, api, now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  assertMain = () => githubReadiness(environment, fetch, environment.RESTORE_CHECK_EXECUTE === 'true'),
  checkpoint = () => {}, readCatalog = collectRestoreCatalog, readSession = readOnly,
  extensionAuthority = inspectExtensionAuthority, installExtensions = installMissingExtensions,
  prepareSmoke = buildRestoreSmoke, smoke = runRestoreSmoke,
  phaseBudgetMs = 120000,
  reserveCleanup = () => inspectCleanupReservation(environment),
  reviewedOriginFingerprint = manifest.expectedMainOriginFingerprint } = {}) {
  const started = now(), execute = environment.RESTORE_CHECK_EXECUTE === 'true';
  const report = { version: 1, sourceMainSha: /^[a-f0-9]{40}$/.test(environment.RELEASE_SHA ?? '') ? environment.RELEASE_SHA : null,
    runId: /^[1-9]\d*$/.test(environment.GITHUB_RUN_ID ?? '') ? environment.GITHUB_RUN_ID : null,
    phase: 'qualification', mode: execute ? 'execute' : 'read-only-plan', status: 'BLOCKED', state: 'NO_TARGET_CREATED',
    qualificationOutcome: 'FAILED', startedAt: new Date(started).toISOString(),
    sourceBranchId: RESTORE.sourceId, backupId: RESTORE.backupId, targetName: RESTORE.target, createdTargetId: null,
    providerMutations: [], credentialActions: [], phases: [], productRowsRead: false, cleanup: 'NOT_NEEDED', blockers: [],
    recoveryAcceptance: 'NOT_CERTIFIED', independentRecovery: 'DEFERRED_BY_OWNER_EXCEPTION', deploymentAuthorized: false,
    verifiedScope: [], cleanupDeadlineAt: new Date(started + RESTORE.maximumMs).toISOString(),
    qualificationStopAt: new Date(started + RESTORE.qualificationStopMs).toISOString(),
    escalationAt: new Date(started + RESTORE.escalationMs).toISOString(), reviewByAt: new Date(started + RESTORE.reviewMs).toISOString(),
    cleanupStartByAt: new Date(started + RESTORE.cleanupStartMs).toISOString() };
  let owned = false, approval, scripts, setup;
  const connections = {};
  const save = async () => { await checkpoint(structuredClone(report)); };
  const time = () => requireThat(now() < Date.parse(report.qualificationStopAt), 'qualification_phase_review_reserve_reached');
  const phase = async (name, operation, maximumMs = 120000, mutation = false) => {
    time();
    const budgetMs = Math.min(maximumMs, phaseBudgetMs, Date.parse(report.qualificationStopAt) - now());
    requireThat(Number.isSafeInteger(budgetMs) && budgetMs > 0, 'qualification_phase_budget_invalid');
    const controller = new AbortController(), row = { name, budgetMs, startedAt: new Date(now()).toISOString(), outcome: 'PENDING' };
    report.phases.push(row); await save();
    const timer = setTimeout(() => controller.abort(new RestoreFailure(`qualification_${name}_timeout`)), budgetMs);
    try {
      const result = await operation(controller.signal); controller.signal.throwIfAborted(); time();
      row.outcome = 'PASSED'; return result;
    } catch (error) {
      row.outcome = controller.signal.aborted ? 'TIMED_OUT' : 'FAILED';
      if (controller.signal.aborted) throw new RestoreFailure(`qualification_${name}_timeout`, mutation ? 'UNKNOWN_MUTATION_OUTCOME' : 'BLOCKED');
      throw error;
    } finally { clearTimeout(timer); row.finishedAt = new Date(now()).toISOString(); await save(); }
  };
  const mutate = async (label, operation) => {
    time(); await assertMain();
    const reservation = await reserveCleanup();
    requireThat(reservation.workflowId === report.cleanupPermit.workflowId && reservation.runNumber === report.cleanupPermit.runNumber,
      'reserved_cleanup_run_number_consumed');
    report.providerMutations.push({ action: label, outcome: 'PENDING_OR_UNKNOWN' }); await save();
    try { const value = await operation(); report.providerMutations.at(-1).outcome = 'ACKNOWLEDGED'; await save(); return value; }
    catch (error) { report.providerMutations.at(-1).outcome = error instanceof RestoreFailure ? error.outcome : 'UNKNOWN_MUTATION_OUTCOME'; await save(); throw error; }
  };
  const boundTarget = async (configuration = true) => {
    const branch = await api.request(targetPath);
    if (configuration) checkBranch(branch, report.createdTargetId); else checkOwnedBranch(branch, report.createdTargetId);
    const backup = await api.request(backupPath);
    requireThat(backup.id === RESTORE.backupId && backup.database_branch?.id === RESTORE.sourceId
      && Array.isArray(backup.restored_branches) && backup.restored_branches.some(row => row.id === report.createdTargetId
        && row.name === RESTORE.target), 'backup_to_new_target_binding_unproven');
    return branch;
  };
  try {
    requireThat(['true', 'false', undefined].includes(environment.RESTORE_CHECK_EXECUTE), 'execution_mode_invalid');
    if (execute) {
      approval = approvalRecord(environment.RESTORE_CHECK_APPROVAL_JSON, environment, started);
      report.approvalSha256 = hash(approval); report.approvalExpiresAt = approval.expiresAt;
      report.reviewWindow = approval.reviewWindow; report.retention = approval.retention;
    }
    await assertMain();
    report.cleanupPermit = await reserveCleanup();
    if (execute) requireThat(hash(report.cleanupPermit) === hash(approval.cleanupPermit), 'cleanup_reservation_not_approved');
    api ??= new RestoreApi(environment.PLANETSCALE_RESTORE_API_TOKEN);
    await api.authority(async evidence => { report.authorityDiagnostic = evidence; await save(); });
    const source = await api.request('/branches/main');
    requireThat(source.id === RESTORE.sourceId && source.name === 'main' && source.kind === 'postgresql'
      && source.default === true && source.deleted_at === null && source.ready === true, 'source_branch_identity_changed');
    const backup = await api.request(backupPath); checkBackup(backup, now());
    requireThat(backup.protected === true, 'protected_backup_with_finite_retention_plan_is_manual_prerequisite');
    const branches = await api.list('/branches');
    requireThat(!branches.some(row => row.name === RESTORE.target || row.id === report.createdTargetId), 'preexisting_target_refused');
    const sourceRoles = checkedRoles(await api.list('/branches/main/roles'), RESTORE.sourceId);
    report.backup = { protected: backup.protected, completedAt: backup.completed_at, expiresAt: backup.expires_at,
      pvcBytes: backup.pvc_size, logicalBytes: backup.uncompressed_size, requestedRecoveryPoint: RESTORE.recoveryPoint,
      actualRecoveryPoint: 'PROVIDER_ATTESTATION_AND_OWNER_REVIEW_REQUIRED' };
    report.cost = { maximumUsd: 5, computeStorageBackupEstimateBeforeTaxUsd: 0.038604429, maximumExerciseSeconds: 7200,
      enforcedProviderHardCap: false, allInReviewedEstimateUsd: approval ? approval.estimatedSubtotalUsd + approval.taxAndFeeAllowanceUsd : null };
    await save();
    if (!execute) { report.status = 'PLAN_ONLY_OWNER_ACTIONS_AND_LIVE_QUALIFICATION_REQUIRED'; return report; }
    const sourceUrl = sourceConnection(environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL, reviewedOriginFingerprint);
    const baseline = await phase('source_catalog', signal => readSession(sourceUrl, RESTORE.sourceId, 'pscale_api_qodocjs6vgrb', readCatalog, undefined, signal));
    requireThat(baseline.extensionCount === 3, 'source_required_extensions_incomplete');
    report.sourceBaseline = baseline;
    scripts = await phase('build', signal => prepareSmoke(signal));
    await assertMain(); checkBackup(await api.request(backupPath), now());
    requireThat(!(await api.list('/branches')).some(row => row.name === RESTORE.target), 'preexisting_target_refused');
    const protectedBackup = await api.request(backupPath); checkBackup(protectedBackup, now());
    requireThat(protectedBackup.protected === true, 'backup_protection_unconfirmed');
    const created = await mutate('create_fixed_restore', () => api.request('/branches', { method: 'POST', body: CREATE_TARGET_BODY }));
    report.cleanup = 'UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED';
    requireThat(safeId(created.id) && created.id !== RESTORE.sourceId && created.name === RESTORE.target
      && Date.parse(created.created_at) >= started - 60000 && Date.parse(created.created_at) <= now(), 'create_ack_identity_invalid', 'UNKNOWN_MUTATION_OUTCOME');
    report.createdTargetId = created.id;
    checkOwnedBranch(created, created.id); owned = true;
    report.creation = { acknowledged: true, id: created.id, name: created.name, createdAt: created.created_at,
      sourceBranchId: created.restored_from_branch.id, kind: created.kind, default: created.default };
    report.state = 'TARGET_RETAINED_PENDING_REVIEW'; report.cleanup = 'TARGET_RETAINED_PENDING_REVIEW'; await save();
    checkBranch(created, created.id);
    let branch;
    for (let count = 0; count < 180; count++) {
      time(); branch = await boundTarget();
      if (branch.ready === true && branch.state === 'ready') break;
      await sleep(10000);
    }
    checkBranch(branch, created.id, true); report.restoreReadyAt = new Date(now()).toISOString();
    const roles = checkedRoles(await api.list(`${targetPath}/roles`), created.id, sourceRoles);
    const reset = async name => {
      await boundTarget();
      checkedRoles(await api.list(`${targetPath}/roles`), created.id, sourceRoles);
      const row = await mutate(`reset_copied_${name}`, () => api.request(`${targetPath}/roles/${roles.get(name).id}/reset`, { method: 'POST' }));
      requireThat(row.id === roles.get(name).id, 'reset_role_id_changed');
      const connection = restoredConnection(row, created.id, name);
      report.credentialActions.push({ role: name, targetBranchId: created.id, outcome: 'RESET_ACKNOWLEDGED_MEMORY_ONLY' }); await save();
      return connection;
    };
    setup = await reset(RESTORE.setup);
    const missing = await phase('extension_authority', signal => extensionAuthority(setup, created.id, undefined, signal), 30000);
    requireThat(Array.isArray(missing) && missing.every(name => EXTENSIONS.includes(name)), 'extension_probe_invalid');
    report.missingExtensions = missing;
    if (missing.length) await mutate('install_missing_named_extensions', () => phase('extensions', signal => installExtensions(setup, created.id, missing, undefined, signal), 60000, true));
    const restored = await phase('restored_catalog', signal => readSession(setup, created.id, RESTORE.setup, readCatalog, undefined, signal));
    requireThat(hash(restored) === hash(baseline), 'restored_catalog_registry_acl_or_grants_mismatch');
    report.restoredVerification = restored;
    for (const name of ['runtime', 'admin', 'jobs', 'privacy']) connections[name] = await reset(RESTORE[name]);
    time(); await boundTarget();
    report.applicationSmoke = await phase('smoke', signal => smoke(connections, created.id, baseline, scripts, undefined, signal));
    requireThat(report.applicationSmoke?.readOnlyDatabaseIdentity === true && report.applicationSmoke?.distinctRoles === 4,
      'application_smoke_not_verified');
    const sourceAfter = await phase('source_readback', signal => readSession(sourceUrl, RESTORE.sourceId, 'pscale_api_qodocjs6vgrb', readCatalog, undefined, signal));
    requireThat(hash(sourceAfter) === hash(baseline), 'source_metadata_changed_during_restore');
    time();
    report.verifiedAt = new Date(now()).toISOString();
    report.measuredRestoreSeconds = Math.ceil((Date.parse(report.restoreReadyAt) - started) / 1000);
    report.status = 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED'; report.qualificationOutcome = 'PASSED';
    report.verifiedScope = ['backup_binding','restore_completion','schema_extensions_indexes','canonical_registry','effective_runtime_privileges','application_smoke'];
  } catch (error) {
    report.blockers.push(failureCode(error));
    report.status = error instanceof RestoreFailure ? error.outcome : error?.extensionOutcomeUnknown ? 'UNKNOWN_MUTATION_OUTCOME' : 'FAILED';
    report.qualificationOutcome = report.status.includes('UNKNOWN') ? 'UNKNOWN' : 'FAILED';
  } finally {
    setup = null; scripts = null;
    for (const key of Object.keys(connections)) delete connections[key];
    if (owned) {
      report.state = 'TARGET_RETAINED_PENDING_REVIEW'; report.cleanup = 'TARGET_RETAINED_PENDING_REVIEW';
    } else if (report.providerMutations.some(row => row.action === 'create_fixed_restore' && row.outcome === 'UNKNOWN_MUTATION_OUTCOME')) {
      report.cleanup = 'UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED';
    }
    report.credentialReferencesDiscarded = true;
    report.costEscalationRequired = report.cleanup === 'UNBOUND_CREATE_OUTCOME_MANUAL_RECONCILIATION_REQUIRED'
      || (owned && (now() >= Date.parse(report.escalationAt) || report.qualificationOutcome !== 'PASSED'));
    report.finishedAt = new Date(now()).toISOString();
    try { await save(); } catch { report.blockers.push('final_evidence_checkpoint_failed'); report.status = 'EVIDENCE_PERSISTENCE_FAILED'; }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.env.EVIDENCE_DIR;
  requireThat(directory && path.isAbsolute(directory), 'evidence_directory_required');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.argv.includes('--finalize-only')) {
    finalizeQualificationEvidence(directory);
    process.exit(0);
  }
  const checkpoint = report => {
    const temporary = path.join(directory, 'checkpoint.pending.json');
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, path.join(directory, 'checkpoint.json'));
  };
  const report = await runNativeRestore({ checkpoint });
  fs.writeFileSync(path.join(directory, 'qualification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: report.status, blockers: report.blockers, cleanup: report.cleanup,
    createdTargetId: report.createdTargetId }) + '\n');
  if (!['PLAN_ONLY_OWNER_ACTIONS_AND_LIVE_QUALIFICATION_REQUIRED', 'TARGET_CHECKS_PASSED_REVIEW_REQUIRED'].includes(report.status)) process.exitCode = 1;
}

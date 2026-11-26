import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { firstFullStage } from './first-full-admin-receipt.mjs';
import { PINS, REPOSITORY, verifyEnvironment, verifyOwnerReview } from './lythaus-new-core-schema-install-control.mjs';
import { accessEvidence, createReadOnlyClient, hyperdriveEvidence, TARGET } from './lythaus-new-core-isolation-review.mjs';
import { ACCOUNT, createSetupClient, RECORDED_WORKER, SCRIPT } from './new-core-isolated-cloudflare.mjs';
import { readAssets, uploadAssets } from './new-core-isolated-worker.mjs';
import { githubRead, sha256 } from './planetscale-native-restore-evidence.mjs';
import { prepareReplacementAdminUpload, transition, validateProductionDatabaseMap, verifyFirstFullStageEvidence,
  verifyReplacementAdminUpload } from './production-database-cutover.mjs';
import { productionConfigs } from './verify-cloudflare-hyperdrive-targets.mjs';

const adminConfigPath = 'apps/lythaus-admin-api/wrangler.jsonc';
const moduleName = 'control-worker.js';
const deploymentPath = SCRIPT + '/deployments';
const secretNames = ['CLOUDFLARE_ACCOUNT_ID','DATABASE_READINESS_TOKEN','PII_ENCRYPTION_KEY_V1','PII_HMAC_KEY_V1'];

function requireStage(condition, code) {
  if (!condition) throw new Error(code);
}

export async function verifyStageGate(env, read = path => githubRead(env,path)) {
  const sha = env.GITHUB_SHA;
  const id = env.GITHUB_RUN_ID;
  requireStage(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REPOSITORY_ID === '1010752912' &&
    env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_PROTECTED === 'true' && env.GITHUB_RUN_ATTEMPT === '1' &&
    env.GITHUB_ACTOR_ID === String(PINS.ownerId) && env.GITHUB_TRIGGERING_ACTOR === env.GITHUB_ACTOR && env.CONFIRM_STAGE_ONLY === 'true' &&
    /^[1-9][0-9]*$/.test(id ?? '') && /^[a-f0-9]{40}$/.test(sha ?? '') && sha === env.REQUESTED_CONTROL_SHA &&
    env.RUNNER_DEBUG !== '1' && !env.NODE_DEBUG && !env.NODE_OPTIONS, 'full_admin_protected_context_required');
  const path = '/actions/runs/' + id;
  const [run, branch, gate, policies, reviews] = await Promise.all([
    read(path), read('/branches/main'), read('/environments/production'),
    read('/environments/production/deployment-branch-policies?per_page=100'), read(path + '/approvals'),
  ]);
  requireStage(run?.id === Number(id) && run.repository?.id === 1010752912 &&
    run.path === firstFullStage.workflow && run.event === 'workflow_dispatch' && run.head_branch === 'main' &&
    run.head_sha === sha && run.run_attempt === 1 && run.status === 'in_progress' &&
    run.actor?.id === PINS.ownerId && run.triggering_actor?.id === PINS.ownerId &&
    run.display_title === firstFullStage.operation + ' at ' + sha && branch?.protected === true && branch.commit?.sha === sha,
    'full_admin_protected_run_required');
  verifyEnvironment(gate,policies);
  verifyOwnerReview(reviews);
}

export async function stageFullAdminVersion({config, secrets, token, expectedOwner, releaseSha, runId,
  module, assets, journal, destination = transition.destination, fetchImpl = fetch}) {
  const pins = destination.isolatedAdminVersions;
  const access = ACCOUNT + '/access/apps/' + destination.ownerAccess.applicationId;
  const org = ACCOUNT + '/access/organizations';
  const connectorPaths = ['lythaus_admin','lythaus_privacy'].map(role =>
    ACCOUNT + '/hyperdrive/configs/' + destination.connectors[role]);
  const paths = new Set([access, access + '/policies?per_page=100&page=1',org,...connectorPaths]);
  const readOnly = createReadOnlyClient(token,fetchImpl,false,paths);
  const api = createSetupClient({token,fetchImpl,resumeWorker:true,singleStage:true,
    record:evidence => journal('full_admin_provider_acknowledged',evidence)});
  const read = path => api.request(path);
  requireStage(Object.keys(secrets).sort().join() === [...secretNames].sort().join() &&
    secrets.CLOUDFLARE_ACCOUNT_ID === TARGET.account && secretNames.every(name =>
      typeof secrets[name] === 'string' && secrets[name].trim().length > 0), 'full_admin_protected_inputs_missing');
  // The immutable version readback encodes the module as base64 in a bounded JSON envelope.
  requireStage(Boolean(expectedOwner) && Buffer.isBuffer(module) && module.length > 0 && module.length <= 700_000 &&
    assets instanceof Map && assets.size > 2 && assets.size <= 100, 'full_admin_artifacts_unverified');
  const assetRecords = [...assets].sort(([a],[b]) => a.localeCompare(b,'en-US')).map(([path,bytes]) =>
    ({path,bytes:bytes.length,sha256:sha256(bytes)}));
  requireStage(assets.has('index.html') && assets.has('_headers') &&
    assets.get('_redirects')?.toString().trim() === '/* /index.html 200' &&
    assetRecords.reduce((sum,row) => sum + row.bytes,0) <= 4 * 1024 * 1024, 'full_admin_assets_unverified');
  const moduleSha256 = sha256(module);
  const assetsSha256 = sha256(JSON.stringify(assetRecords) + '\n');

  const [app, policies, organization, admin, privacy] = await Promise.all(
    [...paths].map(async path => (await readOnly.get(path))));
  const owner = accessEvidence([app.result],policies.result,expectedOwner);
  requireStage(owner.intendedOwnerVerified === true && owner.soleHumanPolicy === true &&
    policies.result_info?.total_count === policies.result.length &&
    app.result.id === destination.ownerAccess.applicationId, 'full_admin_owner_access_unverified');
  for (const [payload,role] of [[admin,'lythaus_admin'],[privacy,'lythaus_privacy']]) {
    const evidence = hyperdriveEvidence(payload.result,{
      branch:destination.branchId,origin:destination.originSha256,hyperdrive:destination.connectors[role],
    });
    requireStage(payload.result?.id === destination.connectors[role] && evidence.scopedRole === role &&
      evidence.branchMatches && evidence.originMatches && evidence.cacheDisabled &&
      evidence.verifyFullAndCaConfigured, 'full_admin_destination_connector_unverified');
  }

  const authorize = async () => {
    const raw = await read(deploymentPath);
    const deployment = (Array.isArray(raw) ? raw : raw?.deployments)?.[0];
    const version = await read(RECORDED_WORKER + '/versions/' + pins.servingVersionId + '?include=modules');
    const snapshot = {deployment,observedDeployment:deployment,versions:[version]};
    const prepared = await prepareReplacementAdminUpload({
      config: {...config,vars:{...config.vars,ACCESS_TEAM_DOMAIN:organization.result.auth_domain,
        ACCESS_JWKS_URL:'https://' + organization.result.auth_domain + '/cdn-cgi/access/certs',
        ACCESS_AUDIENCES:app.result.aud}},
      secretNames, snapshot, releaseSha, token, fetchImpl, destination,
    });
    return {snapshot,prepared};
  };
  await read(RECORDED_WORKER);
  api.selectRecordedWorker();
  const initial = await authorize();
  requireStage(initial.snapshot.observedDeployment.id === pins.servingDeploymentId,'full_admin_serving_baseline_changed');
  api.selectLineage(pins.servingVersionId);
  const jwt = await uploadAssets(assets,api.request,journal);
  const {snapshot,prepared} = await authorize();
  const approved = prepared.config;
  const bindings = [
    ...approved.unsafe.bindings,
    ...Object.entries(approved.vars).map(([name,text]) => ({type:'plain_text',name,text})),
    ...Object.entries(secrets).map(([name,text]) => ({type:'secret_text',name,text})),
    ...approved.hyperdrive.map(({binding:name,id}) => ({type:'hyperdrive',name,id})),
    ...approved.services.map(({binding:name,service,entrypoint}) => ({type:'service',name,service,entrypoint})),
    ...approved.r2_buckets.map(({binding:name,bucket_name}) => ({type:'r2_bucket',name,bucket_name})),
    {type:'assets',name:'ASSETS'}, {type:'version_metadata',name:'WORKER_VERSION'},
  ];
  const modules = [
    {name:moduleName,content_type:'application/javascript+module',content_base64:module.toString('base64')},
    {name:'_headers',content_type:'text/plain',content_base64:assets.get('_headers').toString('base64')},
  ];
  await journal('full_admin_upload_intent',{workerId:pins.workerId,releaseSha,moduleSha256,assetsSha256,
    subjectKeySourceVersionId:pins.servingVersionId,previousDeploymentId:snapshot.observedDeployment.id});
  const uploaded = await api.request(RECORDED_WORKER + '/versions?deploy=false',{method:'POST',body:{
    annotations:{'workers/tag':releaseSha,'workers/message':prepared.message},main_module:moduleName,modules,bindings,
    compatibility_date:approved.compatibility_date,compatibility_flags:approved.compatibility_flags,
    assets:{jwt,config:{run_worker_first:true,not_found_handling:'single-page-application'}},
  }});
  const verified = await verifyReplacementAdminUpload({versionId:uploaded.id,snapshot,config:approved,
    releaseSha,token,fetchImpl,destination});
  const receipt = {schema:'lythaus-first-full-admin-stage-v1',runId,runAttempt:1,operation:firstFullStage.operation,
    baselineRun:firstFullStage.baselineRun,...verified,servingTrafficPercent:100,moduleSha256,assetsSha256};
  await verifyFirstFullStageEvidence({receipt,versionId:uploaded.id,snapshot,releaseSha,token,fetchImpl,destination});
  return receipt;
}

async function main(env) {
  await verifyStageGate(env);
  requireStage(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim() === env.GITHUB_SHA &&
    !execFileSync('git',['diff','--name-only','HEAD','--'],{encoding:'utf8'}).trim(),'full_admin_checkout_unverified');
  const configs = productionConfigs();
  const manifest = JSON.parse(await readFile('infrastructure/cloudflare/native-hyperdrive-production.json','utf8'));
  validateProductionDatabaseMap(manifest,configs,transition,true,TARGET.worker);
  const dir = join(env.RUNNER_TEMP,'new-core-full-admin');
  const entries = await readdir(dir,{withFileTypes:true});
  requireStage(entries.some(entry => entry.isFile() && entry.name === moduleName) &&
    entries.every(entry => entry.isFile() && [moduleName,moduleName+'.map','README.md'].includes(entry.name)),
    'full_admin_bundle_layout_unverified');
  const receipt = await stageFullAdminVersion({
    config:configs.get(adminConfigPath), secrets:Object.fromEntries(secretNames.map(name => [name,env[name]])),
    token:env.CLOUDFLARE_API_TOKEN, expectedOwner:env.LYTHAUS_NEW_CORE_OWNER_EMAIL,
    releaseSha:env.GITHUB_SHA, runId:env.GITHUB_RUN_ID, module:await readFile(join(dir,moduleName)),
    assets:await readAssets('apps/control-panel/dist'),
    journal:(status,evidence) => console.log(JSON.stringify({status,...evidence})),
  });
  await writeFile(join(dir,'first-full-admin.json'),JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(process.env); } catch (error) {
    const code = error?.message;
    console.error(/^full_admin_[a-z_]+$/.test(code) ? code : 'full_admin_stage_unverified_reconcile_before_retry');
    process.exitCode = 1;
  }
}

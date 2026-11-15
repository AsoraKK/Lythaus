import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectRebindConnection} from './admin-subject-rebind-connection.mjs';
import {rebindInstallConsent} from './admin-subject-rebind-capability.mjs';
import {assertRebindExecutorTarget} from './admin-subject-rebind-executor.mjs';

export function approvedRebindInstallationConnection(env,{committedOnly=env.CI==='true',now=Date.now()}={}) {
  const selected=selectRebindConnection(env,{stage:'install'});
  const consent=rebindInstallConsent(selected.env,{committedOnly,now});
  if(!consent)throw new Error('admin_rebind_install_consent_invalid');
  let roles,manifest;
  try {
    roles=JSON.parse(env.PSCALE_ROLE_IDENTIFIERS);
    manifest=JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json','utf8'));
  } catch {throw new Error('admin_rebind_connection_selection_invalid');}
  assertRebindExecutorTarget(selected.env.PLANETSCALE_ADMIN_DATABASE_URL,roles,manifest.expectedMainOriginFingerprint,
    consent.record.executor);
  return {...selected,consent};
}

export function exportApprovedRebindInstallationConnection(env,{write=fs.appendFileSync,mask=console.log,now=Date.now()}={}) {
  const selected=approvedRebindInstallationConnection(env,{now});
  if(typeof env.GITHUB_ENV!=='string'||!path.isAbsolute(env.GITHUB_ENV)||typeof env.RUNNER_TEMP!=='string'
    ||!path.isAbsolute(env.RUNNER_TEMP)
    ||!path.resolve(env.GITHUB_ENV).startsWith(`${path.resolve(env.RUNNER_TEMP)}${path.sep}`))
    throw new Error('admin_rebind_connection_export_unverified');
  const raw=selected.env.PLANETSCALE_ADMIN_DATABASE_URL;
  mask(`::add-mask::${raw.replaceAll('%','%25')}`);
  write(env.GITHUB_ENV,`PLANETSCALE_ADMIN_DATABASE_URL=${raw}\nPLANETSCALE_SCHEMA_READ_DATABASE_URL=${raw}\nPREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT=true\nPLANETSCALE_EPHEMERAL_ROLE_ID=\n`);
  return {status:'APPROVED_PREPROVISIONED_REBIND_CONNECTION_SELECTED',credentialsCreated:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(exportApprovedRebindInstallationConnection(process.env)));}
  catch(error) {
    const code=/^admin_rebind_[a-z_]+$/.test(error?.message??'')?error.message:'admin_rebind_connection_selection_invalid';
    console.error(JSON.stringify({status:'BLOCKED',code,credentialsCreated:false}));process.exitCode=1;
  }
}

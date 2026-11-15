import {branchQualifiedDatabaseTarget} from './planetscale-0021-target-identity.mjs';

const check=(condition,code)=>{if(!condition)throw new Error(code);};
export const REBIND_CONNECTION_MODES=Object.freeze(['existing_owner_connection','separate_owner_connection']);

function approvedMode(raw,stage) {
  let record;
  try {
    check(typeof raw==='string'&&raw.length>0&&raw.length<=65536,'admin_rebind_connection_selection_invalid');
    record=JSON.parse(raw);
  } catch {throw new Error('admin_rebind_connection_selection_invalid');}
  const mode=stage==='disable'?record?.mode:record?.executor?.mode;
  check(REBIND_CONNECTION_MODES.includes(mode),'admin_rebind_connection_selection_invalid');
  return mode;
}

// Selection is local only. Callers must still validate the complete consent and
// every provider/SQL predicate before connecting or performing an operation.
export function selectRebindConnection(env,{stage}={}) {
  let mode;
  if(stage==='packet') {
    check(env.INSPECTION==='rebind-install-packet','admin_rebind_connection_selection_invalid');
    const selection=env.ADMIN_REBIND_CONNECTION===undefined||env.ADMIN_REBIND_CONNECTION===''
      ?'existing':env.ADMIN_REBIND_CONNECTION;
    check(['existing','separate'].includes(selection),'admin_rebind_connection_selection_invalid');
    mode=selection==='separate'?'separate_owner_connection':'existing_owner_connection';
  } else if(stage==='install')mode=approvedMode(env.ADMIN_SUBJECT_REBIND_INSTALL_APPROVAL_JSON,stage);
  else if(['preview','execute'].includes(stage))mode=approvedMode(env.ADMIN_SUBJECT_REBIND_ACTIVATION_APPROVAL_JSON,stage);
  else if(stage==='disable')mode=approvedMode(env.ADMIN_REBIND_EXECUTOR_BINDING_JSON,stage);
  else throw new Error('admin_rebind_connection_selection_invalid');
  const raw=mode==='separate_owner_connection'?env.PLANETSCALE_ADMIN_REBIND_DATABASE_URL:env.PLANETSCALE_ADMIN_DATABASE_URL;
  check(typeof raw==='string'&&raw.length>0&&raw.length<=8192&&raw.trim()===raw&&!/[\r\n\0]/.test(raw),
    'admin_rebind_selected_connection_unavailable');
  if(mode==='separate_owner_connection') {
    let previous,selected;
    try {
      previous=branchQualifiedDatabaseTarget(env.PLANETSCALE_ADMIN_DATABASE_URL);
      selected=branchQualifiedDatabaseTarget(raw);
    } catch {throw new Error('admin_rebind_separate_connection_unverified');}
    check(previous.branchId==='vqa2g2xc9wsl'&&selected.branchId===previous.branchId
      &&previous.sqlDatabaseName==='postgres'&&selected.sqlDatabaseName===previous.sqlDatabaseName
      &&selected.originFingerprint===previous.originFingerprint&&selected.role!==previous.role,
    'admin_rebind_separate_connection_unverified');
  }
  return {mode,env:{...env,PLANETSCALE_ADMIN_DATABASE_URL:raw,PREPROVISIONED_MIGRATION_CREDENTIAL_PRESENT:'true'}};
}

// node-postgres may fall back to PGREPLICATION even when replication:false is
// supplied. Reject inherited protocol selection and inspect the parsed client
// before connect; an observed backend type cannot prove a future startup mode.
export function rebindSqlClient(config,Client,{env=process.env}={}) {
  check(!Object.hasOwn(process.env,'PGREPLICATION')&&!Object.hasOwn(env,'PGREPLICATION')
    &&config&&typeof config==='object'&&(config.replication===undefined||config.replication===false),
  'admin_rebind_sql_transport_unverified');
  let client;
  try {client=new Client({...config,replication:false});}
  catch {throw new Error('admin_rebind_sql_transport_unverified');}
  const parameters=client.connectionParameters;
  check(parameters&&typeof parameters==='object'&&Object.hasOwn(parameters,'replication')
    &&(parameters.replication===undefined||parameters.replication===false),
  'admin_rebind_sql_transport_unverified');
  return client;
}

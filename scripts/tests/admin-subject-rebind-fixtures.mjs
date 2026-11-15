import {createHash} from 'node:crypto';
import {rebindGrantPayload,REBIND_BOUNDARY_SQL,REBIND_SOURCE_STATE_SQL,REBIND_OBJECTS_SQL,REBIND_CREATE_AUTHORITY_SQL} from '../ci/admin-subject-rebind-capability.mjs';
import {REBIND_CONTROL_BOUNDARY_SQL,REBIND_READER_BOUNDARY_SQL,REBIND_RESTORE_STATE_BOUNDARY_SQL,REBIND_CONTROL_READ_SQL,REBIND_CONTROL_LOCK_SQL,
  REBIND_CONTROL_INSERT_SQL,REBIND_CONTROL_UPDATE_SQL} from '../ci/admin-subject-rebind-control.mjs';
import {REBIND_EXECUTOR_SESSION_SQL,rebindExecutorRoleFingerprint,rebindRoleMapSha256} from '../ci/admin-subject-rebind-executor.mjs';
import {REBIND_POLICY_ID_SQL} from '../ci/admin-subject-rebind-activation.mjs';

export const roles=Object.fromEntries(['admin','runtime','jobs','privacy','migrations'].map(label=>[`lythaus_${label}`,`pscale_api_${label}`]));
export const payload=rebindGrantPayload();
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const executor={mode:'existing_owner_connection',branchId:'vqa2g2xc9wsl',databaseName:'postgres',roleId:'syntheticexecutor',
  roleFingerprint:rebindExecutorRoleFingerprint('pscale_api_executor'),originFingerprint:'d'.repeat(64),roleMapSha256:rebindRoleMapSha256(roles)};
const bodies=[...payload.sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)];
export const mutatorRow=()=>({body:bodies[2][1],security_definer:true,owner:'postgres',language_matches:true,return_matches:true,
  behavior_matches:true,arguments_match:true,settings:['search_path=pg_catalog'],admin_execute:true,runtime_execute:false,
  jobs_execute:false,privacy_execute:false,admin_direct_update:false,admin_acts_as_owner:false,unexpected_execute:false,unexpected_role_reach:false});
export const readerRow=()=>({body:bodies[0][1],security_definer:true,owner:'postgres',definition_matches:true,
  settings:['search_path=pg_catalog'],admin_execute:true,other_roles_denied:true,acl_matches:true});
export const restoreStateRow=()=>({body:bodies[1][1],security_definer:true,owner:'postgres',definition_matches:true,
  settings:['search_path=pg_catalog'],verifier_execute:true,apps_denied:true,acl_matches:true,verifier_isolated:true});
export const controlBoundaryRow=()=>({namespace_matches:true,owner_matches:true,columns_match:true,structure_matches:true,runtime_isolated:true,acl_matches:true,
  constraints:["CHECK ((capability_sha256 ~ '^[a-f0-9]{64}$'::text))","CHECK ((disabled_from_policy_sha256 ~ '^[a-f0-9]{64}$'::text))",
    'CHECK (((length(policy_text) >= 1) AND (length(policy_text) <= 16384)))',
    "CHECK (((revision >= 0) AND (revision <= '9007199254740990'::bigint)))",'CHECK (singleton)','PRIMARY KEY (id)','UNIQUE (singleton)'].sort(),
  defaults:['revision:0',"policy_text:'DISABLED'::text"]});

export class PolicyClient {
  constructor({installed=true}={}){
    this.installed=installed;this.policy='DISABLED';this.revision=0;this.disabledFrom=null;
    this.alters=0;this.catalogLocks=0;this.afterCatalogLock=()=>{};this.blockCapacity=false;
    this.mutatorOverride={};this.sessionOverride={};this.queries=[];
  }
  async query(sql,args=[]){
    this.queries.push(sql);
    const one=row=>({rowCount:1,rows:[row]});
    if(sql===REBIND_EXECUTOR_SESSION_SQL)return one({database_name:'postgres',current_role:'pscale_api_executor',
      session_role:'pscale_api_executor',may_set_owner:!this.blockCapacity,login_valid:true,apps_isolated:true,...this.sessionOverride});
    if(sql===REBIND_CREATE_AUTHORITY_SQL)return one({owner_context:true,namespace_create:!this.blockNamespace,functions_create:true,verifier_ready:true});
    if(sql===REBIND_POLICY_ID_SQL)return one({oid:args[0].includes('policy()')?122:123});
    if(sql===REBIND_OBJECTS_SQL)return one({namespace_present:this.installed,control_present:this.installed,reader_present:this.installed,
      restore_state_present:this.installed,mutator_present:this.installed});
    if(sql===REBIND_BOUNDARY_SQL)return this.installed?one({...mutatorRow(),...this.mutatorOverride}):{rowCount:0,rows:[]};
    if(sql.includes(" AS control_present")&&sql.includes(" AS reader_present"))return one({control_present:this.installed,reader_present:this.installed});
    if(sql===REBIND_CONTROL_BOUNDARY_SQL)return one(controlBoundaryRow());
    if(sql===REBIND_READER_BOUNDARY_SQL)return one(readerRow());
    if(sql===REBIND_RESTORE_STATE_BOUNDARY_SQL)return one(restoreStateRow());
    if(sql===REBIND_CONTROL_READ_SQL||sql===REBIND_CONTROL_LOCK_SQL)return one({policy_text:this.policy,revision:String(this.revision),
      capability_sha256:payload.sha256,disabled_from_policy_sha256:this.disabledFrom});
    if(sql===REBIND_CONTROL_INSERT_SQL)return {rowCount:1,rows:[]};
    if(sql===REBIND_CONTROL_UPDATE_SQL){
      if(args[2]!==this.revision||args[3]!==this.policy)return {rowCount:0,rows:[]};
      this.policy=args[0];this.disabledFrom=args[1];this.revision++;this.alters++;
      return one({revision:String(this.revision)});
    }
    if(sql===REBIND_SOURCE_STATE_SQL)return one({one:true,two:true,three:true,four:true});
    if(sql.startsWith('ALTER FUNCTION ')&&sql.endsWith(' COST 100')){this.catalogLocks++;this.afterCatalogLock();return {rowCount:0,rows:[]};}
    if(sql.includes('CREATE TABLE admin_recovery.subject_rebind_control (')){this.installed=true;return {rowCount:0,rows:[]};}
    if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock|LOCK TABLE)/.test(sql))return {rowCount:0,rows:[]};
    throw new Error('unexpected_fixture_query');
  }
  async end(){}
}

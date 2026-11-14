import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {verifyHyperdriveTargets} from './verify-cloudflare-hyperdrive-targets.mjs';
import {branchQualifiedDatabaseTarget} from './planetscale-0021-target-identity.mjs';

const accountId='e5b7ae46e04698f507b7e4b3d4ef1af0';
const zoneId='7bc572c8b7cd3c00be9c655176c29382';
const worker='lythaus-admin-api-development';
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function verifyRebindLiveTarget({env,policy,roles,fetchImpl=fetch,verifyTargets=verifyHyperdriveTargets,
  manifest=JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json','utf8')),now=Date.now}) {
  const checkedAt=Math.floor(now()/1000);
  check(env.CLOUDFLARE_ACCOUNT_ID===accountId&&env.CLOUDFLARE_API_TOKEN,'admin_rebind_provider_context_invalid');
  const binding=manifest.bindings.filter(value=>value.worker===worker&&value.binding==='DB_ADMIN_FRESH');
  check(binding.length===1,'admin_rebind_admin_binding_invalid');
  const target=branchQualifiedDatabaseTarget(env.PLANETSCALE_ADMIN_DATABASE_URL);
  const metadataTarget=branchQualifiedDatabaseTarget(env.PLANETSCALE_SCHEMA_READ_DATABASE_URL);
  check(target.branchId===policy.databaseTarget.branchId&&target.sqlDatabaseName==='postgres'
    &&target.role===roles.lythaus_migrations&&target.originFingerprint===policy.databaseTarget.originFingerprint
    &&target.originFingerprint===manifest.expectedMainOriginFingerprint
    &&metadataTarget.branchId===target.branchId&&metadataTarget.sqlDatabaseName===target.sqlDatabaseName
    &&metadataTarget.originFingerprint===target.originFingerprint
    &&policy.databaseTarget.roleFingerprint===sha256(`lythaus-admin-diagnostic-role:v1:${roles.lythaus_admin}`),
  'admin_rebind_database_target_changed');
  const cf=async path=>{
    let response,payload;
    try{
      response=await fetchImpl(`https://api.cloudflare.com/client/v4${path}`,{method:'GET',redirect:'error',
        headers:{authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,accept:'application/json'},signal:AbortSignal.timeout(15000)});
      payload=await response.json();
    }catch{throw new Error('admin_rebind_provider_read_failed');}
    check(response.ok&&payload?.success===true&&payload.result!==undefined,'admin_rebind_provider_read_failed');
    return payload;
  };
  const list=async(path,{allowUnpaginated=false}={})=>{
    const items=[],ids=new Set();let expectedInventory=null;
    for(let page=1;page<=10;page++){
      const data=await cf(`${path}?per_page=100&page=${page}`);
      check(Array.isArray(data.result)&&data.result.length<=100,'admin_rebind_provider_inventory_invalid');
      const hasInfo=Object.hasOwn(data,'result_info'),info=data.result_info;let totalPages=null;
      if(!hasInfo){
        // Workers routes alone has a documented unpaginated array response.
        // Partial or absent Access pagination metadata never proves completeness.
        check(allowUnpaginated&&page===1&&expectedInventory===null,'admin_rebind_provider_pagination_missing');
      }else{
        check(info&&typeof info==='object'&&!Array.isArray(info),'admin_rebind_provider_pagination_invalid');
        const total=info.total_count,hasPages=Object.hasOwn(info,'total_pages');
        const perPage=info.per_page??(hasPages?100:undefined),derivedPages=Math.ceil(total/perPage);
        const pages=hasPages?info.total_pages:derivedPages;
        totalPages=pages;
        check(Number.isInteger(pages)&&pages>=0&&pages<=10&&info.page===page
          &&Number.isInteger(total)&&total>=0&&total<=1000
          &&Number.isInteger(perPage)&&perPage>0&&perPage<=100
          &&(pages===derivedPages||(total===0&&pages===1))
          &&(page<=pages||(page===1&&pages===0&&total===0))
          &&data.result.length===Math.min(perPage,Math.max(0,total-(page-1)*perPage))
          &&(info.count===undefined||info.count===data.result.length),
        'admin_rebind_provider_pagination_invalid');
        const inventory=JSON.stringify({pages,total,perPage});
        check(expectedInventory===null||expectedInventory===inventory,'admin_rebind_provider_pagination_changed');
        expectedInventory=inventory;
      }
      for(const item of data.result){
        check(typeof item?.id==='string'&&item.id.length>0&&!ids.has(item.id),'admin_rebind_provider_pagination_conflict');
        ids.add(item.id);items.push(item);
      }
      if(!hasInfo)return items;
      check(items.length<=info.total_count,'admin_rebind_provider_pagination_incomplete');
      if(page===totalPages||totalPages===0){
        check(items.length===info.total_count,'admin_rebind_provider_pagination_incomplete');return items;
      }
    }
    throw new Error('admin_rebind_provider_pagination_limit');
  };
  const base=`/accounts/${accountId}/workers/scripts/${worker}`;
  const deployments=(await cf(`${base}/deployments`)).result?.deployments;
  check(Array.isArray(deployments)&&deployments.length>0,'admin_rebind_deployment_missing');
  const sorted=deployments.map(item=>({item,time:Date.parse(item.created_on)})).sort((a,b)=>b.time-a.time);
  check(sorted.every(entry=>Number.isFinite(entry.time))&&(sorted.length===1||sorted[0].time>sorted[1].time),
    'admin_rebind_deployment_ambiguous');
  const serving=sorted[0].item.versions;
  check(Array.isArray(serving)&&serving.length===1&&serving[0].version_id===policy.workerVersionId&&serving[0].percentage===100,
    'admin_rebind_serving_version_changed');
  const version=(await cf(`${base}/versions/${policy.workerVersionId}`)).result;
  check(version.id===policy.workerVersionId&&version.annotations?.['workers/tag']===policy.sourceSha,
    'admin_rebind_serving_source_changed');
  const settings=version.resources?.bindings;
  check(Array.isArray(settings),'admin_rebind_version_bindings_missing');
  const one=name=>{const values=settings.filter(item=>item.name===name);check(values.length===1,'admin_rebind_version_binding_ambiguous');return values[0];};
  check(one('DB_ADMIN_FRESH').type==='hyperdrive'&&one('DB_ADMIN_FRESH').id===binding[0].hyperdriveId
    &&one('WORKER_VERSION').type==='version_metadata'&&one('ACCESS_SUBJECT_HMAC_KEY').type==='secret_text'
    &&one('ACCESS_TEAM_DOMAIN').text===new URL(policy.accessIssuer).hostname
    &&one('ACCESS_AUDIENCES').text?.split(',').map(value=>value.trim()).includes(policy.accessAudience)
    &&one('EXPECTED_HOSTNAMES').text?.split(',').map(value=>value.trim()).includes('admin.lythaus.co')
    &&one('CORS_ALLOWED_ORIGINS').text?.split(',').map(value=>value.trim()).includes(policy.origin),
  'admin_rebind_serving_binding_changed');
  const routes=await list(`/zones/${zoneId}/workers/routes`,{allowUnpaginated:true});
  const routeMatches=pattern=>typeof pattern==='string'&&new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')}$`)
    .test('admin.lythaus.co/api/admin/recovery/subject-rebind');
  const matching=routes.filter(item=>routeMatches(String(item.pattern).replace(/^https?:\/\//,'')));
  check(matching.some(item=>item.pattern==='admin.lythaus.co/api/admin/*'&&item.script===worker)
    &&matching.every(item=>item.script===worker),'admin_rebind_host_route_changed');
  const apps=await list(`/accounts/${accountId}/access/apps`);
  for(const [name,host] of [['Lythaus Admin UI','admin.lythaus.co'],['Lythaus Admin API','admin-api.lythaus.co']]){
    const matches=apps.filter(item=>item.name===name&&[item.domain,item.destination,...(item.self_hosted_domains??[])].includes(host));
    check(matches.length===1,'admin_rebind_access_application_ambiguous');
    const app=matches[0],policies=await list(`/accounts/${accountId}/access/apps/${app.id}/policies`);
    const decision=item=>String(item.decision??item.action??'').toLowerCase();
    const allowed=policies.filter(item=>decision(item)==='allow');
    const human=allowed[0];
    check(allowed.length===1&&human.include?.length===1&&(human.require?.length??0)===0&&(human.exclude?.length??0)===0
      &&!policies.some(item=>decision(item)==='bypass')
      &&policies.some(item=>['deny','block'].includes(decision(item))&&item.include?.some(selector=>selector.everyone)),
    'admin_rebind_access_policy_changed');
    const email=human.include[0]?.email?.email??human.include[0]?.email;
    check(typeof email==='string'&&sha256(email.toLowerCase())===policy.emailSha256,'admin_rebind_access_identity_changed');
    if(name==='Lythaus Admin UI')check(app.aud===policy.accessAudience,'admin_rebind_access_audience_changed');
  }
  const verified=await verifyTargets({environment:{...env,PSCALE_BRANCH_NAME:'main',HYPERDRIVE_VERIFY_IDS:binding[0].hyperdriveId},
    fetchImpl,readOnlyGetOnly:true});
  check(verified.status==='pass'&&verified.targetBranch==='main'&&verified.originFingerprint===policy.databaseTarget.originFingerprint
    &&verified.bindings.length===1&&verified.bindings[0].roleMatches===true&&verified.bindings[0].runtimeRoleMatches===true,
  'admin_rebind_hyperdrive_changed');
  const completedAt=now();
  check(checkedAt>=policy.notBefore&&checkedAt*1000<=completedAt&&completedAt-checkedAt*1000<=120000
    &&completedAt<policy.expiresAt*1000,'admin_rebind_control_plane_observation_expired');
  check(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')
    &&policy.reference===`canonical-release:${env.GITHUB_RUN_ID}:admin-subject-rebind`,
  'admin_rebind_control_plane_run_mismatch');
  return {status:'VERIFIED',workerVersionId:policy.workerVersionId,sourceSha:policy.sourceSha,
    intendedHost:'admin.lythaus.co',mainBindingVerified:true,accessIdentityVerified:true,readOnly:true,
    bindingProof:{schemaVersion:'lythaus-admin-rebind-binding-v1',worker,binding:'DB_ADMIN_FRESH',hyperdriveId:binding[0].hyperdriveId,
      sourceSha:policy.sourceSha,workerVersionId:policy.workerVersionId,releaseRunId:env.GITHUB_RUN_ID,
      branchId:target.branchId,databaseName:target.sqlDatabaseName,originFingerprint:target.originFingerprint,
      roleFingerprint:policy.databaseTarget.roleFingerprint,checkedAt,expiresAt:policy.expiresAt}};
}

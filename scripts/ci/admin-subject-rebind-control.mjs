import {createHash} from 'node:crypto';

export const REBIND_READER_SIGNATURE='identity.admin_subject_rebind_policy()';
export const REBIND_RESTORE_STATE_SIGNATURE='identity.admin_subject_rebind_restore_state()';
export const REBIND_METADATA_VERIFIER_ROLE='pscale_api_qodocjs6vgrb';
export const REBIND_METADATA_VERIFIER_READY_EXPR=`EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${REBIND_METADATA_VERIFIER_ROLE}'
  AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  AND (rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp()))
  AND NOT pg_has_role('${REBIND_METADATA_VERIFIER_ROLE}','postgres','MEMBER')
  AND NOT pg_has_role('${REBIND_METADATA_VERIFIER_ROLE}','postgres','SET')
  AND has_schema_privilege('${REBIND_METADATA_VERIFIER_ROLE}','identity','USAGE')`;
export const REBIND_CONTROL_TABLE='admin_recovery.subject_rebind_control';
export const REBIND_CONTROL_READ_SQL=`SELECT policy_text,revision,capability_sha256,disabled_from_policy_sha256
  FROM admin_recovery.subject_rebind_control WHERE singleton`;
export const REBIND_CONTROL_LOCK_SQL=`${REBIND_CONTROL_READ_SQL} FOR UPDATE`;
export const REBIND_CONTROL_INSERT_SQL=`INSERT INTO admin_recovery.subject_rebind_control(id,singleton,capability_sha256) VALUES($1,true,$2)`;
export const REBIND_CONTROL_UPDATE_SQL=`UPDATE admin_recovery.subject_rebind_control
  SET policy_text=$1,revision=revision+1,disabled_from_policy_sha256=$2
  WHERE singleton AND revision=$3 AND policy_text=$4 RETURNING revision`;
export const REBIND_CONTROL_BOUNDARY_SQL=`SELECT
  pg_get_userbyid(n.nspowner)='postgres'
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner)
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY[$1,$2,$3,$4]) AS member_role JOIN pg_roles reachable
      ON pg_has_role(member_role,reachable.oid,'MEMBER') OR pg_has_role(member_role,reachable.oid,'SET')
      WHERE has_schema_privilege(reachable.oid,n.oid,'USAGE,CREATE'))
    AND NOT EXISTS(SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace=n.oid)
    AND (SELECT count(*)=3 FROM pg_class r WHERE r.relnamespace=n.oid)
    AND (SELECT count(*)=2 FROM pg_type t WHERE t.typnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_type t WHERE t.typnamespace=n.oid AND t.typrelid<>c.oid AND t.typelem<>c.reltype)
    AND NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_operator o WHERE o.oprnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_opclass o WHERE o.opcnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_opfamily o WHERE o.opfnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_collation o WHERE o.collnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_conversion o WHERE o.connamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_ts_config o WHERE o.cfgnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_ts_parser o WHERE o.prsnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_ts_dict o WHERE o.dictnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_ts_template o WHERE o.tmplnamespace=n.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_statistic_ext o WHERE o.stxnamespace=n.oid) AS namespace_matches,
  pg_get_userbyid(c.relowner)='postgres' AND c.relkind='r' AND c.relpersistence='p'
    AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity AND NOT c.relispartition AS owner_matches,
  (SELECT array_agg(a.attname::text ORDER BY a.attnum)=ARRAY['id','singleton','revision','policy_text','capability_sha256','disabled_from_policy_sha256']
    AND array_agg(a.atttypid ORDER BY a.attnum)=ARRAY['uuid'::regtype::oid,'boolean'::regtype::oid,'bigint'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid]
    AND array_agg(a.attnotnull ORDER BY a.attnum)=ARRAY[true,true,true,true,true,false]
    AND bool_and(a.attidentity='' AND a.attgenerated='' AND NOT a.atthasmissing AND a.attacl IS NULL)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns_match,
  (SELECT array_agg(pg_get_constraintdef(k.oid) ORDER BY pg_get_constraintdef(k.oid))
    FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
  (SELECT array_agg(a.attname || ':' || pg_get_expr(d.adbin,d.adrelid) ORDER BY a.attnum)
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
    WHERE d.adrelid=c.oid) AS defaults,
  NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
    AND NOT EXISTS(SELECT 1 FROM pg_rewrite r WHERE r.ev_class=c.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
    AND (SELECT count(*)=1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND i.indisvalid AND i.indisready)
    AND (SELECT count(*)=2 FROM pg_index i WHERE i.indrelid=c.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND (NOT i.indisunique OR NOT i.indisvalid OR NOT i.indisready)) AS structure_matches,
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY[$1,$2,$3,$4]) AS member_role JOIN pg_roles reachable
    ON pg_has_role(member_role,reachable.oid,'MEMBER') OR pg_has_role(member_role,reachable.oid,'SET')
    WHERE has_table_privilege(reachable.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(reachable.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) AS runtime_isolated,
  NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE a.grantee<>c.relowner) AS acl_matches
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='admin_recovery' AND c.relname='subject_rebind_control'`;

export const REBIND_READER_BOUNDARY_SQL=`SELECT p.prosrc AS body,p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,p.proconfig AS settings,
  p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND p.provolatile='s' AND p.proparallel='u'
    AND NOT p.proisstrict AND NOT p.proleakproof AND p.prosupport::oid=0 AND p.procost=100 AND p.prorows=1000
    AND p.prorettype='record'::regtype AND p.proretset AND p.prokind='f' AND p.pronargs=0 AND p.pronargdefaults=0
    AND p.proargnames=ARRAY['policy_text','revision','capability_sha256','disabled_from_policy_sha256']::text[]
    AND p.proargmodes=ARRAY['t','t','t','t']::"char"[]
    AND p.proallargtypes=ARRAY['text'::regtype::oid,'bigint'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid] AS definition_matches,
  has_function_privilege($1,p.oid,'EXECUTE') AS admin_execute,
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY[$2,$3,$4]) AS member_role WHERE has_function_privilege(member_role,p.oid,'EXECUTE')) AS other_roles_denied,
  NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname=$1))
      OR (a.grantee<>p.proowner AND a.is_grantable))) AS acl_matches
 FROM pg_proc p WHERE p.oid=to_regprocedure('identity.admin_subject_rebind_policy()')`;

export const REBIND_RESTORE_STATE_BOUNDARY_SQL=`SELECT p.prosrc AS body,p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,p.proconfig AS settings,
  p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND p.provolatile='s' AND p.proparallel='u'
    AND NOT p.proisstrict AND NOT p.proleakproof AND p.prosupport::oid=0 AND p.procost=100 AND p.prorows=1000
    AND p.prorettype='record'::regtype AND p.proretset AND p.prokind='f' AND p.pronargs=0 AND p.pronargdefaults=0
    AND p.proargnames=ARRAY['id','disabled','revision','capability_sha256','disabled_from_policy_sha256']::text[]
    AND p.proargmodes=ARRAY['t','t','t','t','t']::"char"[]
    AND p.proallargtypes=ARRAY['uuid'::regtype::oid,'boolean'::regtype::oid,'bigint'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid] AS definition_matches,
  has_function_privilege('${REBIND_METADATA_VERIFIER_ROLE}',p.oid,'EXECUTE') AS verifier_execute,
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY[$1,$2,$3,$4]) AS member_role JOIN pg_roles reachable
    ON pg_has_role(member_role,reachable.oid,'MEMBER') OR pg_has_role(member_role,reachable.oid,'SET')
    WHERE has_function_privilege(reachable.oid,p.oid,'EXECUTE')) AS apps_denied,
  NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='${REBIND_METADATA_VERIFIER_ROLE}'))
      OR (a.grantee<>p.proowner AND a.is_grantable))) AS acl_matches,
  NOT EXISTS(SELECT 1 FROM pg_roles reachable WHERE
    (pg_has_role('${REBIND_METADATA_VERIFIER_ROLE}',reachable.oid,'MEMBER') OR pg_has_role('${REBIND_METADATA_VERIFIER_ROLE}',reachable.oid,'SET'))
    AND (has_schema_privilege(reachable.oid,n.oid,'USAGE,CREATE')
      OR has_table_privilege(reachable.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(reachable.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_function_privilege(reachable.oid,to_regprocedure('identity.admin_subject_rebind_policy()'),'EXECUTE')
      OR has_function_privilege(reachable.oid,to_regprocedure('identity.rebind_control_plane_administrator(bytea,text,uuid,text,bytea,bigint,uuid,text)'),'EXECUTE'))) AS verifier_isolated
 FROM pg_proc p JOIN pg_namespace n ON n.nspname='admin_recovery'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname='subject_rebind_control'
 WHERE p.oid=to_regprocedure('identity.admin_subject_rebind_restore_state()')`;

const digest=value=>createHash('sha256').update(value).digest('hex');
const check=(condition,code)=>{if(!condition)throw new Error(code);};
const constraints=[
  "CHECK ((capability_sha256 ~ '^[a-f0-9]{64}$'::text))",
  "CHECK ((disabled_from_policy_sha256 ~ '^[a-f0-9]{64}$'::text))",
  'CHECK (((length(policy_text) >= 1) AND (length(policy_text) <= 16384)))',
  "CHECK (((revision >= 0) AND (revision <= '9007199254740990'::bigint)))",
  'CHECK (singleton)','PRIMARY KEY (id)','UNIQUE (singleton)',
].sort();

export function assertRebindControlBoundary(row) {
  check(row&&row.namespace_matches===true&&row.owner_matches===true&&row.columns_match===true&&row.structure_matches===true
    &&row.runtime_isolated===true&&row.acl_matches===true
    &&Array.isArray(row.constraints)&&JSON.stringify([...row.constraints].sort())===JSON.stringify(constraints)
    &&JSON.stringify(row.defaults)===JSON.stringify(['revision:0',"policy_text:'DISABLED'::text"]),
  'admin_rebind_control_boundary_invalid');
}

export function assertRebindReaderBoundary(row,payload) {
  check(row&&typeof row.body==='string'&&digest(row.body)===payload.readerBodySha256
    &&row.security_definer===true&&row.owner==='postgres'&&row.definition_matches===true
    &&JSON.stringify(row.settings)===JSON.stringify(['search_path=pg_catalog'])
    &&row.admin_execute===true&&row.other_roles_denied===true&&row.acl_matches===true,
  'admin_rebind_reader_boundary_invalid');
}

export function assertRebindRestoreStateBoundary(row,payload) {
  check(row&&typeof row.body==='string'&&digest(row.body)===payload.restoreStateBodySha256
    &&row.security_definer===true&&row.owner==='postgres'&&row.definition_matches===true
    &&JSON.stringify(row.settings)===JSON.stringify(['search_path=pg_catalog'])
    &&row.verifier_execute===true&&row.apps_denied===true&&row.acl_matches===true&&row.verifier_isolated===true,
  'admin_rebind_restore_state_boundary_invalid');
}

export function checkedRebindControl(row,payload) {
  const raw=row?.revision;
  check((typeof raw==='string'&&/^(0|[1-9][0-9]*)$/.test(raw)||typeof raw==='number')
    &&Number.isSafeInteger(Number(raw))&&Number(raw)>=0&&Number(raw)<Number.MAX_SAFE_INTEGER-1
    &&row.capability_sha256===payload.sha256&&typeof row.policy_text==='string'
    &&row.policy_text.length>=1&&row.policy_text.length<=16384
    &&(row.disabled_from_policy_sha256===null||/^[a-f0-9]{64}$/.test(row.disabled_from_policy_sha256)),
  'admin_rebind_control_state_invalid');
  check(row.policy_text==='DISABLED'
    ? Number(raw)===0?row.disabled_from_policy_sha256===null:typeof row.disabled_from_policy_sha256==='string'
    : Number(raw)>0&&row.disabled_from_policy_sha256===null,
  'admin_rebind_control_state_invalid');
  return {policyText:row.policy_text,revision:Number(raw),disabledFromPolicySha256:row.disabled_from_policy_sha256};
}

export async function rebindControlCatalog(client,roles,payload) {
  const args=['admin','runtime','jobs','privacy'].map(label=>roles[`lythaus_${label}`]);
  const table=await client.query(REBIND_CONTROL_BOUNDARY_SQL,args);
  check(table.rowCount===1&&table.rows.length===1,'admin_rebind_control_missing');
  assertRebindControlBoundary(table.rows[0]);
  const reader=await client.query(REBIND_READER_BOUNDARY_SQL,args);
  check(reader.rowCount===1&&reader.rows.length===1,'admin_rebind_reader_missing');
  assertRebindReaderBoundary(reader.rows[0],payload);
  const attestor=await client.query(REBIND_RESTORE_STATE_BOUNDARY_SQL,args);
  check(attestor.rowCount===1&&attestor.rows.length===1,'admin_rebind_restore_state_missing');
  assertRebindRestoreStateBoundary(attestor.rows[0],payload);
}

export async function rebindControlInventory(client,roles,payload,{lock=false}={}) {
  await rebindControlCatalog(client,roles,payload);
  const record=await client.query(lock?REBIND_CONTROL_LOCK_SQL:REBIND_CONTROL_READ_SQL);
  check(record.rowCount===1&&record.rows.length===1,'admin_rebind_control_missing');
  return checkedRebindControl(record.rows[0],payload);
}

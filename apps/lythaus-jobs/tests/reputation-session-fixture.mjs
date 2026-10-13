export const version = '01900000-0000-7000-8000-000000000001';
export const otherVersion = '01900000-0000-7000-8000-000000000002';
export const release = 'a'.repeat(40);
export const metadata = {
  sessionRole: 'pscale_api_9jfbtij9y4b2', currentRole: 'pscale_api_9jfbtij9y4b2', database: 'postgres',
  isolation: 'read committed', defaultIsolation: 'read committed', searchPath: '"$user", public',
  readOnlyMode: 'on', superuser: false, canLogin: true, bypassRls: false,
  createRole: false, createDb: false, inherit: true, memberships: 0,
  trustUsage: true, publicCreate: false, identityCreate: false, trustCreate: false,
  usersUpdate: false, usersIdSelect: true, usersStatusSelect: true, usersRls: false, usersForceRls: false,
};
export const rows = [
  ['sessionRole', 'currentRole', 'database', 'isolation', 'defaultIsolation', 'searchPath', 'readOnlyMode'],
  ['superuser', 'canLogin', 'bypassRls', 'createRole', 'createDb', 'inherit', 'memberships'],
  ['trustUsage', 'publicCreate', 'identityCreate', 'trustCreate', 'usersUpdate', 'usersIdSelect', 'usersStatusSelect'],
  ['usersRls', 'usersForceRls'],
].map(fields => Object.fromEntries(fields.map(field => [field, metadata[field]])));

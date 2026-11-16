import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { NEW_CORE_ROLE_LABELS, NEW_CORE_DEFERRED_ROLE_LABELS,
  verifyNewCoreRoleMemberships, validateNewCoreRoleMap, NEW_CORE_SQL_CREATOR_SHA256 } from '../ci/lythaus-new-core-role-profile.mjs';

const roleMap = Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label, label]));
const manager = 'synthetic_provisioner';
const pin = crypto.createHash('sha256').update(manager).digest('hex');
const managedRows = () => NEW_CORE_DEFERRED_ROLE_LABELS.map((role_name) => ({
  role_name, member_name: manager, admin_option: true, inherit_option: false, set_option: false,
}));
const client = (rows) => ({ async query() { return { rows }; } });

test('only the pinned provisioner may hold the three mandatory ADMIN-only grants', async () => {
  assert.deepEqual(await verifyNewCoreRoleMemberships(client(managedRows()), roleMap, pin), {
    totalMemberships: 3, provisionerManagementGrants: 3, runtimeRoleMemberships: 0,
  });
  assert.equal((await verifyNewCoreRoleMemberships(client([]), roleMap)).totalMemberships, 0);
});

test('unapproved, inheritable, settable and runtime-role memberships are refused', async () => {
  for (const change of [
    { member_name: 'another_provisioner' }, { member_name: 'lythaus_admin' },
    { role_name: 'lythaus_migrations' }, { admin_option: false },
    { inherit_option: true }, { set_option: true },
  ]) {
    const rows = managedRows(); Object.assign(rows[0], change);
    await assert.rejects(verifyNewCoreRoleMemberships(client(rows), roleMap, pin), /membership_boundary_failed/);
  }
  for (const rows of [managedRows().slice(1), [...managedRows(), managedRows()[0]]]) {
    await assert.rejects(verifyNewCoreRoleMemberships(client(rows), roleMap, pin), /membership_boundary_failed/);
  }
  await assert.rejects(verifyNewCoreRoleMemberships(client(managedRows()), roleMap), /membership_boundary_failed/);
});

test('SQL-console mode requires six literal roles and exactly six pinned ADMIN-only creator memberships', async () => {
  assert.throws(() => validateNewCoreRoleMap(roleMap));
  assert.equal(validateNewCoreRoleMap(roleMap, { mode: 'sql-console' }), roleMap);
  assert.throws(() => validateNewCoreRoleMap({ ...roleMap, lythaus_migrations: 'pscale_api_another' }, { mode: 'sql-console' }));
  assert.throws(() => validateNewCoreRoleMap(roleMap, { mode: 'auto' }));
  const rows = NEW_CORE_ROLE_LABELS.map((role_name) => ({ role_name, member_name: 'postgres',
    admin_option: true, inherit_option: false, set_option: false }));
  assert.equal((await verifyNewCoreRoleMemberships(client(rows), roleMap,
    NEW_CORE_SQL_CREATOR_SHA256, { mode: 'sql-console' })).totalMemberships, 6);
  for (const invalid of [rows.slice(1), rows.map((row) => ({ ...row, set_option: true })),
    rows.map((row) => ({ ...row, member_name: 'unapproved' }))]) {
    await assert.rejects(verifyNewCoreRoleMemberships(client(invalid), roleMap,
      NEW_CORE_SQL_CREATOR_SHA256, { mode: 'sql-console' }), /membership_boundary_failed/);
  }
  await assert.rejects(verifyNewCoreRoleMemberships(client(rows), roleMap, pin, { mode: 'sql-console' }), /creator_pin_mismatch/);
});

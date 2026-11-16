import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { NEW_CORE_ROLE_LABELS, NEW_CORE_DEFERRED_ROLE_LABELS,
  verifyNewCoreRoleMemberships } from '../ci/lythaus-new-core-role-profile.mjs';

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

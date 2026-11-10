import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  RESTORE_PLAN_SCHEMA, TARGET_BYTES_MIN, TARGET_BYTES_MAX,
  parseRestorePlanPins, buildRestorePlan, canonicalRestorePlan, restorePlanSha256,
  assertLiveBackupMatchesPlan, planErrorCode,
} from '../ci/planetscale-native-restore-plan.mjs';

// Synthetic fixtures only. This suite imports no provider client or runner.
const GiB = 1024 ** 3;
const completedAt = '2026-11-09T08:00:00.000Z';
const expiresAt = '2026-11-11T08:00:00.000Z';
const deletedAt = '2026-11-08T09:00:00.000Z';
const identity = { releaseSha: 'a'.repeat(40), schemaMode: 'post-0021', sourceBranchId: 'source123' };
const window = { ...identity, now: Date.parse('2026-11-09T10:00:00.000Z'), maximumMs: 60 * 60_000 };
const pins = () => ({ backupId: 'backup123', backupCompletedAt: completedAt,
  target: 'lythaus-0021-native-restore-check-20261109-01', targetBytes: 28 * GiB });
const history = () => [
  { id: 'zold', name: 'older-restore', deleted_at: deletedAt },
  { id: 'aexisting', name: 'retained-restore', deleted_at: null },
];
const backup = () => ({ id: pins().backupId, completed_at: completedAt, expires_at: expiresAt,
  state: 'success', deleted_at: null, protected: true,
  pvc_size: 26 * GiB, uncompressed_size: 512 * 1024 ** 2,
  database_branch: { id: identity.sourceBranchId, name: 'main', deleted_at: null },
  restored_branches: history() });
const plan = () => buildRestorePlan(pins(), backup(), identity);
const clone = value => structuredClone(value);
const reject = (operation, code) => assert.throws(operation, error => {
  assert.equal(typeof error.code, 'string', 'rejection must expose a stable plan error code');
  if (code) assert.equal(error.code, code);
  return true;
});

test('explicit restore pins are required, exact, and immutable', () => {
  const value = parseRestorePlanPins(JSON.stringify(pins()));
  assert.deepEqual(value, pins());
  assert.ok(Object.isFrozen(value));
  for (const raw of [undefined, '', '{', 'undefined']) {
    reject(() => parseRestorePlanPins(raw), 'restore_plan_pins_required');
  }
  for (const value of [null, [], {}, true, 'backup123', { ...pins(), extra: true }]) {
    reject(() => parseRestorePlanPins(JSON.stringify(value)), 'restore_plan_pins_invalid');
  }
  for (const key of Object.keys(pins())) {
    const missing = pins(); delete missing[key];
    reject(() => parseRestorePlanPins(JSON.stringify(missing)), 'restore_plan_pins_invalid');
  }
  reject(() => parseRestorePlanPins(JSON.stringify(pins()).replace(/}$/, ',"__proto__":{}}')),
    'restore_plan_pins_invalid');
});

test('pins reject path, shell, expression, date, and size injection', () => {
  const invalid = [
    ['backupId', '../backup123'], ['backupId', 'backup123; echo unsafe'],
    ['backupId', 'backup123\n'], ['backupId', '${{ secrets.TOKEN }}'],
    ['backupId', 'B'.repeat(65)], ['target', 'main'],
    ['target', `${pins().target}/../main`], ['target', `${pins().target}; echo unsafe`],
    ['target', 'lythaus-0021-native-restore-check-20260230-01'],
    ['target', 'lythaus-0021-native-restore-check-20261301-01'],
    ['target', 'lythaus-0021-native-restore-check-20261109-1'],
    ['backupCompletedAt', '2026-11-09T08:00:00.000+00:00'],
    ['backupCompletedAt', '2026-02-30T08:00:00.000Z'],
    ['targetBytes', '30064771072'], ['targetBytes', null], ['targetBytes', true],
    ['targetBytes', 0], ['targetBytes', -GiB], ['targetBytes', TARGET_BYTES_MIN - GiB],
    ['targetBytes', TARGET_BYTES_MAX + GiB], ['targetBytes', TARGET_BYTES_MIN + 1],
    ['targetBytes', Number.MAX_SAFE_INTEGER + 1],
  ];
  for (const [key, value] of invalid) {
    reject(() => parseRestorePlanPins(JSON.stringify({ ...pins(), [key]: value })), 'restore_plan_pins_invalid');
  }
  for (const targetBytes of [TARGET_BYTES_MIN, TARGET_BYTES_MAX]) {
    assert.equal(parseRestorePlanPins(JSON.stringify({ ...pins(), targetBytes })).targetBytes, targetBytes);
  }
  for (const backupCompletedAt of ['2026-11-09T08:00:00Z', '2026-11-09T08:00:00.7Z', '2026-11-09T08:00:00.123456789Z']) {
    assert.equal(parseRestorePlanPins(JSON.stringify({ ...pins(), backupCompletedAt })).backupCompletedAt, backupCompletedAt);
  }
});

test('canonical plan preserves provider deletion history and is idempotent and deeply frozen', () => {
  const value = plan();
  assert.equal(value.schemaVersion, RESTORE_PLAN_SCHEMA);
  assert.deepEqual(value.backup.restoredBranches, [
    { id: 'aexisting', name: 'retained-restore', deletedAt: null },
    { id: 'zold', name: 'older-restore', deletedAt },
  ]);
  assert.deepEqual(canonicalRestorePlan(value, identity), value);
  for (const object of [value, value.backup, value.target, value.backup.restoredBranches,
    ...value.backup.restoredBranches]) assert.ok(Object.isFrozen(object));
  assert.throws(() => { value.target.minimumStorageBytes = TARGET_BYTES_MAX; }, TypeError);
});

test('plan digest is canonical SHA-256 and independent of object and history ordering', () => {
  const value = plan();
  const shuffled = Object.fromEntries(Object.entries(clone(value)).reverse());
  shuffled.backup = Object.fromEntries(Object.entries(shuffled.backup).reverse());
  shuffled.backup.restoredBranches.reverse();
  shuffled.target = Object.fromEntries(Object.entries(shuffled.target).reverse());
  const expected = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(restorePlanSha256(value, identity), expected);
  assert.equal(restorePlanSha256(shuffled, identity), expected);
  assert.deepEqual(assertLiveBackupMatchesPlan(value, { ...backup(), restored_branches: history().reverse() }, window), value);
});

test('plan digest binds every approved backup, history, target, and release identity field', () => {
  const value = plan(), original = restorePlanSha256(value, identity);
  for (const edit of [
    value => { value.backup.id = 'backup456'; },
    value => { value.backup.completedAt = '2026-11-09T08:01:00.000Z'; },
    value => { value.backup.expiresAt = '2026-11-11T08:01:00.000Z'; },
    value => { value.backup.protected = false; },
    value => { value.backup.pvcBytes += 1; },
    value => { value.backup.uncompressedBytes += 1; },
    value => { value.backup.restoredBranches[0].name = 'renamed-history'; },
    value => { value.backup.restoredBranches[0].id = 'different123'; },
    value => { value.backup.restoredBranches[1].deletedAt = null; },
    value => { value.target.name = 'lythaus-0021-native-restore-check-20261109-02'; },
    value => { value.target.minimumStorageBytes = value.target.maximumStorageBytes = 29 * GiB; },
  ]) {
    const changed = clone(value); edit(changed);
    assert.notEqual(restorePlanSha256(changed, identity), original);
  }
  for (const [field, replacement] of [['releaseSha', 'b'.repeat(40)], ['sourceBranchId', 'source456'], ['schemaMode', 'pre-0021']]) {
    const changed = { ...clone(value), [field]: replacement };
    assert.notEqual(restorePlanSha256(changed, { ...identity, [field]: replacement }), original);
    reject(() => restorePlanSha256(changed, identity), 'restore_plan_identity_invalid');
  }
});

test('canonical plans reject missing, extra, malformed, or mismatched identity and structure', () => {
  for (const options of [{}, { ...identity, releaseSha: 'b'.repeat(40) },
    { ...identity, schemaMode: 'pre-0021' }, { ...identity, sourceBranchId: 'other123' }]) {
    reject(() => canonicalRestorePlan(plan(), options), 'restore_plan_identity_invalid');
  }
  for (const edit of [
    value => { delete value.sourceBranchId; }, value => { value.extra = true; },
    value => { value.schemaVersion = 'unknown'; }, value => { value.releaseSha = 'main'; },
    value => { delete value.backup.expiresAt; }, value => { value.backup.extra = true; },
    value => { value.backup.protected = 'true'; }, value => { value.backup.pvcBytes = 0; },
    value => { value.backup.restoredBranches[0].extra = true; },
    value => { value.backup.uncompressedBytes = -1; }, value => { value.target.extra = true; },
  ]) {
    const changed = clone(plan()); edit(changed);
    reject(() => canonicalRestorePlan(changed, identity));
  }
});

test('target capacity stays within the exact approved bound and fits both backup sizes', () => {
  for (const bytes of [TARGET_BYTES_MIN, TARGET_BYTES_MAX]) {
    const live = { ...backup(), pvc_size: bytes, uncompressed_size: bytes };
    const value = buildRestorePlan({ ...pins(), targetBytes: bytes }, live, identity);
    assert.equal(value.target.minimumStorageBytes, bytes);
    assert.equal(value.target.maximumStorageBytes, bytes);
  }
  for (const field of ['pvc_size', 'uncompressed_size']) {
    reject(() => buildRestorePlan(pins(), { ...backup(), [field]: pins().targetBytes + 1 }, identity),
      'restore_plan_target_too_small');
  }
  for (const edit of [
    value => { value.target.minimumStorageBytes = TARGET_BYTES_MIN - GiB; },
    value => { value.target.minimumStorageBytes = TARGET_BYTES_MAX + GiB; },
    value => { value.target.minimumStorageBytes += 1; },
    value => { value.target.maximumStorageBytes += GiB; },
    value => { value.target.maximumStorageBytes -= GiB; },
  ]) {
    const changed = clone(plan()); edit(changed);
    reject(() => canonicalRestorePlan(changed, identity), 'restore_plan_target_invalid');
  }
});

test('live backup identity, completion, state, source, and metadata cannot drift', () => {
  assert.deepEqual(assertLiveBackupMatchesPlan(plan(), backup(), window), plan());
  for (const edit of [
    value => { value.id = 'different123'; }, value => { value.state = 'pending'; },
    value => { value.deleted_at = deletedAt; }, value => { value.completed_at = '2026-11-09T08:01:00.000Z'; },
    value => { value.expires_at = '2026-11-11T09:00:00.000Z'; },
    value => { value.database_branch.id = 'source456'; }, value => { value.database_branch.name = 'other'; },
    value => { value.database_branch.deleted_at = deletedAt; }, value => { value.protected = false; },
    value => { value.pvc_size += 1; }, value => { value.uncompressed_size += 1; },
  ]) {
    const changed = backup(); edit(changed);
    reject(() => assertLiveBackupMatchesPlan(plan(), changed, window));
  }
});

test('live restore history rejects additions, omissions, renames, rebindings, and deletion drift', () => {
  for (const edit of [
    rows => { rows.push({ id: 'newhistory', name: 'unexpected', deleted_at: null }); },
    rows => { rows.pop(); }, rows => { rows[0].name = 'renamed'; }, rows => { rows[0].id = 'replacement'; },
    rows => { rows[0].deleted_at = null; }, rows => { rows[1].deleted_at = deletedAt; },
    rows => { rows[0].deleted_at = '2026-11-08T09:01:00.000Z'; },
  ]) {
    const changed = backup(); edit(changed.restored_branches);
    reject(() => assertLiveBackupMatchesPlan(plan(), changed, window), 'restore_plan_live_metadata_changed');
  }
});

test('history must be complete, bounded, unique, and well formed', () => {
  for (const rows of [undefined, null, {}, Array.from({ length: 1001 }, (_, i) => ({ id: `id${i}`, name: 'old' })),
    [null], [{ id: 'unsafe/id', name: 'old' }], [{ id: 'old123', name: '' }],
    [{ id: 'old123', name: 'old', deleted_at: 'invalid' }],
    [{ id: 'old123', name: 'one' }, { id: 'old123', name: 'two' }]]) {
    reject(() => buildRestorePlan(pins(), { ...backup(), restored_branches: rows }, identity));
  }
  const missingDeletionState = backup();
  delete missingDeletionState.restored_branches[0].deleted_at;
  reject(() => buildRestorePlan(pins(), missingDeletionState, identity), 'backup_restore_history_invalid');
  const undefinedDeletionState = backup();
  undefinedDeletionState.restored_branches[0].deleted_at = undefined;
  reject(() => buildRestorePlan(pins(), undefinedDeletionState, identity), 'backup_restore_history_invalid');
});

test('freshness covers the entire test window with a strict future expiry', () => {
  const value = plan(), completed = Date.parse(completedAt), day = 24 * 60 * 60_000;
  assert.doesNotThrow(() => assertLiveBackupMatchesPlan(value, backup(), { ...window, now: completed }));
  assert.doesNotThrow(() => assertLiveBackupMatchesPlan(value, backup(), { ...window, now: completed + day - window.maximumMs }));
  for (const options of [
    { now: completed - 1 }, { now: completed + day - window.maximumMs + 1 },
    { now: NaN }, { now: undefined }, { maximumMs: undefined }, { maximumMs: 0 },
    { maximumMs: -1 }, { maximumMs: 1.5 }, { maximumMs: day + 1 },
  ]) reject(() => assertLiveBackupMatchesPlan(value, backup(), { ...window, ...options }), 'backup_stale_or_test_window_too_short');
  for (const difference of [-1, 0, 1]) {
    const live = { ...backup(), expires_at: new Date(window.now + window.maximumMs + difference).toISOString() };
    const expiringPlan = buildRestorePlan(pins(), live, identity);
    if (difference > 0) assert.doesNotThrow(() => assertLiveBackupMatchesPlan(expiringPlan, live, window));
    else reject(() => assertLiveBackupMatchesPlan(expiringPlan, live, window), 'backup_stale_or_test_window_too_short');
  }
});

test('unprotected plans are inspectable but default admission fails closed without changing protection', () => {
  const live = { ...backup(), protected: false }, value = buildRestorePlan(pins(), live, identity);
  assert.equal(value.backup.protected, false);
  assert.match(restorePlanSha256(value, identity), /^[a-f0-9]{64}$/);
  reject(() => canonicalRestorePlan(value, { ...identity, requireProtected: true }), 'restore_plan_backup_not_protected');
  reject(() => assertLiveBackupMatchesPlan(value, live, window), 'restore_plan_backup_not_protected');
  assert.deepEqual(assertLiveBackupMatchesPlan(value, live, { ...window, requireProtected: false }), value);
  reject(() => assertLiveBackupMatchesPlan(value, { ...live, protected: true }, { ...window, requireProtected: false }),
    'restore_plan_live_metadata_changed');
  assert.equal(live.protected, false);
});

test('a target history entry is rejected before create and accepted only with its exact post-create acknowledgment', () => {
  const value = plan(), target = { id: 'created123', name: pins().target };
  const live = backup(); live.restored_branches.push({ ...target, deleted_at: null });
  reject(() => buildRestorePlan(pins(), live, identity), 'backup_target_history_unexpected');
  reject(() => assertLiveBackupMatchesPlan(value, live, window), 'backup_target_history_unexpected');
  assert.deepEqual(assertLiveBackupMatchesPlan(value, live, { ...window, allowedRestoredTarget: target }), value);
  assert.equal(restorePlanSha256(value, identity), restorePlanSha256(plan(), identity), 'post-create admission must preserve the pre-create plan digest');
});

test('post-create acknowledgment permits exactly one live matching target and no other history or metadata drift', () => {
  const target = { id: 'created123', name: pins().target }, options = { ...window, allowedRestoredTarget: target };
  const created = () => ({ ...backup(), restored_branches: [...history(), { ...target, deleted_at: null }] });
  for (const edit of [
    value => { value.restored_branches.pop(); },
    value => { value.restored_branches.at(-1).id = 'wrong123'; },
    value => { value.restored_branches.at(-1).name = 'wrong-target'; },
    value => { value.restored_branches.at(-1).deleted_at = deletedAt; },
    value => { value.restored_branches.push({ id: 'second123', name: target.name, deleted_at: null }); },
    value => { value.restored_branches.push({ ...target, deleted_at: null }); },
    value => { value.restored_branches.push({ id: 'other123', name: 'other-restore', deleted_at: null }); },
    value => { value.restored_branches[0].deleted_at = null; },
    value => { value.pvc_size += 1; }, value => { value.protected = false; },
  ]) {
    const changed = created(); edit(changed);
    reject(() => assertLiveBackupMatchesPlan(plan(), changed, options));
  }
  for (const acknowledgment of [{ id: 'other123', name: target.name }, { id: target.id, name: 'other' },
    { id: '../created123', name: target.name }, {}]) {
    reject(() => assertLiveBackupMatchesPlan(plan(), created(), { ...window, allowedRestoredTarget: acknowledgment }));
  }
  const collidingPlan = clone(plan());
  collidingPlan.backup.restoredBranches.push({ ...target, name: 'previous-name', deletedAt: null });
  reject(() => assertLiveBackupMatchesPlan(collidingPlan, created(), options), 'restore_plan_created_target_binding_invalid');
  const alreadyCreated = buildRestorePlan(pins(), created(), { ...identity, allowedRestoredTarget: target });
  reject(() => assertLiveBackupMatchesPlan(alreadyCreated, created(), options), 'restore_plan_created_target_binding_invalid');
});

test('plan error codes are stable and unexpected exceptions have a bounded fallback', () => {
  assert.equal(planErrorCode({ code: 'restore_plan_target_too_small' }), 'restore_plan_target_too_small');
  for (const error of [null, undefined, new Error('private details'), { code: 123 }]) {
    assert.equal(planErrorCode(error), 'restore_plan_invalid');
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
  createAcceptanceRollbackSnapshot,
  deploymentPayloadForRollback,
  validateAcceptanceRollbackSnapshot,
} from '../release/acceptance-rollback-snapshot.mjs';

const id = (digit) => `${digit}`.repeat(8) + '-1111-4111-8111-' + `${digit}`.repeat(12);
const deployment = (digit, percentage = 100) => ({ versions: [{ version_id: id(digit), percentage }] });
const routes = {
  adminApi: { route: { id: 'route-admin-1', pattern: 'admin.lythaus.co/api/admin/*', script: 'lythaus-admin-api-development' } },
  coordinator: { route: { id: 'route-coordinator-1', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: 'lythaus-auth-acceptance-coordinator-development' } },
};

test('rollback snapshot keeps only positive serving traffic and sanitized routes', () => {
  const snapshot = createAcceptanceRollbackSnapshot({
    workerDeployments: {
      public: { versions: [{ version_id: id(1), percentage: 80 }, { version_id: id(2), percentage: 20 }, { version_id: id(3), percentage: 0 }] },
      admin: deployment(4),
      jobs: deployment(5),
      coordinator: deployment(6),
    },
    routeSnapshots: routes,
  });
  assert.equal(snapshot.schemaVersion, ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA);
  assert.deepEqual(snapshot.workers.public.versions, [{ versionId: id(1), percentage: 80 }, { versionId: id(2), percentage: 20 }]);
  assert.equal(snapshot.workers.public.versions.some(({ percentage }) => percentage === 0), false);
  assert.equal(snapshot.routes.adminApi.script, 'lythaus-admin-api-development');
  assert.deepEqual(deploymentPayloadForRollback(snapshot, 'public'), { versions: [{ version_id: id(1), percentage: 80 }, { version_id: id(2), percentage: 20 }] });
});

test('rollback snapshot permits an absent previous Coordinator only for a new Coordinator', () => {
  const value = {
    schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
    workers: {
      public: { versions: [{ versionId: id(1), percentage: 100 }] },
      admin: { versions: [{ versionId: id(2), percentage: 100 }] },
      jobs: { versions: [{ versionId: id(3), percentage: 100 }] },
      coordinator: { versions: [] },
    },
    routes: { adminApi: null, coordinator: null },
  };
  assert.doesNotThrow(() => validateAcceptanceRollbackSnapshot(value, {
    candidateDependencies: { coordinator: { status: 'NEW_CANDIDATE' } },
  }));
  assert.throws(() => validateAcceptanceRollbackSnapshot(value, {
    candidateDependencies: { coordinator: { status: 'REUSED_PRODUCTION' } },
  }), /reused_snapshot_empty/);
});

test('rollback snapshot rejects zero-traffic-only, duplicate, and unsafe route state', () => {
  const base = {
    schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
    workers: {
      public: { versions: [{ versionId: id(1), percentage: 100 }] },
      admin: { versions: [{ versionId: id(2), percentage: 100 }] },
      jobs: { versions: [{ versionId: id(3), percentage: 100 }] },
      coordinator: { versions: [{ versionId: id(4), percentage: 100 }] },
    },
    routes: { adminApi: null, coordinator: null },
  };
  const zero = structuredClone(base);
  zero.workers.public.versions = [];
  assert.throws(() => validateAcceptanceRollbackSnapshot(zero), /public_versions_invalid/);
  const duplicate = structuredClone(base);
  duplicate.workers.public.versions = [{ versionId: id(1), percentage: 50 }, { versionId: id(1), percentage: 50 }];
  assert.throws(() => validateAcceptanceRollbackSnapshot(duplicate), /duplicate_version/);
  const unsafe = structuredClone(base);
  unsafe.routes.adminApi = { id: 'route', pattern: 'admin.example\n/api/*', script: null };
  assert.throws(() => validateAcceptanceRollbackSnapshot(unsafe), /route_pattern_invalid/);
});

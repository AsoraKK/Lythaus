import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { integratePublicApiComments, integrateJobsCommentNotifications, integrateAdminCommentRevision, integrateCommentNotificationNavigation } from '../apps/lythaus-public-api/tests/comment-integration-hooks.mjs';

const directory = mkdtempSync(join(tmpdir(), 'lythaus-comment-integration-'));
try {
  for (const [path, integrate] of [
    ['apps/lythaus-public-api/src/index.ts', integratePublicApiComments],
    ['apps/lythaus-jobs/src/index.ts', integrateJobsCommentNotifications],
    ['apps/lythaus-admin-api/src/index.ts', integrateAdminCommentRevision],
    ['lib/features/notifications/domain/notification_models.dart', integrateCommentNotificationNavigation],
  ]) {
    const before = readFileSync(path, 'utf8');
    writeFileSync(join(directory, 'before'), before);
    writeFileSync(join(directory, 'after'), integrate(before));
    const result = spawnSync('diff', ['-u', '--label', 'a/' + path, '--label', 'b/' + path,
      join(directory, 'before'), join(directory, 'after')], { encoding: 'utf8' });
    if (![0, 1].includes(result.status)) throw new Error(result.stderr);
    process.stdout.write(result.stdout.replace(/^ $/gm, '-\n+'));
  }
} finally { rmSync(directory, { recursive: true, force: true }); }

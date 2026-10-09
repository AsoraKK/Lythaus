import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

fs.mkdirSync(process.env.HOME, { recursive: true });
const privacy = spawnSync('/tools/flutter/bin/cache/dart-sdk/bin/dart', ['--disable-analytics'], { cwd: '/work', encoding: 'utf8' });
if (privacy.error || privacy.status !== 0) throw new Error('ISOLATED_ANALYTICS_DISABLE_FAILED');

const result = spawnSync('/tools/flutter/bin/cache/dart-sdk/bin/dart', ['analyze', '--fatal-infos', 'test'], { cwd: '/work', encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;

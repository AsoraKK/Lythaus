import { execFileSync } from 'node:child_process';

// This target uses the real Flutter content widgets against a loopback-only
// synthetic API. PostgreSQL tests exercise the actual Worker permissions.
for (const script of [
  'scripts/tests/content-journey-browser-functional.mjs',
  'scripts/tests/content-journey-browser-recovery.mjs',
]) execFileSync(process.execPath, [script], { stdio: 'inherit', env: process.env });

#!/usr/bin/env node

import fs from 'node:fs';
import { assertRollbackSafeAfterPartialActivation } from '../release/owner-testing-activation-handoff.mjs';

const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return JSON.parse(fs.readFileSync(args[index + 1], 'utf8'));
};
const expected = readArg('--expected');
const current = readArg('--current');
const parseEnv = (name, fallback) => {
  const value = process.env[name];
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { throw new Error(`${name} must contain valid JSON`); }
};
assertRollbackSafeAfterPartialActivation(expected, current, {
  attemptedComponents: parseEnv('ROLLBACK_ATTEMPTED_COMPONENTS_JSON', []),
  candidateVersions: parseEnv('ROLLBACK_CANDIDATE_VERSIONS_JSON', {}),
  attemptedRoutes: parseEnv('ROLLBACK_ATTEMPTED_ROUTES_JSON', []),
  candidateRouteTargets: parseEnv('ROLLBACK_CANDIDATE_ROUTE_TARGETS_JSON', {}),
});
console.log('Verified that only the exact predeployment or in-run candidate state is present; rollback may proceed.');

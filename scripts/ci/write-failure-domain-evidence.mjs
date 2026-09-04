import fs from 'node:fs';

import { classifyFailure, failureDomainEvidence } from '../release/failure-domains.mjs';
import { transitionReleaseState } from './transition-release-state.mjs';

const gate = process.env.RELEASE_FAILURE_GATE
  || (process.env.AUTH_ACCEPTANCE_PENDING === 'true' ? 'PRODUCT_ACCEPTANCE' : 'ACTIVATION');
const code = process.env.RELEASE_FAILURE_CODE
  || (process.env.AUTH_ACCEPTANCE_PENDING === 'true' ? 'human_acceptance_required' : 'release_step_failed');
const message = process.env.RELEASE_FAILURE_MESSAGE
  || (process.env.AUTH_ACCEPTANCE_PENDING === 'true' ? 'human acceptance window is incomplete' : 'release step failed');
const evidence = failureDomainEvidence({ gate, code, message, domain: classifyFailure({ gate, code, message }) });
const serialized = JSON.stringify([evidence]);

export function transitionFailureState(history) {
  const current = Array.isArray(history) ? history.at(-1)?.state : undefined;
  if (current === 'VERIFIED' || current === 'ROLLED_BACK') {
    return { state: current, history };
  }
  try {
    return { state: 'BLOCKED', history: transitionReleaseState(history, 'BLOCKED') };
  } catch {
    return { state: 'BLOCKED', history };
  }
}

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `FAILURE_DOMAIN_EVIDENCE_JSON=${serialized}\n`, 'utf8');
  let history = [];
  try { history = process.env.RELEASE_STATE_HISTORY_JSON ? JSON.parse(process.env.RELEASE_STATE_HISTORY_JSON) : []; } catch { history = []; }
  const failureState = transitionFailureState(history);
  fs.appendFileSync(process.env.GITHUB_ENV, `RELEASE_STATE=${failureState.state}\nRELEASE_STATE_HISTORY_JSON=${JSON.stringify(failureState.history)}\n`, 'utf8');
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `domain=${evidence.domain}\n evidence_json=${serialized}\n`.replace(/^ /gm, ''), 'utf8');
console.log(serialized);

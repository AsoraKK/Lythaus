#!/usr/bin/env node

import fs from 'node:fs';

export const RELEASE_STATES = Object.freeze([
  'PREFLIGHT',
  'INFRASTRUCTURE_VERIFIED',
  'CANDIDATE_READY',
  'PRODUCT_ACCEPTANCE_REQUIRED',
  'PRODUCT_ACCEPTANCE_NOT_REQUIRED',
  'PRODUCT_ACCEPTANCE_PASSED',
  'ACTIVATED',
  'VERIFIED',
  'ROLLED_BACK',
  'BLOCKED',
]);

const transitions = Object.freeze({
  PREFLIGHT: ['INFRASTRUCTURE_VERIFIED', 'BLOCKED'],
  INFRASTRUCTURE_VERIFIED: ['CANDIDATE_READY', 'BLOCKED'],
  CANDIDATE_READY: ['PRODUCT_ACCEPTANCE_REQUIRED', 'PRODUCT_ACCEPTANCE_NOT_REQUIRED', 'BLOCKED'],
  PRODUCT_ACCEPTANCE_REQUIRED: ['PRODUCT_ACCEPTANCE_PASSED', 'BLOCKED', 'ROLLED_BACK'],
  PRODUCT_ACCEPTANCE_NOT_REQUIRED: ['ACTIVATED', 'BLOCKED'],
  PRODUCT_ACCEPTANCE_PASSED: ['ACTIVATED', 'BLOCKED'],
  ACTIVATED: ['VERIFIED', 'BLOCKED', 'ROLLED_BACK'],
  VERIFIED: [],
  ROLLED_BACK: [],
  BLOCKED: ['ROLLED_BACK'],
});

function parseHistory(value) {
  if (!value) return [];
  let history;
  try { history = JSON.parse(value); } catch { throw new Error('RELEASE_STATE_HISTORY_JSON must contain valid JSON'); }
  if (!Array.isArray(history) || history.some((entry) => !entry || typeof entry !== 'object' || !RELEASE_STATES.includes(entry.state))) {
    throw new Error('RELEASE_STATE_HISTORY_JSON must be a state history array');
  }
  return history;
}

export function transitionReleaseState(currentHistory, nextState, at = new Date().toISOString()) {
  if (!RELEASE_STATES.includes(nextState)) throw new Error(`unsupported release state ${nextState}`);
  const history = Array.isArray(currentHistory) ? currentHistory : [];
  const current = history.at(-1)?.state;
  if (!current && nextState !== 'PREFLIGHT') throw new Error('release state must start at PREFLIGHT');
  if (current && current !== nextState && !transitions[current]?.includes(nextState)) {
    throw new Error(`invalid release state transition ${current} -> ${nextState}`);
  }
  if (current === nextState) return Object.freeze(history);
  return Object.freeze([...history, Object.freeze({ state: nextState, at })]);
}

function main() {
  const nextState = process.argv[2];
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) throw new Error('GITHUB_ENV is required');
  const history = transitionReleaseState(parseHistory(process.env.RELEASE_STATE_HISTORY_JSON), nextState);
  fs.appendFileSync(githubEnv, `RELEASE_STATE=${nextState}\nRELEASE_STATE_HISTORY_JSON=${JSON.stringify(history)}\n`, 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${nextState}\nhistory_json=${JSON.stringify(history)}\n`, 'utf8');
  }
  console.log(JSON.stringify({ state: nextState, history }));
}

if (process.argv[1] && process.argv[1].endsWith('transition-release-state.mjs')) main();

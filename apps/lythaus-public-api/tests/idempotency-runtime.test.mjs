import assert from 'node:assert/strict';
import test from 'node:test';

import { runClaimedIdempotentWork } from '../src/idempotency-runtime.ts';

test('a domain commit followed by finalization failure is quarantined and never reported as safe to retry', async () => {
  let domainCommits = 0;
  let finalizations = 0;
  let quarantines = 0;

  await assert.rejects(runClaimedIdempotentWork({
    work: async () => {
      domainCommits += 1;
      return Response.json({ created: true }, { status: 201 });
    },
    finalize: async () => {
      finalizations += 1;
      throw new Error('connection_lost_after_domain_commit');
    },
    quarantine: async () => { quarantines += 1; },
    errorResponse: () => { throw new Error('unexpected_error_response'); },
  }), /idempotency_outcome_unknown/);

  assert.equal(domainCommits, 1);
  assert.equal(finalizations, 1);
  assert.equal(quarantines, 1);
});

test('a validation error is finalized as a stable replayable response', async () => {
  let storedStatus = 0;
  let storedBody;
  let quarantines = 0;

  const response = await runClaimedIdempotentWork({
    work: async () => { throw new Error('invalid_post'); },
    finalize: async (result) => {
      storedStatus = result.status;
      storedBody = await result.clone().json();
    },
    quarantine: async () => { quarantines += 1; },
    errorResponse: (classified) => Response.json({ error: classified.exposedCode }, { status: classified.status }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_post' });
  assert.equal(storedStatus, 400);
  assert.deepEqual(storedBody, { error: 'invalid_post' });
  assert.equal(quarantines, 0);
});

test('an ambiguous server failure is quarantined without finalizing an error replay', async () => {
  let finalizations = 0;
  let quarantines = 0;

  await assert.rejects(runClaimedIdempotentWork({
    work: async () => { throw new Error('connection_lost'); },
    finalize: async () => { finalizations += 1; },
    quarantine: async () => { quarantines += 1; },
    errorResponse: () => { throw new Error('unexpected_error_response'); },
  }), /connection_lost/);

  assert.equal(finalizations, 0);
  assert.equal(quarantines, 1);
});

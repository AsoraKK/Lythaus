import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runTagIndexBatch } from '../scripts/tag-search-index-maintenance.mjs';

const proposalPath = path.join(process.cwd(), 'database/planetscale/proposals/0021_tag_search_index_candidate.sql');

export async function applyTagSearchProposal(client) {
  await client.query("SELECT pg_advisory_lock(hashtext('lythaus-tag-search-candidate-tests'))");
  try {
    await client.query(fs.readFileSync(proposalPath, 'utf8'));
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('lythaus-tag-search-candidate-tests'))");
  }
}

export async function prepareTagSearchCandidate(client) {
  await applyTagSearchProposal(client);
  await client.query(
    `UPDATE feed.tag_search_index_control
        SET policy_approved = false,
            max_distinct_tags_per_post = 16,
            max_candidates_per_request = 1000,
            backfill_cursor = NULL, backfill_post_count = 0, backfill_restart_count = 0,
            legacy_tag_limit_excluded_post_count = 0, backfill_complete = false,
            reconciliation_cursor = NULL, reconciliation_post_count = 0,
            reconciliation_restart_count = 0,
            reconciliation_mismatch_count = 0, reconciliation_complete = false,
            incomplete_post_count = 0, search_enabled = false, block_reason = NULL,
            updated_at = now()
      WHERE singleton = true`,
  );
  for (let batches = 0; batches < 100_000; batches += 1) {
    const result = await runTagIndexBatch(client, 'backfill', 200);
    if (result.blocked) assert.fail(`candidate tag backfill blocked: ${result.reason}`);
    if (result.complete) break;
    if (result.processed === 0 && !result.restartSweep) assert.fail('candidate tag backfill made no progress');
    if (batches === 99_999) assert.fail('candidate tag backfill exceeded the bounded test loop');
  }
  for (let batches = 0; batches < 100_000; batches += 1) {
    const result = await runTagIndexBatch(client, 'reconcile', 200);
    if (result.blocked) assert.fail(`candidate tag reconciliation blocked: ${result.reason}`);
    if (result.complete) break;
    if (result.processed === 0 && !result.restartSweep) assert.fail('candidate tag reconciliation made no progress');
    if (batches === 99_999) assert.fail('candidate tag reconciliation exceeded the bounded test loop');
  }
  const enabled = await client.query(
    `UPDATE feed.tag_search_index_control
        SET policy_approved = true, search_enabled = true, block_reason = NULL, updated_at = now()
      WHERE singleton = true AND backfill_complete AND reconciliation_complete
        AND incomplete_post_count = 0
      RETURNING singleton`,
  );
  assert.equal(enabled.rowCount, 1, 'the synthetic database must be fully indexed before search is enabled');
}

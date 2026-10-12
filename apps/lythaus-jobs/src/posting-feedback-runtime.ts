import { createDedicatedAutocommitClient, type DedicatedAutocommitClient } from '@lythaus/db/autocommit';
import type { HyperdriveBinding } from '@lythaus/db';
import {
  createDatabaseReceiptLedger,
  type DatabaseLedgerClient,
} from '../../../packages/authenticity/evaluation/posting-feedback/database-ledger-proposal.ts';
import {
  collectApprovedTextProbe, simulateTextProbe, type ReceiptLedger,
} from '../../../packages/authenticity/evaluation/posting-feedback/collector.ts';

const LIVE_COLLECTION_ENABLED = false;
type LiveOptions = Omit<Parameters<typeof collectApprovedTextProbe>[0], 'ledger'>;
type SyntheticOptions = Omit<Parameters<typeof simulateTextProbe>[0], 'ledger'>;

/**
 * Inactive Jobs-to-database adapter factory for the bounded posting-feedback
 * evaluator. This module is deliberately not imported by the Jobs entrypoint.
 */
export function createInactivePostingFeedbackLedger(binding: HyperdriveBinding) {
  return receiptLedger(createDedicatedAutocommitClient(binding));
}

function receiptLedger(client: DedicatedAutocommitClient): ReceiptLedger {
  const database: DatabaseLedgerClient = {
    async queryAutocommit(sql, values = []) {
      const result = await client.queryAutocommit(sql, values);
      return { rows: result.rows };
    },
  };

  const ledger = createDatabaseReceiptLedger(database);
  return Object.freeze({
    durability: ledger.durability,
    claimProbe: (value: Parameters<ReceiptLedger['claimProbe']>[0]) => ledger.claimProbe(value),
    claimAttempt: (value: Parameters<ReceiptLedger['claimAttempt']>[0]) => ledger.claimAttempt(value),
    persistReceipt: (value: Parameters<ReceiptLedger['persistReceipt']>[0]) => ledger.persistReceipt(value),
  });
}

export function createInactivePostingFeedbackCollector(binding: HyperdriveBinding) {
  const client = createDedicatedAutocommitClient(binding);
  return Object.freeze({
    async collect(options: LiveOptions) {
      if (!LIVE_COLLECTION_ENABLED) throw new Error('posting_feedback_live_collection_disabled');
      return collectApprovedTextProbe({ ...options, ledger: receiptLedger(client) });
    },
    simulate(options: SyntheticOptions) {
      const snapshot = { ...options, fixtures: structuredClone(options.fixtures), gate: structuredClone(options.gate) };
      return simulateTextProbe({ ...snapshot, ledger: receiptLedger(client) });
    },
  });
}

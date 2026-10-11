import { mkdir, open, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { assertTrustedCollectedReceipt, PROBE_SELECTION_HASH } from './collector.ts';

async function exclusiveWrite(path, value) {
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw new Error('collection_ledger_open_failed'); }
  try { await file.writeFile(`${JSON.stringify(value)}\n`); await file.sync(); }
  finally { await file.close(); }
  const parent = await open(dirname(path), 'r');
  try { await parent.sync(); } finally { await parent.close(); }
  return true;
}

// Existing local execution only. Ephemeral Worker filesystems are not durable.
// No recovery, deletion, overwrite, credential lookup or provider API.
export function createLocalReceiptLedger(existingLocalDirectory) {
  const root = resolve(existingLocalDirectory);
  const directory = join(root, PROBE_SELECTION_HASH);
  let claimed = false;
  return {
    durability: 'DURABLE_LOCAL',
    async claimProbe(binding) {
      if (binding.selectionHash !== PROBE_SELECTION_HASH) throw new Error('collection_wrong_ledger_binding');
      if (!(await stat(root)).isDirectory()) throw new Error('collection_existing_local_directory_required');
      await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const parent = await open(root, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
      claimed = await exclusiveWrite(join(directory, 'probe-started.json'), { ...binding, state: 'STARTED_NO_AUTOMATIC_REPLAY' });
      return claimed;
    },
    async claimAttempt(binding) {
      if (!claimed || !/^[a-f0-9-]{36}$/.test(binding.sampleId) || !/^[a-f0-9]{64}$/.test(binding.inputHash))
        throw new Error('collection_invalid_attempt_binding');
      return exclusiveWrite(join(directory, `${binding.sampleId}.started.json`), { ...binding, state: 'DELIVERY_UNCERTAIN_UNTIL_RECEIPT' });
    },
    async persistReceipt(receipt) {
      assertTrustedCollectedReceipt(receipt);
      if (!claimed || !await exclusiveWrite(join(directory, `${receipt.sampleId}.receipt.json`), receipt))
        throw new Error('collection_ledger_receipt_not_committed');
    },
  };
}

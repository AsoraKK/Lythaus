import { constants } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertTrustedCollectedReceipt, PROBE_SELECTION_HASH } from './collector.ts';

const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const descriptorPath = (directory, name = '') => `/proc/self/fd/${directory.fd}/${name}`;
const sameDirectory = (left, right) => left.dev === right.dev && left.ino === right.ino;

function assertPrivateDirectory(metadata, uid) {
  if (!metadata.isDirectory() || metadata.uid !== uid || (metadata.mode & 0o7777) !== 0o700)
    throw new Error('collection_private_storage_required');
}

async function openDirectory(path) {
  try { return await open(path, directoryFlags); }
  catch { throw new Error('collection_unsafe_storage_path'); }
}

async function openTrustedRoot(root, uid) {
  let current = await openDirectory('/');
  try {
    const systemUid = (await current.stat()).uid;
    for (const component of root.split('/').filter(Boolean)) {
      const parent = await current.stat();
      const trustedOwner = parent.uid === uid || parent.uid === systemUid;
      const stickySystemDirectory = parent.uid === systemUid && (parent.mode & 0o1000) !== 0;
      if (!trustedOwner || ((parent.mode & 0o022) !== 0 && !stickySystemDirectory))
        throw new Error('collection_unsafe_storage_ancestor');
      const next = await openDirectory(descriptorPath(current, component));
      await current.close();
      current = next;
    }
    assertPrivateDirectory(await current.stat(), uid);
    return current;
  } catch (error) { await current.close(); throw error; }
}

async function exclusiveWrite(directory, name, value, uid) {
  let file;
  try { file = await open(descriptorPath(directory, name),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw new Error('collection_ledger_open_failed'); }
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.uid !== uid || metadata.nlink !== 1 || (metadata.mode & 0o7777) !== 0o600)
      throw new Error('collection_private_receipt_required');
    await file.writeFile(`${JSON.stringify(value)}\n`);
    await file.sync();
  }
  finally { await file.close(); }
  await directory.sync();
  return true;
}

// Existing local execution only. Ephemeral Worker filesystems are not durable.
// No recovery, deletion, overwrite, credential lookup or provider API.
export function createLocalReceiptLedger(existingLocalDirectory) {
  if (process.platform !== 'linux' || typeof process.geteuid !== 'function'
    || !constants.O_DIRECTORY || !constants.O_NOFOLLOW)
    throw new Error('collection_storage_platform_unsupported');
  const uid = process.geteuid();
  const root = resolve(existingLocalDirectory);
  let claimed = false;
  let storageIdentity;
  async function withDirectory(callback, initialize = false) {
    if (process.geteuid() !== uid) throw new Error('collection_storage_owner_changed');
    const parent = await openTrustedRoot(root, uid);
    let directory;
    try {
      const rootMetadata = await parent.stat();
      if (storageIdentity && !sameDirectory(storageIdentity.root, rootMetadata))
        throw new Error('collection_storage_replaced');
      if (initialize) {
        await mkdir(descriptorPath(parent, PROBE_SELECTION_HASH), { mode: 0o700 })
          .catch(error => { if (error.code !== 'EEXIST') throw new Error('collection_ledger_directory_failed'); });
      }
      await parent.sync();
      directory = await openDirectory(descriptorPath(parent, PROBE_SELECTION_HASH));
      const metadata = await directory.stat();
      assertPrivateDirectory(metadata, uid);
      if (storageIdentity && !sameDirectory(storageIdentity.directory, metadata))
        throw new Error('collection_storage_replaced');
      storageIdentity ??= { root: rootMetadata, directory: metadata };
      return await callback(directory);
    } finally { try { await directory?.close(); } finally { await parent.close(); } }
  }
  return {
    durability: 'DURABLE_LOCAL',
    async claimProbe(binding) {
      if (binding.selectionHash !== PROBE_SELECTION_HASH) throw new Error('collection_wrong_ledger_binding');
      claimed = await withDirectory(directory => exclusiveWrite(directory, 'probe-started.json',
        { ...binding, state: 'STARTED_NO_AUTOMATIC_REPLAY' }, uid), true);
      return claimed;
    },
    async claimAttempt(binding) {
      if (!claimed || !/^[a-f0-9-]{36}$/.test(binding.sampleId) || !/^[a-f0-9]{64}$/.test(binding.inputHash))
        throw new Error('collection_invalid_attempt_binding');
      return withDirectory(directory => exclusiveWrite(directory, `${binding.sampleId}.started.json`,
        { ...binding, state: 'DELIVERY_UNCERTAIN_UNTIL_RECEIPT' }, uid));
    },
    async persistReceipt(receipt) {
      assertTrustedCollectedReceipt(receipt);
      if (!claimed || !await withDirectory(directory => exclusiveWrite(directory,
        `${receipt.sampleId}.receipt.json`, receipt, uid)))
        throw new Error('collection_ledger_receipt_not_committed');
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error('ARGUMENT_REQUIRED'); return args[index + 1]; };
try {
  const inspect = JSON.parse(fs.readFileSync(path.resolve(value('--inspect')), 'utf8'));
  const item = Array.isArray(inspect) && inspect.length === 1 ? inspect[0] : null;
  const sourceSha = value('--source-sha');
  if (!item || !/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('IMAGE_INSPECT_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(item.Id ?? '')) throw new Error('IMAGE_ID_INVALID');
  if (!['65532', '65532:65532'].includes(item.Config?.User ?? '')) throw new Error('NON_ROOT_IMAGE_INVALID');
  const labels = item.Config?.Labels ?? {};
  if (labels['org.opencontainers.image.revision'] !== sourceSha) throw new Error('IMAGE_SOURCE_MISMATCH');
  const repoDigests = Array.isArray(item.RepoDigests) ? item.RepoDigests.filter(value => /^[^@\s]+@sha256:[0-9a-f]{64}$/.test(value)) : [];
  const result = { schemaVersion: 'lythaus-private-evaluation-image-v1', sourceSha, identityKind: repoDigests.length ? 'registry_manifest_digest' : 'local_image_id', imageId: item.Id, repoDigests, sizeBytes: Number.isSafeInteger(item.Size) ? item.Size : null, user: item.Config.User, labelRevision: labels['org.opencontainers.image.revision'] };
  const output = args.includes('--output') ? path.resolve(value('--output')) : null;
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 }); fs.writeFileSync(output, JSON.stringify(result) + '\n', { mode: 0o600 }); }
  process.stdout.write('EVALUATION_IMAGE_VERIFIED\n');
} catch (error) { const code = error?.message && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'IMAGE_IDENTITY_REJECTED'; process.stdout.write(`EVALUATION_IMAGE_REJECTED:${code}\n`); process.exitCode = 1; }

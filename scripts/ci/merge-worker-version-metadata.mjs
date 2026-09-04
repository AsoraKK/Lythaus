import fs from 'node:fs';

function versionItems(value) {
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (payload?.result && typeof payload.result === 'object') return [payload.result];
  if (payload && typeof payload === 'object' && (payload.id || payload.version_id)) return [payload];
  return [];
}

export function mergeWorkerVersionMetadata(...payloads) {
  const byId = new Map();
  for (const payload of payloads) {
    for (const item of versionItems(payload)) {
      const id = item?.id ?? item?.version_id;
      if (typeof id === 'string' && id.length > 0) byId.set(id.toLowerCase(), item);
    }
  }
  return [...byId.values()];
}

function main() {
  const paths = process.argv.slice(2);
  if (paths.length < 1) throw new Error('at least one Worker version metadata path is required');
  const merged = mergeWorkerVersionMetadata(...paths.map((filePath) => fs.readFileSync(filePath, 'utf8')));
  process.stdout.write(`${JSON.stringify(merged)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('merge-worker-version-metadata.mjs')) main();

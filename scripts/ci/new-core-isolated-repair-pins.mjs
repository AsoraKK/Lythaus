import { pathToFileURL } from 'node:url';
import { assertRepairPins } from './new-core-isolated-repair-state.mjs';

// Independently rebuilt from the protected squash of application PR #1197.
export const REPAIR_PINS = Object.freeze({
  sourceSha: 'fc1dce9683219edee3312cf339526b2850385aa2',
  workerSha: '38bee5bd1a6b394816a7169c8209e788eabf99d9645ed8a1775909a69288fd07',
  workerBytes: 657919,
  assetsSha: 'd4d62e847efe855abf4b19484ef3a0d56118f511ae70c82ef9db370a1e29026d',
  assetCount: 30,
  assetBytes: 394578,
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pins = REPAIR_PINS;
  assertRepairPins(pins);
  if (process.argv[2] === 'source' && process.argv.length === 3) console.log(pins.sourceSha);
  else if (process.argv[2] === 'prepare' && process.argv.length === 5) {
    const {prepareArtifacts} = await import('./new-core-isolated-worker.mjs');
    await prepareArtifacts({sourceDir:process.argv[3],artifactDir:process.argv[4],pins});
  } else throw new Error('setup_repair_preparation_invalid');
}

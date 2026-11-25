import { pathToFileURL } from 'node:url';
import { assertRepairPins } from './new-core-isolated-repair-state.mjs';

// Independently rebuilt from the protected squash of application PR #1193.
export const REPAIR_PINS = Object.freeze({
  sourceSha: '78747f85d02c69efa8a1b6f86b73b08947cdce0b',
  workerSha: '81409a2b4c022dfec37c1d4ef0f0842cec85e94a8cb646aa3c1677954980266b',
  workerBytes: 653531,
  assetsSha: 'f2ff945764193e34e32d781b08efb32d09b7dfe6090ac338c13da5e32e8ed69a',
  assetCount: 30,
  assetBytes: 393797,
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

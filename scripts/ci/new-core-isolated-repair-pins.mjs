import { pathToFileURL } from 'node:url';
import { assertRepairPins } from './new-core-isolated-repair-state.mjs';

// Independently rebuilt from the protected squash of application PR #1195.
export const REPAIR_PINS = Object.freeze({
  sourceSha: '78958d886d72eecc6ea01001d808f1d8c505046d',
  workerSha: 'e568b5cfc238a9b87f3ca87ff3ef1ebfff5efd7415cd2bd469d6089b2104b0bd',
  workerBytes: 655674,
  assetsSha: 'f9848f5188fad141385d3653c16adbc57eff69afa7317990ecccad7422284316',
  assetCount: 30,
  assetBytes: 393868,
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

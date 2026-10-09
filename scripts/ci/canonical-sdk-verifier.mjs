import fs from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { runSourceVerification } from './canonical-sdk-isolation.mjs';

if (!process.argv.includes('--development-only')) throw new Error('USE_PROTECTED_MAIN_BOOTSTRAP_FOR_ELIGIBLE_VERIFICATION');
const value = flag => process.argv[process.argv.indexOf(flag) + 1];
const candidateSha = value('--candidate');
if (!process.argv.includes('--candidate')) throw new Error('EXACT_CANDIDATE_REQUIRED');
fs.mkdirSync(resolve('.artifacts'), { recursive: true });
const directory = fs.mkdtempSync(resolve('.artifacts/sdk-isolation-'));
const tools = { node: resolve(dirname(process.execPath), '..'), flutter: process.env.LYTHAUS_VERIFIER_FLUTTER ?? '/workspace/.lythaus-tools/flutter-sdk/flutter', java: process.env.LYTHAUS_VERIFIER_JAVA ?? '/workspace/.lythaus-tools/java17', generator: process.env.LYTHAUS_VERIFIER_GENERATOR ?? '/workspace/.lythaus-tools/openapi-generator-cli-7.7.0.jar' };
try {
  const result = await runSourceVerification({ repository: resolve('.'), candidateSha, recipe: resolve('.'), tools, directory, archiveCache: process.argv.includes('--archive-cache') ? resolve(value('--archive-cache')) : null });
  fs.writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`Development mechanics verified; coverage remains ineligible. Evidence: ${directory}/result.json\n`);
} catch (error) {
  fs.writeFileSync(join(directory, 'failure.json'), JSON.stringify({ candidateSha, coverageEligible: false, reason: error.message }, null, 2) + '\n');
  process.stderr.write(`Verification stopped: ${error.message}\nEvidence: ${directory}/failure.json\n`);
  process.exitCode = 1;
}

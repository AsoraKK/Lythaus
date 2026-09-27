import fs from 'node:fs';

const directory = '.artifacts/security-run-evidence';
fs.mkdirSync(directory, { recursive: true });
const file = `${directory}/comparison.json`;
const receipt = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { workflow: 'Dependency review', headSha: process.env.GITHUB_SHA, reason: 'PROBE_DID_NOT_COMPLETE' };
receipt.nativeActionOutcome = process.env.NATIVE_OUTCOME ?? 'skipped';
receipt.conclusion = receipt.coverage === 'COMPLETE' && receipt.nativeActionOutcome === 'success' ? 'success' : 'failure';
fs.writeFileSync(`${directory}/run.json`, JSON.stringify(receipt, null, 2) + '\n');
if (receipt.conclusion !== 'success') throw new Error(`DEPENDENCY_REVIEW_INCOMPLETE: ${receipt.reason}; coverage=${receipt.coverage ?? 'unknown'}; native=${receipt.nativeActionOutcome}`);

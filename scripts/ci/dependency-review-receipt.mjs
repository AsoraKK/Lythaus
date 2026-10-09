import fs from 'node:fs';
import { aggregateReview } from './canonical-sdk-contract.mjs';

const directory = '.artifacts/security-run-evidence';
fs.mkdirSync(directory, { recursive: true });
const file = `${directory}/comparison.json`;
const receipt = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { workflow: 'Dependency review', headSha: process.env.GITHUB_SHA, reason: 'PROBE_DID_NOT_COMPLETE' };
receipt.nativeActionOutcome = process.env.NATIVE_OUTCOME ?? 'skipped';
receipt.licenseResolutionOutcome = process.env.LICENSE_OUTCOME ?? 'skipped';
receipt.licenseResolution = fs.existsSync(`${directory}/licenses.json`) ? JSON.parse(fs.readFileSync(`${directory}/licenses.json`, 'utf8')) : null;
receipt.mode = 'category-aware-native-and-first-party-source';
Object.assign(receipt, aggregateReview(receipt, null, { native: receipt.nativeActionOutcome, licenses: receipt.licenseResolutionOutcome === 'success' && receipt.licenseResolution?.conclusion === 'success' ? 'success' : 'failure' }));
if (receipt.sourceRequired.length) receipt.reason = 'FRESH_TRUSTED_SOURCE_VERIFICATION_REQUIRED';
fs.writeFileSync(`${directory}/run.json`, JSON.stringify(receipt, null, 2) + '\n');
if (receipt.conclusion !== 'success') throw new Error(`DEPENDENCY_REVIEW_INCOMPLETE: ${receipt.reason}; coverage=${receipt.coverage ?? 'unknown'}; native=${receipt.nativeActionOutcome}`);

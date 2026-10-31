import { readFileSync } from 'node:fs';

const [project, output] = process.argv.slice(2);
if (!/^lythaus-[a-z0-9-]+$/.test(project ?? '') || !output) throw new Error('Pages deployment output inputs invalid');
const text = readFileSync(output, 'utf8');
const candidates = [...new Set(text.match(new RegExp(`https://[a-z0-9-]+\\.${project}\\.pages\\.dev`, 'g')) ?? [])];
if (candidates.length !== 1) throw new Error('Pages deployment output has no unique deployment URL');
process.stdout.write(candidates[0]);

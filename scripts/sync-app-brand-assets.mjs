import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const copies = [
  ['apps/marketing-site/public/brand/lythaus-mark.svg', 'assets/brand/lythaus_mark.svg'],
  ['apps/marketing-site/public/icons/lythaus-192.png', 'web/favicon.png'],
  ['apps/marketing-site/public/icons/lythaus-192.png', 'web/icons/Icon-192.png'],
  ['apps/marketing-site/public/icons/lythaus-512.png', 'web/icons/Icon-512.png'],
  ['apps/marketing-site/public/icons/lythaus-512-maskable.png', 'web/icons/Icon-maskable-512.png'],
];
for (const [source, destination] of copies) {
  await copyFile(path.join(root, source), path.join(root, destination));
}
await rm(path.join(root, 'web/icons/Icon-maskable-192.png'), { force: true });
const source = await readFile(path.join(root, 'apps/marketing-site/src/components/OpeningWordmark.astro'), 'utf8');
const geometry = source.match(/<path id="wordmark-material" d="([^"]+)"/);
if (!geometry) throw new Error('Approved marketing wordmark geometry not found');
await writeFile(path.join(root, 'assets/brand/lythaus_wordmark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -5 1000 174"><path fill="#fff" d="${geometry[1]}"/></svg>\n`);
console.log('App assets synchronized from the existing marketing artwork.');

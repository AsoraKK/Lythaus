import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function versionWebEntrypoints(directory) {
  const root = path.resolve(directory);
  const main = readFileSync(path.join(root, 'main.dart.js'));
  const bootstrap = readFileSync(path.join(root, 'flutter_bootstrap.js'), 'utf8');
  const index = readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainReference = /("mainJsPath"\s*:\s*)"main\.dart\.js"/g;
  const bootstrapReference = /src="flutter_bootstrap\.js"/g;
  assert.equal([...bootstrap.matchAll(mainReference)].length, 1, 'Expected one Flutter main entrypoint');
  assert.equal([...index.matchAll(bootstrapReference)].length, 1, 'Expected one bootstrap script in the app document');
  const mainHash = digest(main);
  const mainFile = `main.dart.${mainHash.slice(0, 16)}.js`;
  const versionedBootstrap = bootstrap.replace(mainReference, `$1"${mainFile}"`);
  const bootstrapHash = digest(versionedBootstrap);
  const bootstrapFile = `flutter_bootstrap.${bootstrapHash.slice(0, 16)}.js`;
  const versionedIndex = index.replace(bootstrapReference, `src="${bootstrapFile}"`);
  const manifest = {
    schemaVersion: 1,
    main: { file: mainFile, sha256: mainHash },
    bootstrap: { file: bootstrapFile, sha256: bootstrapHash },
    index: { file: 'index.html', sha256: digest(versionedIndex) },
  };
  writeFileSync(path.join(root, mainFile), main);
  writeFileSync(path.join(root, bootstrapFile), versionedBootstrap);
  writeFileSync(path.join(root, 'index.html'), versionedIndex);
  writeFileSync(path.join(root, 'web-release-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(versionWebEntrypoints(process.argv[2] ?? 'build/web')));
}

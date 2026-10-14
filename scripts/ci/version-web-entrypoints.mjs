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
  const updateClient = readFileSync(path.join(root, 'release-update.js'));
  const index = readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainReference = /("mainJsPath"\s*:\s*)"main\.dart\.js"/g;
  const bootstrapReference = /src="flutter_bootstrap\.js"/g;
  const updateClientReference = /src="release-update\.js"/g;
  const releaseIdReference = /content="__LYTHAUS_WEB_RELEASE_ID__"/g;
  assert.equal([...bootstrap.matchAll(mainReference)].length, 1, 'Expected one Flutter main entrypoint');
  assert.equal([...index.matchAll(bootstrapReference)].length, 1, 'Expected one bootstrap script in the app document');
  assert.equal([...index.matchAll(updateClientReference)].length, 1, 'Expected one release update client in the app document');
  assert.equal([...index.matchAll(releaseIdReference)].length, 1, 'Expected one frontend release identity in the app document');
  const mainHash = digest(main);
  const mainFile = `main.dart.${mainHash.slice(0, 16)}.js`;
  const versionedBootstrap = bootstrap.replace(mainReference, `$1"${mainFile}"`);
  const bootstrapHash = digest(versionedBootstrap);
  const bootstrapFile = `flutter_bootstrap.${bootstrapHash.slice(0, 16)}.js`;
  const updateClientHash = digest(updateClient);
  const updateClientFile = `release-update.${updateClientHash.slice(0, 16)}.js`;
  const identityIndex = index
    .replace(bootstrapReference, `src="${bootstrapFile}"`)
    .replace(updateClientReference, `src="${updateClientFile}"`);
  const releaseId = digest(
    `${mainHash}\n${bootstrapHash}\n${updateClientHash}\n${digest(identityIndex.replace(releaseIdReference, 'content=""'))}`,
  );
  const versionedIndex = identityIndex.replace(
    releaseIdReference,
    `content="${releaseId}"`,
  );
  const manifest = {
    schemaVersion: 1,
    releaseId,
    main: { file: mainFile, sha256: mainHash },
    bootstrap: { file: bootstrapFile, sha256: bootstrapHash },
    updateClient: { file: updateClientFile, sha256: updateClientHash },
    index: { file: 'index.html', sha256: digest(versionedIndex) },
  };
  writeFileSync(path.join(root, mainFile), main);
  writeFileSync(path.join(root, bootstrapFile), versionedBootstrap);
  writeFileSync(path.join(root, updateClientFile), updateClient);
  writeFileSync(path.join(root, 'index.html'), versionedIndex);
  writeFileSync(path.join(root, 'web-release-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(versionWebEntrypoints(process.argv[2] ?? 'build/web')));
}

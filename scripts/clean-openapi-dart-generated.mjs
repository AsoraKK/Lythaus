import { readdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const repositoryRoot = process.cwd();
const generatedRoot = resolve(repositoryRoot, 'lib/generated/api_client');
const generatedDirectories = ['doc', 'lib', 'test'];
const generatedSupportingFiles = [
  '.gitignore',
  'README.md',
  'analysis_options.yaml',
  'pubspec.yaml',
];

if (!generatedRoot.startsWith(`${resolve(repositoryRoot)}${sep}`)) {
  throw new Error('Generated client path escaped the repository root.');
}

async function removeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      if (!entryPath.startsWith(`${generatedRoot}${sep}`)) {
        throw new Error(`Refusing to remove path outside generated client: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        await removeFiles(entryPath);
        return;
      }
      await rm(entryPath);
    }),
  );
}

for (const directory of generatedDirectories) {
  await removeFiles(resolve(generatedRoot, directory));
}

for (const file of generatedSupportingFiles) {
  await rm(resolve(generatedRoot, file), { force: true });
}

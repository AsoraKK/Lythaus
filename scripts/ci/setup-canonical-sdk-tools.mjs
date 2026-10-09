import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const recipe = resolve('.trusted-verifier');
const toolset = JSON.parse(fs.readFileSync(join(recipe, 'scripts/ci/sdk-verifier/toolset.json')));
if (process.version !== `v${toolset.nodeVersion}`) throw new Error('TRUSTED_NODE_VERSION_MISMATCH');
const directory = fs.mkdtempSync(join(process.env.RUNNER_TEMP, 'lythaus-sdk-tools-'));

async function download(record, path) {
  const response = await fetch(record.url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`TRUSTED_TOOL_DOWNLOAD_FAILED:${response.status}`);
  const descriptor = fs.openSync(path, 'wx', 0o600), hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > record.maximumBytes) throw new Error('TRUSTED_TOOL_DOWNLOAD_LIMIT');
      hash.update(chunk);
      if (fs.writeSync(descriptor, chunk) !== chunk.length) throw new Error('TRUSTED_TOOL_DOWNLOAD_SHORT_WRITE');
    }
  } finally { fs.closeSync(descriptor); }
  if (hash.digest('hex') !== record.sha256) throw new Error('TRUSTED_TOOL_ARCHIVE_MISMATCH');
}

const flutterArchive = join(directory, 'flutter.tar.xz'), javaArchive = join(directory, 'java.tar.gz'), generator = join(directory, 'generator.jar');
await download(toolset.flutter, flutterArchive);
execFileSync('tar', ['-xJf', flutterArchive, '-C', directory], { stdio: 'inherit' });
await download(toolset.java, javaArchive);
const java = join(directory, 'java'); fs.mkdirSync(java);
execFileSync('tar', ['-xzf', javaArchive, '--strip-components=1', '-C', java], { stdio: 'inherit' });
await download(toolset.generator, generator);
execFileSync('docker', ['pull', toolset.isolationImage], { stdio: 'inherit' });
const tools = { flutter: join(directory, 'flutter'), java, generator, node: resolve(dirname(process.execPath), '..'), toolset };
fs.writeFileSync(join(recipe, 'tools.json'), JSON.stringify(tools, null, 2) + '\n');

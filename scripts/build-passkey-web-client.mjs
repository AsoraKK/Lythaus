import { createRequire } from 'node:module';
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'packages/security/package.json'));
const entry = require.resolve('@simplewebauthn/browser');
const directory = path.resolve(path.dirname(entry), '..');
const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
if (manifest.version !== '14.0.0') throw new Error('Unreviewed passkey browser version');
const destination = path.resolve(root, process.argv[2] ?? 'build/web/passkeys-client.js');
copyFileSync(path.join(directory, 'dist/bundle/index.umd.min.js'), destination);
console.log('Copied pinned SimpleWebAuthn browser client to local web output');

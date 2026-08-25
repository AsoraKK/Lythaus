#!/usr/bin/env node

import { spawn } from 'node:child_process';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error('Usage: runtime-authenticated-command.mjs --token-env NAME -- command [args...]');
  }
  const options = argv.slice(0, separator);
  const tokenIndex = options.indexOf('--token-env');
  if (tokenIndex < 0 || !options[tokenIndex + 1]) {
    throw new Error('--token-env is required');
  }
  return { tokenEnv: options[tokenIndex + 1], command: argv.slice(separator + 1) };
}

function run(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { env, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Authenticated command terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

const { tokenEnv, command } = parseArgs(process.argv.slice(2));
const apiBase = required('RUNTIME_AUTH_API_BASE_URL').replace(/\/$/, '');
const email = required('RUNTIME_AUTH_EMAIL');
const password = required('RUNTIME_AUTH_PASSWORD');
const clientId = process.env.RUNTIME_AUTH_CLIENT_ID?.trim();

let accessToken = '';
let refreshToken = '';
try {
  const response = await fetch(`${apiBase}/auth/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(clientId ? { client_id: clientId } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* provider error details are not evidence */ }
    const code = typeof body?.error === 'string' && /^[a-z0-9_.-]+$/.test(body.error) ? body.error : '';
    const state = typeof body?.state === 'string' && /^[a-z0-9_.-]+$/.test(body.state) ? body.state : '';
    const detail = [code, state].filter(Boolean).join(',');
    throw new Error(`Runtime authentication failed with status ${response.status}${detail ? ` (${detail})` : ''}`);
  }
  const body = await response.json();
  accessToken = body?.data?.access_token || '';
  refreshToken = body?.data?.refresh_token || '';
  if (!accessToken || !refreshToken) {
    throw new Error('Runtime authentication response omitted required tokens');
  }

  process.stdout.write(`::add-mask::${accessToken}\n`);
  process.stdout.write(`::add-mask::${refreshToken}\n`);
  const code = await run(command, { ...process.env, [tokenEnv]: accessToken });
  if (code !== 0) process.exitCode = code;
} finally {
  if (accessToken) {
    try {
      await fetch(`${apiBase}/auth/sessions/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      process.stderr.write('::warning::Runtime session cleanup could not be confirmed\n');
    }
  }
  accessToken = '';
  refreshToken = '';
  delete process.env[tokenEnv];
}

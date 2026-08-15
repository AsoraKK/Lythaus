#!/usr/bin/env node

import fs from 'node:fs';

const command = process.argv[2] ?? 'resolve';
if (!['ensure', 'resolve'].includes(command)) throw new Error('usage: waitlist-turnstile.mjs <ensure|resolve>');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
const githubEnv = process.env.GITHUB_ENV ?? '';
const evidencePath = process.env.TURNSTILE_EVIDENCE_PATH ?? '';
const secretFile = process.env.TURNSTILE_SECRET_FILE ?? '';

const widgetName = 'Lythaus Website Waitlist';
const expectedDomains = Object.freeze(['lythaus.co', 'www.lythaus.co']);
const expectedMode = 'managed';
const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}/challenges/widgets`;

if (!/^[0-9a-f]{32}$/.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid');
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (command === 'ensure' && !secretFile) throw new Error('TURNSTILE_SECRET_FILE is required for ensure');

function normalizedDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return domains
    .map((value) => typeof value === 'string' ? value : value?.name ?? value?.domain ?? '')
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function sameValues(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function cloudflare(path = '', init = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${apiToken}`);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error?.code).filter((value) => value !== undefined).join(',')
      : '';
    throw new Error(`Cloudflare Turnstile API request failed (${response.status}${codes ? `; codes=${codes}` : ''})`);
  }
  return payload.result;
}

async function listExactWidgets() {
  const query = new URLSearchParams({ per_page: '1000', filter: `name:${widgetName}` });
  const result = await cloudflare(`?${query}`);
  if (!Array.isArray(result)) throw new Error('Cloudflare Turnstile list response is invalid');
  return result.filter((widget) => widget?.name === widgetName);
}

function validateWidget(widget) {
  const sitekey = typeof widget?.sitekey === 'string' ? widget.sitekey : '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(sitekey)) throw new Error('production waitlist Turnstile sitekey is invalid');
  if (widget?.name !== widgetName) throw new Error('production waitlist Turnstile widget name mismatch');
  if (widget?.mode !== expectedMode) throw new Error('production waitlist Turnstile widget must use managed mode');
  const domains = normalizedDomains(widget?.domains);
  if (!sameValues(domains, expectedDomains)) {
    throw new Error('production waitlist Turnstile widget hostnames do not match the approved contract');
  }
  return { sitekey, domains };
}

let created = false;
let matches = await listExactWidgets();
if (matches.length > 1) throw new Error('multiple production waitlist Turnstile widgets have the approved display name');

if (matches.length === 0) {
  if (command !== 'ensure') throw new Error('production waitlist Turnstile widget does not exist');
  const createdWidget = await cloudflare('', {
    method: 'POST',
    body: JSON.stringify({
      name: widgetName,
      domains: expectedDomains,
      mode: expectedMode,
      clearance_level: 'no_clearance',
    }),
  });
  matches = [createdWidget];
  created = true;
}

const listed = matches[0];
const sitekey = listed?.sitekey;
const detailed = await cloudflare(`/${encodeURIComponent(sitekey)}`);
const { domains } = validateWidget(detailed);
const secret = typeof detailed?.secret === 'string' ? detailed.secret : '';

if (command === 'ensure') {
  if (!secret) throw new Error('Cloudflare did not return the production Turnstile secret');
  fs.writeFileSync(secretFile, `${JSON.stringify({ TURNSTILE_SECRET_KEY: secret })}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(secretFile, 0o600);
}

if (githubEnv) fs.appendFileSync(githubEnv, `PUBLIC_TURNSTILE_SITE_KEY=${detailed.sitekey}\n`, 'utf8');

const evidence = {
  schemaVersion: 1,
  widgetName,
  sitekey: detailed.sitekey,
  mode: detailed.mode,
  domains,
  created,
  lifecycle: 'active',
  capturedAt: new Date().toISOString(),
};
if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'pass', widgetName, sitekey: detailed.sitekey, mode: detailed.mode, domains, created }));

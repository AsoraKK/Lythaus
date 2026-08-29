#!/usr/bin/env node

import fs from 'node:fs';
import { approvedPost0014Expectation } from './product-integrity-schema-contract.mjs';

const configPath = 'apps/lythaus-public-api/wrangler.jsonc';
const materialize = process.env.MATERIALIZE_PUBLIC_WAITLIST_CONFIG === 'true';
const expectation = approvedPost0014Expectation(
  process.env.PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT ?? '',
  process.env.PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT ?? '',
);

const fingerprintPlaceholder = 'REPLACE_WITH_POST_0014_SCHEMA_FINGERPRINT';
const relationCountPlaceholder = 'REPLACE_WITH_POST_0014_RELATION_COUNT';

function productionValue(source, key) {
  const production = source.slice(0, source.indexOf('"env"') === -1 ? source.length : source.indexOf('"env"'));
  return production.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] ?? '';
}

const committedSource = fs.readFileSync(configPath, 'utf8');
if (productionValue(committedSource, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== fingerprintPlaceholder) {
  throw new Error('public Worker must retain the canonical database fingerprint placeholder before release materialization');
}
if (productionValue(committedSource, 'EXPECTED_DATABASE_RELATION_COUNT') !== relationCountPlaceholder) {
  throw new Error('public Worker must retain the canonical database relation-count placeholder before release materialization');
}
if (productionValue(committedSource, 'EXPECTED_DATABASE_SCHEMA_VERSION') !== '0014_transactional_email_outbox.sql') {
  throw new Error('public waitlist deployment requires migration 0014');
}
if (productionValue(committedSource, 'EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED') !== 'true') {
  throw new Error('public waitlist deployment requires the production budget ledger');
}
if (productionValue(committedSource, 'EXPECTED_DATABASE_TARGET') !== 'main') {
  throw new Error('public waitlist deployment must target PlanetScale main');
}
if (productionValue(committedSource, 'TURNSTILE_REQUIRED') !== 'true') {
  throw new Error('public waitlist deployment must require Turnstile');
}
if (productionValue(committedSource, 'TURNSTILE_EXPECTED_HOSTNAMES') !== 'lythaus.co,www.lythaus.co') {
  throw new Error('public waitlist Turnstile hostnames do not match the approved production contract');
}
if (productionValue(committedSource, 'HYPERDRIVE_QUERY_CACHE_MODE') !== 'disabled') {
  throw new Error('public waitlist deployment requires Hyperdrive query caching to remain disabled');
}
const origins = new Set(productionValue(committedSource, 'CORS_ALLOWED_ORIGINS').split(',').map((value) => value.trim()).filter(Boolean));
for (const requiredOrigin of ['https://lythaus.co', 'https://www.lythaus.co', 'https://app.lythaus.co']) {
  if (!origins.has(requiredOrigin)) throw new Error(`public waitlist CORS is missing ${requiredOrigin}`);
}

const source = committedSource
  .replace(`"${fingerprintPlaceholder}"`, `"${expectation.fingerprint}"`)
  .replace(`"${relationCountPlaceholder}"`, `"${expectation.relationCount}"`);

if (productionValue(source, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== expectation.fingerprint) {
  throw new Error('public waitlist database fingerprint materialization failed');
}
if (productionValue(source, 'EXPECTED_DATABASE_RELATION_COUNT') !== String(expectation.relationCount)) {
  throw new Error('public waitlist database relation-count materialization failed');
}
if (productionValue(source, 'AUTHENTICATED_ACCEPTANCE_PROVEN') !== 'false') {
  throw new Error('public waitlist cutover must not falsely assert full authenticated acceptance');
}
if (/REPLACE_WITH_POST_0014_/.test(source.slice(0, source.indexOf('"env"')))) {
  throw new Error('public waitlist production database identity contains an unresolved placeholder');
}

if (materialize) fs.writeFileSync(configPath, source, 'utf8');
console.log(JSON.stringify({
  status: 'pass',
  materialized: materialize,
  schemaVersion: '0014_transactional_email_outbox.sql',
  relationCount: expectation.relationCount,
  fingerprint: expectation.fingerprint,
  authenticatedAcceptanceProven: false,
}));

#!/usr/bin/env node

import { approvedPost0014Expectation } from './product-integrity-schema-contract.mjs';

const expectation = approvedPost0014Expectation(
  process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? '',
  process.env.EXPECTED_DATABASE_RELATION_COUNT ?? '',
);
process.env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT = expectation.fingerprint;
process.env.EXPECTED_DATABASE_RELATION_COUNT = String(expectation.relationCount);

await import('./run-adr003-authenticated-acceptance.mjs');

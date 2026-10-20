import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const clientRoot = resolve(process.argv[2] ?? 'lib/generated/api_client');
const fixtureRoot = resolve('tests/contract/dart');
const fixtures = [
  ['subscription_status_test.dart.fixture', 'subscription_status_test.dart'],
  [
    'subscription_status_entitlements_test.dart.fixture',
    'subscription_status_entitlements_test.dart',
  ],
  [
    'subscription_status401_response_test.dart.fixture',
    'subscription_status401_response_test.dart',
  ],
  [
    'subscription_status500_response_test.dart.fixture',
    'subscription_status500_response_test.dart',
  ],
];

for (const [fixture, output] of fixtures) {
  const source = resolve(fixtureRoot, fixture);
  const destination = resolve(clientRoot, 'test', output);
  if (!existsSync(source)) {
    throw new Error(`Missing generated-client membership fixture: ${source}`);
  }
  copyFileSync(source, destination);
}
